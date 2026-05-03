import json
import os
import secrets
from urllib.parse import quote, urlencode
from json import JSONDecodeError

from fastapi import HTTPException, Request
from fastapi.responses import HTMLResponse
import httpx
import requests
from dotenv import load_dotenv

from integrations.integration_item import IntegrationItem
from integrations.crypto_utils import encrypt_json_payload
from redis_client import add_key_value_redis, delete_key_redis, get_value_redis

load_dotenv()

CLIENT_ID = os.getenv("HUBSPOT_CLIENT_ID", "XXX")
CLIENT_SECRET = os.getenv("HUBSPOT_CLIENT_SECRET", "XXX")
PII_SAFE_MODE = os.getenv("PII_SAFE_MODE", "false").lower() == "true"
REDIRECT_URI = "http://localhost:8000/integrations/hubspot/oauth2callback"
AUTHORIZATION_BASE_URL = "https://app.hubspot.com/oauth/authorize"
TOKEN_URL = "https://api.hubapi.com/oauth/v1/token"
SCOPES = [
    "oauth",
    "crm.objects.contacts.read",
    "crm.objects.companies.read",
    "crm.objects.deals.read",
]


def _build_item_name(response_json, object_type):
    properties = response_json.get("properties", {})
    if object_type == "contact":
        first_name = properties.get("firstname") or ""
        last_name = properties.get("lastname") or ""
        full_name = f"{first_name} {last_name}".strip()
        return full_name or properties.get("email") or f"Contact {response_json.get('id')}"
    if object_type == "company":
        return properties.get("name") or properties.get("domain") or f"Company {response_json.get('id')}"
    if object_type == "deal":
        return properties.get("dealname") or f"Deal {response_json.get('id')}"
    return f"{object_type.capitalize()} {response_json.get('id')}"


def _mask_value(value, visible=3):
    if not value:
        return value
    value = str(value)
    if len(value) <= visible:
        return "*" * len(value)
    return value[:visible] + "*" * (len(value) - visible)


def _mask_properties(properties: dict) -> dict:
    masked = dict(properties or {})
    for key in ("email", "domain", "firstname", "lastname", "dealname", "name"):
        if key in masked and masked[key]:
            masked[key] = _mask_value(masked[key])
    return masked


async def authorize_hubspot(user_id, org_id):
    state_data = {
        "state": secrets.token_urlsafe(32),
        "user_id": user_id,
        "org_id": org_id,
    }
    encoded_state = json.dumps(state_data, separators=(",", ":"))
    await add_key_value_redis(f"hubspot_state:{org_id}:{user_id}", encoded_state, expire=600)

    params = {
        "client_id": CLIENT_ID,
        "redirect_uri": REDIRECT_URI,
        "scope": " ".join(SCOPES),
        "state": encoded_state,
    }
    return f"{AUTHORIZATION_BASE_URL}?{urlencode(params, quote_via=quote)}"


async def oauth2callback_hubspot(request: Request):
    if request.query_params.get("error"):
        raise HTTPException(status_code=400, detail=request.query_params.get("error_description") or request.query_params.get("error"))

    code = request.query_params.get("code")
    encoded_state = request.query_params.get("state")
    if not code or not encoded_state:
        raise HTTPException(status_code=400, detail="Missing code or state in callback.")

    try:
        state_data = json.loads(encoded_state)
    except JSONDecodeError:
        try:
            # HubSpot may normalize `+` characters in query strings to spaces.
            # Replacing spaces back to plus helps recover the original JSON payload.
            state_data = json.loads(encoded_state.replace(" ", "+"))
        except JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail="Invalid OAuth state payload.") from exc
    original_state = state_data.get("state")
    user_id = state_data.get("user_id")
    org_id = state_data.get("org_id")
    saved_state = await get_value_redis(f"hubspot_state:{org_id}:{user_id}")

    if not saved_state or original_state != json.loads(saved_state).get("state"):
        raise HTTPException(status_code=400, detail="State does not match.")

    async with httpx.AsyncClient() as client:
        response = await client.post(
            TOKEN_URL,
            data={
                "grant_type": "authorization_code",
                "client_id": CLIENT_ID,
                "client_secret": CLIENT_SECRET,
                "redirect_uri": REDIRECT_URI,
                "code": code,
            },
            headers={"Content-Type": "application/x-www-form-urlencoded"},
        )

    await delete_key_redis(f"hubspot_state:{org_id}:{user_id}")
    if response.status_code != 200:
        raise HTTPException(status_code=400, detail=response.text)

    await add_key_value_redis(
        f"hubspot_credentials:{org_id}:{user_id}",
        json.dumps(response.json()),
        expire=600,
    )

    close_window_script = """
    <html>
        <script>
            window.close();
        </script>
    </html>
    """
    return HTMLResponse(content=close_window_script)


async def get_hubspot_credentials(user_id, org_id):
    credentials = await get_value_redis(f"hubspot_credentials:{org_id}:{user_id}")
    if not credentials:
        raise HTTPException(status_code=400, detail="No credentials found.")
    await delete_key_redis(f"hubspot_credentials:{org_id}:{user_id}")
    connection_id = secrets.token_urlsafe(24)
    await add_key_value_redis(
        f"hubspot_session:{org_id}:{user_id}:{connection_id}",
        credentials,
        expire=3600,
    )
    return {
        "connection_id": connection_id,
        "credential_mode": "opaque_session",
        "expires_in": 3600,
    }


def create_integration_item_metadata_object(response_json, object_type):
    properties = response_json.get("properties", {})
    safe_props = _mask_properties(properties) if PII_SAFE_MODE else properties
    last_modified = (
        safe_props.get("hs_lastmodifieddate")
        or safe_props.get("lastmodifieddate")
        or response_json.get("updatedAt")
    )
    name_response = dict(response_json)
    name_response["properties"] = safe_props
    return IntegrationItem(
        id=f"{response_json.get('id')}_{object_type}",
        type=object_type,
        name=_build_item_name(name_response, object_type),
        creation_time=safe_props.get("createdate"),
        last_modified_time=last_modified,
        url=f"https://app.hubspot.com/contacts/{{portal_id}}/record/{object_type}/{response_json.get('id')}",
        delta=encrypt_json_payload(safe_props),
    )


async def get_items_hubspot(credentials):
    credentials = json.loads(credentials)
    access_token = credentials.get("access_token")
    if not access_token and credentials.get("connection_id"):
        connection_id = credentials.get("connection_id")
        user_id = credentials.get("user_id")
        org_id = credentials.get("org_id")
        if not connection_id or not user_id or not org_id:
            raise HTTPException(status_code=400, detail="Missing connection context.")
        stored_credentials = await get_value_redis(f"hubspot_session:{org_id}:{user_id}:{connection_id}")
        if not stored_credentials:
            raise HTTPException(status_code=400, detail="Session expired. Reconnect HubSpot.")
        credentials = json.loads(stored_credentials)
        access_token = credentials.get("access_token")
    if not access_token:
        raise HTTPException(status_code=400, detail="Missing access token.")

    headers = {"Authorization": f"Bearer {access_token}"}
    endpoints = {
        "contact": "https://api.hubapi.com/crm/v3/objects/contacts?limit=100&properties=firstname,lastname,email,createdate,lastmodifieddate,hs_lastmodifieddate,lifecyclestage",
        "company": "https://api.hubapi.com/crm/v3/objects/companies?limit=100&properties=name,domain,createdate,lastmodifieddate,hs_lastmodifieddate,industry",
        "deal": "https://api.hubapi.com/crm/v3/objects/deals?limit=100&properties=dealname,dealstage,amount,closedate,createdate,lastmodifieddate,hs_lastmodifieddate,pipeline",
    }

    list_of_integration_item_metadata = []
    for object_type, endpoint in endpoints.items():
        response = requests.get(endpoint, headers=headers, timeout=30)
        if response.status_code != 200:
            continue
        for result in response.json().get("results", []):
            list_of_integration_item_metadata.append(
                create_integration_item_metadata_object(result, object_type)
            )

    output = [item.__dict__ for item in list_of_integration_item_metadata]
    print(f"hubspot_integration_items: {output}")
    return output

import json

from fastapi import FastAPI, Form, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

from integrations.airtable import authorize_airtable, get_items_airtable, oauth2callback_airtable, get_airtable_credentials
from integrations.notion import authorize_notion, get_items_notion, oauth2callback_notion, get_notion_credentials
from integrations.hubspot import authorize_hubspot, get_hubspot_credentials, get_items_hubspot, oauth2callback_hubspot
from integrations.insights import generate_insights
from integrations.llm_insights import generate_llm_insights
from integrations.notion_publish import publish_insights_to_notion
from integrations.settings import get_user_settings, save_user_settings

app = FastAPI()

origins = [
    "http://localhost:3000",  # React app address
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get('/')
def read_root():
    return {'Ping': 'Pong'}


# Airtable
@app.post('/integrations/airtable/authorize')
async def authorize_airtable_integration(user_id: str = Form(...), org_id: str = Form(...)):
    return await authorize_airtable(user_id, org_id)

@app.get('/integrations/airtable/oauth2callback')
async def oauth2callback_airtable_integration(request: Request):
    return await oauth2callback_airtable(request)

@app.post('/integrations/airtable/credentials')
async def get_airtable_credentials_integration(user_id: str = Form(...), org_id: str = Form(...)):
    return await get_airtable_credentials(user_id, org_id)

@app.post('/integrations/airtable/load')
async def get_airtable_items(credentials: str = Form(...)):
    return await get_items_airtable(credentials)


# Notion
@app.post('/integrations/notion/authorize')
async def authorize_notion_integration(user_id: str = Form(...), org_id: str = Form(...)):
    return await authorize_notion(user_id, org_id)

@app.get('/integrations/notion/oauth2callback')
async def oauth2callback_notion_integration(request: Request):
    return await oauth2callback_notion(request)

@app.post('/integrations/notion/credentials')
async def get_notion_credentials_integration(user_id: str = Form(...), org_id: str = Form(...)):
    return await get_notion_credentials(user_id, org_id)

@app.post('/integrations/notion/load')
async def get_notion_items(credentials: str = Form(...)):
    return await get_items_notion(credentials)

# HubSpot
@app.post('/integrations/hubspot/authorize')
async def authorize_hubspot_integration(user_id: str = Form(...), org_id: str = Form(...)):
    return await authorize_hubspot(user_id, org_id)

@app.get('/integrations/hubspot/oauth2callback')
async def oauth2callback_hubspot_integration(request: Request):
    return await oauth2callback_hubspot(request)

@app.post('/integrations/hubspot/credentials')
async def get_hubspot_credentials_integration(user_id: str = Form(...), org_id: str = Form(...)):
    return await get_hubspot_credentials(user_id, org_id)

@app.post('/integrations/hubspot/load')
async def load_hubspot_data_integration(credentials: str = Form(...)):
    return await get_items_hubspot(credentials)


@app.post('/integrations/insights')
async def get_integration_insights(integration_type: str = Form(...), items: str = Form(...)):
    try:
        parsed_items = json.loads(items)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid items payload.") from exc

    if not isinstance(parsed_items, list):
        raise HTTPException(status_code=400, detail="items must be a list.")

    return generate_insights(parsed_items, integration_type)


@app.post('/integrations/insights/llm')
async def get_integration_llm_insights(
    integration_type: str = Form(...),
    items: str = Form(...),
    analyst_prompt: str = Form(""),
):
    try:
        parsed_items = json.loads(items)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid items payload.") from exc

    if not isinstance(parsed_items, list):
        raise HTTPException(status_code=400, detail="items must be a list.")

    return await generate_llm_insights(integration_type, parsed_items, analyst_prompt=analyst_prompt)


@app.post('/integrations/insights/publish-notion')
async def publish_insights_report_to_notion(
    integration_type: str = Form(...),
    insights: str = Form(...),
    llm_insight: str = Form(""),
    notion_access_token: str = Form(...),
    notion_parent_page_id: str = Form(...),
):
    try:
        parsed_insights = json.loads(insights)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid insights payload.") from exc

    if not isinstance(parsed_insights, dict):
        raise HTTPException(status_code=400, detail="insights must be an object.")

    parsed_llm = {}
    if llm_insight:
        try:
            parsed_llm = json.loads(llm_insight)
        except json.JSONDecodeError:
            parsed_llm = {"insight": llm_insight}

    return publish_insights_to_notion(
        notion_access_token=notion_access_token,
        parent_page_id=notion_parent_page_id,
        integration_type=integration_type,
        insights=parsed_insights,
        llm_insight=parsed_llm,
    )


@app.post('/integrations/settings/save')
async def save_integration_settings(
    user_id: str = Form(...),
    org_id: str = Form(...),
    notion_access_token: str = Form(""),
    notion_parent_page_id: str = Form(""),
):
    return await save_user_settings(user_id, org_id, notion_access_token, notion_parent_page_id)


@app.post('/integrations/settings/get')
async def get_integration_settings(
    user_id: str = Form(...),
    org_id: str = Form(...),
):
    return await get_user_settings(user_id, org_id)

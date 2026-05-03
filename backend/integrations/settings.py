import json

from redis_client import add_key_value_redis, get_value_redis
from integrations.crypto_utils import decrypt_json_payload, encrypt_json_payload


def _settings_key(user_id: str, org_id: str) -> str:
    return f"integration_settings:{org_id}:{user_id}"


async def save_user_settings(user_id: str, org_id: str, notion_access_token: str, notion_parent_page_id: str):
    payload = {
        "notion_access_token": notion_access_token or "",
        "notion_parent_page_id": notion_parent_page_id or "",
    }
    await add_key_value_redis(_settings_key(user_id, org_id), encrypt_json_payload(payload), expire=60 * 60 * 24 * 14)
    return {"status": "ok"}


async def get_user_settings(user_id: str, org_id: str):
    raw = await get_value_redis(_settings_key(user_id, org_id))
    if not raw:
        return {"notion_access_token": "", "notion_parent_page_id": ""}
    try:
        return decrypt_json_payload(raw)
    except Exception:
        # Backward compatibility for previously plain JSON values.
        return json.loads(raw)

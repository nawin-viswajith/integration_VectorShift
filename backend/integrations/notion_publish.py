import json

import requests
from fastapi import HTTPException


NOTION_VERSION = "2022-06-28"


def _paragraph(text):
    return {
        "object": "block",
        "type": "paragraph",
        "paragraph": {
            "rich_text": [{"type": "text", "text": {"content": text[:1900]}}]
        },
    }


def publish_insights_to_notion(
    notion_access_token: str,
    parent_page_id: str,
    integration_type: str,
    insights: dict,
):
    if not notion_access_token or not parent_page_id:
        raise HTTPException(status_code=400, detail="notion_access_token and parent_page_id are required.")

    summary = insights.get("summary", "No summary available.")
    total_items = insights.get("total_items", 0)
    health_score = insights.get("health_score", 0)
    automation_score = insights.get("automation_opportunity_score", 0)
    stale_items = insights.get("stale_items", 0)
    recommended_actions = insights.get("recommended_actions", [])

    title = f"{integration_type} CRM Health Report"
    children = [
        _paragraph(f"Summary: {summary}"),
        _paragraph(
            f"KPI Snapshot -> Total: {total_items}, Health Score: {health_score}/100, "
            f"Automation Opportunity: {automation_score}/100, Stale: {stale_items}"
        ),
        _paragraph("Recommended Actions:"),
    ]
    for idx, action in enumerate(recommended_actions[:10], start=1):
        children.append(_paragraph(f"{idx}. {action}"))

    payload = {
        "parent": {"page_id": parent_page_id},
        "properties": {
            "title": {
                "title": [{"type": "text", "text": {"content": title}}]
            }
        },
        "children": children,
    }

    response = requests.post(
        "https://api.notion.com/v1/pages",
        headers={
            "Authorization": f"Bearer {notion_access_token}",
            "Notion-Version": NOTION_VERSION,
            "Content-Type": "application/json",
        },
        data=json.dumps(payload),
        timeout=30,
    )

    if response.status_code >= 300:
        raise HTTPException(status_code=400, detail=f"Notion publish failed: {response.text}")

    data = response.json()
    return {
        "status": "ok",
        "notion_page_id": data.get("id"),
        "notion_page_url": data.get("url"),
    }

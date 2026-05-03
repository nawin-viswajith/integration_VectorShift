import os

import httpx
from fastapi import HTTPException
from dotenv import load_dotenv

load_dotenv()


GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = "gemini-2.5-flash-lite"
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"


async def generate_llm_insights(integration_type: str, items, analyst_prompt: str = ""):
    if not GEMINI_API_KEY:
        return {
            "provider": GEMINI_MODEL,
            "status": "fallback",
            "insight": (
                "GEMINI_API_KEY is not configured. Set it to enable live LLM insights. "
                "Fallback mode keeps dashboard functional for demo."
            ),
        }

    sample = items[:20]
    analyst_section = f"\nAnalyst request: {analyst_prompt}\n" if analyst_prompt else ""
    prompt = (
        f"You are an analytics copilot for a no-code AI platform. "
        f"Given integration data from {integration_type}, provide:\n"
        f"1) one-line executive summary\n"
        f"2) top 3 risks\n"
        f"3) top 3 automation opportunities\n"
        f"Keep it concise and practical."
        f"{analyst_section}\nData sample:\n{sample}"
    )

    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.2, "maxOutputTokens": 400},
    }

    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            f"{GEMINI_URL}?key={GEMINI_API_KEY}",
            json=payload,
        )

    if response.status_code != 200:
        raise HTTPException(status_code=400, detail=f"Gemini call failed: {response.text}")

    data = response.json()
    text = (
        data.get("candidates", [{}])[0]
        .get("content", {})
        .get("parts", [{}])[0]
        .get("text", "")
    )

    return {
        "provider": GEMINI_MODEL,
        "status": "ok",
        "insight": text or "No text returned by Gemini.",
    }

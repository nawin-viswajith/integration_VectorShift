# VectorShift Integrations Technical Assessment

## Overview
This project implements the required HubSpot OAuth integration and item loading flow using:
- Frontend: React + Material UI
- Backend: FastAPI
- State/Credentials cache: Redis

In addition to the required scope, this repo includes an optional AI Insights dashboard that computes CRM health metrics, provides explainability, supports LLM-based recommendations, and can publish insight reports to Notion.

## What Is Implemented

### Assessment Requirements
- HubSpot OAuth flow:
  - `POST /integrations/hubspot/authorize`
  - `GET /integrations/hubspot/oauth2callback`
  - `POST /integrations/hubspot/credentials`
- HubSpot item loading:
  - `POST /integrations/hubspot/load`
- Frontend wiring:
  - HubSpot connector added to integration selector
  - OAuth popup flow and credential handoff implemented

### Optional Product Extension
- AI Insights dashboard mode (toggle ON/OFF)
- Metric cards and explainability panel (click KPI card for details)
- ML-style deterministic scoring:
  - Health score
  - Automation opportunity score
  - Freshness/completeness
  - Missing field risk metrics
- LLM insights (Gemini 2.5 Flash-Lite) with analyst prompt
- Notion publishing:
  - publish dashboard summary/KPIs/actions to a Notion page
- User settings persistence in Redis:
  - Notion token + parent page ID saved per `user_id` + `org_id`

## Run Locally
Use 3 terminals.

### 1) Redis
```powershell
redis-server
```

### 2) Backend
```powershell
cd C:\Users\ASUS\Downloads\automations_technical_assessment\integrations_technical_assessment\backend
.venv312\Scripts\activate
pip install fastapi uvicorn redis requests httpx python-multipart kombu python-dotenv faker
uvicorn main:app --reload
```

### 3) Frontend
```powershell
cd C:\Users\ASUS\Downloads\automations_technical_assessment\integrations_technical_assessment\frontend
npm install
npm start
```

Frontend: `http://localhost:3000`  
Backend: `http://localhost:8000`

## Environment Variables
Create `backend/.env`:

```env
HUBSPOT_APP_ID=...
HUBSPOT_CLIENT_ID=...
HUBSPOT_CLIENT_SECRET=...
HUBSPOT_PRIVATE_APP_TOKEN=...
GEMINI_API_KEY=...

SEED_CONTACTS=100
SEED_COMPANIES=40
SEED_DEALS=80
```

Notes:
- `HUBSPOT_CLIENT_ID/SECRET` are for OAuth app flow.
- `HUBSPOT_PRIVATE_APP_TOKEN` is for bulk seeding script only.
- `GEMINI_API_KEY` is optional; app falls back gracefully if missing.

## HubSpot OAuth App Scopes
Required scopes should match install URL exactly:
- `oauth`
- `crm.objects.contacts.read`
- `crm.objects.companies.read`
- `crm.objects.deals.read`

## Seed Demo Data (Optional)
```powershell
cd C:\Users\ASUS\Downloads\automations_technical_assessment\integrations_technical_assessment\backend
.venv312\Scripts\activate
python scripts\seed_hubspot.py
```

Default creates:
- 100 contacts
- 40 companies
- 80 deals

## API Endpoints (Key)
- `POST /integrations/hubspot/authorize`
- `GET /integrations/hubspot/oauth2callback`
- `POST /integrations/hubspot/credentials`
- `POST /integrations/hubspot/load`
- `POST /integrations/insights`
- `POST /integrations/insights/llm`
- `POST /integrations/insights/publish-notion`
- `POST /integrations/settings/save`
- `POST /integrations/settings/get`

## Demo Flow (Quick)
1. Connect HubSpot
2. Load Data
3. Generate ML Insights
4. Click KPI tile to inspect explainability
5. Add analyst prompt and generate LLM insights
6. Save Notion settings
7. Publish report to Notion

## Current Limitations
- HubSpot loader fetches one page per object (up to configured `limit`) and does not yet paginate through all `after` cursors.
- Notion/Airtable base integrations from starter template may require real credentials for full operation.

## Security Note
If any token/secret was exposed during local testing, rotate it before final submission.

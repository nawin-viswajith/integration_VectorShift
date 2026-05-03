# VectorShift Integrations Technical Assessment

## Overview
This project completes the HubSpot OAuth + data loading assessment requirements and extends the product with an AI Insights workflow suitable for CRM Ops analysis and demo presentation.

Stack:
- Frontend: React + Material UI
- Backend: FastAPI
- Cache/session/settings store: Redis

Extended capabilities:
- AI Insights dashboard with explainability and actionable recommendations
- LLM insights generation with prompt customization
- Notion publishing for stakeholder-ready reporting
- PII safety and encryption controls for sensitive data handling

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
- Record explorer UI:
  - filterable (contact/company/deal), paginated cards, modal detail view

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
PII_SAFE_MODE=false
ENCRYPT_SENSITIVE_DATA=false
ENCRYPTION_KEY=

SEED_CONTACTS=100
SEED_COMPANIES=40
SEED_DEALS=80
```

Notes:
- `HUBSPOT_CLIENT_ID/SECRET` are for OAuth app flow.
- `HUBSPOT_PRIVATE_APP_TOKEN` is for bulk seeding script only.
- `GEMINI_API_KEY` is optional; app falls back gracefully if missing.
- `PII_SAFE_MODE=true` masks sensitive CRM fields in API responses and uses PII-minimized payloads for LLM prompts.
- `ENCRYPT_SENSITIVE_DATA=true` enables AES-256-GCM encryption for sensitive JSON payloads (`delta` fields and saved settings in Redis).
- `ENCRYPTION_KEY` must be a urlsafe base64-encoded 32-byte key.
- `ENABLE_AI_INSIGHTS=true` (if present in your environment conventions) can be used to gate AI-only behavior in deployment.

Generate an encryption key:
```powershell
python -c "import os,base64;print(base64.urlsafe_b64encode(os.urandom(32)).decode())"
```

## HubSpot OAuth App Scopes
Required scopes should match install URL exactly:
- `oauth`
- `crm.objects.contacts.read`
- `crm.objects.companies.read`
- `crm.objects.deals.read`

## Security & Privacy Controls
Implemented controls in this solution:
- OAuth credentials are not exposed in frontend responses; backend stores session material in Redis and returns an opaque connection reference.
- PII-safe mode (`PII_SAFE_MODE=true`) masks sensitive fields in loaded CRM records and minimizes sensitive payload passed to LLM analysis.
- Application-level encryption (`ENCRYPT_SENSITIVE_DATA=true`) uses AES-256-GCM for sensitive server-side fields/settings.
- Production guidance documented:
  - HTTPS/TLS in deployment
  - Redis at-rest encryption
  - Managed key rotation (KMS) for encryption keys

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
4. Click KPI tiles to inspect explainability + significance
5. Open LLM prompt panel, run default prompt, then a custom prompt
6. Save Notion settings (token + parent page id)
7. Publish report to Notion (includes LLM section when available)
8. Open record explorer: filter by type + paginate + open record detail modal

## Current Limitations
- HubSpot loader fetches one page per object (up to configured `limit`) and does not yet paginate through all `after` cursors.
- Notion/Airtable base integrations from starter template may require real credentials for full operation.
- This frontend is CRA-based; dependency stack shows legacy warnings from upstream CRA packages.

## Security Note
If any token/secret was exposed during local testing, rotate it before final submission.

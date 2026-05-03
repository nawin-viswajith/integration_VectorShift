# VectorShift Integrations Technical Assessment - KT Guide

## 1) What This Project Is About
This project is a full-stack integration demo for OAuth-based third-party connectors.

The app lets a user:
- Choose an integration (`Notion`, `Airtable`, `HubSpot`)
- Connect using OAuth in a popup
- Retrieve temporary credentials from backend
- Load integration items and display the response

The assessment focus is:
- Correct OAuth implementation in backend (FastAPI)
- Correct frontend wiring (React)
- Converting provider data into normalized `IntegrationItem` objects

## 2) Tech Stack
- Frontend: React + Material UI + Axios
- Backend: FastAPI + Redis + Requests/HTTPX
- OAuth state/credentials cache: Redis

## 3) Project Structure
```text
integrations_technical_assessment/
  backend/
    main.py
    redis_client.py
    requirements.txt
    integrations/
      airtable.py
      notion.py
      hubspot.py
      integration_item.py
  frontend/
    package.json
    src/
      App.js
      index.js
      index.css
      integration-form.js
      data-form.js
      integrations/
        airtable.js
        notion.js
        hubspot.js
        slack.js
```

## 4) How To Run
Run these in separate terminals.

### 4.1 Redis
```powershell
redis-server
```

### 4.2 Backend
```powershell
cd C:\Users\ASUS\Downloads\automations_technical_assessment\integrations_technical_assessment\backend
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```
Backend runs on `http://localhost:8000`.

### 4.3 Frontend
```powershell
cd C:\Users\ASUS\Downloads\automations_technical_assessment\integrations_technical_assessment\frontend
npm install
npm start
```
Frontend runs on `http://localhost:3000`.

### 4.4 HubSpot Credentials (required for HubSpot live flow)
Set environment variables before starting backend:
```powershell
$env:HUBSPOT_CLIENT_ID="your_client_id"
$env:HUBSPOT_CLIENT_SECRET="your_client_secret"
```

Note:
- `Notion` and `Airtable` credentials in this repo are template/test values and may not work unless replaced.

## 5) End-to-End Flow (Runtime)
1. User selects integration in frontend.
2. Frontend calls `POST /integrations/<provider>/authorize` with `user_id`, `org_id`.
3. Backend creates OAuth state, stores in Redis, returns provider auth URL.
4. Frontend opens popup to provider consent screen.
5. Provider redirects to backend callback endpoint.
6. Backend validates state, exchanges code for token, stores credentials in Redis.
7. Popup closes; frontend detects close and calls `POST /integrations/<provider>/credentials`.
8. Backend returns credentials and deletes one-time credential key.
9. Frontend calls `POST /integrations/<provider>/load` with credential payload.
10. Backend fetches provider objects and returns normalized item list.

## 6) API Endpoints
### Common Pattern Per Integration
- `POST /integrations/<provider>/authorize`
- `GET /integrations/<provider>/oauth2callback`
- `POST /integrations/<provider>/credentials`
- `POST /integrations/<provider>/load`

### Implemented Providers
- Airtable: fully wired
- Notion: mostly wired (load function currently prints but returns `None`)
- HubSpot: fully wired for this assessment

## 7) Script-By-Script KT

## Backend
- `backend/main.py`
  - FastAPI entrypoint.
  - Adds CORS for `http://localhost:3000`.
  - Exposes all integration routes for authorize/callback/credentials/load.
  - Delegates actual logic to provider modules.

- `backend/redis_client.py`
  - Creates async Redis client.
  - Utility functions:
    - `add_key_value_redis(key, value, expire)`
    - `get_value_redis(key)`
    - `delete_key_redis(key)`
  - Used for OAuth state and temporary credential storage.

- `backend/requirements.txt`
  - Python dependency list used by backend environment.

- `backend/integrations/integration_item.py`
  - Defines `IntegrationItem` class with common metadata fields:
    `id`, `type`, `name`, `parent_id`, timestamps, `url`, etc.
  - Serves as normalized model across different providers.

- `backend/integrations/airtable.py`
  - Implements Airtable OAuth with PKCE.
  - Stores and validates state + code verifier in Redis.
  - Exchanges auth code for token.
  - Loads Airtable bases and tables.
  - Converts each object to `IntegrationItem`.

- `backend/integrations/notion.py`
  - Implements Notion OAuth authorize/callback/credentials flow.
  - Uses recursive helper to derive readable names from Notion payloads.
  - `get_items_notion` queries Notion search API and builds item objects.
  - Current behavior: prints items; does not return item list to API caller.

- `backend/integrations/hubspot.py`
  - Implements HubSpot OAuth authorize/callback/credentials flow.
  - Reads `HUBSPOT_CLIENT_ID` and `HUBSPOT_CLIENT_SECRET` from env (fallback `XXX`).
  - Loads CRM objects: contacts, companies, deals.
  - Maps results to normalized objects and returns JSON-serializable list.

## Frontend
- `frontend/src/index.js`
  - React bootstrap entrypoint.
  - Renders `<App />` into root DOM node.

- `frontend/src/App.js`
  - Top-level app shell.
  - Renders `IntegrationForm`.

- `frontend/src/index.css`
  - Base global styles and default font setup.

- `frontend/src/integration-form.js`
  - Main UI container for integration workflow.
  - Lets user enter `user` and `organization`.
  - Lets user choose integration from dropdown.
  - Mounts selected integration connect component.
  - Shows `DataForm` after credentials are available.

- `frontend/src/data-form.js`
  - Handles data loading after integration is connected.
  - Maps integration type to backend endpoint segment.
  - Sends credentials to `/integrations/<provider>/load`.
  - Displays loaded response in text field.

- `frontend/src/integrations/airtable.js`
  - Airtable connect button + popup OAuth flow.
  - Retrieves credentials when popup closes.
  - Saves credentials into parent state.

- `frontend/src/integrations/notion.js`
  - Same pattern as Airtable for Notion.

- `frontend/src/integrations/hubspot.js`
  - Same OAuth popup pattern for HubSpot.
  - On success, stores `{ credentials, type: 'HubSpot' }` in parent state.

- `frontend/src/integrations/slack.js`
  - Placeholder file (`TODO`), not wired into UI.

- `frontend/package.json`
  - Frontend dependencies and scripts:
    - `npm start`
    - `npm run build`
    - `npm test`
    - `npm run eject`

## 8) Known Gaps / Risks
- Notion `load` endpoint currently returns `None` (items are printed only).
- Airtable currently has client values in code; should be moved to env vars.
- HubSpot record URL template contains placeholder `{portal_id}`.
- No pagination beyond first page in HubSpot object fetches.
- No automated tests are included for backend/frontend integration flows.

## 9) Suggested KT Walkthrough Sequence
1. Explain architecture (React UI -> FastAPI -> Redis -> provider APIs).
2. Show `main.py` route pattern for one provider.
3. Show provider OAuth flow (authorize, callback, credentials).
4. Show frontend popup flow and credential handoff.
5. Show item loading and normalization to `IntegrationItem`.
6. Demo HubSpot connect + load.
7. Close with known gaps and production hardening suggestions.

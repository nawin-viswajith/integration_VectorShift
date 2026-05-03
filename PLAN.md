# HubSpot Integration Assessment Execution Plan

## Summary
Implement a complete HubSpot OAuth + item loading integration across FastAPI backend and React frontend, following existing Airtable/Notion patterns, while fixing current HubSpot wiring inconsistencies so the flow works end-to-end from "Connect" to "Load Data".

## Implementation Changes
1. Backend OAuth (`backend/integrations/hubspot.py`)
- Implement `authorize_hubspot(user_id, org_id)`:
  - Generate and persist OAuth `state` in Redis with 10-minute TTL.
  - Build HubSpot authorization URL with required scopes and redirect URI.
- Implement `oauth2callback_hubspot(request)`:
  - Validate error query params.
  - Parse and validate state against Redis.
  - Exchange auth code for access token via HubSpot token endpoint.
  - Delete state key, store credentials in Redis with TTL, return close-window HTML.
- Implement `get_hubspot_credentials(user_id, org_id)`:
  - Fetch credentials from Redis, validate, delete after retrieval, return parsed JSON.
- Secret strategy:
  - Read `HUBSPOT_CLIENT_ID` / `HUBSPOT_CLIENT_SECRET` from env first.
  - Fallback to local placeholder constants in code if env vars are absent.
- Use consistent Redis key pattern: `hubspot_state:{org}:{user}`, `hubspot_credentials:{org}:{user}`.

2. Backend item loading (`get_items_hubspot`)
- Implement `create_integration_item_metadata_object(response_json)` to map HubSpot entities to `IntegrationItem` fields (id/type/name/timestamps/url/parent when available).
- Implement `get_items_hubspot(credentials)`:
  - Parse credentials JSON and call one or more HubSpot CRM endpoints (recommended: contacts + companies + deals).
  - Convert each record to `IntegrationItem`.
  - Return list of IntegrationItem-like objects (dict-serializable) and print/log for assessment visibility.

3. Backend route consistency (`backend/main.py`)
- Fix HubSpot load route naming mismatch for frontend parity:
  - Prefer `/integrations/hubspot/load` to match existing `DataForm` contract.
  - Keep handler name accurate (not `load_slack_data_integration`).

4. Frontend HubSpot integration component (`frontend/src/integrations/hubspot.js`)
- Create component mirroring Notion/Airtable UX:
  - "Connect to HubSpot" button.
  - OAuth popup flow.
  - Poll for popup close and fetch credentials.
  - Update `integrationParams` with `{ credentials, type: 'HubSpot' }`.
  - Loading and connected states with MUI button/progress behavior.

5. Frontend integration wiring
- Update `frontend/src/integration-form.js`:
  - Import `HubSpotIntegration`.
  - Add `"HubSpot"` to `integrationMapping`.
- Update `frontend/src/data-form.js`:
  - Add endpoint mapping `'HubSpot': 'hubspot'`.
  - Keep load action posting `credentials` JSON to `/integrations/hubspot/load`.

## Public API / Interface Updates
- Add/standardize backend load endpoint: `POST /integrations/hubspot/load` (form field: `credentials`).
- Frontend integration selector gains a new option: `HubSpot`.
- Environment variables supported: `HUBSPOT_CLIENT_ID`, `HUBSPOT_CLIENT_SECRET` (with code fallback constants).

## Test Plan
1. Startup and wiring checks
- Start Redis, backend (`uvicorn main:app --reload`), frontend (`npm run start`).
- Verify HubSpot appears in integration dropdown.
- Verify backend route list includes HubSpot authorize/callback/credentials/load endpoints.

2. OAuth flow tests
- Click "Connect to HubSpot".
- Confirm popup opens HubSpot consent page.
- Complete auth and verify popup auto-closes.
- Confirm UI shows "HubSpot Connected".
- Confirm credentials retrieval works exactly once (second fetch without reconnect should fail with "No credentials found").

3. Load-data tests
- Click "Load Data" for HubSpot after connection.
- Verify non-empty response is returned/rendered in text field (or at minimum logs in backend).
- Validate items include expected core fields (`id`, `type`, `name`) and stable typing across endpoint sources.

4. Negative-path tests
- Tampered/expired state should fail callback with 400.
- Invalid credentials payload should return clean error.
- Missing env vars should still work if fallback constants are set.

## Assumptions and Defaults
- OAuth callback URL remains `http://localhost:8000/integrations/hubspot/oauth2callback`.
- Scope set will cover read access to selected CRM objects (contacts/companies/deals).
- Returning serialized IntegrationItem objects is acceptable (matching existing pattern where responses are simple JSON payloads).
- Console output of loaded items is acceptable per assessment instructions, with UI display kept via existing `Loaded Data` field.

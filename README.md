# Rollout CRM Activity Sync

This project is a focused demo for exploring Rollout CRM activity data. It bundles a lightweight Express server with a React UI so you can:

- connect with Rollout Link using your client credentials,
- browse connected credentials and people records,
- inspect recent CRM activity (events, notes, calls, texts, appointments, tasks),
- and create new appointments against a selected credential.

The backend handles token generation and Rollout API calls, while the frontend provides an interactive workflow for testing against live CRM data.

## Project layout

- `index.js` / `src/` – Express server, session handling, and Rollout API helpers.
- `client/` – Vite + React single-page app for credential management and person insights.
- `rollout-crm-openapi.json` – reference OpenAPI schema for local exploration.
- `render.yaml` – optional Render deployment configuration.

## Prerequisites

- Node.js 18+ (22.x validated)
- npm 9+
- Rollout client credentials with CRM permissions

## Environment configuration

1. Copy `.env.example` to `.env`.
2. Populate the required variables:
   - `ROLLOUT_CLIENT_ID` / `ROLLOUT_CLIENT_SECRET` — client credentials used to mint JWTs for the Link session.
   - `SESSION_SECRET` — random string for cookie signing (do not share).
3. Optional overrides:
   - `ROLLOUT_CONSUMER_KEY` — default consumer key if none is set in the session.
   - `ALLOWED_ORIGINS` — comma-delimited list of origins allowed to access the API during development.
   - `ROLLOUT_API_BASE` / `ROLLOUT_CRM_API_BASE` — target a non-production Rollout environment.
   - `PERSON_RECORDS_LIMIT`, `MAX_PAGINATED_REQUESTS`, `ROLLOUT_TOKEN_TTL_SECS`, `SESSION_MAX_AGE_MS`, `PORT`.

Frontend-specific options can go in `client/.env.local` if you need them; for example `VITE_ROLLOUT_CONSUMER_KEY` seeds the consumer key field in the UI.

## Run locally

Install dependencies (this installs both server and client packages):

```bash
npm install
```

Start both the server (Express on `5174`) and client (Vite on `5173`):

```bash
npm run dev
```

The Vite dev server proxies `/api/*` requests to the Express backend and persists session data in memory. Visit http://localhost:5173 to use the app.

## Available scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Runs the Express server with `nodemon` and the React client with Vite. |
| `npm run server` / `client` | Start either half independently during development. |
| `npm run build` | Builds the React frontend into `client/dist`; Express will serve these assets in production mode. |
| `npm start` | Launches the Express server only (expects a pre-built `client/dist`). |

## Deploying

Any Node-capable host works: run `npm install`, then `npm run build`, and finally `npm start`. Provide the same environment variables you use locally. The included `render.yaml` gives a head start for Render deployments; adjust names and env vars as needed.

## Troubleshooting

- **401 errors from Rollout API:** confirm that client credentials are set either via `.env` or through the “Configure client credentials” form in the UI.
- **Empty people dropdown:** ensure the connected credential has people data and that the configured consumer key has access.
- **CORS failures:** update `ALLOWED_ORIGINS` to include your frontend origin (e.g. `http://localhost:5173` or the deployed URL).

## Next steps

- Leverage `rollout-crm-openapi.json` with tools like Stoplight or Postman for deeper API exploration.
- Extend `src/routes/` with additional CRM endpoints (tasks, deals, etc.) as needed.

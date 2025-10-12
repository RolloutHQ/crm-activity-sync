# Rollout Webhooks Demo

A full-stack demo for exercising Rollout credential management and webhook flows. The project exposes a small Express backend with a Vite-powered React UI.

## Prerequisites

- Node.js 18+ (22.x tested)
- npm 9+
- Rollout client credentials

## Local Development

```bash
npm install
npm run dev
```

The dev script runs both the Express server (port `5174`) and the Vite client (port `5173`). The Vite dev server proxies `/api/*` requests to the backend.

Create a `.env` file using `.env.example` as a template. At minimum you must set `ROLLOUT_CLIENT_ID`, `ROLLOUT_CLIENT_SECRET`, and `SESSION_SECRET`.

## Building

```bash
npm run build
```

This produces the production React build in `client/dist`. When present, Express serves the static assets automatically.

## Deploying to Render

1. **Push the repo** to a Git provider (GitHub, GitLab, Bitbucket).
2. **Create a new Web Service** on [render.com](https://render.com):
   - Environment: `Node`
   - Plan: `Free` (upgrade later if you need persistent uptime)
   - Build command: `npm install && npm run build`
   - Start command: `npm start`
3. **Set environment variables** in Render’s dashboard:
   - `ROLLOUT_CLIENT_ID`, `ROLLOUT_CLIENT_SECRET`
   - `ROLLOUT_CONSUMER_KEY` (optional, defaults to `demo-consumer`)
   - `ROLLOUT_API_BASE`, `ROLLOUT_CRM_API_BASE` (defaults provided)
   - `DEFAULT_WEBHOOK_TARGET`
   - `ALLOWED_ORIGINS` (include your Render URL, e.g. `https://your-app.onrender.com`)
   - `SESSION_SECRET` (use a long random string)
   - Optional: `SESSION_MAX_AGE_MS`, `MAX_RECEIVED_WEBHOOKS`, `ROLLOUT_TOKEN_TTL_SECS`
4. **Deploy**. Render will install dependencies, build the client, and run `npm start`.
5. **Verify** by visiting the Render URL (for example, `https://your-app.onrender.com`) and testing credential listing, webhook subscription, and the webhook log UI.

> ℹ️ A `render.yaml` file is included if you prefer infrastructure-as-code. Adjust the service name, region, and env vars as needed.

## Webhook Tunnel (Local Testing)

Use a tool like `ngrok http 5174` to expose your local server. Update the “Webhook Target” field in the UI (or `DEFAULT_WEBHOOK_TARGET`) with the public URL plus `/webhooks`.

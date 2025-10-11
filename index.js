const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 5174;
const ROLLOUT_API_BASE =
  process.env.ROLLOUT_API_BASE || "https://universal.rollout.com/api";
const ROLLOUT_CRM_API_BASE =
  process.env.ROLLOUT_CRM_API_BASE || "https://crm.universal.rollout.com/api";

const allowedOrigins = (process.env.ALLOWED_ORIGINS ||
  "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors(
    allowedOrigins.length > 0
      ? {
          origin(origin, callback) {
            if (!origin || allowedOrigins.includes(origin)) {
              callback(null, true);
            } else {
              callback(new Error("Not allowed by CORS"));
            }
          },
        }
      : undefined
  )
);

app.use(express.json());

app.use((req, res, next) => {
  console.log(`[Server] ${req.method} ${req.originalUrl}`);
  next();
});

app.post("/webhooks", (req, res) => {
  console.log("Received Rollout webhook:", {
    headers: req.headers,
    body: req.body,
  });
  res.status(204).end();
});

const ROLLOUT_CLIENT_ID = process.env.ROLLOUT_CLIENT_ID;
const ROLLOUT_CLIENT_SECRET = process.env.ROLLOUT_CLIENT_SECRET;
const DEFAULT_CONSUMER_KEY =
  process.env.ROLLOUT_CONSUMER_KEY || "demo-consumer";
const TOKEN_TTL_SECS =
  Number(process.env.ROLLOUT_TOKEN_TTL_SECS) || 60 * 60;
const DEFAULT_WEBHOOK_TARGET =
  process.env.DEFAULT_WEBHOOK_TARGET || "http://localhost:5174/webhooks";

function createRolloutToken(consumerKey = DEFAULT_CONSUMER_KEY) {
  if (!ROLLOUT_CLIENT_ID || !ROLLOUT_CLIENT_SECRET) {
    throw new Error("Rollout client credentials not configured");
  }

  if (!consumerKey) {
    throw new Error("Missing consumer key");
  }

  const nowSecs = Math.round(Date.now() / 1000);
  const exp = nowSecs + TOKEN_TTL_SECS;

  return jwt.sign(
    {
      iss: ROLLOUT_CLIENT_ID,
      sub: consumerKey,
      iat: nowSecs,
      exp,
    },
    ROLLOUT_CLIENT_SECRET,
    { algorithm: "HS512" }
  );
}

if (!ROLLOUT_CLIENT_ID || !ROLLOUT_CLIENT_SECRET) {
  console.warn(
    "Missing Rollout client credentials; /rollout-token will return 500 until they are configured."
  );
}

app.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/rollout-token", (req, res) => {
  try {
    const consumerKey = req.query.consumerKey || DEFAULT_CONSUMER_KEY;
    const token = createRolloutToken(consumerKey);
    const nowSecs = Math.round(Date.now() / 1000);
    const exp = nowSecs + TOKEN_TTL_SECS;
    res.json({ token, expiresAt: exp });
  } catch (err) {
    console.error("Error generating Rollout token", err);
    res.status(500).json({ error: "Unexpected error generating Rollout token" });
  }
});

async function callRolloutApi({
  baseUrl,
  path,
  method = "GET",
  searchParams,
  body,
  consumerKey,
  headers,
}) {
  const token = createRolloutToken(consumerKey);
  const sanitizedPath = path.startsWith("/") ? path.slice(1) : path;
  const normalizedBase = baseUrl.endsWith("/")
    ? baseUrl
    : `${baseUrl}/`;
  const url = new URL(sanitizedPath, normalizedBase);
  if (searchParams) {
    for (const [key, value] of Object.entries(searchParams)) {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  console.log(`[Rollout API] ${method} ${url.toString()}`);
  if (body) {
    console.log(`[Rollout API] Payload:`, body);
  }

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(headers || {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    const error = new Error(
      `Rollout API request failed with status ${response.status}`
    );
    error.status = response.status;
    error.body = errorBody;
    throw error;
  }

  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    const json = await response.json();
    console.log(`[Rollout API] Response (${response.status}):`, json);
    return json;
  }

  const text = await response.text();
  console.log(`[Rollout API] Response (${response.status}):`, text);
  return text;
}

app.get("/api/credentials", async (req, res) => {
  try {
    const data = await callRolloutApi({
      baseUrl: ROLLOUT_API_BASE,
      path: "/credentials",
      searchParams: {
        includeProfile: "true",
        includeData: "true",
      },
      consumerKey: req.query.consumerKey || DEFAULT_CONSUMER_KEY,
    });
    console.log(
      `[Server] Retrieved ${Array.isArray(data) ? data.length : "unknown"} credentials`
    );
    res.json(data);
  } catch (err) {
    if (err.status === 404) {
      console.warn("No credentials found for current consumer");
      res.json([]);
      return;
    }
    console.error("Error fetching credentials from Rollout", err);
    const status = err.status || 500;
    res
      .status(status)
      .json({ error: "Failed to fetch credentials", details: err.body });
  }
});

app.get("/api/webhooks", async (req, res) => {
  try {
    const { offset, limit, next, credentialId } = req.query;
    if (!credentialId) {
      res.status(400).json({ error: "credentialId query parameter is required" });
      return;
    }
    const data = await callRolloutApi({
      baseUrl: ROLLOUT_CRM_API_BASE,
      path: "/webhooks",
      searchParams: {
        offset,
        limit,
        next,
      },
      consumerKey: req.query.consumerKey || DEFAULT_CONSUMER_KEY,
      headers: {
        "x-rollout-credential-id": credentialId,
      },
    });
    console.log(
      `[Server] Retrieved ${Array.isArray(data) ? data.length : "unknown"} webhooks`
    );
    res.json(data);
  } catch (err) {
    if (err.status === 404) {
      console.warn("No webhook subscriptions found for current consumer");
      res.json([]);
      return;
    }
    console.error("Error fetching webhooks from Rollout", err);
    const status = err.status || 500;
    res
      .status(status)
      .json({ error: "Failed to fetch webhooks", details: err.body });
  }
});

app.post("/api/webhooks", async (req, res) => {
  const { url, event, filters, consumerKey, credentialId } = req.body || {};

  const webhookUrl = url || DEFAULT_WEBHOOK_TARGET;

  if (!webhookUrl || !event) {
    res.status(400).json({ error: "Webhook url and event are required" });
    return;
  }

  if (!credentialId) {
    res.status(400).json({ error: "Webhook credentialId is required" });
    return;
  }

  try {
    const data = await callRolloutApi({
      baseUrl: ROLLOUT_CRM_API_BASE,
      path: "/webhooks",
      method: "POST",
      body: {
        url: webhookUrl,
        event,
        filters: filters && typeof filters === "object" ? filters : {},
      },
      consumerKey: consumerKey || DEFAULT_CONSUMER_KEY,
      headers: {
        "x-rollout-credential-id": credentialId,
      },
    });
    res.status(201).json(data);
  } catch (err) {
    console.error("Error creating webhook subscription", err);
    const status = err.status || 500;
    res
      .status(status)
      .json({ error: "Failed to create webhook", details: err.body });
  }
});

const clientDistPath = path.join(__dirname, "client", "dist");
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));

  app.get("*", (_req, res) => {
    res.sendFile(path.join(clientDistPath, "index.html"));
  });
}

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});

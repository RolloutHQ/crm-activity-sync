const path = require("path");
const fs = require("fs");
const { randomUUID } = require("crypto");
const express = require("express");
const session = require("express-session");
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 5174;
const ROLLOUT_API_BASE =
  process.env.ROLLOUT_API_BASE || "https://universal.rollout.com/api";
const ROLLOUT_CRM_API_BASE =
  process.env.ROLLOUT_CRM_API_BASE || "https://crm.universal.rollout.com/api";
const ROLLOUT_CLIENT_ID = process.env.ROLLOUT_CLIENT_ID;
const ROLLOUT_CLIENT_SECRET = process.env.ROLLOUT_CLIENT_SECRET;
const DEFAULT_CONSUMER_KEY =
  process.env.ROLLOUT_CONSUMER_KEY || "demo-consumer";
const DEFAULT_ACCORDION_STATE = {
  connectProvider: true,
  connectedCredentials: true,
  webhookTarget: true,
  webhookSubscriptions: true,
  receivedWebhooks: true,
};
const TOKEN_TTL_SECS =
  Number(process.env.ROLLOUT_TOKEN_TTL_SECS) || 60 * 60;
const DEFAULT_WEBHOOK_TARGET =
  process.env.DEFAULT_WEBHOOK_TARGET ||
  "https://rollout-webhooks-demo.onrender.com/webhooks";
const MAX_RECEIVED_WEBHOOKS =
  Number(process.env.MAX_RECEIVED_WEBHOOKS) || 100;
const SESSION_SECRET = process.env.SESSION_SECRET || "rollout-demo-secret";
const SESSION_MAX_AGE_MS =
  Number(process.env.SESSION_MAX_AGE_MS) || 1000 * 60 * 60 * 6;
const SESSION_DB_PATH =
  process.env.SESSION_DB_PATH ||
  path.join(__dirname, "session-data", "sessions.sqlite");
const receivedWebhooks = [];

function sanitizeConsumerKey(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveConsumerKey(req, provided) {
  const override = sanitizeConsumerKey(provided);
  if (override) {
    return override;
  }
  const sessionKey = sanitizeConsumerKey(req.session?.consumerKey);
  if (sessionKey) {
    return sessionKey;
  }
  return DEFAULT_CONSUMER_KEY;
}

function normalizeAccordionState(value) {
  const normalized = { ...DEFAULT_ACCORDION_STATE };
  if (value && typeof value === "object") {
    for (const key of Object.keys(DEFAULT_ACCORDION_STATE)) {
      if (typeof value[key] === "boolean") {
        normalized[key] = value[key];
      }
    }
  }
  return normalized;
}

if (!fs.existsSync(path.dirname(SESSION_DB_PATH))) {
  fs.mkdirSync(path.dirname(SESSION_DB_PATH), { recursive: true });
}

const SQLiteStore = require("connect-sqlite3")(session);

// Respect the Render proxy so secure cookies are transmitted correctly.
app.set("trust proxy", 1);

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
          credentials: true,
        }
      : undefined
  )
);

app.use(
  session({
    name: "rollout.sid",
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: new SQLiteStore({
      db: path.basename(SESSION_DB_PATH),
      dir: path.dirname(SESSION_DB_PATH),
      concurrentDB: false,
    }),
    cookie: {
      maxAge: SESSION_MAX_AGE_MS,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
  })
);

app.use(express.json());

app.use((req, res, next) => {
  console.log(`[Server] ${req.method} ${req.originalUrl}`);
  next();
});

app.post("/webhooks", (req, res) => {
  const payload = {
    id: randomUUID(),
    receivedAt: new Date().toISOString(),
    headers: req.headers,
    body: req.body,
  };
  console.log("Received Rollout webhook:", payload);
  receivedWebhooks.unshift(payload);
  if (receivedWebhooks.length > MAX_RECEIVED_WEBHOOKS) {
    receivedWebhooks.length = MAX_RECEIVED_WEBHOOKS;
  }
  res.status(204).end();
});

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
    const consumerKey = resolveConsumerKey(req, req.query.consumerKey);
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
  const resolvedConsumerKey = sanitizeConsumerKey(consumerKey) || DEFAULT_CONSUMER_KEY;
  const token = createRolloutToken(resolvedConsumerKey);
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
      consumerKey: resolveConsumerKey(req, req.query.consumerKey),
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
      consumerKey: resolveConsumerKey(req, req.query.consumerKey),
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
      consumerKey: resolveConsumerKey(req, consumerKey),
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

app.get("/api/session/consumer-key", (req, res) => {
  const stored = sanitizeConsumerKey(req.session.consumerKey);
  res.json({
    consumerKey: stored || "",
    effectiveConsumerKey: stored || DEFAULT_CONSUMER_KEY,
  });
});

app.post("/api/session/consumer-key", (req, res) => {
  const { consumerKey } = req.body || {};
  if (
    consumerKey !== undefined &&
    consumerKey !== null &&
    typeof consumerKey !== "string"
  ) {
    res
      .status(400)
      .json({ error: "consumerKey must be a string, null, or undefined" });
    return;
  }

  const sanitized = sanitizeConsumerKey(consumerKey);
  if (sanitized) {
    req.session.consumerKey = sanitized;
  } else {
    delete req.session.consumerKey;
  }

  res.json({
    consumerKey: sanitized || "",
    effectiveConsumerKey: resolveConsumerKey(req),
  });
});

app.get("/api/session/accordion", (req, res) => {
  const stored = req.session.accordionState;
  const accordionState = normalizeAccordionState(stored);
  res.json({ accordionState });
});

app.post("/api/session/accordion", (req, res) => {
  const { accordionState } = req.body || {};
  if (
    !accordionState ||
    typeof accordionState !== "object" ||
    Array.isArray(accordionState)
  ) {
    res
      .status(400)
      .json({ error: "accordionState must be an object containing booleans" });
    return;
  }

  const normalized = normalizeAccordionState(accordionState);
  req.session.accordionState = normalized;
  res.json({ accordionState: normalized });
});

app.get("/api/session/webhook-target", (req, res) => {
  const storedTarget = req.session.webhookTarget;
  res.json({
    webhookTarget:
      typeof storedTarget === "string" && storedTarget.length > 0
        ? storedTarget
        : DEFAULT_WEBHOOK_TARGET,
  });
});

app.post("/api/session/webhook-target", (req, res) => {
  const { webhookTarget } = req.body || {};
  if (typeof webhookTarget !== "string") {
    res.status(400).json({ error: "webhookTarget must be a string" });
    return;
  }

  req.session.webhookTarget = webhookTarget.trim();
  res.json({ webhookTarget: req.session.webhookTarget });
});

app.delete("/api/webhooks/:id", async (req, res) => {
  const { id } = req.params;
  const { credentialId, consumerKey } = req.query;

  if (!id) {
    res.status(400).json({ error: "Webhook id is required" });
    return;
  }

  if (!credentialId) {
    res.status(400).json({ error: "credentialId query parameter is required" });
    return;
  }

  try {
    await callRolloutApi({
      baseUrl: ROLLOUT_CRM_API_BASE,
      path: `/webhooks/${id}`,
      method: "DELETE",
      consumerKey: resolveConsumerKey(req, consumerKey),
      headers: {
        "x-rollout-credential-id": credentialId,
      },
    });
    res.status(204).end();
  } catch (err) {
    console.error("Error deleting webhook subscription", err);
    const status = err.status || 500;
    res
      .status(status)
      .json({ error: "Failed to delete webhook", details: err.body });
  }
});

app.get("/api/received-webhooks", (_req, res) => {
  res.json(receivedWebhooks);
});

app.delete("/api/received-webhooks", (_req, res) => {
  receivedWebhooks.length = 0;
  console.log("[Server] Cleared received webhook log");
  res.status(204).end();
});

const clientDistPath = path.join(__dirname, "client", "dist");
app.use(express.static(clientDistPath));

app.get("*", (_req, res, next) => {
  const indexPath = path.join(clientDistPath, "index.html");
  if (!fs.existsSync(indexPath)) {
    next();
    return;
  }
  res.sendFile(indexPath);
});

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});

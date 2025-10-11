const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 5174;

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

const ROLLOUT_CLIENT_ID = process.env.ROLLOUT_CLIENT_ID;
const ROLLOUT_CLIENT_SECRET = process.env.ROLLOUT_CLIENT_SECRET;
const DEFAULT_CONSUMER_KEY =
  process.env.ROLLOUT_CONSUMER_KEY || "demo-consumer";
const TOKEN_TTL_SECS =
  Number(process.env.ROLLOUT_TOKEN_TTL_SECS) || 60 * 60;

if (!ROLLOUT_CLIENT_ID || !ROLLOUT_CLIENT_SECRET) {
  console.warn(
    "Missing Rollout client credentials; /rollout-token will return 500 until they are configured."
  );
}

app.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/rollout-token", (req, res) => {
  if (!ROLLOUT_CLIENT_ID || !ROLLOUT_CLIENT_SECRET) {
    res.status(500).json({ error: "Rollout client credentials not configured" });
    return;
  }

  const consumerKey = req.query.consumerKey || DEFAULT_CONSUMER_KEY;
  if (!consumerKey) {
    res.status(400).json({ error: "Missing consumer key" });
    return;
  }

  try {
    const nowSecs = Math.round(Date.now() / 1000);
    const exp = nowSecs + TOKEN_TTL_SECS;
    const token = jwt.sign(
      {
        iss: ROLLOUT_CLIENT_ID,
        sub: consumerKey,
        iat: nowSecs,
        exp,
      },
      ROLLOUT_CLIENT_SECRET,
      { algorithm: "HS512" }
    );

    res.json({ token, expiresAt: exp });
  } catch (err) {
    console.error("Error generating Rollout token", err);
    res.status(500).json({ error: "Unexpected error generating Rollout token" });
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

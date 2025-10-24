const express = require("express");
const router = express.Router();
const { allowedOrigins } = require("../config");
const {
  getSessionRolloutClientCredentials,
  getEffectiveRolloutClientCredentials,
  resolveConsumerKey,
  createRolloutToken,
} = require("../rollout/auth");
const { sanitizeClientId, sanitizeClientSecret, sanitizeConsumerKey } = require("../util");

router.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

router.get("/rollout-token", (req, res) => {
  try {
    const consumerKey = resolveConsumerKey(req, req.query.consumerKey);
    const token = createRolloutToken(req, consumerKey);
    const nowSecs = Math.round(Date.now() / 1000);
    const exp = nowSecs + require("../config").TOKEN_TTL_SECS;
    res.json({ token, expiresAt: exp });
  } catch (err) {
    console.error("Error generating Rollout token", err);
    const status = err.status || 500;
    const message = status === 401 ? err.message : "Unexpected error generating Rollout token";
    res.status(status).json({ error: message });
  }
});

router.get("/api/session/rollout-client", (req, res) => {
  const sessionCreds = getSessionRolloutClientCredentials(req);
  const effectiveCreds = getEffectiveRolloutClientCredentials(req);
  const usingEnvironment = !sessionCreds && Boolean(require("../config").DEFAULT_ROLLOUT_CLIENT_ID && require("../config").DEFAULT_ROLLOUT_CLIENT_SECRET);
  res.json({
    configured: Boolean(effectiveCreds),
    clientId: effectiveCreds?.clientId || "",
    updatedAt: sessionCreds?.updatedAt || null,
    defaultClientId: require("../config").DEFAULT_ROLLOUT_CLIENT_ID,
    usingEnvironment,
    sessionClientId: sessionCreds?.clientId || "",
  });
});

router.post("/api/session/rollout-client", (req, res) => {
  const { clientId, clientSecret } = req.body || {};
  const sanitizedId = sanitizeClientId(clientId);
  const sanitizedSecret = sanitizeClientSecret(clientSecret);
  if (!sanitizedId || !sanitizedSecret) {
    res.status(400).json({ error: "clientId and clientSecret must be non-empty strings" });
    return;
  }
  req.session.rolloutClientCredentials = {
    clientId: sanitizedId,
    clientSecret: sanitizedSecret,
    updatedAt: new Date().toISOString(),
  };
  delete req.session.defaultCredentialId;
  res.json({
    configured: true,
    clientId: sanitizedId,
    defaultClientId: require("../config").DEFAULT_ROLLOUT_CLIENT_ID,
    usingEnvironment: false,
    sessionClientId: sanitizedId,
  });
});

router.delete("/api/session/rollout-client", (req, res) => {
  delete req.session.rolloutClientCredentials;
  delete req.session.defaultCredentialId;
  res.status(204).end();
});

router.get("/api/session/consumer-key", (req, res) => {
  const stored = sanitizeConsumerKey(req.session.consumerKey);
  res.json({ consumerKey: stored || "", effectiveConsumerKey: stored || require("../config").DEFAULT_CONSUMER_KEY });
});

router.post("/api/session/consumer-key", (req, res) => {
  const { consumerKey } = req.body || {};
  if (consumerKey !== undefined && consumerKey !== null && typeof consumerKey !== "string") {
    res.status(400).json({ error: "consumerKey must be a string, null, or undefined" });
    return;
  }
  const sanitized = sanitizeConsumerKey(consumerKey);
  if (sanitized) req.session.consumerKey = sanitized;
  else delete req.session.consumerKey;
  res.json({ consumerKey: sanitized || "", effectiveConsumerKey: require("../rollout/auth").resolveConsumerKey(req) });
});

module.exports = router;


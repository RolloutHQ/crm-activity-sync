const jwt = require("jsonwebtoken");
const {
  DEFAULT_CONSUMER_KEY,
  DEFAULT_ROLLOUT_CLIENT_ID,
  DEFAULT_ROLLOUT_CLIENT_SECRET,
  TOKEN_TTL_SECS,
} = require("../config");
const { sanitizeClientId, sanitizeClientSecret, sanitizeConsumerKey } = require("../util");

function getSessionRolloutClientCredentials(req) {
  const stored = req.session?.rolloutClientCredentials;
  if (!stored || typeof stored !== "object") return null;
  const clientId = sanitizeClientId(stored.clientId);
  const clientSecret = sanitizeClientSecret(stored.clientSecret);
  if (!clientId || !clientSecret) return null;
  return {
    clientId,
    clientSecret,
    updatedAt: typeof stored.updatedAt === "string" && stored.updatedAt.length > 0 ? stored.updatedAt : null,
  };
}

function getEffectiveRolloutClientCredentials(req) {
  const sessionCreds = getSessionRolloutClientCredentials(req);
  if (sessionCreds) return sessionCreds;
  if (DEFAULT_ROLLOUT_CLIENT_ID && DEFAULT_ROLLOUT_CLIENT_SECRET) {
    return { clientId: DEFAULT_ROLLOUT_CLIENT_ID, clientSecret: DEFAULT_ROLLOUT_CLIENT_SECRET };
  }
  return null;
}

function requireRolloutClientCredentials(req) {
  const credentials = getEffectiveRolloutClientCredentials(req);
  if (!credentials) {
    const error = new Error("Rollout client credentials are not configured for this session");
    error.status = 401;
    throw error;
  }
  return credentials;
}

function resolveConsumerKey(req, provided) {
  const override = sanitizeConsumerKey(provided);
  if (override) return override;
  const sessionKey = sanitizeConsumerKey(req.session?.consumerKey);
  if (sessionKey) return sessionKey;
  return DEFAULT_CONSUMER_KEY;
}

function createRolloutToken(req, consumerKey = DEFAULT_CONSUMER_KEY) {
  if (!consumerKey) throw new Error("Missing consumer key");
  const { clientId, clientSecret } = requireRolloutClientCredentials(req);
  const nowSecs = Math.round(Date.now() / 1000);
  const exp = nowSecs + TOKEN_TTL_SECS;
  return jwt.sign({ iss: clientId, sub: consumerKey, iat: nowSecs, exp }, clientSecret, { algorithm: "HS512" });
}

module.exports = {
  getSessionRolloutClientCredentials,
  getEffectiveRolloutClientCredentials,
  requireRolloutClientCredentials,
  resolveConsumerKey,
  createRolloutToken,
};


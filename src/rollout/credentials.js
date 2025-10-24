const { callRolloutApi, ROLLOUT_API_BASE } = require("./client");
const { extractItems } = require("../util");

async function resolveDefaultCredentialId(req, explicitCredentialId) {
  if (typeof explicitCredentialId === "string" && explicitCredentialId.trim().length > 0) {
    req.session.defaultCredentialId = explicitCredentialId.trim();
    return explicitCredentialId.trim();
  }
  const cached =
    typeof req.session.defaultCredentialId === "string" && req.session.defaultCredentialId.length > 0
      ? req.session.defaultCredentialId
      : null;
  if (cached) return cached;
  const data = await callRolloutApi(req, {
    baseUrl: ROLLOUT_API_BASE,
    path: "/credentials",
    searchParams: { includeProfile: "true", includeData: "true" },
  });
  const credentials = extractItems(data);
  const first = credentials.find((credential) => credential && typeof credential.id === "string" && credential.id.trim().length > 0);
  if (!first) return null;
  req.session.defaultCredentialId = first.id;
  return first.id;
}

module.exports = { resolveDefaultCredentialId };


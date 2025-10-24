const { ROLLOUT_API_BASE, ROLLOUT_CRM_API_BASE } = require("../config");
const { resolveConsumerKey, createRolloutToken } = require("./auth");

async function callRolloutApi(
  req,
  { baseUrl, path: apiPath, method = "GET", searchParams, body, consumerKey, credentialId, headers } = {}
) {
  const resolvedConsumerKey = resolveConsumerKey(req, consumerKey);
  const token = createRolloutToken(req, resolvedConsumerKey);
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const sanitizedPath = apiPath.startsWith("/") ? apiPath.slice(1) : apiPath;
  const url = new URL(sanitizedPath, normalizedBase);
  if (searchParams && typeof searchParams === "object") {
    for (const [key, value] of Object.entries(searchParams)) {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
    }
  }
  const requestHeaders = {
    Authorization: `Bearer ${token}`,
    ...(credentialId ? { "X-Rollout-Credential-Id": credentialId } : {}),
    ...(headers || {}),
  };
  let requestBody;
  if (body !== undefined) {
    requestHeaders["Content-Type"] = "application/json";
    requestBody = JSON.stringify(body);
  }
  const response = await fetch(url.toString(), { method, headers: requestHeaders, body: requestBody });
  console.log(`[Rollout API] ${method} ${url.toString()}${credentialId ? ` (credential ${credentialId})` : ""}`);
  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[Rollout API] ${method} ${url.toString()} failed: ${response.status} ${errorBody}`);
    const error = new Error(`Rollout API request failed with status ${response.status}`);
    error.status = response.status;
    error.body = errorBody;
    throw error;
  }
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const json = await response.json();
    console.log(`[Rollout API] ${method} ${url.toString()} succeeded: ${response.status}`, JSON.stringify(json).slice(0, 2000));
    return json;
  }
  const text = await response.text();
  console.log(`[Rollout API] ${method} ${url.toString()} succeeded: ${response.status} ${text.slice(0, 2000)}`);
  return text;
}

module.exports = {
  callRolloutApi,
  ROLLOUT_API_BASE,
  ROLLOUT_CRM_API_BASE,
};


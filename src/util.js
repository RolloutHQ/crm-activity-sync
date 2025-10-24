function sanitizeConsumerKey(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function sanitizeClientId(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function sanitizeClientSecret(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function extractItems(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.data)) return data.data;
  if (Array.isArray(data.credentials)) return data.credentials;
  if (Array.isArray(data.results)) return data.results;
  if (typeof data === "object") {
    const firstArray = Object.values(data).find((value) => Array.isArray(value));
    if (Array.isArray(firstArray)) return firstArray;
  }
  return [];
}

module.exports = {
  sanitizeConsumerKey,
  sanitizeClientId,
  sanitizeClientSecret,
  extractItems,
};


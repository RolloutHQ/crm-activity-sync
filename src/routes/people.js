const express = require("express");
const router = express.Router();
const { callRolloutApi, ROLLOUT_CRM_API_BASE } = require("../rollout/client");
const { resolveDefaultCredentialId } = require("../rollout/credentials");
const { extractItems } = require("../util");
const { MAX_PAGINATED_REQUESTS } = require("../config");

router.get("/api/people", async (req, res) => {
  const limitParam = Number.parseInt(req.query.limit, 10);
  const limit = Number.isFinite(limitParam) && limitParam > 0 && limitParam <= 100 ? limitParam : 20;
  const pageLimit = Math.min(100, Math.max(1, limit));
  const credentialOverride = typeof req.query.credentialId === "string" ? req.query.credentialId.trim() : undefined;
  try {
    const credentialId = await resolveDefaultCredentialId(req, credentialOverride);
    if (!credentialId) {
      res.status(400).json({ error: "No Rollout credentials available. Connect a provider first." });
      return;
    }
    const people = [];
    const seenIds = new Set();
    let next = null;
    let iterations = 0;
    while (iterations < MAX_PAGINATED_REQUESTS && people.length < limit) {
      const searchParams = { limit: pageLimit };
      if (next) searchParams.next = next;
      const data = await callRolloutApi(req, { baseUrl: ROLLOUT_CRM_API_BASE, path: "/people", searchParams, credentialId });
      const items = extractItems(data);
      for (const person of items) {
        if (!person || person.id === undefined || person.id === null) continue;
        const id = String(person.id).trim();
        if (!id || seenIds.has(id)) continue;
        const fullName = [person.firstName, person.lastName]
          .filter((v) => typeof v === "string" && v.trim().length > 0)
          .join(" ")
          .trim();
        let email = "";
        if (Array.isArray(person.emails)) {
          const primaryEmail = person.emails.find((e) => e?.isPrimary) || person.emails[0];
          if (primaryEmail && typeof primaryEmail.value === "string") email = primaryEmail.value.trim();
        }
        const labelParts = [fullName || null, email || null].filter(Boolean);
        const label = labelParts.length > 0 ? labelParts.join(" · ") : id;
        people.push({ id, label });
        seenIds.add(id);
        if (people.length >= limit) break;
      }
      if (people.length >= limit) break;
      next = typeof data?._metadata?.next === "string" && data._metadata.next.length > 0 ? data._metadata.next : null;
      if (!next) break;
      iterations += 1;
    }
    res.json({ people });
  } catch (err) {
    console.error("Error fetching people", err);
    const status = err.status || 500;
    res.status(status).json({ error: err.message || "Failed to fetch people" });
  }
});

module.exports = router;


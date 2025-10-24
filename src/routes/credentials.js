const express = require("express");
const router = express.Router();
const { callRolloutApi, ROLLOUT_API_BASE } = require("../rollout/client");
const { extractItems } = require("../util");

router.get("/api/credentials", async (req, res) => {
  try {
    const data = await callRolloutApi(req, {
      baseUrl: ROLLOUT_API_BASE,
      path: "/credentials",
      searchParams: { includeProfile: "true", includeData: "true" },
      consumerKey: req.query.consumerKey,
    });
    const credentials = extractItems(data)
      .map((credential) => {
        if (!credential || typeof credential !== "object") return null;
        const id = typeof credential.id === "string" && credential.id.trim().length > 0 ? credential.id.trim() : null;
        if (!id) return null;
        const appKey = typeof credential.appKey === "string" ? credential.appKey : "";
        const accountName = typeof credential.profile?.accountName === "string" ? credential.profile.accountName : "";
        const label = accountName || appKey || id;
        return { id, label, appKey, accountName };
      })
      .filter(Boolean);
    res.json({ credentials });
  } catch (err) {
    console.error("Error fetching Rollout credentials", err);
    const status = err.status || 500;
    res.status(status).json({ error: err.message || "Failed to fetch credentials" });
  }
});

module.exports = router;


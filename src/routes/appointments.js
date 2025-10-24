const express = require("express");
const router = express.Router();
const { callRolloutApi, ROLLOUT_CRM_API_BASE } = require("../rollout/client");
const { resolveDefaultCredentialId } = require("../rollout/credentials");
const { extractItems } = require("../util");

async function fetchAppointmentMetadata(req, credentialId, { path, label }) {
  const data = await callRolloutApi(req, { baseUrl: ROLLOUT_CRM_API_BASE, path, credentialId });
  return extractItems(data)
    .filter((item) => item && item.id !== undefined && item.id !== null)
    .map((item) => {
      const id = String(item.id).trim();
      if (!id) return null;
      const text =
        (typeof item.name === "string" && item.name.trim().length > 0 && item.name.trim()) ||
        (typeof item.label === "string" && item.label.trim().length > 0 && item.label.trim()) ||
        `${label} ${id}`;
      return { id, label: text };
    })
    .filter(Boolean);
}

async function resolveDefaultUserId(req, credentialId) {
  try {
    const data = await callRolloutApi(req, {
      baseUrl: ROLLOUT_CRM_API_BASE,
      path: "/users",
      searchParams: { limit: 1 },
      credentialId,
    });
    const items = extractItems(data);
    const first = items.find((u) => u && (typeof u.id === "string" || typeof u.id === "number"));
    return first ? String(first.id).trim() : null;
  } catch (_e) {
    return null;
  }
}

async function fetchFirstAppointmentTypeId(req, credentialId) {
  try {
    const data = await callRolloutApi(req, { baseUrl: ROLLOUT_CRM_API_BASE, path: "/appointment-types", credentialId });
    const items = extractItems(data);
    const first = items.find((t) => t && (typeof t.id === "string" || typeof t.id === "number"));
    return first ? String(first.id).trim() : null;
  } catch (_e) {
    return null;
  }
}

router.get("/api/appointment-metadata", async (req, res) => {
  const credentialOverride = typeof req.query.credentialId === "string" ? req.query.credentialId.trim() : undefined;
  try {
    const credentialId = await resolveDefaultCredentialId(req, credentialOverride);
    if (!credentialId) {
      res.status(400).json({ error: "No Rollout credentials available. Connect a provider first to continue." });
      return;
    }
    const [types, outcomes] = await Promise.all([
      fetchAppointmentMetadata(req, credentialId, { path: "/appointment-types", label: "Type" }),
      fetchAppointmentMetadata(req, credentialId, { path: "/appointment-outcomes", label: "Outcome" }),
    ]);
    res.json({ types, outcomes });
  } catch (err) {
    console.error("Error fetching appointment metadata", err);
    const status = err.status || 500;
    res.status(status).json({ error: err.message || "Failed to fetch appointment metadata" });
  }
});

router.get("/api/users", async (req, res) => {
  const credentialOverride = typeof req.query.credentialId === "string" ? req.query.credentialId.trim() : undefined;
  const limitParam = Number.parseInt(req.query.limit, 10);
  const limit = Number.isFinite(limitParam) && limitParam > 0 && limitParam <= 500 ? limitParam : 100;
  const pageLimit = Math.min(100, Math.max(1, limit));
  const { MAX_PAGINATED_REQUESTS } = require("../config");
  try {
    const credentialId = await resolveDefaultCredentialId(req, credentialOverride);
    if (!credentialId) {
      res.status(400).json({ error: "No Rollout credentials available. Connect a provider first to continue." });
      return;
    }
    const users = [];
    const seen = new Set();
    let next = null;
    let iterations = 0;
    while (iterations < MAX_PAGINATED_REQUESTS && users.length < limit) {
      const searchParams = { limit: pageLimit };
      if (next) searchParams.next = next;
      const data = await callRolloutApi(req, { baseUrl: ROLLOUT_CRM_API_BASE, path: "/users", searchParams, credentialId });
      const items = extractItems(data);
      for (const u of items) {
        const id = u && (typeof u.id === "string" || typeof u.id === "number") ? String(u.id).trim() : "";
        if (!id || seen.has(id)) continue;
        const name = [u.firstName, u.lastName]
          .filter((v) => typeof v === "string" && v.trim().length > 0)
          .join(" ")
          .trim();
        const email = typeof u.email === "string" ? u.email.trim() : "";
        const label = name || email || id;
        users.push({ id, label });
        seen.add(id);
        if (users.length >= limit) break;
      }
      if (users.length >= limit) break;
      next = typeof data?._metadata?.next === "string" && data._metadata.next.length > 0 ? data._metadata.next : null;
      if (!next) break;
      iterations += 1;
    }
    res.json({ users });
  } catch (err) {
    console.error("Error fetching users", err);
    const status = err.status || 500;
    res.status(status).json({ error: err.message || "Failed to fetch users" });
  }
});

router.post("/api/appointments", async (req, res) => {
  const {
    credentialId: credentialOverride,
    personId,
    userId,
    appointmentTypeId,
    appointmentOutcomeId,
    title,
    description,
    location,
    isAllDay,
    startsAt,
    endsAt,
  } = req.body || {};
  try {
    const credentialId = await resolveDefaultCredentialId(req, credentialOverride);
    if (!credentialId) {
      res.status(400).json({ error: "No Rollout credentials available. Connect a provider first to continue." });
      return;
    }
    const problems = [];
    if (!(typeof personId === "string" && personId.trim())) problems.push("personId");
    if (!(typeof title === "string" && title.trim())) problems.push("title");
    if (!(typeof location === "string" && location.trim())) problems.push("location");
    if (problems.length > 0) {
      res.status(400).json({ error: `Missing required fields: ${problems.join(", ")}` });
      return;
    }
    let effectiveTypeId = typeof appointmentTypeId === "string" && appointmentTypeId.trim() ? appointmentTypeId.trim() : null;
    if (!effectiveTypeId) {
      effectiveTypeId = await fetchFirstAppointmentTypeId(req, credentialId);
    }
    const body = {
      personId: String(personId).trim(),
      title: title.trim(),
      location: location.trim(),
    };
    if (effectiveTypeId) body.appointmentTypeId = effectiveTypeId;
    if (typeof userId === "string" && userId.trim()) body.userId = userId.trim();
    else {
      const fallbackUserId = await resolveDefaultUserId(req, credentialId);
      if (fallbackUserId) body.userId = fallbackUserId;
    }
    if (typeof appointmentOutcomeId === "string" && appointmentOutcomeId.trim()) body.appointmentOutcomeId = appointmentOutcomeId.trim();
    if (typeof description === "string") body.description = description;
    if (typeof isAllDay === "boolean") body.isAllDay = isAllDay;
    if (startsAt !== undefined && startsAt !== null && startsAt !== "") body.startsAt = startsAt;
    if (endsAt !== undefined && endsAt !== null && endsAt !== "") body.endsAt = endsAt;

    let created;
    try {
      created = await callRolloutApi(req, { baseUrl: ROLLOUT_CRM_API_BASE, path: "/appointments", method: "POST", body, credentialId });
    } catch (firstErr) {
      const errBody = String(firstErr?.body || "");
      const status = firstErr?.status || 0;
      const invalidFields = [];
      const match = errBody.match(/Invalid fields[^:]*:\s*([^\"]+)/i);
      if (match && match[1]) {
        for (const token of match[1].split(/[\s,]+/).map((t) => t.trim()).filter(Boolean)) invalidFields.push(token.replace(/\.$/, ""));
      }
      const missingRequired = new Set();
      if (status === 422) {
        try {
          const parsed = JSON.parse(errBody);
          const errs = Array.isArray(parsed?.errors) ? parsed.errors : [];
          for (const e of errs) {
            const p = typeof e?.path === "string" ? e.path : "";
            const m = typeof e?.message === "string" ? e.message.toLowerCase() : "";
            if (p.startsWith("/") && m.includes("required")) missingRequired.add(p.slice(1));
          }
        } catch (_) {}
      }
      const fallback = { title: body.title, location: body.location };
      if (body.description) fallback.description = body.description;
      if (body.startsAt) fallback[invalidFields.includes("startsAt") ? "start" : "startsAt"] = body.startsAt;
      if (body.endsAt) fallback[invalidFields.includes("endsAt") ? "end" : "endsAt"] = body.endsAt;
      const invitees = [];
      if (body.personId) invitees.push({ personId: body.personId });
      if (body.userId) invitees.push({ userId: body.userId });
      if (invitees.length > 0) fallback.invitees = invitees;
      if (body.appointmentTypeId && !invalidFields.includes("appointmentTypeId")) fallback.appointmentTypeId = body.appointmentTypeId;
      if (status === 422) {
        if (body.personId && (missingRequired.has("personId") || !invalidFields.includes("personId"))) fallback.personId = body.personId;
        if (!fallback.appointmentTypeId && missingRequired.has("appointmentTypeId")) {
          const typeId = await fetchFirstAppointmentTypeId(req, credentialId);
          if (typeId) fallback.appointmentTypeId = typeId;
        }
      }
      try {
        created = await callRolloutApi(req, { baseUrl: ROLLOUT_CRM_API_BASE, path: "/appointments", method: "POST", body: fallback, credentialId });
      } catch (secondErr) {
        const secondBody = String(secondErr?.body || "");
        const secondStatus = secondErr?.status || 0;
        let needsType = false;
        if (secondStatus === 422) {
          try {
            const parsed = JSON.parse(secondBody);
            const errs = Array.isArray(parsed?.errors) ? parsed.errors : [];
            needsType = errs.some((e) => String(e?.path) === "/appointmentTypeId");
          } catch (_) {}
        }
        if (needsType && !fallback.appointmentTypeId) {
          const candidates = ["Other", "Default", "Appointment", "Meeting", "Consultation", "1"];
          let lastErr = secondErr;
          for (const candidate of candidates) {
            try {
              const attempt = { ...fallback, appointmentTypeId: candidate };
              created = await callRolloutApi(req, { baseUrl: ROLLOUT_CRM_API_BASE, path: "/appointments", method: "POST", body: attempt, credentialId });
              lastErr = null;
              break;
            } catch (e) {
              lastErr = e;
            }
          }
          if (lastErr) throw lastErr;
        } else {
          throw secondErr;
        }
      }
    }
    res.status(201).json(created);
  } catch (err) {
    console.error("Error creating appointment", err);
    const status = err.status || 500;
    res.status(status).json({ error: err.body || err.message || "Failed to create appointment" });
  }
});

module.exports = router;


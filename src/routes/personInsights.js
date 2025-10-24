const express = require("express");
const router = express.Router();
const { callRolloutApi, ROLLOUT_CRM_API_BASE } = require("../rollout/client");
const { resolveDefaultCredentialId } = require("../rollout/credentials");
const { extractItems } = require("../util");
const { PERSON_RECORDS_LIMIT, MAX_PAGINATED_REQUESTS } = require("../config");

async function fetchPersonById(req, credentialId, personId) {
  const trimmedId = personId.trim();
  try {
    return await callRolloutApi(req, { baseUrl: ROLLOUT_CRM_API_BASE, path: `/people/${encodeURIComponent(trimmedId)}`, credentialId });
  } catch (err) {
    if (err.status === 404) return null;
    throw err;
  }
}

async function fetchPersonByEmail(req, credentialId, email) {
  const normalizedEmail = email.trim().toLowerCase();
  let next = null;
  let iterations = 0;
  while (iterations < MAX_PAGINATED_REQUESTS) {
    const searchParams = { limit: 100 };
    if (next) searchParams.next = next;
    const data = await callRolloutApi(req, { baseUrl: ROLLOUT_CRM_API_BASE, path: "/people", searchParams, credentialId });
    const people = Array.isArray(data?.people) ? data.people : extractItems(data);
    const match = people.find((person) => Array.isArray(person?.emails) && person.emails.some((e) => typeof e?.value === "string" && e.value.trim().toLowerCase() === normalizedEmail));
    if (match) return match;
    next = typeof data?._metadata?.next === "string" && data._metadata.next.length > 0 ? data._metadata.next : null;
    if (!next) break;
    iterations += 1;
  }
  return null;
}

async function fetchPersonCollection(req, credentialId, personId, { path, responseKey, personField = "personId", processor, sorter, additionalSearchParams, personMatcher }) {
  if (personId === undefined || personId === null) return [];
  const normalizedPersonId = String(personId).trim();
  if (!normalizedPersonId) return [];
  const collected = [];
  let next = null;
  let iterations = 0;
  while (iterations < MAX_PAGINATED_REQUESTS && collected.length < PERSON_RECORDS_LIMIT) {
    const searchParams = { limit: 100 };
    if (additionalSearchParams) {
      const extra = typeof additionalSearchParams === "function" ? additionalSearchParams(normalizedPersonId) : additionalSearchParams;
      if (extra && typeof extra === "object") {
        for (const [k, v] of Object.entries(extra)) {
          if (v !== undefined && v !== null && v !== "") searchParams[k] = String(v);
        }
      }
    }
    if (next) searchParams.next = next;
    const data = await callRolloutApi(req, { baseUrl: ROLLOUT_CRM_API_BASE, path, searchParams, credentialId });
    let items = responseKey ? data?.[responseKey] : null;
    if (!Array.isArray(items)) items = extractItems(data);
    for (const item of items) {
      if (!item) continue;
      let matches = false;
      if (typeof personMatcher === "function") {
        try { matches = Boolean(personMatcher(item, normalizedPersonId)); } catch (_) { matches = false; }
      } else {
        const personValue = item[personField];
        const itemPersonId = personValue === undefined || personValue === null ? "" : String(personValue).trim();
        matches = Boolean(itemPersonId && itemPersonId === normalizedPersonId);
      }
      if (!matches) continue;
      const processed = processor ? processor(item) : item;
      if (!processed) continue;
      collected.push(processed);
      if (collected.length >= PERSON_RECORDS_LIMIT) break;
    }
    if (collected.length >= PERSON_RECORDS_LIMIT) break;
    next = typeof data?._metadata?.next === "string" && data._metadata.next.length > 0 ? data._metadata.next : null;
    if (!next) break;
    iterations += 1;
  }
  const ordered = sorter ? sorter([...collected]) : collected;
  return ordered.slice(0, PERSON_RECORDS_LIMIT);
}

function fetchPersonEvents(req, credentialId, personId) {
  return fetchPersonCollection(req, credentialId, personId, { path: "/events", responseKey: "events" });
}
function fetchPersonNotes(req, credentialId, personId) {
  return fetchPersonCollection(req, credentialId, personId, { path: "/notes", responseKey: "notes" });
}
function fetchPersonCalls(req, credentialId, personId) {
  return fetchPersonCollection(req, credentialId, personId, { path: "/calls", responseKey: "calls" });
}
function fetchPersonTextMessages(req, credentialId, personId) {
  return fetchPersonCollection(req, credentialId, personId, { path: "/textMessages", additionalSearchParams: (pId) => ({ personId: pId }) });
}
function fetchPersonAppointments(req, credentialId, personId) {
  const now = Date.now();
  return fetchPersonCollection(req, credentialId, personId, {
    path: "/appointments",
    responseKey: "appointments",
    processor: (appointment) => {
      const endsRaw = appointment?.endsAt || appointment?.end;
      const startsRaw = appointment?.startsAt || appointment?.start;
      const ends = endsRaw ? Date.parse(endsRaw) : Number.NaN;
      const starts = startsRaw ? Date.parse(startsRaw) : Number.NaN;
      const reference = !Number.isNaN(ends) ? ends : !Number.isNaN(starts) ? starts : Number.NaN;
      return { ...appointment, _sortTimestamp: !Number.isNaN(reference) ? reference : Date.parse(appointment?.updated || appointment?.created || 0) };
    },
    sorter: (items) => items
      .sort((a, b) => (b._sortTimestamp || Number.MIN_SAFE_INTEGER) - (a._sortTimestamp || Number.MIN_SAFE_INTEGER))
      .map(({ _sortTimestamp, ...rest }) => rest),
    personMatcher: (appointment, normalizedPersonId) => {
      const topLevel = appointment && appointment.personId !== undefined && appointment.personId !== null ? String(appointment.personId).trim() : "";
      if (topLevel && topLevel === normalizedPersonId) return true;
      const invitees = Array.isArray(appointment?.invitees) ? appointment.invitees : [];
      return invitees.some((inv) => inv && inv.personId !== undefined && inv.personId !== null && String(inv.personId).trim() === normalizedPersonId);
    },
  });
}
function fetchPersonTasks(req, credentialId, personId) {
  return fetchPersonCollection(req, credentialId, personId, { path: "/tasks", responseKey: "tasks" });
}

router.get("/api/person-insights", async (req, res) => {
  const identifierType = typeof req.query.identifierType === "string" ? req.query.identifierType : "";
  const value = typeof req.query.value === "string" ? req.query.value.trim() : "";
  const credentialOverride = typeof req.query.credentialId === "string" ? req.query.credentialId.trim() : undefined;
  if (!["personId", "email"].includes(identifierType)) {
    res.status(400).json({ error: "identifierType must be either personId or email" });
    return;
  }
  if (!value) {
    res.status(400).json({ error: "value is required" });
    return;
  }
  try {
    const credentialId = await resolveDefaultCredentialId(req, credentialOverride);
    if (!credentialId) {
      res.status(400).json({ error: "No Rollout credentials available. Connect a provider first to continue." });
      return;
    }
    let person;
    if (identifierType === "personId") person = await fetchPersonById(req, credentialId, value);
    else person = await fetchPersonByEmail(req, credentialId, value);
    if (!person) {
      res.status(404).json({ error: identifierType === "personId" ? `No person found with id ${value}` : `No person found with email ${value}` });
      return;
    }
    const personId = person && person.id !== undefined && person.id !== null ? String(person.id).trim() : null;
    let events = [], notes = [], calls = [], textMessages = [], appointments = [], tasks = [];
    if (personId) {
      const results = await Promise.allSettled([
        fetchPersonEvents(req, credentialId, personId),
        fetchPersonNotes(req, credentialId, personId),
        fetchPersonCalls(req, credentialId, personId),
        fetchPersonTextMessages(req, credentialId, personId),
        fetchPersonAppointments(req, credentialId, personId),
        fetchPersonTasks(req, credentialId, personId),
      ]);
      const coerce = (idx, label) => {
        const r = results[idx];
        if (r && r.status === "fulfilled" && Array.isArray(r.value)) return r.value;
        if (r && r.status === "rejected") {
          const err = r.reason || {};
          const msg = typeof err?.body === "string" ? err.body : String(err?.message || err);
          console.warn(`Suppressed ${label} fetch error; treating as empty.`, msg);
        }
        return [];
      };
      events = coerce(0, "events");
      notes = coerce(1, "notes");
      calls = coerce(2, "calls");
      textMessages = coerce(3, "textMessages");
      appointments = coerce(4, "appointments");
      tasks = coerce(5, "tasks");
    }
    res.json({ person, events, notes, calls, textMessages, appointments, tasks });
  } catch (err) {
    console.error("Error fetching person insights", err);
    const status = err.status || 500;
    res.status(status).json({ error: err.message || "Failed to fetch person insights" });
  }
});

module.exports = router;


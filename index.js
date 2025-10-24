// Bootstrap server from src/server to improve readability and modularity.
require("./src/server").start();

// The remainder of this file is intentionally left minimal.
// All server logic has been decomposed under src/ for readability.

// (legacy code removed; see src/* for implementation)

function getEffectiveRolloutClientCredentials(req) {
  const sessionCreds = getSessionRolloutClientCredentials(req);
  if (sessionCreds) {
    return sessionCreds;
  }
  if (DEFAULT_ROLLOUT_CLIENT_ID && DEFAULT_ROLLOUT_CLIENT_SECRET) {
    return {
      clientId: DEFAULT_ROLLOUT_CLIENT_ID,
      clientSecret: DEFAULT_ROLLOUT_CLIENT_SECRET,
    };
  }
  return null;
}

function requireRolloutClientCredentials(req) {
  const credentials = getEffectiveRolloutClientCredentials(req);
  if (!credentials) {
    const error = new Error(
      "Rollout client credentials are not configured for this session"
    );
    error.status = 401;
    throw error;
  }
  return credentials;
}

function extractItems(data) {
  if (!data) {
    return [];
  }
  if (Array.isArray(data)) {
    return data;
  }
  if (Array.isArray(data.items)) {
    return data.items;
  }
  if (Array.isArray(data.data)) {
    return data.data;
  }
  if (Array.isArray(data.credentials)) {
    return data.credentials;
  }
  if (Array.isArray(data.results)) {
    return data.results;
  }
  if (typeof data === "object") {
    const firstArray = Object.values(data).find((value) => Array.isArray(value));
    if (Array.isArray(firstArray)) {
      return firstArray;
    }
  }
  return [];
}

async function callRolloutApi(
  req,
  {
    baseUrl,
    path: apiPath,
    method = "GET",
    searchParams,
    body,
    consumerKey,
    credentialId,
    headers,
  } = {}
) {
  const resolvedConsumerKey = resolveConsumerKey(req, consumerKey);
  const token = createRolloutToken(req, resolvedConsumerKey);
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const sanitizedPath = apiPath.startsWith("/")
    ? apiPath.slice(1)
    : apiPath;
  const url = new URL(sanitizedPath, normalizedBase);

  if (searchParams && typeof searchParams === "object") {
    for (const [key, value] of Object.entries(searchParams)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
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

  const response = await fetch(url.toString(), {
    method,
    headers: requestHeaders,
    body: requestBody,
  });

  console.log(
    `[Rollout API] ${method} ${url.toString()}${
      credentialId ? ` (credential ${credentialId})` : ""
    }`
  );

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(
      `[Rollout API] ${method} ${url.toString()} failed: ${response.status} ${errorBody}`
    );
    const error = new Error(
      `Rollout API request failed with status ${response.status}`
    );
    error.status = response.status;
    error.body = errorBody;
    throw error;
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const json = await response.json();
    console.log(
      `[Rollout API] ${method} ${url.toString()} succeeded: ${response.status}`,
      JSON.stringify(json).slice(0, 2000)
    );
    return json;
  }
  const text = await response.text();
  console.log(
    `[Rollout API] ${method} ${url.toString()} succeeded: ${response.status} ${text.slice(
      0,
      2000
    )}`
  );
  return text;
}

async function resolveDefaultCredentialId(req, explicitCredentialId) {
  if (
    typeof explicitCredentialId === "string" &&
    explicitCredentialId.trim().length > 0
  ) {
    req.session.defaultCredentialId = explicitCredentialId.trim();
    return explicitCredentialId.trim();
  }

  const cached =
    typeof req.session.defaultCredentialId === "string" &&
    req.session.defaultCredentialId.length > 0
      ? req.session.defaultCredentialId
      : null;
  if (cached) {
    return cached;
  }

  const data = await callRolloutApi(req, {
    baseUrl: ROLLOUT_API_BASE,
    path: "/credentials",
    searchParams: {
      includeProfile: "true",
      includeData: "true",
    },
  });
  const credentials = extractItems(data);
  const first = credentials.find((credential) => {
    if (!credential || credential.id === undefined || credential.id === null) {
      return false;
    }
    return String(credential.id).trim().length > 0;
  });
  if (!first) {
    return null;
  }
  const normalizedId = String(first.id).trim();
  req.session.defaultCredentialId = normalizedId;
  return normalizedId;
}

async function fetchPersonById(req, credentialId, personId) {
  const trimmedId = personId.trim();
  try {
    return await callRolloutApi(req, {
      baseUrl: ROLLOUT_CRM_API_BASE,
      path: `/people/${encodeURIComponent(trimmedId)}`,
      credentialId,
    });
  } catch (err) {
    if (err.status === 404) {
      return null;
    }
    throw err;
  }
}

async function fetchPersonByEmail(req, credentialId, email) {
  const normalizedEmail = email.trim().toLowerCase();
  let next = null;
  let iterations = 0;

  while (iterations < MAX_PAGINATED_REQUESTS) {
    const searchParams = { limit: 100 };
    if (next) {
      searchParams.next = next;
    }
    const data = await callRolloutApi(req, {
      baseUrl: ROLLOUT_CRM_API_BASE,
      path: "/people",
      searchParams,
      credentialId,
    });

    const people = Array.isArray(data?.people)
      ? data.people
      : extractItems(data);
    const match = people.find((person) => {
      if (!person || !Array.isArray(person.emails)) {
        return false;
      }
      return person.emails.some((entry) => {
        if (!entry || typeof entry.value !== "string") {
          return false;
        }
        return entry.value.trim().toLowerCase() === normalizedEmail;
      });
    });
    if (match) {
      return match;
    }

    next =
      typeof data?._metadata?.next === "string" &&
      data._metadata.next.length > 0
        ? data._metadata.next
        : null;
    if (!next) {
      break;
    }
    iterations += 1;
  }
  return null;
}

async function fetchPersonCollection(
  req,
  credentialId,
  personId,
  {
    path,
    responseKey,
    personField = "personId",
    processor,
    sorter,
    // Optional: include extra query params (e.g., personId) required by certain endpoints
    additionalSearchParams,
    // Optional: custom matcher to decide if an item belongs to a person
    personMatcher,
  }
) {
  if (personId === undefined || personId === null) {
    return [];
  }
  const normalizedPersonId = String(personId).trim();
  if (!normalizedPersonId) {
    return [];
  }

  const collected = [];
  let next = null;
  let iterations = 0;

  while (
    iterations < MAX_PAGINATED_REQUESTS &&
    collected.length < PERSON_RECORDS_LIMIT
  ) {
    const searchParams = { limit: 100 };
    // Merge in any additional search params (can be object or function)
    if (additionalSearchParams) {
      const extra =
        typeof additionalSearchParams === "function"
          ? additionalSearchParams(normalizedPersonId)
          : additionalSearchParams;
      if (extra && typeof extra === "object") {
        for (const [k, v] of Object.entries(extra)) {
          if (v !== undefined && v !== null && v !== "") {
            searchParams[k] = String(v);
          }
        }
      }
    }
    if (next) {
      searchParams.next = next;
    }

    const data = await callRolloutApi(req, {
      baseUrl: ROLLOUT_CRM_API_BASE,
      path,
      searchParams,
      credentialId,
    });

    let items = responseKey ? data?.[responseKey] : null;
    if (!Array.isArray(items)) {
      items = extractItems(data);
    }

    for (const item of items) {
      if (!item) {
        continue;
      }
      let matches = false;
      if (typeof personMatcher === "function") {
        try {
          matches = Boolean(personMatcher(item, normalizedPersonId));
        } catch (_e) {
          matches = false;
        }
      } else {
        const personValue = item[personField];
        const itemPersonId =
          personValue === undefined || personValue === null
            ? ""
            : String(personValue).trim();
        matches = Boolean(itemPersonId && itemPersonId === normalizedPersonId);
      }
      if (!matches) {
        continue;
      }

      const processed = processor ? processor(item) : item;
      if (!processed) {
        continue;
      }

      collected.push(processed);
      if (collected.length >= PERSON_RECORDS_LIMIT) {
        break;
      }
    }

    if (collected.length >= PERSON_RECORDS_LIMIT) {
      break;
    }

    next =
      typeof data?._metadata?.next === "string" &&
      data._metadata.next.length > 0
        ? data._metadata.next
        : null;
    if (!next) {
      break;
    }
    iterations += 1;
  }

  const ordered = sorter ? sorter([...collected]) : collected;
  return ordered.slice(0, PERSON_RECORDS_LIMIT);
}

async function fetchPersonEvents(req, credentialId, personId) {
  return fetchPersonCollection(req, credentialId, personId, {
    path: "/events",
    responseKey: "events",
  });
}

async function fetchPersonNotes(req, credentialId, personId) {
  return fetchPersonCollection(req, credentialId, personId, {
    path: "/notes",
    responseKey: "notes",
  });
}

async function fetchPersonCalls(req, credentialId, personId) {
  return fetchPersonCollection(req, credentialId, personId, {
    path: "/calls",
    responseKey: "calls",
  });
}

async function fetchPersonTextMessages(req, credentialId, personId) {
  return fetchPersonCollection(req, credentialId, personId, {
    path: "/textMessages",
    // API requires personId for GET /textMessages; include it in query
    additionalSearchParams: (normalizedPersonId) => ({ personId: normalizedPersonId }),
    // Response key varies; rely on extractItems fallback
  });
}

async function fetchPersonAppointments(req, credentialId, personId) {
  const now = Date.now();
  return fetchPersonCollection(req, credentialId, personId, {
    path: "/appointments",
    responseKey: "appointments",
    processor: (appointment) => {
      // Support both camelCase (startsAt/endsAt) and short keys (start/end)
      const endsRaw = appointment?.endsAt || appointment?.end;
      const startsRaw = appointment?.startsAt || appointment?.start;
      const ends = endsRaw ? Date.parse(endsRaw) : Number.NaN;
      const starts = startsRaw ? Date.parse(startsRaw) : Number.NaN;
      const reference = !Number.isNaN(ends)
        ? ends
        : !Number.isNaN(starts)
        ? starts
        : Number.NaN;
      return {
        ...appointment,
        _sortTimestamp: !Number.isNaN(reference)
          ? reference
          : Date.parse(appointment?.updated || appointment?.created || 0),
      };
    },
    sorter: (items) =>
      items
        .sort(
          (a, b) => (b._sortTimestamp || Number.MIN_SAFE_INTEGER) - (a._sortTimestamp || Number.MIN_SAFE_INTEGER)
        )
        .map(({ _sortTimestamp, ...rest }) => rest),
    personMatcher: (appointment, normalizedPersonId) => {
      const topLevel =
        appointment && appointment.personId !== undefined && appointment.personId !== null
          ? String(appointment.personId).trim()
          : "";
      if (topLevel && topLevel === normalizedPersonId) {
        return true;
      }
      const invitees = Array.isArray(appointment?.invitees)
        ? appointment.invitees
        : [];
      return invitees.some((inv) => {
        if (!inv || inv.personId === undefined || inv.personId === null) {
          return false;
        }
        const pid = String(inv.personId).trim();
        return Boolean(pid && pid === normalizedPersonId);
      });
    },
  });
}

async function fetchPersonTasks(req, credentialId, personId) {
  return fetchPersonCollection(req, credentialId, personId, {
    path: "/tasks",
    responseKey: "tasks",
  });
}

//
// Note: createAppointment helper was removed to avoid duplication with
// the adaptive POST /api/appointments route below.

// Respect the Render proxy so secure cookies are transmitted correctly.
app.set("trust proxy", 1);

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
          credentials: true,
        }
      : undefined
  )
);

app.use(
  session({
    name: "rollout.sid",
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: SESSION_MAX_AGE_MS,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
  })
);

app.use(express.json());

app.use((req, res, next) => {
  console.log(`[Server] ${req.method} ${req.originalUrl}`);
  next();
});

function createRolloutToken(req, consumerKey = DEFAULT_CONSUMER_KEY) {
  if (!consumerKey) {
    throw new Error("Missing consumer key");
  }

  const { clientId, clientSecret } = requireRolloutClientCredentials(req);
  const nowSecs = Math.round(Date.now() / 1000);
  const exp = nowSecs + TOKEN_TTL_SECS;

  return jwt.sign(
    {
      iss: clientId,
      sub: consumerKey,
      iat: nowSecs,
      exp,
    },
    clientSecret,
    { algorithm: "HS512" }
  );
}

app.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/rollout-token", (req, res) => {
  try {
    const consumerKey = resolveConsumerKey(req, req.query.consumerKey);
    const token = createRolloutToken(req, consumerKey);
    const nowSecs = Math.round(Date.now() / 1000);
    const exp = nowSecs + TOKEN_TTL_SECS;
    res.json({ token, expiresAt: exp });
  } catch (err) {
    console.error("Error generating Rollout token", err);
    const status = err.status || 500;
    const message =
      status === 401
        ? err.message
        : "Unexpected error generating Rollout token";
    res.status(status).json({ error: message });
  }
});

app.get("/api/session/rollout-client", (req, res) => {
  const sessionCreds = getSessionRolloutClientCredentials(req);
  const effectiveCreds = getEffectiveRolloutClientCredentials(req);
  const usingEnvironment =
    !sessionCreds &&
    Boolean(DEFAULT_ROLLOUT_CLIENT_ID && DEFAULT_ROLLOUT_CLIENT_SECRET);
  res.json({
    configured: Boolean(effectiveCreds),
    clientId: effectiveCreds?.clientId || "",
    updatedAt: sessionCreds?.updatedAt || null,
    defaultClientId: DEFAULT_ROLLOUT_CLIENT_ID,
    usingEnvironment,
    sessionClientId: sessionCreds?.clientId || "",
  });
});

app.post("/api/session/rollout-client", (req, res) => {
  const { clientId, clientSecret } = req.body || {};
  const sanitizedId = sanitizeClientId(clientId);
  const sanitizedSecret = sanitizeClientSecret(clientSecret);

  if (!sanitizedId || !sanitizedSecret) {
    res.status(400).json({
      error: "clientId and clientSecret must be non-empty strings",
    });
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
    defaultClientId: DEFAULT_ROLLOUT_CLIENT_ID,
    usingEnvironment: false,
    sessionClientId: sanitizedId,
  });
});

app.delete("/api/session/rollout-client", (req, res) => {
  delete req.session.rolloutClientCredentials;
  delete req.session.defaultCredentialId;
  res.status(204).end();
});

app.get("/api/session/consumer-key", (req, res) => {
  const stored = sanitizeConsumerKey(req.session.consumerKey);
  res.json({
    consumerKey: stored || "",
    effectiveConsumerKey: stored || DEFAULT_CONSUMER_KEY,
  });
});

app.post("/api/session/consumer-key", (req, res) => {
  const { consumerKey } = req.body || {};
  if (
    consumerKey !== undefined &&
    consumerKey !== null &&
    typeof consumerKey !== "string"
  ) {
    res
      .status(400)
      .json({ error: "consumerKey must be a string, null, or undefined" });
    return;
  }

  const sanitized = sanitizeConsumerKey(consumerKey);
  if (sanitized) {
    req.session.consumerKey = sanitized;
  } else {
    delete req.session.consumerKey;
  }

  res.json({
    consumerKey: sanitized || "",
    effectiveConsumerKey: resolveConsumerKey(req),
  });
});

app.get("/api/credentials", async (req, res) => {
  try {
    const data = await callRolloutApi(req, {
      baseUrl: ROLLOUT_API_BASE,
      path: "/credentials",
      searchParams: {
        includeProfile: "true",
        includeData: "true",
      },
      consumerKey: req.query.consumerKey,
    });
    const credentials = extractItems(data)
      .map((credential) => {
        if (!credential || typeof credential !== "object") {
          return null;
        }
        const id =
          typeof credential.id === "string" && credential.id.trim().length > 0
            ? credential.id.trim()
            : null;
        if (!id) {
          return null;
        }
        const appKey =
          typeof credential.appKey === "string" ? credential.appKey : "";
        const accountName =
          typeof credential.profile?.accountName === "string"
            ? credential.profile.accountName
            : "";
        const label = accountName || appKey || id;
        return { id, label, appKey, accountName };
      })
      .filter(Boolean);
    res.json({ credentials });
  } catch (err) {
    console.error("Error fetching Rollout credentials", err);
    const status = err.status || 500;
    res
      .status(status)
      .json({ error: err.message || "Failed to fetch credentials" });
  }
});

app.get("/api/people", async (req, res) => {
  const limitParam = Number.parseInt(req.query.limit, 10);
  const limit =
    Number.isFinite(limitParam) && limitParam > 0 && limitParam <= 100
      ? limitParam
      : 20;
  const pageLimit = Math.min(100, Math.max(1, limit));
  const credentialOverride =
    typeof req.query.credentialId === "string"
      ? req.query.credentialId.trim()
      : undefined;

  try {
    const credentialId = await resolveDefaultCredentialId(
      req,
      credentialOverride
    );
    if (!credentialId) {
      res.status(400).json({
        error: "No Rollout credentials available. Connect a provider first.",
      });
      return;
    }

    const people = [];
    const seenIds = new Set();
    let next = null;
    let iterations = 0;

    while (iterations < MAX_PAGINATED_REQUESTS && people.length < limit) {
      const searchParams = { limit: pageLimit };
      if (next) {
        searchParams.next = next;
      }

      const data = await callRolloutApi(req, {
        baseUrl: ROLLOUT_CRM_API_BASE,
        path: "/people",
        searchParams,
        credentialId,
      });

      const items = extractItems(data);
      for (const person of items) {
        if (!person || person.id === undefined || person.id === null) {
          continue;
        }
        const rawId =
          typeof person.id === "string" || typeof person.id === "number"
            ? person.id
            : String(person.id);
        const id = String(rawId).trim();
        if (!id || seenIds.has(id)) {
          continue;
        }
        const fullName = [person.firstName, person.lastName]
          .filter((value) => typeof value === "string" && value.trim().length > 0)
          .join(" ")
          .trim();
        let email = "";
        if (Array.isArray(person.emails)) {
          const primaryEmail =
            person.emails.find((entry) => entry?.isPrimary) || person.emails[0];
          if (primaryEmail && typeof primaryEmail.value === "string") {
            email = primaryEmail.value.trim();
          }
        }
        const labelParts = [fullName || null, email || null].filter(Boolean);
        const label = labelParts.length > 0 ? labelParts.join(" · ") : id;
        people.push({ id, label });
        seenIds.add(id);
        if (people.length >= limit) {
          break;
        }
      }

      if (people.length >= limit) {
        break;
      }
      next =
        typeof data?._metadata?.next === "string" && data._metadata.next.length > 0
          ? data._metadata.next
          : null;
      if (!next) {
        break;
      }
      iterations += 1;
    }

    res.json({ people });
  } catch (err) {
    console.error("Error fetching people", err);
    const status = err.status || 500;
    res
      .status(status)
      .json({ error: err.message || "Failed to fetch people" });
  }
});

async function fetchAppointmentMetadata(req, credentialId, { path, label }) {
  const data = await callRolloutApi(req, {
    baseUrl: ROLLOUT_CRM_API_BASE,
    path,
    credentialId,
  });
  return extractItems(data)
    .filter((item) => item && item.id !== undefined && item.id !== null)
    .map((item) => {
      const id = String(item.id).trim();
      if (!id) {
        return null;
      }
      const text =
        typeof item.name === "string" && item.name.trim().length > 0
          ? item.name.trim()
          : typeof item.label === "string" && item.label.trim().length > 0
          ? item.label.trim()
          : `${label} ${id}`;
      return { id, label: text };
    })
    .filter(Boolean);
}

async function fetchFirstAppointmentTypeId(req, credentialId) {
  try {
    const data = await callRolloutApi(req, {
      baseUrl: ROLLOUT_CRM_API_BASE,
      path: "/appointment-types",
      credentialId,
    });
    const items = extractItems(data);
    const first = items.find(
      (t) => t && (typeof t.id === "string" || typeof t.id === "number")
    );
    return first ? String(first.id).trim() : null;
  } catch (_e) {
    return null;
  }
}

app.get("/api/appointment-metadata", async (req, res) => {
  const credentialOverride =
    typeof req.query.credentialId === "string"
      ? req.query.credentialId.trim()
      : undefined;
  try {
    const credentialId = await resolveDefaultCredentialId(
      req,
      credentialOverride
    );
    if (!credentialId) {
      res.status(400).json({
        error:
          "No Rollout credentials available. Connect a provider first to continue.",
      });
      return;
    }

    const [types, outcomes] = await Promise.all([
      fetchAppointmentMetadata(req, credentialId, {
        path: "/appointment-types",
        label: "Type",
      }),
      fetchAppointmentMetadata(req, credentialId, {
        path: "/appointment-outcomes",
        label: "Outcome",
      }),
    ]);

    res.json({ types, outcomes });
  } catch (err) {
    console.error("Error fetching appointment metadata", err);
    const status = err.status || 500;
    res
      .status(status)
      .json({ error: err.message || "Failed to fetch appointment metadata" });
  }
});

app.get("/api/users", async (req, res) => {
  const credentialOverride =
    typeof req.query.credentialId === "string"
      ? req.query.credentialId.trim()
      : undefined;
  const limitParam = Number.parseInt(req.query.limit, 10);
  const limit =
    Number.isFinite(limitParam) && limitParam > 0 && limitParam <= 500
      ? limitParam
      : 100;
  const pageLimit = Math.min(100, Math.max(1, limit));

  try {
    const credentialId = await resolveDefaultCredentialId(
      req,
      credentialOverride
    );
    if (!credentialId) {
      res.status(400).json({
        error:
          "No Rollout credentials available. Connect a provider first to continue.",
      });
      return;
    }

    const users = [];
    const seen = new Set();
    let next = null;
    let iterations = 0;
    while (iterations < MAX_PAGINATED_REQUESTS && users.length < limit) {
      const searchParams = { limit: pageLimit };
      if (next) searchParams.next = next;
      const data = await callRolloutApi(req, {
        baseUrl: ROLLOUT_CRM_API_BASE,
        path: "/users",
        searchParams,
        credentialId,
      });
      const items = extractItems(data);
      for (const u of items) {
        const id =
          u && (typeof u.id === "string" || typeof u.id === "number")
            ? String(u.id).trim()
            : "";
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
      next =
        typeof data?._metadata?.next === "string" && data._metadata.next.length > 0
          ? data._metadata.next
          : null;
      if (!next) break;
      iterations += 1;
    }
    res.json({ users });
  } catch (err) {
    console.error("Error fetching users", err);
    const status = err.status || 500;
    res
      .status(status)
      .json({ error: err.message || "Failed to fetch users" });
  }
});

async function resolveDefaultUserId(req, credentialId) {
  try {
    const data = await callRolloutApi(req, {
      baseUrl: ROLLOUT_CRM_API_BASE,
      path: "/users",
      searchParams: { limit: 1 },
      credentialId,
    });
    const items = extractItems(data);
    const first = items.find(
      (u) => u && (typeof u.id === "string" || typeof u.id === "number")
    );
    return first ? String(first.id).trim() : null;
  } catch (_e) {
    return null;
  }
}

app.post("/api/appointments", async (req, res) => {
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
      res.status(400).json({
        error:
          "No Rollout credentials available. Connect a provider first to continue.",
      });
      return;
    }

    // Validate required fields: personId, title, location
    const problems = [];
    if (!(typeof personId === "string" && personId.trim())) problems.push("personId");
    if (!(typeof title === "string" && title.trim())) problems.push("title");
    if (!(typeof location === "string" && location.trim())) problems.push("location");
    if (problems.length > 0) {
      res.status(400).json({
        error: `Missing required fields: ${problems.join(", ")}`,
      });
      return;
    }

    // Determine effective appointmentTypeId if not provided (some connectors require it)
    let effectiveTypeId =
      typeof appointmentTypeId === "string" && appointmentTypeId.trim()
        ? appointmentTypeId.trim()
        : null;
    if (!effectiveTypeId) {
      effectiveTypeId = await fetchFirstAppointmentTypeId(req, credentialId);
    }

    const body = {
      personId: String(personId).trim(),
      title: title.trim(),
      location: location.trim(),
    };
    if (effectiveTypeId) {
      body.appointmentTypeId = effectiveTypeId;
    }
    if (typeof userId === "string" && userId.trim()) {
      body.userId = userId.trim();
    } else {
      const fallbackUserId = await resolveDefaultUserId(req, credentialId);
      if (fallbackUserId) {
        body.userId = fallbackUserId;
      }
    }
    if (
      typeof appointmentOutcomeId === "string" &&
      appointmentOutcomeId.trim()
    )
      body.appointmentOutcomeId = appointmentOutcomeId.trim();
    if (typeof description === "string") body.description = description;
    if (typeof isAllDay === "boolean") body.isAllDay = isAllDay;
    if (startsAt !== undefined && startsAt !== null && startsAt !== "")
      body.startsAt = startsAt;
    if (endsAt !== undefined && endsAt !== null && endsAt !== "")
      body.endsAt = endsAt;

    let created;
    try {
      created = await callRolloutApi(req, {
        baseUrl: ROLLOUT_CRM_API_BASE,
        path: "/appointments",
        method: "POST",
        body,
        credentialId,
      });
    } catch (firstErr) {
      // Fallback: some connectors reject certain fields or prefer alternative keys.
      const errBody = String(firstErr?.body || "");
      const status = firstErr?.status || 0;
      const invalidFields = [];
      const match = errBody.match(/Invalid fields[^:]*:\s*([^\"]+)/i);
      if (match && match[1]) {
        for (const token of match[1].split(/[\s,]+/).map((t) => t.trim()).filter(Boolean)) {
          invalidFields.push(token.replace(/\.$/, ""));
        }
      }
      // Parse missing required properties from 422 validation errors
      const missingRequired = new Set();
      if (status === 422) {
        try {
          const parsed = JSON.parse(errBody);
          const errs = Array.isArray(parsed?.errors) ? parsed.errors : [];
          for (const e of errs) {
            const p = typeof e?.path === "string" ? e.path : "";
            const m = typeof e?.message === "string" ? e.message.toLowerCase() : "";
            if (p.startsWith("/") && m.includes("required")) {
              missingRequired.add(p.slice(1));
            }
          }
        } catch (_e) {}
      }

      // Construct a sanitized fallback body (minimal + invitees mapping)
      const fallback = { title: body.title, location: body.location };
      if (body.description) fallback.description = body.description;
      // Use start/end keys if startsAt/endsAt were flagged; otherwise pass through if present
      if (body.startsAt) {
        if (invalidFields.includes("startsAt")) fallback.start = body.startsAt;
        else fallback.startsAt = body.startsAt;
      }
      if (body.endsAt) {
        if (invalidFields.includes("endsAt")) fallback.end = body.endsAt;
        else fallback.endsAt = body.endsAt;
      }
      // Associate person and user
      const invitees = [];
      if (body.personId) invitees.push({ personId: body.personId });
      if (body.userId) invitees.push({ userId: body.userId });
      if (invitees.length > 0) fallback.invitees = invitees;
      // Include appointmentTypeId if we have one and it was not flagged invalid
      if (body.appointmentTypeId && !invalidFields.includes("appointmentTypeId")) {
        fallback.appointmentTypeId = body.appointmentTypeId;
      }
      // If the first failure was 422 for missing required, make sure to include personId/type
      if (status === 422) {
        if (body.personId && (missingRequired.has("personId") || !invalidFields.includes("personId"))) {
          fallback.personId = body.personId;
        }
        if (!fallback.appointmentTypeId && missingRequired.has("appointmentTypeId")) {
          const typeId = await fetchFirstAppointmentTypeId(req, credentialId);
          if (typeId) fallback.appointmentTypeId = typeId;
        }
      }

      try {
        created = await callRolloutApi(req, {
          baseUrl: ROLLOUT_CRM_API_BASE,
          path: "/appointments",
          method: "POST",
          body: fallback,
          credentialId,
        });
      } catch (secondErr) {
        // If still failing due to missing/invalid type for connectors without types endpoint,
        // try a few safe default strings for appointmentTypeId.
        const secondBody = String(secondErr?.body || "");
        const secondStatus = secondErr?.status || 0;
        let needsType = false;
        if (secondStatus === 422) {
          try {
            const parsed = JSON.parse(secondBody);
            const errs = Array.isArray(parsed?.errors) ? parsed.errors : [];
            needsType = errs.some((e) => String(e?.path) === "/appointmentTypeId");
          } catch (_e) {}
        }
        if (needsType && !fallback.appointmentTypeId) {
          const candidates = [
            "Other",
            "Default",
            "Appointment",
            "Meeting",
            "Consultation",
            "1",
          ];
          let lastErr = secondErr;
          for (const candidate of candidates) {
            try {
              const attempt = { ...fallback, appointmentTypeId: candidate };
              created = await callRolloutApi(req, {
                baseUrl: ROLLOUT_CRM_API_BASE,
                path: "/appointments",
                method: "POST",
                body: attempt,
                credentialId,
              });
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
    res
      .status(status)
      .json({ error: err.body || err.message || "Failed to create appointment" });
  }
});

app.get("/api/person-insights", async (req, res) => {
  const identifierType =
    typeof req.query.identifierType === "string"
      ? req.query.identifierType
      : "";
  const value =
    typeof req.query.value === "string" ? req.query.value.trim() : "";
  const credentialOverride =
    typeof req.query.credentialId === "string"
      ? req.query.credentialId.trim()
      : undefined;

  if (!["personId", "email"].includes(identifierType)) {
    res
      .status(400)
      .json({ error: "identifierType must be either personId or email" });
    return;
  }
  if (!value) {
    res.status(400).json({ error: "value is required" });
    return;
  }

  try {
    const credentialId = await resolveDefaultCredentialId(
      req,
      credentialOverride
    );
    if (!credentialId) {
      res.status(400).json({
        error:
          "No Rollout credentials available. Connect a provider first to continue.",
      });
      return;
    }

    let person;
    if (identifierType === "personId") {
      person = await fetchPersonById(req, credentialId, value);
    } else {
      person = await fetchPersonByEmail(req, credentialId, value);
    }

    if (!person) {
      res.status(404).json({
        error:
          identifierType === "personId"
            ? `No person found with id ${value}`
            : `No person found with email ${value}`,
      });
      return;
    }

    // Ensure we handle numeric IDs as well as strings
    const personId =
      person && person.id !== undefined && person.id !== null
        ? String(person.id).trim()
        : null;
    let events = [];
    let notes = [];
    let calls = [];
    let textMessages = [];
    let appointments = [];
    let tasks = [];

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
        if (r && r.status === "fulfilled" && Array.isArray(r.value)) {
          return r.value;
        }
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

    res.json({
      person,
      events,
      notes,
      calls,
      textMessages,
      appointments,
      tasks,
    });
  } catch (err) {
    console.error("Error fetching person insights", err);
    const status = err.status || 500;
    res
      .status(status)
      .json({ error: err.message || "Failed to fetch person insights" });
  }
});

app.post("/api/appointments", async (req, res) => {
  const credentialOverride =
    typeof req.query.credentialId === "string"
      ? req.query.credentialId.trim()
      : undefined;
  try {
    const credentialId = await resolveDefaultCredentialId(
      req,
      credentialOverride
    );
    if (!credentialId) {
      res.status(400).json({
        error:
          "No Rollout credentials available. Connect a provider first to continue.",
      });
      return;
    }

    const payload = req.body || {};
    const requiredFields = ["personId", "appointmentTypeId", "title", "location"];
    const missing = requiredFields.filter((field) => {
      const value = payload[field];
      return value === undefined || value === null || String(value).trim().length === 0;
    });

    if (missing.length > 0) {
      res.status(400).json({
        error: `Missing required fields: ${missing.join(", ")}`,
      });
      return;
    }

    const result = await createAppointment(req, credentialId, payload);
    res.status(201).json(result);
  } catch (err) {
    console.error("Error creating appointment", err);
    const status = err.status || 500;
    res
      .status(status)
      .json({ error: err.message || "Failed to create appointment" });
  }
});

const clientDistPath = path.join(__dirname, "client", "dist");
app.use(express.static(clientDistPath));

app.get("*", (_req, res, next) => {
  const indexPath = path.join(clientDistPath, "index.html");
  if (!fs.existsSync(indexPath)) {
    next();
    return;
  }
  res.sendFile(indexPath);
});

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});

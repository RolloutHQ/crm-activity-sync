import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  RolloutLinkProvider,
  CredentialsManager,
} from "@rollout/link-react";
import "@rollout/link-react/style.css";
import "./App.css";

const rolloutTokenEndpoint =
  import.meta.env.VITE_ROLLOUT_TOKEN_URL || "/rollout-token";

const SUBSCRIPTION_EVENTS = [
  { id: "peopleCreated", label: "Person Created" },
  { id: "peopleUpdated", label: "Person Updated" },
  { id: "notesCreated", label: "Note Created" },
  { id: "notesUpdated", label: "Note Updated" },
];

const defaultWebhookUrl =
  import.meta.env.VITE_DEFAULT_WEBHOOK_URL ||
  "https://rollout-webhooks-demo.onrender.com/webhooks";

const defaultConsumerKey =
  import.meta.env.VITE_ROLLOUT_CONSUMER_KEY || "demo-consumer";

const DEFAULT_ACCORDION_STATE = {
  connectProvider: true,
  connectedCredentials: true,
  webhookTarget: true,
  webhookSubscriptions: true,
  receivedWebhooks: true,
};

async function fetchJson(path, options) {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Request failed (${response.status})${
        errorText ? `: ${errorText}` : ""
      }`
    );
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  return response.text();
}

function extractItems(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.data)) return data.data;
  if (Array.isArray(data.credentials)) return data.credentials;
  if (Array.isArray(data.results)) return data.results;
  if (typeof data === "object") {
    const firstArrayValue = Object.values(data).find((value) =>
      Array.isArray(value)
    );
    if (Array.isArray(firstArrayValue)) {
      return firstArrayValue;
    }
  }
  return [];
}

function normalizeAccordionStateClient(state) {
  const normalized = { ...DEFAULT_ACCORDION_STATE };
  if (state && typeof state === "object") {
    for (const key of Object.keys(DEFAULT_ACCORDION_STATE)) {
      if (typeof state[key] === "boolean") {
        normalized[key] = state[key];
      }
    }
  }
  return normalized;
}

function serializeAccordionState(state) {
  return JSON.stringify(normalizeAccordionStateClient(state));
}

function AccordionSection({ id, title, isOpen, onToggle, headerActions, children }) {
  const contentId = `${id}-content`;
  const buttonId = `${id}-toggle`;
  return (
    <section className="card accordion-section">
      <div className="accordion-header">
        <div className="accordion-header-content">
          <button
            type="button"
            className="accordion-toggle"
            aria-expanded={isOpen}
            aria-controls={contentId}
            id={buttonId}
            onClick={onToggle}
          >
            <span className="accordion-indicator" aria-hidden="true">
              {isOpen ? "▾" : "▸"}
            </span>
            <span className="accordion-label">{title}</span>
          </button>
        </div>
        {headerActions ? (
          <div className="accordion-header-actions">{headerActions}</div>
        ) : null}
      </div>
      <div
        id={contentId}
        role="region"
        aria-labelledby={buttonId}
        className="accordion-content"
        hidden={!isOpen}
      >
        {children}
      </div>
    </section>
  );
}

export default function App() {
  const [credentials, setCredentials] = useState([]);
  const [credentialsLoading, setCredentialsLoading] = useState(false);
  const [credentialsError, setCredentialsError] = useState(null);
  const [consumerKey, setConsumerKey] = useState(defaultConsumerKey);
  const [consumerKeyStatus, setConsumerKeyStatus] = useState("");
  const [consumerKeyError, setConsumerKeyError] = useState(null);
  const [hasLoadedConsumerKey, setHasLoadedConsumerKey] = useState(false);
  const [savingConsumerKey, setSavingConsumerKey] = useState(false);
  const persistedConsumerKey = useRef(null);
  const latestConsumerKeyRef = useRef(consumerKey);
  const credentialsRequestIdRef = useRef(0);
  const webhooksRequestIdRef = useRef(0);
  const [accordionState, setAccordionState] = useState(() =>
    normalizeAccordionStateClient(DEFAULT_ACCORDION_STATE)
  );
  const [accordionStatus, setAccordionStatus] = useState("");
  const [accordionError, setAccordionError] = useState(null);
  const [hasLoadedAccordionState, setHasLoadedAccordionState] = useState(false);
  const [savingAccordionState, setSavingAccordionState] = useState(false);
  const persistedAccordionState = useRef(
    serializeAccordionState(DEFAULT_ACCORDION_STATE)
  );
  const accordionSaveTimeoutRef = useRef(null);
  const [webhooks, setWebhooks] = useState([]);
  const [webhooksLoading, setWebhooksLoading] = useState(false);
  const [webhooksError, setWebhooksError] = useState(null);
  const [webhookUrl, setWebhookUrl] = useState(defaultWebhookUrl);
  const [subscriptionTarget, setSubscriptionTarget] = useState(null);
  const [subscriptionError, setSubscriptionError] = useState(null);
  const [lastSubscriptionMessage, setLastSubscriptionMessage] = useState("");
  const [selectedCredentialId, setSelectedCredentialId] = useState("");
  const [receivedWebhooks, setReceivedWebhooks] = useState([]);
  const [receivedWebhooksLoading, setReceivedWebhooksLoading] = useState(false);
  const [receivedWebhooksError, setReceivedWebhooksError] = useState(null);
  const [clearingReceivedWebhooks, setClearingReceivedWebhooks] =
    useState(false);
  const [deletingWebhookId, setDeletingWebhookId] = useState(null);
  const [webhookDeletionError, setWebhookDeletionError] = useState(null);
  const [webhookTargetStatus, setWebhookTargetStatus] = useState("");
  const [webhookTargetError, setWebhookTargetError] = useState(null);
  const [hasLoadedWebhookTarget, setHasLoadedWebhookTarget] = useState(false);
  const [savingWebhookTarget, setSavingWebhookTarget] = useState(false);

  const buildApiUrl = useCallback(
    (path, params = {}) => {
      const origin =
        typeof window !== "undefined" ? window.location.origin : "http://localhost";
      const url = new URL(path, origin);
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== "") {
          url.searchParams.set(key, value);
        }
      }
      const normalizedConsumerKey =
        typeof consumerKey === "string" ? consumerKey.trim() : "";
      if (normalizedConsumerKey) {
        url.searchParams.set("consumerKey", normalizedConsumerKey);
      }
      return url.toString();
    },
    [consumerKey]
  );

  useEffect(() => {
    latestConsumerKeyRef.current =
      typeof consumerKey === "string" ? consumerKey.trim() : "";
  }, [consumerKey]);

  const fetchRolloutToken = useCallback(() => {
    const origin =
      typeof window !== "undefined" ? window.location.origin : "http://localhost";
    const url =
      rolloutTokenEndpoint.startsWith("http://") ||
      rolloutTokenEndpoint.startsWith("https://")
        ? new URL(rolloutTokenEndpoint)
        : new URL(rolloutTokenEndpoint, origin);
    const normalizedConsumerKey =
      typeof consumerKey === "string" ? consumerKey.trim() : "";
    if (normalizedConsumerKey) {
      url.searchParams.set("consumerKey", normalizedConsumerKey);
    }
    return fetch(url.toString(), {
      method: "GET",
      credentials: "omit",
    })
      .then((resp) => {
        if (!resp.ok) {
          throw new Error(`Failed to fetch token (${resp.status})`);
        }
        return resp.json();
      })
      .then((data) => data.token);
  }, [consumerKey, rolloutTokenEndpoint]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchJson("/api/session/consumer-key");
        if (cancelled) {
          return;
        }
        const stored =
          data && typeof data.consumerKey === "string" && data.consumerKey.length > 0
            ? data.consumerKey
            : null;
        if (stored) {
          const trimmed = stored.trim();
          persistedConsumerKey.current = trimmed;
          setConsumerKey(trimmed);
        } else {
          persistedConsumerKey.current = null;
          setConsumerKey(defaultConsumerKey);
        }
        setConsumerKeyError(null);
        setConsumerKeyStatus("");
      } catch (err) {
        if (cancelled) {
          return;
        }
        persistedConsumerKey.current = null;
        setConsumerKeyError(err.message);
        setConsumerKey(defaultConsumerKey);
        setConsumerKeyStatus("");
      } finally {
        if (!cancelled) {
          setHasLoadedConsumerKey(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [defaultConsumerKey]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchJson("/api/session/accordion");
        if (cancelled) {
          return;
        }
        const normalized = normalizeAccordionStateClient(
          data?.accordionState
        );
        persistedAccordionState.current = serializeAccordionState(normalized);
        setAccordionState(normalized);
        setAccordionError(null);
        setAccordionStatus("");
      } catch (err) {
        if (cancelled) {
          return;
        }
        const fallback = normalizeAccordionStateClient(
          DEFAULT_ACCORDION_STATE
        );
        persistedAccordionState.current =
          serializeAccordionState(fallback);
        setAccordionState(fallback);
        setAccordionError(err.message);
        setAccordionStatus("");
      } finally {
        if (!cancelled) {
          setHasLoadedAccordionState(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchJson("/api/session/webhook-target");
        if (cancelled) return;
        const stored =
          data && typeof data.webhookTarget === "string"
            ? data.webhookTarget
            : null;
        if (stored) {
          setWebhookUrl(stored);
        } else {
          setWebhookUrl(defaultWebhookUrl);
        }
        setWebhookTargetError(null);
      } catch (err) {
        if (cancelled) return;
        setWebhookTargetError(err.message);
        setWebhookUrl(defaultWebhookUrl);
      } finally {
        if (!cancelled) {
          setHasLoadedWebhookTarget(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [defaultWebhookUrl]);

  useEffect(() => {
    if (!hasLoadedWebhookTarget) {
      return;
    }

    let cancelled = false;
    const handle = setTimeout(async () => {
      if (cancelled) {
        return;
      }
      setSavingWebhookTarget(true);
      setWebhookTargetError(null);
      setWebhookTargetStatus("");
      try {
        await fetchJson("/api/session/webhook-target", {
          method: "POST",
          body: JSON.stringify({ webhookTarget: webhookUrl }),
        });
        if (!cancelled) {
          setWebhookTargetStatus("Webhook target saved for this browser session.");
        }
      } catch (err) {
        if (!cancelled) {
          setWebhookTargetError(err.message);
        }
      } finally {
        if (!cancelled) {
          setSavingWebhookTarget(false);
        }
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [webhookUrl, hasLoadedWebhookTarget]);

  useEffect(() => {
    if (!hasLoadedAccordionState) {
      return;
    }

    const serialized = serializeAccordionState(accordionState);
    if (serialized === persistedAccordionState.current) {
      return;
    }

    if (accordionSaveTimeoutRef.current) {
      clearTimeout(accordionSaveTimeoutRef.current);
      accordionSaveTimeoutRef.current = null;
    }

    setSavingAccordionState(true);
    setAccordionError(null);
    setAccordionStatus("");
    const normalized = normalizeAccordionStateClient(accordionState);
    const timeoutId = setTimeout(async () => {
      try {
        await fetchJson("/api/session/accordion", {
          method: "POST",
          body: JSON.stringify({ accordionState: normalized }),
        });
        persistedAccordionState.current = serialized;
        setAccordionStatus("Section preferences saved for this session.");
      } catch (err) {
        setAccordionError(err.message);
      } finally {
        setSavingAccordionState(false);
      }
    }, 300);

    accordionSaveTimeoutRef.current = timeoutId;

    return () => {
      clearTimeout(timeoutId);
      accordionSaveTimeoutRef.current = null;
      setSavingAccordionState(false);
    };
  }, [accordionState, hasLoadedAccordionState]);

  const toggleAccordionSection = useCallback((key) => {
    setAccordionState((prev) => {
      const current = normalizeAccordionStateClient(prev);
      if (!Object.prototype.hasOwnProperty.call(current, key)) {
        return current;
      }
      return {
        ...current,
        [key]: !current[key],
      };
    });
  }, []);

  useEffect(() => {
    if (!hasLoadedConsumerKey) {
      return;
    }

    const normalizedConsumerKey =
      typeof consumerKey === "string" ? consumerKey.trim() : "";
    const persisted = persistedConsumerKey.current;
    const trimmedDefault = defaultConsumerKey.trim();

    if (normalizedConsumerKey.length === 0) {
      if (persisted === null) {
        return;
      }
    } else if (persisted === normalizedConsumerKey) {
      return;
    } else if (persisted === null && normalizedConsumerKey === trimmedDefault) {
      return;
    }

    let cancelled = false;
    const handle = setTimeout(async () => {
      if (cancelled) {
        return;
      }
      setSavingConsumerKey(true);
      setConsumerKeyError(null);
      setConsumerKeyStatus("");
      try {
        await fetchJson("/api/session/consumer-key", {
          method: "POST",
          body: JSON.stringify({
            consumerKey:
              normalizedConsumerKey.length > 0 ? normalizedConsumerKey : null,
          }),
        });
        if (!cancelled) {
          persistedConsumerKey.current =
            normalizedConsumerKey.length > 0 ? normalizedConsumerKey : null;
          setConsumerKeyStatus("Consumer key saved for this session.");
        }
      } catch (err) {
        if (!cancelled) {
          setConsumerKeyError(err.message);
        }
      } finally {
        if (!cancelled) {
          setSavingConsumerKey(false);
        }
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [consumerKey, hasLoadedConsumerKey, defaultConsumerKey]);

  const refreshCredentials = useCallback(async () => {
    const url = buildApiUrl("/api/credentials");
    const requestId = ++credentialsRequestIdRef.current;
    setCredentialsLoading(true);
    setCredentialsError(null);
    try {
      const data = await fetchJson(url);
      if (credentialsRequestIdRef.current === requestId) {
        setCredentials(extractItems(data));
      }
    } catch (err) {
      if (credentialsRequestIdRef.current === requestId) {
        setCredentialsError(err.message);
      }
    } finally {
      if (credentialsRequestIdRef.current === requestId) {
        setCredentialsLoading(false);
      }
    }
  }, [buildApiUrl]);

  const refreshWebhooks = useCallback(
    async (credentialIdOverride) => {
      const credentialIdToUse =
        credentialIdOverride || selectedCredentialId || "";
      if (!credentialIdToUse) {
        setWebhooks([]);
        return;
      }
      setWebhooksLoading(true);
      setWebhooksError(null);
      const requestId = ++webhooksRequestIdRef.current;
      try {
        const data = await fetchJson(
          buildApiUrl("/api/webhooks", { credentialId: credentialIdToUse })
        );
        if (webhooksRequestIdRef.current === requestId) {
          setWebhooks(extractItems(data));
        }
      } catch (err) {
        if (webhooksRequestIdRef.current === requestId) {
          setWebhooksError(err.message);
        }
      } finally {
        if (webhooksRequestIdRef.current === requestId) {
          setWebhooksLoading(false);
        }
      }
    },
    [selectedCredentialId, buildApiUrl]
  );

  useEffect(() => {
    refreshCredentials();
  }, [refreshCredentials]);

  useEffect(() => {
    setSelectedCredentialId("");
    setCredentials([]);
    setWebhooks([]);
  }, [consumerKey]);

  useEffect(() => {
    if (!selectedCredentialId && credentials.length > 0) {
      setSelectedCredentialId(credentials[0].id);
      refreshWebhooks(credentials[0].id);
    }
  }, [credentials, selectedCredentialId, refreshWebhooks]);

  useEffect(() => {
    if (
      selectedCredentialId &&
      credentials.every((cred) => cred.id !== selectedCredentialId)
    ) {
      const fallbackId = credentials[0]?.id || "";
      setSelectedCredentialId(fallbackId);
      if (fallbackId) {
        refreshWebhooks(fallbackId);
      } else {
        setWebhooks([]);
      }
    }
  }, [credentials, selectedCredentialId, refreshWebhooks]);

  const refreshReceivedWebhooks = useCallback(async () => {
    setReceivedWebhooksLoading(true);
    setReceivedWebhooksError(null);
    try {
      const data = await fetchJson("/api/received-webhooks");
      setReceivedWebhooks(Array.isArray(data) ? data : extractItems(data));
    } catch (err) {
      setReceivedWebhooksError(err.message);
    } finally {
      setReceivedWebhooksLoading(false);
    }
  }, []);

  const clearReceivedWebhooks = useCallback(async () => {
    setClearingReceivedWebhooks(true);
    setReceivedWebhooksError(null);
    try {
      await fetchJson("/api/received-webhooks", { method: "DELETE" });
      setReceivedWebhooks([]);
    } catch (err) {
      setReceivedWebhooksError(err.message);
    } finally {
      setClearingReceivedWebhooks(false);
    }
  }, []);

  useEffect(() => {
    if (selectedCredentialId) {
      refreshWebhooks(selectedCredentialId);
    }
  }, [selectedCredentialId, refreshWebhooks]);

  useEffect(() => {
    refreshReceivedWebhooks();
  }, [refreshReceivedWebhooks]);

  const handleCredentialChange = useCallback(() => {
    refreshCredentials();
  }, [refreshCredentials]);

  const subscribing = useMemo(
    () => Boolean(subscriptionTarget),
    [subscriptionTarget]
  );

  const subscribeToEvent = useCallback(
    async (credential, eventId) => {
      if (!webhookUrl) {
        setSubscriptionError("Please provide a webhook URL before subscribing.");
        return;
      }

      setSubscriptionTarget(`${credential.id}:${eventId}`);
      setSubscriptionError(null);
      setLastSubscriptionMessage("");

      try {
        await fetchJson("/api/webhooks", {
          method: "POST",
          body: JSON.stringify({
            url: webhookUrl,
            event: eventId,
            credentialId: credential.id,
            consumerKey:
              typeof consumerKey === "string" && consumerKey.trim().length > 0
                ? consumerKey.trim()
                : undefined,
          }),
        });

        setLastSubscriptionMessage(
          `Subscribed ${credential.profile?.accountName || credential.id} to ${eventId}.`
        );
        await refreshWebhooks();
      } catch (err) {
        setSubscriptionError(err.message);
      } finally {
        setSubscriptionTarget(null);
      }
    },
    [refreshWebhooks, webhookUrl, consumerKey]
  );

  const deleteWebhook = useCallback(
    async (webhook) => {
      if (!webhook?.id) {
        setWebhookDeletionError("Cannot delete webhook without an id.");
        return;
      }

      if (!selectedCredentialId) {
        return;
      }

      setDeletingWebhookId(webhook.id);
      setWebhookDeletionError(null);
      try {
        await fetchJson(
          buildApiUrl(`/api/webhooks/${encodeURIComponent(webhook.id)}`, {
            credentialId: selectedCredentialId,
          }),
          { method: "DELETE" }
        );
        await refreshWebhooks(selectedCredentialId);
      } catch (err) {
        setWebhookDeletionError(err.message);
      } finally {
        setDeletingWebhookId(null);
      }
    },
    [refreshWebhooks, selectedCredentialId, buildApiUrl]
  );

  const rolloutProviderKey = useMemo(() => {
    const normalized =
      typeof consumerKey === "string" ? consumerKey.trim() : "";
    if (!hasLoadedConsumerKey) {
      return "loading-consumer-key";
    }
    return normalized.length > 0 ? normalized : "default-consumer-key";
  }, [consumerKey, hasLoadedConsumerKey]);

  return (
    <div className="app">
      <header>
        <h1>Rollout Webhooks Demo</h1>
        <p>
          Use the embedded Rollout Link to connect providers, view existing
          credentials, and subscribe to webhook events.
        </p>
        <div className="consumer-key-controls">
          <label htmlFor="consumer-key-input">Rollout consumer key</label>
          <input
            id="consumer-key-input"
            type="text"
            value={consumerKey}
            onChange={(event) => setConsumerKey(event.target.value)}
            placeholder="Enter a Rollout consumer key"
          />
          <p className="hint">
            Used when requesting tokens and talking to the Rollout APIs.
          </p>
          {hasLoadedConsumerKey && savingConsumerKey && (
            <p className="hint">Saving consumer key for this session…</p>
          )}
          {hasLoadedConsumerKey && consumerKeyError && (
            <p className="error">
              Error saving consumer key: {consumerKeyError}
            </p>
          )}
          {hasLoadedConsumerKey &&
            !savingConsumerKey &&
            !consumerKeyError &&
            consumerKeyStatus && <p className="success">{consumerKeyStatus}</p>}
          {hasLoadedAccordionState && savingAccordionState && (
            <p className="hint">Saving section preferences…</p>
          )}
          {hasLoadedAccordionState && accordionError && (
            <p className="error">
              Error saving section preferences: {accordionError}
            </p>
          )}
          {hasLoadedAccordionState &&
            !savingAccordionState &&
            !accordionError &&
            accordionStatus && <p className="success">{accordionStatus}</p>}
        </div>
      </header>
      <main>
        <AccordionSection
          id="accordion-connect-provider"
          title="Connect a Provider"
          isOpen={accordionState.connectProvider}
          onToggle={() => toggleAccordionSection("connectProvider")}
        >
          <p>
            Launch Rollout Link to add or remove credentials. The lists below
            refresh automatically after changes.
          </p>
          {!hasLoadedConsumerKey && (
            <p className="hint">Loading stored consumer key…</p>
          )}
          <RolloutLinkProvider
            key={rolloutProviderKey}
            token={fetchRolloutToken}
          >
            <CredentialsManager
              key={rolloutProviderKey}
              onCredentialAdded={handleCredentialChange}
              onCredentialDeleted={handleCredentialChange}
            />
          </RolloutLinkProvider>
        </AccordionSection>

        <AccordionSection
          id="accordion-connected-credentials"
          title="Connected Credentials"
          isOpen={accordionState.connectedCredentials}
          onToggle={() => toggleAccordionSection("connectedCredentials")}
          headerActions={
            <button
              type="button"
              onClick={refreshCredentials}
              disabled={credentialsLoading}
            >
              {credentialsLoading ? "Refreshing…" : "Refresh"}
            </button>
          }
        >
          {credentialsError && (
            <p className="error">Error loading credentials: {credentialsError}</p>
          )}
          {!credentialsError && credentials.length === 0 && !credentialsLoading && (
            <p className="empty">No credentials found yet.</p>
          )}
          <div className="credential-list">
            {credentials.map((credential) => (
              <article key={credential.id} className="credential-card">
                <header>
                  <h3>{credential.profile?.accountName || credential.appKey}</h3>
                  <span className="credential-id">{credential.id}</span>
                </header>
                <dl>
                  <div>
                    <dt>App</dt>
                    <dd>{credential.appKey}</dd>
                  </div>
                </dl>

                <div className="webhook-subscribe">
                  <p>Subscribe this credential to webhook events:</p>
                  <div className="event-buttons">
                    {SUBSCRIPTION_EVENTS.map((event) => {
                      const buttonId = `${credential.id}:${event.id}`;
                      const loading = subscriptionTarget === buttonId;
                      return (
                        <button
                          key={event.id}
                          type="button"
                          disabled={loading || subscribing}
                          onClick={() => subscribeToEvent(credential, event.id)}
                        >
                          {loading ? "Subscribing…" : event.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </AccordionSection>

        <AccordionSection
          id="accordion-webhook-target"
          title="Webhook Target"
          isOpen={accordionState.webhookTarget}
          onToggle={() => toggleAccordionSection("webhookTarget")}
        >
          <p>
            Provide the URL Rollout should call when events fire. This is usually
            a secure publicly accessible endpoint.
          </p>
          <p className="hint">
            Example: <code>https://abc123.ngrok-free.app/webhooks</code> when using an
            ngrok tunnel for local testing.
          </p>
          <input
            type="url"
            value={webhookUrl}
            onChange={(event) => setWebhookUrl(event.target.value)}
            placeholder="https://example.com/webhooks/rollout"
          />
          {savingWebhookTarget && (
            <p className="hint">Saving target for this browser…</p>
          )}
          {webhookTargetError && (
            <p className="error">
              Error saving webhook target: {webhookTargetError}
            </p>
          )}
          {!savingWebhookTarget &&
            !webhookTargetError &&
            webhookTargetStatus && (
              <p className="success">{webhookTargetStatus}</p>
            )}
          {subscriptionError && (
            <p className="error">Subscription error: {subscriptionError}</p>
          )}
          {lastSubscriptionMessage && (
            <p className="success">{lastSubscriptionMessage}</p>
          )}
        </AccordionSection>

        <AccordionSection
          id="accordion-webhook-subscriptions"
          title="Webhook Subscriptions"
          isOpen={accordionState.webhookSubscriptions}
          onToggle={() => toggleAccordionSection("webhookSubscriptions")}
          headerActions={
            <button
              type="button"
              onClick={() => refreshWebhooks(selectedCredentialId)}
              disabled={webhooksLoading || !selectedCredentialId}
            >
              {webhooksLoading ? "Refreshing…" : "Refresh"}
            </button>
          }
        >
          <div className="webhook-credential-selector">
            <label htmlFor="webhook-credential">
              View subscriptions for credential
            </label>
            <select
              id="webhook-credential"
              value={selectedCredentialId}
              onChange={(event) => setSelectedCredentialId(event.target.value)}
              disabled={credentials.length === 0}
            >
              <option value="">
                {credentials.length === 0
                  ? "No credentials available"
                  : "Select credential"}
              </option>
              {credentials.map((credential) => (
                <option key={credential.id} value={credential.id}>
                  {credential.profile?.accountName || credential.appKey} (
                  {credential.id})
                </option>
              ))}
            </select>
          </div>
          {(webhooksError || webhookDeletionError) && (
            <p className="error">
              {webhooksError
                ? `Error loading webhooks: ${webhooksError}`
                : `Failed to delete webhook: ${webhookDeletionError}`}
            </p>
          )}
          {!webhooksError && webhooks.length === 0 && !webhooksLoading && (
            <p className="empty">No webhook subscriptions found yet.</p>
          )}
          <ul className="webhook-list">
            {webhooks.map((hook) => (
              <li key={hook.id || `${hook.event}-${hook.url}`}>
                <span className="event">{hook.event}</span>
                <span className="url">{hook.url}</span>
                <button
                  type="button"
                  className="danger"
                  onClick={() => hook.id && deleteWebhook(hook)}
                  disabled={
                    !hook.id ||
                    (deletingWebhookId !== null &&
                      deletingWebhookId === hook.id)
                  }
                >
                  {hook.id && deletingWebhookId === hook.id
                    ? "Deleting…"
                    : "Delete"}
                </button>
                {hook.filters && (
                  <pre>{JSON.stringify(hook.filters, null, 2)}</pre>
                )}
              </li>
            ))}
          </ul>
        </AccordionSection>

        <AccordionSection
          id="accordion-received-webhooks"
          title="Received Webhook Events"
          isOpen={accordionState.receivedWebhooks}
          onToggle={() => toggleAccordionSection("receivedWebhooks")}
          headerActions={
            <div className="section-actions">
              <button
                type="button"
                onClick={refreshReceivedWebhooks}
                disabled={receivedWebhooksLoading}
              >
                {receivedWebhooksLoading ? "Refreshing…" : "Refresh"}
              </button>
              <button
                type="button"
                onClick={clearReceivedWebhooks}
                disabled={
                  clearingReceivedWebhooks || receivedWebhooks.length === 0
                }
                className="secondary"
              >
                {clearingReceivedWebhooks ? "Clearing…" : "Clear"}
              </button>
            </div>
          }
        >
          {receivedWebhooksError && (
            <p className="error">
              Error loading received webhooks: {receivedWebhooksError}
            </p>
          )}
          {!receivedWebhooksError &&
            receivedWebhooks.length === 0 &&
            !receivedWebhooksLoading && <p className="empty">No webhooks received yet.</p>}
          <ul className="received-webhook-list">
            {receivedWebhooks.map((hook) => {
              const eventName = hook.body?.event || "Unknown event";
              const receivedAt = hook.receivedAt
                ? new Date(hook.receivedAt).toLocaleString()
                : "";
              return (
                <li key={hook.id}>
                  <div className="received-webhook-meta">
                    <span className="event">{eventName}</span>
                    <span className="timestamp">{receivedAt}</span>
                  </div>
                  <details>
                    <summary>Payload</summary>
                    <pre>{JSON.stringify(hook.body, null, 2)}</pre>
                  </details>
                  <details>
                    <summary>Headers</summary>
                    <pre>{JSON.stringify(hook.headers, null, 2)}</pre>
                  </details>
                </li>
              );
            })}
          </ul>
        </AccordionSection>
      </main>
    </div>
  );
}

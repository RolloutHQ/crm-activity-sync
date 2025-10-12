import React, { useCallback, useEffect, useMemo, useState } from "react";
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
  import.meta.env.VITE_DEFAULT_WEBHOOK_URL || "http://localhost:5174/webhooks";

function fetchRolloutToken() {
  return fetch(rolloutTokenEndpoint, {
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
}

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

export default function App() {
  const [credentials, setCredentials] = useState([]);
  const [credentialsLoading, setCredentialsLoading] = useState(false);
  const [credentialsError, setCredentialsError] = useState(null);
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

  const refreshCredentials = useCallback(async () => {
    setCredentialsLoading(true);
    setCredentialsError(null);
    try {
      const data = await fetchJson("/api/credentials");
      setCredentials(extractItems(data));
    } catch (err) {
      setCredentialsError(err.message);
    } finally {
      setCredentialsLoading(false);
    }
  }, []);

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
      try {
        const data = await fetchJson(
          `/api/webhooks?credentialId=${encodeURIComponent(
            credentialIdToUse
          )}`
        );
        setWebhooks(extractItems(data));
      } catch (err) {
        setWebhooksError(err.message);
      } finally {
        setWebhooksLoading(false);
      }
    },
    [selectedCredentialId]
  );

  useEffect(() => {
    refreshCredentials();
  }, [refreshCredentials]);

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
    [refreshWebhooks, webhookUrl]
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
          `/api/webhooks/${encodeURIComponent(webhook.id)}?credentialId=${encodeURIComponent(
            selectedCredentialId
          )}`,
          { method: "DELETE" }
        );
        await refreshWebhooks(selectedCredentialId);
      } catch (err) {
        setWebhookDeletionError(err.message);
      } finally {
        setDeletingWebhookId(null);
      }
    },
    [refreshWebhooks, selectedCredentialId]
  );

  return (
    <div className="app">
      <header>
        <h1>Rollout Webhooks Demo</h1>
        <p>
          Use the embedded Rollout Link to connect providers, view existing
          credentials, and subscribe to webhook events.
        </p>
      </header>
      <main>
        <section className="card">
          <h2>Connect a Provider</h2>
          <p>
            Launch Rollout Link to add or remove credentials. The lists below
            refresh automatically after changes.
          </p>
          <RolloutLinkProvider token={fetchRolloutToken}>
            <CredentialsManager
              onCredentialAdded={handleCredentialChange}
              onCredentialDeleted={handleCredentialChange}
            />
          </RolloutLinkProvider>
        </section>

        <section className="card">
          <div className="section-header">
            <h2>Connected Credentials</h2>
            <button
              type="button"
              onClick={refreshCredentials}
              disabled={credentialsLoading}
            >
              {credentialsLoading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
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
                  <div>
                    <dt>Last Sync</dt>
                    <dd>{credential.data?.lastSyncAt || "—"}</dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>{credential.status || "Unknown"}</dd>
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
        </section>

        <section className="card">
          <h2>Webhook Target</h2>
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
        </section>

        <section className="card">
          <div className="section-header">
            <h2>Webhook Subscriptions</h2>
            <button
              type="button"
              onClick={() => refreshWebhooks(selectedCredentialId)}
              disabled={webhooksLoading || !selectedCredentialId}
            >
              {webhooksLoading ? "Refreshing…" : "Refresh"}
            </button>
          </div>
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
        </section>

        <section className="card">
          <div className="section-header">
            <h2>Received Webhook Events</h2>
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
                disabled={clearingReceivedWebhooks || receivedWebhooks.length === 0}
                className="secondary"
              >
                {clearingReceivedWebhooks ? "Clearing…" : "Clear"}
              </button>
            </div>
          </div>
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
        </section>
      </main>
    </div>
  );
}

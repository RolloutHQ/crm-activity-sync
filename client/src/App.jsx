import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppointmentForm from "./components/AppointmentForm.jsx";
import PersonInsights from "./components/PersonInsights.jsx";
import PersonLookupForm from "./components/PersonLookupForm.jsx";
import {
  RolloutLinkProvider,
  CredentialsManager,
} from "@rollout/link-react";
import "@rollout/link-react/style.css";
import "./App.css";
const rolloutTokenEndpoint =
  import.meta.env.VITE_ROLLOUT_TOKEN_URL || "/rollout-token";

const defaultConsumerKey =
  import.meta.env.VITE_ROLLOUT_CONSUMER_KEY || "demo-consumer";

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

function formatTimestamp(value) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function truncate(value, maxLength = 220) {
  if (typeof value !== "string") {
    return "";
  }
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength).trimEnd()}…`;
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
  const [clientCredentialsConfigured, setClientCredentialsConfigured] =
    useState(false);
  const [clientCredentialsLoading, setClientCredentialsLoading] =
    useState(true);
  const [clientCredentialsLoadError, setClientCredentialsLoadError] =
    useState(null);
  const [clientCredentialsFormError, setClientCredentialsFormError] =
    useState(null);
  const [clientCredentialsStatus, setClientCredentialsStatus] = useState("");
  const [clientCredentialFormClientId, setClientCredentialFormClientId] =
    useState("");
  const [clientCredentialFormClientSecret, setClientCredentialFormClientSecret] =
    useState("");
  const [isEditingClientCredentials, setIsEditingClientCredentials] =
    useState(false);
  const [isSavingClientCredentials, setIsSavingClientCredentials] =
    useState(false);
  const [isClearingClientCredentials, setIsClearingClientCredentials] =
    useState(false);
  const storedClientIdRef = useRef("");
  const defaultClientIdRef = useRef("");
  const [consumerKey, setConsumerKey] = useState(defaultConsumerKey);
  const [consumerKeyStatus, setConsumerKeyStatus] = useState("");
  const [consumerKeyError, setConsumerKeyError] = useState(null);
  const [hasLoadedConsumerKey, setHasLoadedConsumerKey] = useState(false);
  const [savingConsumerKey, setSavingConsumerKey] = useState(false);
  const persistedConsumerKey = useRef(null);
  const [isConnectSectionOpen, setIsConnectSectionOpen] = useState(true);
  const [isEnvironmentCredentials, setIsEnvironmentCredentials] = useState(false);
  const [credentialOptions, setCredentialOptions] = useState([]);
  const [credentialOptionsLoading, setCredentialOptionsLoading] = useState(false);
  const [credentialOptionsError, setCredentialOptionsError] = useState(null);
  const [selectedCredentialId, setSelectedCredentialId] = useState("");
  const [isPersonInsightsOpen, setIsPersonInsightsOpen] = useState(true);
  const [isFetchingPerson, setIsFetchingPerson] = useState(false);
  const [personLookupError, setPersonLookupError] = useState(null);
  const [personLookupStatus, setPersonLookupStatus] = useState("");
  const [personDetails, setPersonDetails] = useState(null);
  const [personEvents, setPersonEvents] = useState([]);
  const [personNotes, setPersonNotes] = useState([]);
  const [personCalls, setPersonCalls] = useState([]);
  const [personTextMessages, setPersonTextMessages] = useState([]);
  const [personAppointments, setPersonAppointments] = useState([]);
  const [personTasks, setPersonTasks] = useState([]);
  const [peopleOptions, setPeopleOptions] = useState([]);
  const [peopleOptionsLoading, setPeopleOptionsLoading] = useState(false);
  const [peopleOptionsError, setPeopleOptionsError] = useState(null);
  const [selectedPersonId, setSelectedPersonId] = useState("");
  // Appointment state moved into AppointmentForm component

  // Smart defaults helpers
  // Appointment helpers moved into AppointmentForm component
  // Person detail derivations moved to PersonInsights component

  const applyClientCredentialsResponse = useCallback((payload) => {
    const configured = Boolean(payload?.configured);
    const defaultId =
      typeof payload?.defaultClientId === "string" ? payload.defaultClientId : "";
    const clientIdValue =
      typeof payload?.clientId === "string" ? payload.clientId : "";
    const usingEnvironment = Boolean(payload?.usingEnvironment);
    const sessionClientId =
      typeof payload?.sessionClientId === "string"
        ? payload.sessionClientId
        : "";

    setIsEnvironmentCredentials(usingEnvironment);

    storedClientIdRef.current = sessionClientId || "";
    defaultClientIdRef.current = defaultId;

    const formClientId =
      sessionClientId || clientIdValue || defaultId || "";
    setClientCredentialFormClientId(formClientId);
    setClientCredentialFormClientSecret("");
    setClientCredentialsConfigured(configured);
    setIsEditingClientCredentials(!configured);
    setClientCredentialsFormError(null);
    setClientCredentialsLoadError(null);
    setClientCredentialsStatus("");
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setClientCredentialsLoading(true);
      setClientCredentialsLoadError(null);
      try {
        const data = await fetchJson("/api/session/rollout-client");
        if (cancelled) {
          return;
        }
        applyClientCredentialsResponse(data);
      } catch (err) {
        if (cancelled) {
          return;
        }
        storedClientIdRef.current = "";
        defaultClientIdRef.current = "";
        setClientCredentialsConfigured(false);
        setIsEditingClientCredentials(true);
        setClientCredentialFormClientId("");
        setClientCredentialFormClientSecret("");
        setClientCredentialsLoadError(err.message);
        setClientCredentialsFormError(null);
        setClientCredentialsStatus("");
        setIsEnvironmentCredentials(false);
      } finally {
        if (!cancelled) {
          setClientCredentialsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyClientCredentialsResponse]);

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

  useEffect(() => {
    if (!clientCredentialsConfigured) {
      setCredentialOptions([]);
      setCredentialOptionsLoading(false);
      setCredentialOptionsError(null);
      setSelectedCredentialId("");
      setPeopleOptions([]);
      setPeopleOptionsLoading(false);
      setPeopleOptionsError(null);
      setSelectedPersonId("");
      return;
    }

    let cancelled = false;
    setCredentialOptionsLoading(true);
    setCredentialOptionsError(null);

    (async () => {
      try {
        const data = await fetchJson("/api/credentials");
        if (cancelled) {
          return;
        }
        const options = Array.isArray(data?.credentials)
          ? data.credentials
              .filter(
                (credential) =>
                  credential &&
                  typeof credential.id === "string" &&
                  credential.id.length > 0
              )
              .map((credential) => ({
                id: credential.id,
                label:
                  typeof credential.label === "string" && credential.label.trim()
                    ? credential.label.trim()
                    : credential.id,
              }))
          : [];
        setCredentialOptions(options);
        setCredentialOptionsError(null);
      } catch (err) {
        if (!cancelled) {
          setCredentialOptionsError(err.message);
          setCredentialOptions([]);
        }
      } finally {
        if (!cancelled) {
          setCredentialOptionsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clientCredentialsConfigured, consumerKey]);

  useEffect(() => {
    if (selectedCredentialId) {
      const exists = credentialOptions.some(
        (option) => option.id === selectedCredentialId
      );
      if (!exists) {
        setSelectedCredentialId("");
      }
    }
  }, [credentialOptions, selectedCredentialId]);

  useEffect(() => {
    if (!clientCredentialsConfigured) {
      return;
    }

    let cancelled = false;
    setPeopleOptionsLoading(true);
    setPeopleOptionsError(null);
    setPeopleOptions([]);
    setSelectedPersonId("");
    setPersonLookupStatus("");
    setPersonLookupError(null);

    const params = new URLSearchParams();
    // Show more people in the dropdown by fetching up to 100
    params.set("limit", "100");
    if (selectedCredentialId) {
      params.set("credentialId", selectedCredentialId);
    }

    (async () => {
      try {
        const data = await fetchJson(`/api/people?${params.toString()}`);
        if (cancelled) {
          return;
        }
        const options = Array.isArray(data?.people)
          ? data.people
              .filter((person) => person && person.id !== undefined && person.id !== null)
              .map((person) => {
                const id = String(person.id).trim();
                if (!id) {
                  return null;
                }
                const label =
                  typeof person.label === "string" && person.label.trim()
                    ? person.label.trim()
                    : id;
                return { id, label };
              })
              .filter(Boolean)
          : [];
        setPeopleOptions(options);
        if (options.length > 0) {
          setSelectedPersonId(options[0].id);
        } else {
          setSelectedPersonId("");
        }
      } catch (err) {
        if (!cancelled) {
          setPeopleOptionsError(err.message);
          setPeopleOptions([]);
          setSelectedPersonId("");
        }
      } finally {
        if (!cancelled) {
          setPeopleOptionsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clientCredentialsConfigured, selectedCredentialId, consumerKey, hasLoadedConsumerKey]);

  useEffect(() => {
    if (!hasLoadedConsumerKey) {
      return;
    }
    setPersonDetails(null);
    setPersonEvents([]);
    setPersonNotes([]);
    setPersonCalls([]);
    setPersonTextMessages([]);
    setPersonAppointments([]);
    setPersonTasks([]);
    setPersonLookupStatus("");
    setPersonLookupError(null);
    setSelectedCredentialId("");
    setCredentialOptions([]);
    setCredentialOptionsError(null);
    setPeopleOptions([]);
    setPeopleOptionsError(null);
    setPeopleOptionsLoading(false);
    setSelectedPersonId("");
  }, [consumerKey, hasLoadedConsumerKey]);

  // Load appointment metadata (types and outcomes) for the selected credential
  // Appointment metadata handled in AppointmentForm component
  useEffect(() => {}, [clientCredentialsConfigured, selectedCredentialId]);

  // Load users for selected credential (for default/explicit user assignment)
  useEffect(() => {
    if (!clientCredentialsConfigured) {
      setUserOptions([]);
      setSelectedUserId("");
      setUserOptionsError(null);
      setUserOptionsLoading(false);
      return;
    }
    let cancelled = false;
    setUserOptionsLoading(true);
    setUserOptionsError(null);
    const params = new URLSearchParams();
    if (selectedCredentialId) params.set("credentialId", selectedCredentialId);
    // handled in AppointmentForm component
    return () => {
      cancelled = true;
    };
  }, [clientCredentialsConfigured, selectedCredentialId]);

  // handled in AppointmentForm component

  // handled in AppointmentForm component

  const fetchRolloutToken = useCallback(() => {
    if (!clientCredentialsConfigured) {
      return Promise.reject(
        new Error(
          "Rollout client credentials are not configured for this session."
        )
      );
    }
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
      credentials: "same-origin",
    })
      .then((resp) => {
        if (!resp.ok) {
          throw new Error(`Failed to fetch token (${resp.status})`);
        }
        return resp.json();
      })
      .then((data) => data.token);
  }, [clientCredentialsConfigured, consumerKey, rolloutTokenEndpoint]);

  const handleClientCredentialsSubmit = async (event) => {
    event.preventDefault();
    if (isSavingClientCredentials || isClearingClientCredentials) {
      return;
    }
    const trimmedClientId = clientCredentialFormClientId.trim();
    const trimmedClientSecret = clientCredentialFormClientSecret.trim();
    if (!trimmedClientId || !trimmedClientSecret) {
      setClientCredentialsFormError(
        "Both client ID and client secret are required."
      );
      return;
    }
    setClientCredentialsFormError(null);
    setClientCredentialsStatus("");
    setIsSavingClientCredentials(true);
    try {
      const payload = await fetchJson("/api/session/rollout-client", {
        method: "POST",
        body: JSON.stringify({
          clientId: trimmedClientId,
          clientSecret: trimmedClientSecret,
        }),
      });
      applyClientCredentialsResponse(payload);
      setClientCredentialsLoadError(null);
      setClientCredentialsStatus(
        "Rollout client credentials saved for this session."
      );
      setIsEnvironmentCredentials(false);
      setPersonDetails(null);
      setPersonEvents([]);
      setPersonNotes([]);
      setPersonCalls([]);
      setPersonTextMessages([]);
      setPersonAppointments([]);
      setPersonTasks([]);
      setPersonLookupStatus("");
      setPersonLookupError(null);
      setSelectedCredentialId("");
      setCredentialOptions([]);
      setCredentialOptionsError(null);
    } catch (err) {
      setClientCredentialsFormError(err.message);
    } finally {
      setIsSavingClientCredentials(false);
    }
  };

  const handleClearClientCredentials = async () => {
    if (isClearingClientCredentials || isSavingClientCredentials) {
      return;
    }
    setClientCredentialsFormError(null);
    setClientCredentialsStatus("");
    setIsClearingClientCredentials(true);
    try {
      const response = await fetch("/api/session/rollout-client", {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Failed to clear credentials (${response.status})${
            errorText ? `: ${errorText}` : ""
          }`
        );
      }
      storedClientIdRef.current = "";
      setClientCredentialFormClientSecret("");
      const refreshed = await fetchJson("/api/session/rollout-client");
      applyClientCredentialsResponse(refreshed);
      setClientCredentialsLoadError(null);
      setClientCredentialsStatus(
        "Rollout client credentials cleared for this session."
      );
      setPersonDetails(null);
      setPersonEvents([]);
      setPersonNotes([]);
      setPersonCalls([]);
      setPersonTextMessages([]);
      setPersonAppointments([]);
      setPersonTasks([]);
      setPersonLookupStatus("");
      setPersonLookupError(null);
      setSelectedCredentialId("");
      setCredentialOptions([]);
      setCredentialOptionsError(null);
      setPeopleOptions([]);
      setPeopleOptionsError(null);
      setPeopleOptionsLoading(false);
      setSelectedPersonId("");
    } catch (err) {
      setClientCredentialsFormError(err.message);
    } finally {
      setIsClearingClientCredentials(false);
    }
  };

  // Appointment submission handled in AppointmentForm component

  const handleCancelClientCredentialsEdit = () => {
    if (!clientCredentialsConfigured) {
      return;
    }
    setClientCredentialsFormError(null);
    setClientCredentialsStatus("");
    setClientCredentialFormClientId(
      storedClientIdRef.current || defaultClientIdRef.current || ""
    );
    setClientCredentialFormClientSecret("");
    setIsEditingClientCredentials(false);
  };

  const handleOpenClientCredentialsEditor = () => {
    setClientCredentialsFormError(null);
    setClientCredentialsStatus("");
    setClientCredentialFormClientId(
      storedClientIdRef.current || defaultClientIdRef.current || ""
    );
    setClientCredentialFormClientSecret("");
    setIsEditingClientCredentials(true);
  };

  const renderClientCredentialsForm = ({
    showCancel = false,
    showClear = false,
    showStatusInForm = true,
  } = {}) => (
    <form
      className="client-credentials-form"
      onSubmit={handleClientCredentialsSubmit}
    >
      <label htmlFor="rollout-client-id-input">Rollout client ID</label>
      <input
        id="rollout-client-id-input"
        type="text"
        value={clientCredentialFormClientId}
        onChange={(event) => {
          setClientCredentialFormClientId(event.target.value);
          if (clientCredentialsFormError) {
            setClientCredentialsFormError(null);
          }
          if (clientCredentialsStatus) {
            setClientCredentialsStatus("");
          }
        }}
        placeholder="Enter a Rollout client ID"
        autoComplete="off"
        required
      />
      <label htmlFor="rollout-client-secret-input">Rollout client secret</label>
      <input
        id="rollout-client-secret-input"
        type="password"
        value={clientCredentialFormClientSecret}
        onChange={(event) => {
          setClientCredentialFormClientSecret(event.target.value);
          if (clientCredentialsFormError) {
            setClientCredentialsFormError(null);
          }
          if (clientCredentialsStatus) {
            setClientCredentialsStatus("");
          }
        }}
        placeholder="Enter the client secret"
        autoComplete="off"
        required
      />
      <p className="hint">
        Stored only for this browser session. Clear the session to remove it.
      </p>
      {clientCredentialsFormError ? (
        <p className="error">
          Error saving client credentials: {clientCredentialsFormError}
        </p>
      ) : null}
      {!clientCredentialsFormError &&
      clientCredentialsStatus &&
      showStatusInForm ? (
        <p className="success">{clientCredentialsStatus}</p>
      ) : null}
      <div className="client-credentials-actions">
        <button
          type="submit"
          disabled={isSavingClientCredentials || isClearingClientCredentials}
        >
          {isSavingClientCredentials ? "Saving…" : "Save client credentials"}
        </button>
        {showClear ? (
          <button
            type="button"
            onClick={handleClearClientCredentials}
            disabled={isSavingClientCredentials || isClearingClientCredentials}
          >
            {isClearingClientCredentials ? "Clearing…" : "Clear stored credentials"}
          </button>
        ) : null}
        {showCancel ? (
          <button
            type="button"
            onClick={handleCancelClientCredentialsEdit}
            disabled={isSavingClientCredentials || isClearingClientCredentials}
          >
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );

  const handlePersonInsightsSubmit = useCallback(
    async (event) => {
      event.preventDefault();
      if (isFetchingPerson) {
        return;
      }
      if (!selectedPersonId) {
        setPersonLookupError("Select a person to load insights.");
        setPersonLookupStatus("");
        return;
      }

      setIsFetchingPerson(true);
      setPersonLookupError(null);
      setPersonLookupStatus("");
      setPersonDetails(null);
      setPersonEvents([]);
      setPersonNotes([]);
      setPersonCalls([]);
      setPersonTextMessages([]);
      setPersonAppointments([]);
      setPersonTasks([]);

      try {
        const params = new URLSearchParams({
          identifierType: "personId",
          value: selectedPersonId,
        });
        if (selectedCredentialId) {
          params.set("credentialId", selectedCredentialId);
        }
        const data = await fetchJson(`/api/person-insights?${params.toString()}`);
        const receivedPerson =
          data && typeof data === "object" ? data.person : null;
        const receivedEvents = Array.isArray(data?.events) ? data.events : [];
        const receivedNotes = Array.isArray(data?.notes) ? data.notes : [];
        const receivedCalls = Array.isArray(data?.calls) ? data.calls : [];
        const receivedTextMessages = Array.isArray(data?.textMessages)
          ? data.textMessages
          : [];
        const receivedAppointments = Array.isArray(data?.appointments)
          ? data.appointments
          : [];
        const receivedTasks = Array.isArray(data?.tasks) ? data.tasks : [];
        setPersonDetails(receivedPerson);
        setPersonEvents(receivedEvents);
        setPersonNotes(receivedNotes);
        setPersonCalls(receivedCalls);
        setPersonTextMessages(receivedTextMessages);
        setPersonAppointments(receivedAppointments);
        setPersonTasks(receivedTasks);
        const personLabel =
          receivedPerson?.name ||
          receivedPerson?.firstName ||
          receivedPerson?.id ||
          peopleOptions.find((option) => option.id === selectedPersonId)?.label ||
          selectedPersonId;
        const selectedCredentialOption = credentialOptions.find(
          (option) => option.id === selectedCredentialId
        );
        const credentialLabel =
          selectedCredentialId && selectedCredentialOption?.label
            ? selectedCredentialOption.label
            : "";
        setPersonLookupStatus(
          `Fetched details for ${personLabel}${
            credentialLabel ? ` via ${credentialLabel}` : ""
          }.`
        );
      } catch (err) {
        setPersonLookupError(err.message);
      } finally {
        setIsFetchingPerson(false);
      }
    },
    [
      isFetchingPerson,
      selectedPersonId,
      selectedCredentialId,
      credentialOptions,
      peopleOptions,
    ]
  );

  const rolloutProviderKey = useMemo(() => {
    const normalized =
      typeof consumerKey === "string" ? consumerKey.trim() : "";
    if (!hasLoadedConsumerKey) {
      return "loading-consumer-key";
    }
    return normalized.length > 0 ? normalized : "default-consumer-key";
  }, [consumerKey, hasLoadedConsumerKey]);

  const storedClientId = storedClientIdRef.current;

  if (clientCredentialsLoading) {
    return (
      <div className="app credentials-setup">
        <section className="card credentials-card">
          <h1>Rollout Activity Sync Demo</h1>
          <p className="hint">
            Loading session-specific Rollout client credentials…
          </p>
        </section>
      </div>
    );
  }

  if (!clientCredentialsConfigured) {
    return (
      <div className="app credentials-setup">
        <section className="card credentials-card">
          <h1>Rollout Activity Sync Demo</h1>
          <p>
            Enter your Rollout client ID and client secret to continue. The
            values are stored only for this browser session.
          </p>
          {clientCredentialsLoadError ? (
            <p className="error">
              Failed to load stored credentials: {clientCredentialsLoadError}
            </p>
          ) : null}
          {renderClientCredentialsForm()}
        </section>
      </div>
    );
  }

  return (
    <div className="app">
      <header>
        <div className="header-top">
          <h1>Rollout Activity Sync Demo</h1>
          <div className="header-actions">
            <button
              type="button"
              className="primary-button"
              onClick={handleOpenClientCredentialsEditor}
            >
              Rollout API Keys
            </button>
          </div>
        </div>
        {clientCredentialsStatus && !isEditingClientCredentials ? (
          <p className="success inline-status">{clientCredentialsStatus}</p>
        ) : null}
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
          {isEnvironmentCredentials ? (
            <p className="hint">
              Credentials sourced from environment variables.
            </p>
          ) : null}
        </div>
      </header>
      <main>
        <AccordionSection
          id="accordion-connect-provider"
          title="Connect a Provider"
          isOpen={isConnectSectionOpen}
          onToggle={() => setIsConnectSectionOpen((open) => !open)}
        >
          <p>
            Launch Rollout Link to add or remove credentials. The embedded
            experience keeps data in sync automatically.
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
              entitiesToSync={{ notes: true }}
            />
          </RolloutLinkProvider>
        </AccordionSection>

        <AccordionSection
          id="accordion-person-insights"
          title="Person Insights"
          isOpen={isPersonInsightsOpen}
          onToggle={() => setIsPersonInsightsOpen((open) => !open)}
        >
          <p className="section-subtitle">
            Choose a credential and person to inspect their latest Rollout activity and details.
          </p>
          <PersonLookupForm
            credentialOptions={credentialOptions}
            credentialOptionsLoading={credentialOptionsLoading}
            credentialOptionsError={credentialOptionsError}
            selectedCredentialId={selectedCredentialId}
            setSelectedCredentialId={setSelectedCredentialId}
            peopleOptions={peopleOptions}
            peopleOptionsLoading={peopleOptionsLoading}
            peopleOptionsError={peopleOptionsError}
            selectedPersonId={selectedPersonId}
            setSelectedPersonId={setSelectedPersonId}
            isFetchingPerson={isFetchingPerson}
            onSubmit={handlePersonInsightsSubmit}
          />
          {personLookupError ? <p className="error">{personLookupError}</p> : null}
          {personLookupStatus && !personLookupError ? (
            <p className="success">{personLookupStatus}</p>
          ) : null}
          {isFetchingPerson ? <p className="hint">Contacting Rollout…</p> : null}
          <PersonInsights
            isFetchingPerson={isFetchingPerson}
            personDetails={personDetails}
            personEvents={personEvents}
            personNotes={personNotes}
            personCalls={personCalls}
            personTextMessages={personTextMessages}
            personAppointments={personAppointments}
            personTasks={personTasks}
          />
        </AccordionSection>

        <AppointmentForm
          credentialOptions={credentialOptions}
          credentialOptionsLoading={credentialOptionsLoading}
          selectedCredentialId={selectedCredentialId}
          setSelectedCredentialId={setSelectedCredentialId}
          peopleOptions={peopleOptions}
          peopleOptionsLoading={peopleOptionsLoading}
          selectedPersonId={selectedPersonId}
          setSelectedPersonId={setSelectedPersonId}
        />
      </main>
      {isEditingClientCredentials ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="client-credentials-modal-title"
          onClick={handleCancelClientCredentialsEdit}
        >
          <div
            className="modal"
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            <header className="modal-header">
              <h2 id="client-credentials-modal-title">Rollout API Keys</h2>
              <button
                type="button"
                className="modal-close"
                onClick={handleCancelClientCredentialsEdit}
                aria-label="Close Rollout API Keys editor"
              >
                ×
              </button>
            </header>
            <div className="modal-body">
              <p className="hint">
                Stored only for this browser session. Update or clear them here.
              </p>
              <dl className="client-credentials-summary">
                <div>
                  <dt>Current client ID</dt>
                  <dd>{storedClientId || "Not configured"}</dd>
                </div>
              </dl>
              {renderClientCredentialsForm({
                showCancel: true,
                showClear: true,
                showStatusInForm: false,
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

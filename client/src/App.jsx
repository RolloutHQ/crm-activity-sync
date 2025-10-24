import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  const [appointmentTypes, setAppointmentTypes] = useState([]);
  const [appointmentOutcomes, setAppointmentOutcomes] = useState([]);
  const [appointmentTypeId, setAppointmentTypeId] = useState("");
  const [appointmentOutcomeId, setAppointmentOutcomeId] = useState("");
  const [appointmentTitle, setAppointmentTitle] = useState("");
  const [appointmentLocation, setAppointmentLocation] = useState("");
  const [appointmentStartsAt, setAppointmentStartsAt] = useState("");
  const [appointmentEndsAt, setAppointmentEndsAt] = useState("");
  const [appointmentDescription, setAppointmentDescription] = useState("");
  const [appointmentIsAllDay, setAppointmentIsAllDay] = useState(false);
  const [appointmentStatus, setAppointmentStatus] = useState("");
  const [appointmentError, setAppointmentError] = useState(null);
  const [appointmentSubmitting, setAppointmentSubmitting] = useState(false);
  const [userOptions, setUserOptions] = useState([]);
  const [userOptionsLoading, setUserOptionsLoading] = useState(false);
  const [userOptionsError, setUserOptionsError] = useState(null);
  const [selectedUserId, setSelectedUserId] = useState("");

  // Smart defaults helpers
  function pad2(n) {
    return n < 10 ? `0${n}` : String(n);
  }
  function toDateTimeLocalString(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = pad2(d.getMonth() + 1);
    const day = pad2(d.getDate());
    const hours = pad2(d.getHours());
    const mins = pad2(d.getMinutes());
    return `${year}-${month}-${day}T${hours}:${mins}`;
  }
  function addMinutes(date, mins) {
    const d = new Date(date);
    d.setMinutes(d.getMinutes() + mins);
    return d;
  }
  const personName = useMemo(() => {
    if (!personDetails) {
      return "";
    }
    if (typeof personDetails.name === "string" && personDetails.name.trim()) {
      return personDetails.name.trim();
    }
    const combined = [personDetails.firstName, personDetails.lastName]
      .filter((part) => typeof part === "string" && part.trim().length > 0)
      .join(" ")
      .trim();
    if (combined) {
      return combined;
    }
    return typeof personDetails.id === "string" ? personDetails.id : "";
  }, [personDetails]);

  const primaryEmail = useMemo(() => {
    if (!personDetails || !Array.isArray(personDetails.emails)) {
      return "";
    }
    const primary =
      personDetails.emails.find((entry) => entry?.isPrimary) ||
      personDetails.emails[0];
    return typeof primary?.value === "string" ? primary.value : "";
  }, [personDetails]);

  const primaryPhone = useMemo(() => {
    if (!personDetails || !Array.isArray(personDetails.phones)) {
      return "";
    }
    const primary =
      personDetails.phones.find((entry) => entry?.isPrimary) ||
      personDetails.phones[0];
    return typeof primary?.value === "string" ? primary.value : "";
  }, [personDetails]);

  const personStage = useMemo(() => {
    if (!personDetails) {
      return "";
    }
    if (typeof personDetails.stage === "string" && personDetails.stage.trim()) {
      return personDetails.stage.trim();
    }
    if (typeof personDetails.stageId === "string" && personDetails.stageId.trim()) {
      return personDetails.stageId.trim();
    }
    return "";
  }, [personDetails]);

  const personUpdated = useMemo(() => {
    if (!personDetails) {
      return "";
    }
    return (
      formatTimestamp(personDetails.updated) ||
      formatTimestamp(personDetails.created)
    );
  }, [personDetails]);

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
  useEffect(() => {
    if (!clientCredentialsConfigured) {
      setAppointmentTypes([]);
      setAppointmentOutcomes([]);
      setAppointmentTypeId("");
      setAppointmentOutcomeId("");
      return;
    }
    let cancelled = false;
    const params = new URLSearchParams();
    if (selectedCredentialId) {
      params.set("credentialId", selectedCredentialId);
    }
    (async () => {
      try {
        const data = await fetchJson(`/api/appointment-metadata?${params.toString()}`);
        if (cancelled) return;
        const types = Array.isArray(data?.types) ? data.types : [];
        const outcomes = Array.isArray(data?.outcomes) ? data.outcomes : [];
        setAppointmentTypes(types);
        setAppointmentOutcomes(outcomes);
        if (!types.find((t) => t.id === appointmentTypeId)) {
          // Smart default: pick first available type
          setAppointmentTypeId(types[0]?.id || "");
        }
        if (!outcomes.find((o) => o.id === appointmentOutcomeId)) {
          setAppointmentOutcomeId("");
        }
      } catch (_err) {
        if (!cancelled) {
          setAppointmentTypes([]);
          setAppointmentOutcomes([]);
          setAppointmentTypeId("");
          setAppointmentOutcomeId("");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientCredentialsConfigured, selectedCredentialId]);

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
    (async () => {
      try {
        const data = await fetchJson(`/api/users?${params.toString()}`);
        if (cancelled) return;
        const options = Array.isArray(data?.users) ? data.users : [];
        setUserOptions(options);
        // Smart default: prefer last-used user per credential, else first
        const storageKey = selectedCredentialId
          ? `lastUserId:${selectedCredentialId}`
          : `lastUserId:default`;
        const saved = typeof window !== "undefined" ? window.localStorage.getItem(storageKey) : null;
        const savedExists = saved && options.find((o) => o.id === saved);
        if (!selectedUserId) {
          setSelectedUserId(savedExists ? saved : options[0]?.id || "");
        } else if (!options.find((o) => o.id === selectedUserId)) {
          setSelectedUserId(savedExists ? saved : options[0]?.id || "");
        }
      } catch (err) {
        if (!cancelled) {
          setUserOptionsError(err.message);
          setUserOptions([]);
          setSelectedUserId("");
        }
      } finally {
        if (!cancelled) setUserOptionsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clientCredentialsConfigured, selectedCredentialId]);

  // Persist last-selected user per credential
  useEffect(() => {
    if (!selectedUserId) return;
    const storageKey = selectedCredentialId
      ? `lastUserId:${selectedCredentialId}`
      : `lastUserId:default`;
    try {
      if (typeof window !== "undefined") {
        window.localStorage.setItem(storageKey, selectedUserId);
      }
    } catch (_e) {}
  }, [selectedUserId, selectedCredentialId]);

  // Smart default: initialize start/end times (now → now + 30m)
  useEffect(() => {
    if (!appointmentStartsAt) {
      const now = new Date();
      // round to next 5-minute increment
      const rounded = new Date(now);
      const remainder = rounded.getMinutes() % 5;
      if (remainder !== 0) {
        rounded.setMinutes(rounded.getMinutes() + (5 - remainder));
      }
      const startLocal = toDateTimeLocalString(addMinutes(rounded, 5));
      setAppointmentStartsAt(startLocal);
    }
    if (!appointmentEndsAt && appointmentStartsAt) {
      const start = new Date(appointmentStartsAt);
      const endLocal = toDateTimeLocalString(addMinutes(start, 30));
      setAppointmentEndsAt(endLocal);
    }
  }, [appointmentStartsAt, appointmentEndsAt]);

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

  function toIsoOrNull(v) {
    if (!v || typeof v !== "string") return null;
    const trimmed = v.trim();
    if (!trimmed) return null;
    // Interpret as local time; browsers give datetime-local without tz
    const d = new Date(trimmed);
    if (Number.isNaN(d.getTime())) return trimmed; // fall back to raw
    return d.toISOString();
  }

  const handleCreateAppointment = async (event) => {
    event.preventDefault();
    if (appointmentSubmitting) return;
    setAppointmentError(null);
    setAppointmentStatus("");

    const personId = selectedPersonId?.trim();
    const credId = selectedCredentialId?.trim();
    const typeId = appointmentTypeId?.trim();
    const title = appointmentTitle?.trim();
    const location = appointmentLocation?.trim();

    const typeIsRequired = Array.isArray(appointmentTypes) && appointmentTypes.length > 0;
    if (!personId || (typeIsRequired && !typeId) || !title || !location) {
      setAppointmentError(
        typeIsRequired
          ? "Please select a person and provide title, location, and type."
          : "Please select a person and provide title and location."
      );
      return;
    }

    const payload = {
      credentialId: credId || undefined,
      personId,
      // Include type only if available/selected for this connector
      ...(typeId ? { appointmentTypeId: typeId } : {}),
      appointmentOutcomeId: appointmentOutcomeId || undefined,
      title,
      location,
      description: appointmentDescription || undefined,
      isAllDay: Boolean(appointmentIsAllDay),
    };
    if (selectedUserId) payload.userId = selectedUserId;
    const startsIso = toIsoOrNull(appointmentStartsAt);
    const endsIso = toIsoOrNull(appointmentEndsAt);
    if (startsIso) payload.startsAt = startsIso;
    if (endsIso) payload.endsAt = endsIso;

    setAppointmentSubmitting(true);
    try {
      const created = await fetchJson("/api/appointments", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setAppointmentStatus("Appointment created successfully.");
      setAppointmentError(null);
      // Reset minimal fields
      setAppointmentTitle("");
      setAppointmentLocation("");
      setAppointmentStartsAt("");
      setAppointmentEndsAt("");
      setAppointmentDescription("");
      // Optionally refresh person appointments
      // no-op: keep lightweight
    } catch (err) {
      setAppointmentError(err.message);
    } finally {
      setAppointmentSubmitting(false);
    }
  };

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
          <form className="person-lookup-form" onSubmit={handlePersonInsightsSubmit}>
            <div className="person-lookup-row">
              <label htmlFor="person-lookup-credential">Credential</label>
              <select
                id="person-lookup-credential"
                value={selectedCredentialId}
                onChange={(event) => setSelectedCredentialId(event.target.value)}
                disabled={credentialOptionsLoading || credentialOptions.length === 0}
              >
                <option value="">Auto-select first connected credential</option>
                {credentialOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            {credentialOptionsLoading ? (
              <p className="hint">Loading connected credentials…</p>
            ) : null}
            {!credentialOptionsLoading && credentialOptions.length === 0 ? (
              <p className="hint">
                Connect a Rollout credential to target a specific destination.
              </p>
            ) : null}
            <div className="person-lookup-row">
              <label htmlFor="person-lookup-person">Person</label>
              <select
                id="person-lookup-person"
                value={selectedPersonId}
                onChange={(event) => setSelectedPersonId(event.target.value)}
                disabled={peopleOptionsLoading || peopleOptions.length === 0}
              >
                {peopleOptions.length === 0 ? (
                  <option value="">No people available</option>
                ) : null}
                {peopleOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            {peopleOptionsLoading ? (
              <p className="hint">Loading people…</p>
            ) : null}
            {peopleOptionsError ? (
              <p className="error">Failed to load people: {peopleOptionsError}</p>
            ) : null}
            <div className="person-lookup-controls">
              <button type="submit" disabled={isFetchingPerson || peopleOptions.length === 0}>
                {isFetchingPerson ? "Fetching…" : "Fetch person"}
              </button>
            </div>
          </form>
          {credentialOptionsError ? (
            <p className="error">
              Failed to load credentials: {credentialOptionsError}
            </p>
          ) : null}
          {personLookupError ? <p className="error">{personLookupError}</p> : null}
          {personLookupStatus && !personLookupError ? (
            <p className="success">{personLookupStatus}</p>
          ) : null}
          {isFetchingPerson ? (
            <p className="hint">Contacting Rollout…</p>
          ) : null}
          {personDetails ? (
            <section className="person-insights-details">
              <div className="person-insights-summary">
                <div className="person-insights-summary-text">
                  <h3>{personName || "Person Details"}</h3>
                  <ul className="person-insights-meta">
                    {personDetails?.id ? (
                      <li>
                        <span className="label">Person ID</span>
                        <span>{personDetails.id}</span>
                      </li>
                    ) : null}
                    {primaryEmail ? (
                      <li>
                        <span className="label">Email</span>
                        <span>{primaryEmail}</span>
                      </li>
                    ) : null}
                    {primaryPhone ? (
                      <li>
                        <span className="label">Phone</span>
                        <span>{primaryPhone}</span>
                      </li>
                    ) : null}
                    {personStage ? (
                      <li>
                        <span className="label">Stage</span>
                        <span>{personStage}</span>
                      </li>
                    ) : null}
                    {personUpdated ? (
                      <li>
                        <span className="label">Updated</span>
                        <span>{personUpdated}</span>
                      </li>
                    ) : null}
                  </ul>
                </div>
              </div>
              <details className="person-insights-raw">
                <summary>View raw person payload</summary>
                <pre>{JSON.stringify(personDetails, null, 2)}</pre>
              </details>
            </section>
          ) : null}
          {personDetails ? (
            <section className="person-insights-events">
              <h3>Recent Events ({personEvents.length})</h3>
              {personEvents.length > 0 ? (
                <ul className="event-list">
                  {personEvents.map((event) => {
                    const occurredAt =
                      event?.occurredAt || event?.created || event?.updated;
                    const displayTimestamp = formatTimestamp(occurredAt);
                    const message = event?.message || event?.description || "";
                    return (
                      <li key={event?.id || `${event?.type}-${occurredAt}`}>
                        <header className="event-summary">
                          <div className="event-summary-main">
                            <span className="event-type">{event?.type || "Event"}</span>
                            {message ? <span className="event-message">{message}</span> : null}
                          </div>
                          {displayTimestamp ? (
                            <span className="event-timestamp">{displayTimestamp}</span>
                          ) : null}
                        </header>
                        <ul className="event-meta">
                          {event?.source ? (
                            <li>
                              <span className="label">Source</span>
                              <span>{event.source}</span>
                            </li>
                          ) : null}
                          {event?.system ? (
                            <li>
                              <span className="label">System</span>
                              <span>{event.system}</span>
                            </li>
                          ) : null}
                          {event?.pageTitle ? (
                            <li>
                              <span className="label">Page</span>
                              <span>{event.pageTitle}</span>
                            </li>
                          ) : null}
                        </ul>
                        {event?.pageUrl ? (
                          <p className="event-link">
                            <span className="label">URL</span>{" "}
                            <a href={event.pageUrl} target="_blank" rel="noreferrer">
                              {event.pageUrl}
                            </a>
                          </p>
                        ) : null}
                        <details>
                          <summary>Raw event payload</summary>
                          <pre>{JSON.stringify(event, null, 2)}</pre>
                        </details>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                !isFetchingPerson && <p className="empty">No events found for this person.</p>
              )}
            </section>
          ) : null}

          {personDetails ? (
            <section className="person-insights-notes">
              <h3>Recent Notes ({personNotes.length})</h3>
              {personNotes.length > 0 ? (
                <ul className="event-list">
                  {personNotes.map((note) => {
                    const timestamp = formatTimestamp(note?.updated || note?.created);
                    const bodyPreview = truncate(note?.body || "");
                    return (
                      <li key={note?.id || `${note?.updated}-${note?.created}`}>
                        <header className="event-summary">
                          <div className="event-summary-main">
                            <span className="event-type">{note?.subject || "Note"}</span>
                            {bodyPreview ? (
                              <span className="event-message">{bodyPreview}</span>
                            ) : null}
                          </div>
                          {timestamp ? (
                            <span className="event-timestamp">{timestamp}</span>
                          ) : null}
                        </header>
                        <details>
                          <summary>Raw note payload</summary>
                          <pre>{JSON.stringify(note, null, 2)}</pre>
                        </details>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                !isFetchingPerson && <p className="empty">No notes found for this person.</p>
              )}
            </section>
          ) : null}

          {personDetails ? (
            <section className="person-insights-calls">
              <h3>Recent Calls ({personCalls.length})</h3>
              {personCalls.length > 0 ? (
                <ul className="event-list">
                  {personCalls.map((call) => {
                    const timestamp = formatTimestamp(call?.created || call?.updated);
                    const direction =
                      call?.isIncoming === true
                        ? "Incoming"
                        : call?.isIncoming === false
                        ? "Outgoing"
                        : "";
                    const summaryParts = [direction, call?.outcome]
                      .filter(Boolean)
                      .map((part) => part);
                    if (call?.duration) {
                      summaryParts.push(`${call.duration}s`);
                    }
                    const summaryText = summaryParts.join(" · ");
                    const notePreview = truncate(call?.note || "");
                    return (
                      <li key={call?.id || `${call?.created}-${call?.updated}`}>
                        <header className="event-summary">
                          <div className="event-summary-main">
                            <span className="event-type">Call</span>
                            {summaryText ? (
                              <span className="event-message">{summaryText}</span>
                            ) : null}
                            {notePreview ? (
                              <span className="event-message">{notePreview}</span>
                            ) : null}
                          </div>
                          {timestamp ? (
                            <span className="event-timestamp">{timestamp}</span>
                          ) : null}
                        </header>
                        <ul className="event-meta">
                          {call?.fromNumber ? (
                            <li>
                              <span className="label">From</span>
                              <span>{call.fromNumber}</span>
                            </li>
                          ) : null}
                          {call?.toNumber ? (
                            <li>
                              <span className="label">To</span>
                              <span>{call.toNumber}</span>
                            </li>
                          ) : null}
                          {call?.recordingUrl ? (
                            <li>
                              <span className="label">Recording</span>
                              <a href={call.recordingUrl} target="_blank" rel="noreferrer">
                                Listen
                              </a>
                            </li>
                          ) : null}
                        </ul>
                        <details>
                          <summary>Raw call payload</summary>
                          <pre>{JSON.stringify(call, null, 2)}</pre>
                        </details>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                !isFetchingPerson && <p className="empty">No calls found for this person.</p>
              )}
            </section>
          ) : null}

          {personDetails ? (
            <section className="person-insights-texts">
              <h3>Recent Text Messages ({personTextMessages.length})</h3>
              {personTextMessages.length > 0 ? (
                <ul className="event-list">
                  {personTextMessages.map((text) => {
                    const timestamp = formatTimestamp(text?.sent || text?.updated || text?.created);
                    const direction =
                      text?.isIncoming === true
                        ? "Incoming"
                        : text?.isIncoming === false
                        ? "Outgoing"
                        : "Message";
                    const messagePreview = truncate(text?.message || "");
                    return (
                      <li key={text?.id || `${text?.sent}-${text?.created}`}>
                        <header className="event-summary">
                          <div className="event-summary-main">
                            <span className="event-type">{direction}</span>
                            {messagePreview ? (
                              <span className="event-message">{messagePreview}</span>
                            ) : null}
                          </div>
                          {timestamp ? (
                            <span className="event-timestamp">{timestamp}</span>
                          ) : null}
                        </header>
                        <ul className="event-meta">
                          {text?.fromNumber ? (
                            <li>
                              <span className="label">From</span>
                              <span>{text.fromNumber}</span>
                            </li>
                          ) : null}
                          {text?.toNumber ? (
                            <li>
                              <span className="label">To</span>
                              <span>{text.toNumber}</span>
                            </li>
                          ) : null}
                          {text?.status ? (
                            <li>
                              <span className="label">Status</span>
                              <span>{text.status}</span>
                            </li>
                          ) : null}
                        </ul>
                        {text?.externalUrl ? (
                          <p className="event-link">
                            <span className="label">External</span>{" "}
                            <a href={text.externalUrl} target="_blank" rel="noreferrer">
                              {text.externalLabel || text.externalUrl}
                            </a>
                          </p>
                        ) : null}
                        <details>
                          <summary>Raw text message payload</summary>
                          <pre>{JSON.stringify(text, null, 2)}</pre>
                        </details>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                !isFetchingPerson && <p className="empty">No text messages found for this person.</p>
              )}
            </section>
          ) : null}

          {personDetails ? (
            <section className="person-insights-appointments">
              <h3>Past Appointments ({personAppointments.length})</h3>
              {personAppointments.length > 0 ? (
                <ul className="event-list">
                  {personAppointments.map((appt) => {
                    const startsAt = formatTimestamp(appt?.startsAt);
                    const endsAt = formatTimestamp(appt?.endsAt);
                    const timing = [startsAt, endsAt ? `→ ${endsAt}` : ""]
                      .filter(Boolean)
                      .join(" ");
                    const descriptionPreview = truncate(appt?.description || "");
                    return (
                      <li key={appt?.id || `${appt?.startsAt}-${appt?.endsAt}`}>
                        <header className="event-summary">
                          <div className="event-summary-main">
                            <span className="event-type">{appt?.title || "Appointment"}</span>
                            {timing ? (
                              <span className="event-message">{timing}</span>
                            ) : null}
                            {descriptionPreview ? (
                              <span className="event-message">{descriptionPreview}</span>
                            ) : null}
                          </div>
                          {appt?.location ? (
                            <span className="event-timestamp">{appt.location}</span>
                          ) : null}
                        </header>
                        <details>
                          <summary>Raw appointment payload</summary>
                          <pre>{JSON.stringify(appt, null, 2)}</pre>
                        </details>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                !isFetchingPerson && <p className="empty">No appointments found for this person.</p>
              )}
            </section>
          ) : null}

          {personDetails ? (
            <section className="person-insights-tasks">
              <h3>Open Tasks ({personTasks.length})</h3>
              {personTasks.length > 0 ? (
                <ul className="event-list">
                  {personTasks.map((task) => {
                    const dueDate = formatTimestamp(task?.dueDateTime);
                    const status = task?.isCompleted ? "Completed" : "Open";
                    return (
                      <li key={task?.id || `${task?.name}-${task?.dueDateTime}`}>
                        <header className="event-summary">
                          <div className="event-summary-main">
                            <span className="event-type">{task?.name || "Task"}</span>
                            <span className="event-message">{status}</span>
                          </div>
                          {dueDate ? (
                            <span className="event-timestamp">Due {dueDate}</span>
                          ) : null}
                        </header>
                        <details>
                          <summary>Raw task payload</summary>
                          <pre>{JSON.stringify(task, null, 2)}</pre>
                        </details>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                !isFetchingPerson && <p className="empty">No tasks found for this person.</p>
              )}
            </section>
          ) : null}
        </AccordionSection>

        <section className="card">
          <h2>Create Appointment</h2>
          <p className="section-subtitle">
            Create an appointment for the selected person.
          </p>
          <form className="appointment-form" onSubmit={handleCreateAppointment}>
            <div className="person-lookup-row">
              <label>Credential</label>
              <select
                value={selectedCredentialId}
                onChange={(e) => setSelectedCredentialId(e.target.value)}
                disabled={credentialOptionsLoading || credentialOptions.length === 0}
              >
                <option value="">Auto-select first connected credential</option>
                {credentialOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="person-lookup-row">
              <label>Assigned user</label>
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                disabled={userOptionsLoading || userOptions.length === 0}
              >
                {userOptions.length === 0 ? (
                  <option value="">No users available</option>
                ) : null}
                {userOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="person-lookup-row">
              <label>Person</label>
              <select
                value={selectedPersonId}
                onChange={(e) => setSelectedPersonId(e.target.value)}
                disabled={peopleOptionsLoading || peopleOptions.length === 0}
              >
                {peopleOptions.length === 0 ? (
                  <option value="">No people available</option>
                ) : null}
                {peopleOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="person-lookup-row">
              <label>Type</label>
              <select
                value={appointmentTypeId}
                onChange={(e) => setAppointmentTypeId(e.target.value)}
                disabled={appointmentTypes.length === 0}
                required={appointmentTypes.length > 0}
              >
                <option value="">Select a type</option>
                {appointmentTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            {appointmentTypes.length === 0 ? (
              <p className="hint">
                This provider doesn’t expose appointment types; creating without a type.
              </p>
            ) : null}

            <div className="person-lookup-row">
              <label>Outcome (optional)</label>
              <select
                value={appointmentOutcomeId}
                onChange={(e) => setAppointmentOutcomeId(e.target.value)}
                disabled={appointmentOutcomes.length === 0}
              >
                <option value="">No outcome</option>
                {appointmentOutcomes.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="person-lookup-row">
              <label>Title</label>
              <input
                type="text"
                value={appointmentTitle}
                onChange={(e) => setAppointmentTitle(e.target.value)}
                placeholder="e.g., Buyer consultation"
                required
              />
            </div>

            <div className="person-lookup-row">
              <label>Location</label>
              <input
                type="text"
                value={appointmentLocation}
                onChange={(e) => setAppointmentLocation(e.target.value)}
                placeholder="e.g., 123 Main St"
                required
              />
            </div>

            <div className="person-lookup-row">
              <label>Starts at</label>
              <input
                type="datetime-local"
                value={appointmentStartsAt}
                onChange={(e) => setAppointmentStartsAt(e.target.value)}
              />
            </div>
            <div className="person-lookup-row">
              <label>Ends at</label>
              <input
                type="datetime-local"
                value={appointmentEndsAt}
                onChange={(e) => setAppointmentEndsAt(e.target.value)}
              />
            </div>

            <div className="person-lookup-row">
              <label>
                <input
                  type="checkbox"
                  checked={appointmentIsAllDay}
                  onChange={(e) => setAppointmentIsAllDay(e.target.checked)}
                />
                All day
              </label>
            </div>

            <div className="person-lookup-row">
              <label>Description (optional)</label>
              <textarea
                value={appointmentDescription}
                onChange={(e) => setAppointmentDescription(e.target.value)}
                rows={3}
              />
            </div>

            {appointmentError ? (
              <p className="error">{appointmentError}</p>
            ) : null}
            {appointmentStatus ? (
              <p className="success">{appointmentStatus}</p>
            ) : null}

            <div className="person-lookup-controls">
              <button type="submit" disabled={appointmentSubmitting}>
                {appointmentSubmitting ? "Creating…" : "Create appointment"}
              </button>
            </div>
          </form>
        </section>
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

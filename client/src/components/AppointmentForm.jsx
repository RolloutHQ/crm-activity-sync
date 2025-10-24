import React, { useEffect, useState } from "react";

function pad2(n) { return n < 10 ? `0${n}` : String(n); }
function toDateTimeLocalString(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  const hours = pad2(d.getHours());
  const mins = pad2(d.getMinutes());
  return `${year}-${month}-${day}T${hours}:${mins}`;
}
function addMinutes(date, mins) { const d = new Date(date); d.setMinutes(d.getMinutes() + mins); return d; }

async function fetchJson(path, options) {
  const response = await fetch(path, { credentials: "same-origin", ...options, headers: { "Content-Type": "application/json", ...(options?.headers || {}) } });
  if (!response.ok) { const errorText = await response.text(); throw new Error(`Request failed (${response.status})${errorText ? `: ${errorText}` : ""}`); }
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return response.json();
  return response.text();
}

export default function AppointmentForm({
  credentialOptions,
  credentialOptionsLoading,
  selectedCredentialId,
  setSelectedCredentialId,
  peopleOptions,
  peopleOptionsLoading,
  selectedPersonId,
  setSelectedPersonId,
}) {
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
  const [selectedUserId, setSelectedUserId] = useState("");

  // Smart defaults for time
  useEffect(() => {
    if (!appointmentStartsAt) {
      const now = new Date();
      const rounded = new Date(now);
      const remainder = rounded.getMinutes() % 5;
      if (remainder !== 0) rounded.setMinutes(rounded.getMinutes() + (5 - remainder));
      setAppointmentStartsAt(toDateTimeLocalString(addMinutes(rounded, 5)));
    }
    if (!appointmentEndsAt && appointmentStartsAt) {
      const start = new Date(appointmentStartsAt);
      setAppointmentEndsAt(toDateTimeLocalString(addMinutes(start, 30)));
    }
  }, [appointmentStartsAt, appointmentEndsAt]);

  // Load users for selected credential
  useEffect(() => {
    setUserOptionsLoading(true);
    const params = new URLSearchParams();
    if (selectedCredentialId) params.set("credentialId", selectedCredentialId);
    fetchJson(`/api/users?${params.toString()}`)
      .then((data) => {
        const options = Array.isArray(data?.users) ? data.users : [];
        setUserOptions(options);
        const storageKey = selectedCredentialId ? `lastUserId:${selectedCredentialId}` : `lastUserId:default`;
        const saved = typeof window !== "undefined" ? window.localStorage.getItem(storageKey) : null;
        const savedExists = saved && options.find((o) => o.id === saved);
        if (!selectedUserId) setSelectedUserId(savedExists ? saved : options[0]?.id || "");
        else if (!options.find((o) => o.id === selectedUserId)) setSelectedUserId(savedExists ? saved : options[0]?.id || "");
      })
      .catch(() => { setUserOptions([]); setSelectedUserId(""); })
      .finally(() => setUserOptionsLoading(false));
  }, [selectedCredentialId]);

  useEffect(() => {
    if (!selectedUserId) return;
    const storageKey = selectedCredentialId ? `lastUserId:${selectedCredentialId}` : `lastUserId:default`;
    try { if (typeof window !== "undefined") window.localStorage.setItem(storageKey, selectedUserId); } catch {}
  }, [selectedUserId, selectedCredentialId]);

  // Load appointment types/outcomes
  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedCredentialId) params.set("credentialId", selectedCredentialId);
    fetchJson(`/api/appointment-metadata?${params.toString()}`)
      .then((data) => {
        const types = Array.isArray(data?.types) ? data.types : [];
        const outcomes = Array.isArray(data?.outcomes) ? data.outcomes : [];
        setAppointmentTypes(types);
        setAppointmentOutcomes(outcomes);
        if (!types.find((t) => t.id === appointmentTypeId)) setAppointmentTypeId(types[0]?.id || "");
        if (!outcomes.find((o) => o.id === appointmentOutcomeId)) setAppointmentOutcomeId("");
      })
      .catch(() => { setAppointmentTypes([]); setAppointmentOutcomes([]); setAppointmentTypeId(""); setAppointmentOutcomeId(""); });
  }, [selectedCredentialId]);

  function toIsoOrNull(v) { if (!v || typeof v !== "string") return null; const trimmed = v.trim(); if (!trimmed) return null; const d = new Date(trimmed); if (Number.isNaN(d.getTime())) return trimmed; return d.toISOString(); }

  const handleCreateAppointment = async (event) => {
    event.preventDefault();
    if (appointmentSubmitting) return;
    setAppointmentError(null); setAppointmentStatus("");
    const personId = selectedPersonId?.trim();
    const credId = selectedCredentialId?.trim();
    const typeId = appointmentTypeId?.trim();
    const title = appointmentTitle?.trim();
    const location = appointmentLocation?.trim();
    const typeIsRequired = Array.isArray(appointmentTypes) && appointmentTypes.length > 0;
    if (!personId || (typeIsRequired && !typeId) || !title || !location) {
      setAppointmentError(typeIsRequired ? "Please select a person and provide title, location, and type." : "Please select a person and provide title and location.");
      return;
    }
    const payload = {
      credentialId: credId || undefined,
      personId,
      ...(typeId ? { appointmentTypeId: typeId } : {}),
      appointmentOutcomeId: appointmentOutcomeId || undefined,
      title, location,
      description: appointmentDescription || undefined,
      isAllDay: Boolean(appointmentIsAllDay),
    };
    const startsIso = toIsoOrNull(appointmentStartsAt);
    const endsIso = toIsoOrNull(appointmentEndsAt);
    if (startsIso) payload.startsAt = startsIso;
    if (endsIso) payload.endsAt = endsIso;
    if (selectedUserId) payload.userId = selectedUserId;
    setAppointmentSubmitting(true);
    try {
      await fetchJson("/api/appointments", { method: "POST", body: JSON.stringify(payload) });
      setAppointmentStatus("Appointment created successfully.");
      setAppointmentError(null);
      setAppointmentTitle(""); setAppointmentLocation(""); setAppointmentStartsAt(""); setAppointmentEndsAt(""); setAppointmentDescription("");
    } catch (err) { setAppointmentError(err.message); } finally { setAppointmentSubmitting(false); }
  };

  return (
    <section className="card">
      <h2>Create Appointment</h2>
      <p className="section-subtitle">Create an appointment for the selected person.</p>
      <form className="appointment-form" onSubmit={handleCreateAppointment}>
        <div className="person-lookup-row">
          <label>Credential</label>
          <select value={selectedCredentialId} onChange={(e) => setSelectedCredentialId(e.target.value)} disabled={credentialOptionsLoading || credentialOptions.length === 0}>
            <option value="">Auto-select first connected credential</option>
            {credentialOptions.map((option) => (<option key={option.id} value={option.id}>{option.label}</option>))}
          </select>
        </div>
        <div className="person-lookup-row">
          <label>Person</label>
          <select value={selectedPersonId} onChange={(e) => setSelectedPersonId(e.target.value)} disabled={peopleOptionsLoading || peopleOptions.length === 0}>
            {peopleOptions.length === 0 ? (<option value="">No people available</option>) : null}
            {peopleOptions.map((option) => (<option key={option.id} value={option.id}>{option.label}</option>))}
          </select>
        </div>
        <div className="person-lookup-row">
          <label>Assigned user</label>
          <select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)} disabled={userOptionsLoading || userOptions.length === 0}>
            {userOptions.length === 0 ? (<option value="">No users available</option>) : null}
            {userOptions.map((option) => (<option key={option.id} value={option.id}>{option.label}</option>))}
          </select>
        </div>
        <div className="person-lookup-row">
          <label>Type</label>
          <select value={appointmentTypeId} onChange={(e) => setAppointmentTypeId(e.target.value)} disabled={appointmentTypes.length === 0} required={appointmentTypes.length > 0}>
            <option value="">Select a type</option>
            {appointmentTypes.map((t) => (<option key={t.id} value={t.id}>{t.label}</option>))}
          </select>
        </div>
        {appointmentTypes.length === 0 ? (<p className="hint">This provider doesn’t expose appointment types; creating without a type.</p>) : null}
        <div className="person-lookup-row">
          <label>Outcome (optional)</label>
          <select value={appointmentOutcomeId} onChange={(e) => setAppointmentOutcomeId(e.target.value)} disabled={appointmentOutcomes.length === 0}>
            <option value="">No outcome</option>
            {appointmentOutcomes.map((o) => (<option key={o.id} value={o.id}>{o.label}</option>))}
          </select>
        </div>
        <div className="person-lookup-row">
          <label>Title</label>
          <input type="text" value={appointmentTitle} onChange={(e) => setAppointmentTitle(e.target.value)} placeholder="e.g., Buyer consultation" required />
        </div>
        <div className="person-lookup-row">
          <label>Location</label>
          <input type="text" value={appointmentLocation} onChange={(e) => setAppointmentLocation(e.target.value)} placeholder="e.g., 123 Main St" required />
        </div>
        <div className="person-lookup-row">
          <label>Starts at</label>
          <input type="datetime-local" value={appointmentStartsAt} onChange={(e) => setAppointmentStartsAt(e.target.value)} />
        </div>
        <div className="person-lookup-row">
          <label>Ends at</label>
          <input type="datetime-local" value={appointmentEndsAt} onChange={(e) => setAppointmentEndsAt(e.target.value)} />
        </div>
        <div className="person-lookup-row">
          <label>
            <input type="checkbox" checked={appointmentIsAllDay} onChange={(e) => setAppointmentIsAllDay(e.target.checked)} />
            All day
          </label>
        </div>
        <div className="person-lookup-row">
          <label>Description (optional)</label>
          <textarea value={appointmentDescription} onChange={(e) => setAppointmentDescription(e.target.value)} rows={3} />
        </div>
        {appointmentError ? (<p className="error">{appointmentError}</p>) : null}
        {appointmentStatus ? (<p className="success">{appointmentStatus}</p>) : null}
        <div className="person-lookup-controls">
          <button type="submit" disabled={appointmentSubmitting}>{appointmentSubmitting ? "Creating…" : "Create appointment"}</button>
        </div>
      </form>
    </section>
  );
}


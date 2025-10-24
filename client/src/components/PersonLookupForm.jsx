import React from "react";

export default function PersonLookupForm({
  credentialOptions,
  credentialOptionsLoading,
  credentialOptionsError,
  selectedCredentialId,
  setSelectedCredentialId,
  peopleOptions,
  peopleOptionsLoading,
  peopleOptionsError,
  selectedPersonId,
  setSelectedPersonId,
  isFetchingPerson,
  onSubmit,
}) {
  return (
    <form className="person-lookup-form" onSubmit={onSubmit}>
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
        <p className="hint">Connect a Rollout credential to target a specific destination.</p>
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
      {peopleOptionsLoading ? <p className="hint">Loading people…</p> : null}
      {peopleOptionsError ? (
        <p className="error">Failed to load people: {peopleOptionsError}</p>
      ) : null}
      {credentialOptionsError ? (
        <p className="error">Failed to load credentials: {credentialOptionsError}</p>
      ) : null}
      <div className="person-lookup-controls">
        <button type="submit" disabled={isFetchingPerson || peopleOptions.length === 0}>
          {isFetchingPerson ? "Fetching…" : "Fetch person"}
        </button>
      </div>
    </form>
  );
}


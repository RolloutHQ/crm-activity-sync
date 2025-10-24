import React, { useMemo } from "react";

function formatTimestamp(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}
function truncate(value, maxLength = 220) {
  if (typeof value !== "string") return "";
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength).trimEnd()}…`;
}

export default function PersonInsights({
  isFetchingPerson,
  personDetails,
  personEvents,
  personNotes,
  personCalls,
  personTextMessages,
  personAppointments,
  personTasks,
}) {
  const personName = useMemo(() => {
    if (!personDetails) return "";
    if (typeof personDetails.name === "string" && personDetails.name.trim()) return personDetails.name.trim();
    const combined = [personDetails.firstName, personDetails.lastName]
      .filter((part) => typeof part === "string" && part.trim().length > 0)
      .join(" ")
      .trim();
    if (combined) return combined;
    return typeof personDetails.id === "string" ? personDetails.id : "";
  }, [personDetails]);

  const primaryEmail = useMemo(() => {
    if (!personDetails || !Array.isArray(personDetails.emails)) return "";
    const primary = personDetails.emails.find((entry) => entry?.isPrimary) || personDetails.emails[0];
    return typeof primary?.value === "string" ? primary.value : "";
  }, [personDetails]);

  const primaryPhone = useMemo(() => {
    if (!personDetails || !Array.isArray(personDetails.phones)) return "";
    const primary = personDetails.phones.find((entry) => entry?.isPrimary) || personDetails.phones[0];
    return typeof primary?.value === "string" ? primary.value : "";
  }, [personDetails]);

  const personStage = useMemo(() => {
    if (!personDetails) return "";
    if (typeof personDetails.stage === "string" && personDetails.stage.trim()) return personDetails.stage.trim();
    if (typeof personDetails.stageId === "string" && personDetails.stageId.trim()) return personDetails.stageId.trim();
    return "";
  }, [personDetails]);

  const personUpdated = useMemo(() => {
    if (!personDetails) return "";
    return formatTimestamp(personDetails.updated) || formatTimestamp(personDetails.created);
  }, [personDetails]);

  if (!personDetails) return null;

  return (
    <>
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

      <section className="person-insights-events">
        <h3>Recent Events ({personEvents.length})</h3>
        {personEvents.length > 0 ? (
          <ul className="event-list">
            {personEvents.map((event) => {
              const occurredAt = event?.occurredAt || event?.created || event?.updated;
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
                      {bodyPreview ? <span className="event-message">{bodyPreview}</span> : null}
                    </div>
                    {timestamp ? <span className="event-timestamp">{timestamp}</span> : null}
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

      <section className="person-insights-calls">
        <h3>Recent Calls ({personCalls.length})</h3>
        {personCalls.length > 0 ? (
          <ul className="event-list">
            {personCalls.map((call) => {
              const timestamp = formatTimestamp(call?.created || call?.updated);
              const direction = call?.isIncoming === true ? "Incoming" : call?.isIncoming === false ? "Outgoing" : "";
              const summaryParts = [direction, call?.outcome].filter(Boolean).map((part) => part);
              if (call?.duration) summaryParts.push(`${call.duration}s`);
              const summaryText = summaryParts.join(" · ");
              const notePreview = truncate(call?.note || "");
              return (
                <li key={call?.id || `${call?.created}-${call?.updated}`}>
                  <header className="event-summary">
                    <div className="event-summary-main">
                      <span className="event-type">Call</span>
                      {summaryText ? <span className="event-message">{summaryText}</span> : null}
                      {notePreview ? <span className="event-message">{notePreview}</span> : null}
                    </div>
                    {timestamp ? <span className="event-timestamp">{timestamp}</span> : null}
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
                        <a href={call.recordingUrl} target="_blank" rel="noreferrer">Listen</a>
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

      <section className="person-insights-texts">
        <h3>Recent Text Messages ({personTextMessages.length})</h3>
        {personTextMessages.length > 0 ? (
          <ul className="event-list">
            {personTextMessages.map((text) => {
              const timestamp = formatTimestamp(text?.sent || text?.updated || text?.created);
              const direction = text?.isIncoming === true ? "Incoming" : text?.isIncoming === false ? "Outgoing" : "Message";
              const messagePreview = truncate(text?.message || "");
              return (
                <li key={text?.id || `${text?.sent}-${text?.created}`}>
                  <header className="event-summary">
                    <div className="event-summary-main">
                      <span className="event-type">{direction}</span>
                      {messagePreview ? <span className="event-message">{messagePreview}</span> : null}
                    </div>
                    {timestamp ? <span className="event-timestamp">{timestamp}</span> : null}
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
                      <a href={text.externalUrl} target="_blank" rel="noreferrer">{text.externalLabel || text.externalUrl}</a>
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

      <section className="person-insights-appointments">
        <h3>Past Appointments ({personAppointments.length})</h3>
        {personAppointments.length > 0 ? (
          <ul className="event-list">
            {personAppointments.map((appt) => {
              const startsAt = formatTimestamp(appt?.startsAt);
              const endsAt = formatTimestamp(appt?.endsAt);
              const timing = [startsAt, endsAt ? `→ ${endsAt}` : ""].filter(Boolean).join(" ");
              const descriptionPreview = truncate(appt?.description || "");
              return (
                <li key={appt?.id || `${appt?.startsAt}-${appt?.endsAt}`}>
                  <header className="event-summary">
                    <div className="event-summary-main">
                      <span className="event-type">{appt?.title || "Appointment"}</span>
                      {timing ? <span className="event-message">{timing}</span> : null}
                      {descriptionPreview ? <span className="event-message">{descriptionPreview}</span> : null}
                    </div>
                    {appt?.location ? <span className="event-timestamp">{appt.location}</span> : null}
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
                    {dueDate ? <span className="event-timestamp">Due {dueDate}</span> : null}
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
    </>
  );
}


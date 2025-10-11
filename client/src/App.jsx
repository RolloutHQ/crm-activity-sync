import React from "react";
import {
  RolloutLinkProvider,
  CredentialsManager,
} from "@rollout/link-react";
import "@rollout/link-react/style.css";
import "./App.css";

const rolloutTokenEndpoint =
  import.meta.env.VITE_ROLLOUT_TOKEN_URL || "/rollout-token";

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

export default function App() {
  return (
    <div className="app">
      <header>
        <h1>Rollout Webhooks Demo</h1>
        <p>Use the embedded Rollout Link to manage credentials.</p>
      </header>
      <main>
        <RolloutLinkProvider token={fetchRolloutToken}>
          <CredentialsManager />
        </RolloutLinkProvider>
      </main>
    </div>
  );
}

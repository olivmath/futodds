import { EventSource } from "eventsource";

export function createTxlineStream({ apiOrigin, guestJwt, apiToken, onDisconnect = null }) {
  const origin = normalizeOrigin(apiOrigin);
  let currentGuestJwt = guestJwt;
  let eventSource = null;
  const oddsCallbacks = new Map();

  async function connect() {
    if (eventSource) return;

    const url = `${origin}/api/odds/stream`;

    eventSource = new EventSource(url, {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        headers.set("Authorization", `Bearer ${currentGuestJwt}`);
        headers.set("X-Api-Token", apiToken);
        return fetch(input, { ...init, headers });
      },
    });

    eventSource.addEventListener("message", (event) => {
      try {
        const data = JSON.parse(event.data);
        const fixtureId = String(data.FixtureId);
        if (fixtureId && oddsCallbacks.has(fixtureId)) {
          oddsCallbacks.get(fixtureId)(data);
        }
      } catch (error) {
        // ignore parse errors
      }
    });

    eventSource.addEventListener("error", () => {
      disconnect();
      if (onDisconnect) {
        onDisconnect();
      }
    });
  }

  function disconnect() {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
  }

  function onOdds(fixtureId, callback) {
    oddsCallbacks.set(String(fixtureId), callback);
  }

  function offOdds(fixtureId) {
    oddsCallbacks.delete(String(fixtureId));
  }

  function isConnected() {
    return eventSource !== null;
  }

  function getActiveFixtures() {
    return Array.from(oddsCallbacks.keys());
  }

  return {
    connect,
    disconnect,
    onOdds,
    offOdds,
    isConnected,
    getActiveFixtures,
  };
}

function normalizeOrigin(apiOrigin) {
  return String(apiOrigin).replace(/\/+$/, "");
}

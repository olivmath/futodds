export function createTxlineStream({ apiOrigin, guestJwt, apiToken, onDisconnect = null, fetchImpl = fetch }) {
  const origin = normalizeOrigin(apiOrigin);
  let currentGuestJwt = guestJwt;
  let eventSource = null;
  const oddsCallbacks = new Map();

  async function connect() {
    if (eventSource) return;

    const url = `${origin}/api/odds/stream`;
    const headers = {
      Authorization: `Bearer ${currentGuestJwt}`,
      "X-Api-Token": apiToken,
    };

    eventSource = new EventSource(url, { headers });

    eventSource.addEventListener("open", () => {
      // connection opened
    });

    eventSource.addEventListener("message", (event) => {
      try {
        const data = JSON.parse(event.data);
        const fixtureId = data.FixtureId;
        if (fixtureId && oddsCallbacks.has(fixtureId)) {
          oddsCallbacks.get(fixtureId)(data);
        }
      } catch (error) {
        // ignore parse errors
      }
    });

    eventSource.addEventListener("heartbeat", () => {
      // heartbeat received
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
    oddsCallbacks.set(fixtureId, callback);
  }

  function offOdds(fixtureId) {
    oddsCallbacks.delete(fixtureId);
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

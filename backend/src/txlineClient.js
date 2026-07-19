export function createTxlineClient({
  apiOrigin,
  guestJwt,
  apiToken,
  fetchImpl = fetch,
}) {
  const origin = normalizeOrigin(apiOrigin);
  let currentGuestJwt = guestJwt;

  async function fetchOddsSnapshot(fixtureId) {
    return txlineJsonRequest(`/api/odds/snapshot/${encodeURIComponent(fixtureId)}`);
  }

  async function fetchFixturesSnapshot({ competitionId, startEpochDay } = {}) {
    const params = new URLSearchParams();
    if (competitionId !== undefined) params.set("competitionId", String(competitionId));
    if (startEpochDay !== undefined) params.set("startEpochDay", String(startEpochDay));
    const query = params.toString();
    return txlineJsonRequest(`/api/fixtures/snapshot${query ? `?${query}` : ""}`);
  }

  async function txlineJsonRequest(path) {
    let response = await authenticatedFetch(path);
    if (response.status === 401) {
      currentGuestJwt = await renewGuestJwt();
      response = await authenticatedFetch(path);
    }
    if (!response.ok) {
      throw new Error(`TxLINE request failed: ${response.status} ${await response.text()}`);
    }
    return response.json();
  }

  async function authenticatedFetch(path) {
    return fetchImpl(`${origin}${path}`, {
      headers: {
        Authorization: `Bearer ${currentGuestJwt}`,
        "X-Api-Token": apiToken,
      },
    });
  }

  async function renewGuestJwt() {
    const response = await fetchImpl(`${origin}/auth/guest/start`, { method: "POST" });
    if (!response.ok) {
      throw new Error(`TxLINE guest JWT renewal failed: ${response.status} ${await response.text()}`);
    }
    const body = await response.json();
    if (!body.token) {
      throw new Error("TxLINE guest JWT renewal response did not include token");
    }
    return body.token;
  }

  return { fetchOddsSnapshot, fetchFixturesSnapshot };
}

function normalizeOrigin(apiOrigin) {
  return String(apiOrigin).replace(/\/+$/, "");
}

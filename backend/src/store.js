const RECENT_LIMIT = 20;

export function createStore() {
  const state = {
    poller: { running: false, lastRunAt: null },
    settlement: { running: false, lastRunAt: null },
    matches: [],
    matchSources: new Map(),
    matchFixtures: new Map(),
    matchStreamStatus: new Map(),
    matchLatestOdds: new Map(),
    txs: [],
    errors: [],
  };

  function trim(items) {
    return items.slice(0, RECENT_LIMIT);
  }

  return {
    get status() {
      return {
        poller: { ...state.poller },
        settlement: { ...state.settlement },
        matches: state.matches.map((m) => ({
          ...cloneMatch(m),
          fixtureId: state.matchFixtures.get(m.id),
          streamStatus: state.matchStreamStatus.get(m.id) ?? "inactive",
        })),
        txs: [...state.txs],
        errors: [...state.errors],
      };
    },
    getMatch(matchId) {
      const match = state.matches.find((item) => item.id === matchId);
      return match ? cloneMatch(match) : null;
    },
    listMatches() {
      return state.matches.map(cloneMatch);
    },
    updateMatchOdds(matchId, odds) {
      const match = state.matches.find((item) => item.id === matchId);
      if (!match) {
        throw new Error(`Unknown match: ${matchId}`);
      }
      match.odds = { ...odds };
      match.updatedAt = new Date().toISOString();
    },
    replaceMatches(matches) {
      const currentById = new Map(state.matches.map((match) => [match.id, match]));
      state.matches = matches.map((match) => ({
        ...match,
        odds: { ...match.odds },
        oddsSource: match.oddsSourceLabel ?? state.matchSources.get(match.id) ?? currentById.get(match.id)?.oddsSource ?? "random",
        fixtureId: state.matchFixtures.get(match.id),
        streamStatus: state.matchStreamStatus.get(match.id) ?? "inactive",
      }));
    },
    setMatchOddsSource(matchId, oddsSource) {
      state.matchSources.set(matchId, oddsSource);
      const match = state.matches.find((item) => item.id === matchId);
      if (match) {
        match.oddsSource = oddsSource;
      }
    },
    setMatchFixture(matchId, fixtureId) {
      state.matchFixtures.set(matchId, fixtureId);
      const match = state.matches.find((item) => item.id === matchId);
      if (match) {
        match.fixtureId = fixtureId;
      }
    },
    setStreamStatus(matchId, status) {
      if (!["active", "paused", "inactive"].includes(status)) {
        throw new Error(`Invalid stream status: ${status}`);
      }
      state.matchStreamStatus.set(matchId, status);
      const match = state.matches.find((item) => item.id === matchId);
      if (match) {
        match.streamStatus = status;
      }
    },
    getStreamStatus(matchId) {
      return state.matchStreamStatus.get(matchId) ?? "inactive";
    },
    setLatestOdds(matchId, odds) {
      state.matchLatestOdds.set(matchId, { ...odds });
    },
    getLatestOdds(matchId) {
      const odds = state.matchLatestOdds.get(matchId);
      return odds ? { ...odds } : null;
    },
    getFixtureId(matchId) {
      return state.matchFixtures.get(matchId);
    },
    setPollerRunning(running) {
      state.poller.running = running;
      state.poller.lastRunAt = new Date().toISOString();
    },
    setSettlementRunning(running) {
      state.settlement.running = running;
      state.settlement.lastRunAt = new Date().toISOString();
    },
    recordTx(tx) {
      state.txs = trim([{ at: new Date().toISOString(), ...tx }, ...state.txs]);
    },
    recordError(error) {
      state.errors = trim([
        {
          at: new Date().toISOString(),
          message: error instanceof Error ? error.message : String(error),
        },
        ...state.errors,
      ]);
    },
  };
}

function cloneMatch(match) {
  return { ...match, odds: { ...match.odds } };
}

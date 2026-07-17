const RECENT_LIMIT = 20;

export function createStore(matches = []) {
  const state = {
    poller: { running: false, lastRunAt: null },
    settlement: { running: false, lastRunAt: null },
    matches: matches.map((match) => ({ ...match, odds: { ...match.odds } })),
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
        matches: state.matches.map((match) => ({ ...match, odds: { ...match.odds } })),
        txs: [...state.txs],
        errors: [...state.errors],
      };
    },
    getMatch(matchId) {
      return state.matches.find((match) => match.id === matchId) ?? null;
    },
    listMatches() {
      return state.matches.map((match) => ({ ...match, odds: { ...match.odds } }));
    },
    updateMatchOdds(matchId, odds) {
      const match = state.matches.find((item) => item.id === matchId);
      if (!match) {
        throw new Error(`Unknown match: ${matchId}`);
      }
      match.odds = { ...odds };
      match.updatedAt = new Date().toISOString();
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

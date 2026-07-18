export function nextGeneratedOdds(current) {
  const home = clamp(current.home + 100, 1000, 9000);
  const draw = current.draw;
  const away = 10_000 - home - draw;
  if (away < 0) {
    return { home: 6500, away: 3000, draw: 500 };
  }
  return { home, away, draw };
}

export function createOddsPoller({ store, sendUpdateOdds, intervalMs = 60_000 }) {
  let timer = null;

  async function runOnce() {
    store.setPollerRunning(true);
    try {
      for (const match of store.listMatches()) {
        const odds = nextGeneratedOdds(match.odds);
        const signature = await sendUpdateOdds(match.id, odds);
        store.updateMatchOdds(match.id, odds);
        store.recordTx({ type: "update_odds", matchId: match.id, signature });
      }
    } catch (error) {
      store.recordError(error);
      throw error;
    } finally {
      store.setPollerRunning(Boolean(timer));
    }
  }

  function start() {
    if (timer) {
      return;
    }
    timer = setInterval(() => void runOnce().catch(() => undefined), intervalMs);
    store.setPollerRunning(true);
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    store.setPollerRunning(false);
  }

  return { runOnce, start, stop };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

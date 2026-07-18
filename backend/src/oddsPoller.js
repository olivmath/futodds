export function nextGeneratedOdds(current) {
  const home = clamp(current.home + 100, 1000, 9000);
  const draw = current.draw;
  const away = 10_000 - home - draw;
  if (away < 0) {
    return { home: 6500, away: 3000, draw: 500 };
  }
  return { home, away, draw };
}

import { logger as defaultLogger } from "./logger.js";

export function createOddsPoller({ store, sendUpdateOdds, intervalMs = 60_000, logger = defaultLogger }) {
  let timer = null;

  async function runOnce() {
    store.setPollerRunning(true);
    const matches = store.listMatches();
    logger.info("poller.run.start", { matches: matches.length });
    try {
      for (const match of matches) {
        const odds = nextGeneratedOdds(match.odds);
        logger.info("poller.match.update", { matchId: match.id, previousOdds: match.odds, nextOdds: odds });
        const signature = await sendUpdateOdds(match.id, odds);
        store.updateMatchOdds(match.id, odds);
        store.recordTx({ type: "update_odds", matchId: match.id, signature });
        logger.info("poller.match.updated", { matchId: match.id, signature, odds });
      }
      logger.info("poller.run.done", { matches: matches.length });
    } catch (error) {
      store.recordError(error);
      logger.error("poller.run.error", { message: error instanceof Error ? error.message : String(error) });
      throw error;
    } finally {
      store.setPollerRunning(Boolean(timer));
    }
  }

  function start() {
    if (timer) {
      logger.info("poller.start.skip", { reason: "already_running" });
      return;
    }
    timer = setInterval(() => void runOnce().catch(() => undefined), intervalMs);
    store.setPollerRunning(true);
    logger.info("poller.start", { intervalMs });
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    store.setPollerRunning(false);
    logger.info("poller.stop");
  }

  return { runOnce, start, stop };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

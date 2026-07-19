import { logger as defaultLogger } from "./logger.js";

export function createOddsPoller({
  store,
  sendUpdateOdds,
  syncMatches = async () => store.listMatches(),
  intervalMs = 60_000,
  logger = defaultLogger,
}) {
  let timer = null;

  async function runOnce() {
    store.setPollerRunning(true);
    try {
      const syncedMatches = await syncMatches();
      store.replaceMatches(syncedMatches);
      const matches = store.listMatches();

      for (const match of matches) {
        const streamStatus = store.getStreamStatus(match.id);
        if (streamStatus !== "active") continue;

        const odds = store.getLatestOdds(match.id);
        if (!odds) continue;

        try {
          const signature = await sendUpdateOdds(match.id, odds);
          store.updateMatchOdds(match.id, odds);
          store.recordTx({ type: "update_odds", matchId: match.id, signature });
          logger.info("oracle.updated", { matchId: match.id, signature, odds });
        } catch (error) {
          store.recordError(error);
          logger.error("error.fatal", { context: "oracle.update", matchId: match.id, message: error instanceof Error ? error.message : String(error) });
        }
      }
    } catch (error) {
      store.recordError(error);
      logger.error("error.fatal", { context: "poller.sync", message: error instanceof Error ? error.message : String(error) });
    } finally {
      store.setPollerRunning(Boolean(timer));
    }
  }

  function start() {
    if (timer) return;
    void runOnce().catch(() => undefined);
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

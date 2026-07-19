import { logger as defaultLogger } from "./logger.js";

export function createOddsPoller({
  store,
  sendUpdateOdds,
  fetchTxlineOdds = async () => null,
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
        if (match.oddsSource === "txline-realtime") continue;

        try {
          let odds = store.getLatestOdds(match.id);
          if (match.oddsSource === "txline-polling") {
            const latest = await fetchTxlineOdds(match.fixtureId ?? match.id);
            if (latest) {
              odds = latest;
              store.setLatestOdds(match.id, latest);
            }
          } else if (match.oddsSource === "random") {
            odds = generateRandomOdds(match.odds);
            store.setLatestOdds(match.id, odds);
          }
          if (!odds) continue;

          const signature = await sendUpdateOdds(match.id, odds, match.oddsSource);
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

function generateRandomOdds(current) {
  const base = current ?? { home: 3334, away: 3333, draw: 3333 };
  const drift = () => Math.floor((Math.random() - 0.5) * 400);
  let home = Math.max(500, base.home + drift());
  let away = Math.max(500, base.away + drift());
  let draw = Math.max(500, base.draw + drift());
  const total = home + away + draw;
  home = Math.round((home / total) * 10000);
  away = Math.round((away / total) * 10000);
  draw = 10000 - home - away;
  return { home, away, draw };
}

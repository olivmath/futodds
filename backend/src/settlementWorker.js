import { logger as defaultLogger } from "./logger.js";

export function createSettlementWorker({ store, fetchOpenBets, settleBet, now = unixNow, intervalMs = 10_000, logger = defaultLogger }) {
  let timer = null;

  async function runOnce() {
    store.setSettlementRunning(true);
    let checked = 0;
    let settled = 0;
    let failed = 0;

    logger.info("settlement.run.start");
    try {
      const bets = await fetchOpenBets();
      checked = bets.length;
      logger.info("settlement.bets.fetched", { checked });
      for (const bet of bets) {
        if (bet.status !== 0 || bet.expiresAt > now()) {
          logger.info("settlement.bet.skip", {
            matchId: bet.matchId,
            user: bet.user,
            nonce: bet.nonce,
            status: bet.status,
            expiresAt: bet.expiresAt,
          });
          continue;
        }

        const match = store.getMatch(bet.matchId);
        if (!match) {
          const error = new Error(`No odds configured for ${bet.matchId}`);
          store.recordError(error);
          logger.error("settlement.bet.error", { matchId: bet.matchId, message: error.message });
          continue;
        }

        try {
          logger.info("settlement.bet.settle", {
            matchId: bet.matchId,
            user: bet.user,
            nonce: bet.nonce,
            oddsAtExpiryHome: match.odds.home,
          });
          const signature = await settleBet(bet, match.odds.home);
          settled += 1;
          store.recordTx({
            type: "settle_bet",
            matchId: bet.matchId,
            user: bet.user,
            nonce: bet.nonce,
            signature,
          });
          logger.info("settlement.bet.settled", { matchId: bet.matchId, user: bet.user, nonce: bet.nonce, signature });
        } catch (error) {
          failed += 1;
          store.recordError(error);
          logger.error("settlement.bet.error", {
            matchId: bet.matchId,
            user: bet.user,
            nonce: bet.nonce,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
      logger.info("settlement.run.done", { checked, settled, failed });
      return { checked, settled, failed };
    } catch (error) {
      store.recordError(error);
      logger.error("settlement.run.error", { message: error instanceof Error ? error.message : String(error) });
      throw error;
    } finally {
      store.setSettlementRunning(false);
    }
  }

  function start() {
    if (timer) return;
    void runOnce().catch(() => undefined);
    timer = setInterval(() => void runOnce().catch(() => undefined), intervalMs);
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  return { runOnce, start, stop };
}

function unixNow() {
  return Math.floor(Date.now() / 1000);
}

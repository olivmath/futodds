export function createSettlementWorker({ store, fetchOpenBets, settleBet, now = unixNow }) {
  async function runOnce() {
    store.setSettlementRunning(true);
    let checked = 0;
    let settled = 0;

    try {
      const bets = await fetchOpenBets();
      checked = bets.length;
      for (const bet of bets) {
        if (bet.status !== 0 || bet.expiresAt > now()) {
          continue;
        }

        const match = store.getMatch(bet.matchId);
        if (!match) {
          store.recordError(new Error(`No odds configured for ${bet.matchId}`));
          continue;
        }

        const signature = await settleBet(bet, match.odds.home);
        settled += 1;
        store.recordTx({
          type: "settle_bet",
          matchId: bet.matchId,
          user: bet.user,
          nonce: bet.nonce,
          signature,
        });
      }
      return { checked, settled };
    } catch (error) {
      store.recordError(error);
      throw error;
    } finally {
      store.setSettlementRunning(false);
    }
  }

  return { runOnce };
}

function unixNow() {
  return Math.floor(Date.now() / 1000);
}

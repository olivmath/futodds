import express from "express";
import { loadConfig, loadKeypair } from "./config.js";
import { createOddsPoller } from "./oddsPoller.js";
import { createSettlementWorker } from "./settlementWorker.js";
import { createStore } from "./store.js";
import { createConnection, fetchOpenBets, sendSettleBet, sendUpdateOdds } from "./solana.js";

export function createApp({ store, poller, settlementWorker }) {
  const app = express();
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });
  app.use(express.json());

  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.get("/status", (_req, res) => res.json(store.status));
  app.get("/matches", (_req, res) => res.json(store.listMatches()));
  app.post("/poller/start", (_req, res) => {
    poller.start();
    res.json({ running: true });
  });
  app.post("/poller/stop", (_req, res) => {
    poller.stop();
    res.json({ running: false });
  });
  app.post("/settlement/run-once", async (_req, res, next) => {
    try {
      res.json(await settlementWorker.runOnce());
    } catch (error) {
      next(error);
    }
  });

  app.use((error, _req, res, _next) => {
    store.recordError(error);
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  });

  return app;
}

export function createRuntime(env = process.env) {
  const config = loadConfig(env);
  const connection = createConnection(config.rpcUrl);
  const authority = loadKeypair(config.keypairPath);
  const store = createStore(config.matches);
  const poller = createOddsPoller({
    store,
    intervalMs: config.pollIntervalMs,
    sendUpdateOdds: (matchId, odds) => sendUpdateOdds(connection, authority, matchId, odds),
  });
  const settlementWorker = createSettlementWorker({
    store,
    fetchOpenBets: () => fetchOpenBets(connection),
    settleBet: (bet, oddsAtExpiryHome) =>
      sendSettleBet(connection, authority, config.mint, bet, oddsAtExpiryHome),
  });

  return { config, store, poller, settlementWorker };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const runtime = createRuntime();
  const app = createApp(runtime);
  app.listen(runtime.config.port, () => {
    console.log(`FutOdds backend listening on ${runtime.config.port}`);
  });
}

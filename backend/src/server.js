import express from "express";
import { loadConfig, loadKeypair } from "./config.js";
import { createOddsPoller } from "./oddsPoller.js";
import { createSettlementWorker } from "./settlementWorker.js";
import { createStore } from "./store.js";
import { createConnection, fetchOpenBets, sendSettleBet, sendUpdateOdds } from "./solana.js";
import { logger as defaultLogger } from "./logger.js";

export function createApp({ store, poller, settlementWorker, logger = defaultLogger }) {
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
  app.use((req, res, next) => {
    logger.info("http.request", { method: req.method, path: req.path });
    res.on("finish", () => {
      logger.info("http.response", { method: req.method, path: req.path, status: res.statusCode });
    });
    next();
  });

  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.get("/status", (_req, res) => res.json(store.status));
  app.get("/matches", (_req, res) => res.json(store.listMatches()));
  app.post("/poller/start", (_req, res) => {
    logger.info("admin.poller.start");
    poller.start();
    res.json({ running: true });
  });
  app.post("/poller/stop", (_req, res) => {
    logger.info("admin.poller.stop");
    poller.stop();
    res.json({ running: false });
  });
  app.post("/settlement/run-once", async (_req, res, next) => {
    try {
      logger.info("admin.settlement.run_once");
      res.json(await settlementWorker.runOnce());
    } catch (error) {
      next(error);
    }
  });

  app.use((error, _req, res, _next) => {
    store.recordError(error);
    logger.error("http.error", { message: error instanceof Error ? error.message : String(error) });
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
    logger: defaultLogger,
    sendUpdateOdds: (matchId, odds) => sendUpdateOdds(connection, authority, matchId, odds),
  });
  const settlementWorker = createSettlementWorker({
    store,
    logger: defaultLogger,
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
    defaultLogger.info("server.start", {
      port: runtime.config.port,
      rpcUrl: runtime.config.rpcUrl,
      pollIntervalMs: runtime.config.pollIntervalMs,
      matches: runtime.config.matches.map((match) => match.id),
    });
  });
}

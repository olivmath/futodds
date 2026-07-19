import express from "express";
import { AppConfig } from "./appConfig.js";
import { loadKeypair } from "./config.js";
import { createOddsPoller } from "./oddsPoller.js";
import { createSettlementWorker } from "./settlementWorker.js";
import { createStore } from "./store.js";
import {
  BETTING_PROGRAM_ID,
  ORACLE_PROGRAM_ID,
  createConnection,
  fetchOpenMatches,
  fetchOpenBets,
  fetchPoolState,
  pendingFees,
  sendSettleBet,
  sendSetMatchStatus,
  sendUpdateOdds,
} from "./solana.js";
import { logger as defaultLogger } from "./logger.js";
import { createTxlineClient } from "./txlineClient.js";
import { loadLeagues } from "./leagues.js";
import { createTxlineStream } from "./txlineStream.js";

export function createApp({
  store,
  poller,
  settlementWorker,
  txlineClient = null,
  txlineStream = null,
  createMatch = null,
  closeMatch = null,
  fetchPoolState = null,
  poolsMeta = null,
  logger = defaultLogger,
  healthCheck = async () => ({ ok: true }),
}) {
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

  app.get("/health", async (req, res, next) => {
    try {
      const health = await healthCheck();
      if (wantsHtml(req)) {
        res.type("html").send(renderHealthHtml(health));
        return;
      }
      res.json(health);
    } catch (error) {
      next(error);
    }
  });
  app.get("/status", (_req, res) => res.json(store.status));
  app.get("/matches", (_req, res) => res.json(store.listMatches()));
  app.post("/matches/:matchId/source", (req, res) => {
    const oddsSource = req.body?.oddsSource;
    const validSources = ["random", "txline-polling", "txline-realtime"];
    if (!validSources.includes(oddsSource)) {
      res.status(400).json({ error: `oddsSource must be one of: ${validSources.join(", ")}` });
      return;
    }
    store.setMatchOddsSource(req.params.matchId, oddsSource);
    logger.info("admin.match.source", { matchId: req.params.matchId, oddsSource });
    res.json({ matchId: req.params.matchId, oddsSource });
  });
  app.post("/matches/:matchId/close", async (req, res, next) => {
    try {
      if (!closeMatch) {
        res.status(503).json({ error: "closeMatch not available" });
        return;
      }
      const matchId = req.params.matchId;
      const signature = await closeMatch(matchId);
      store.recordTx({ type: "close_match", matchId, signature });
      logger.info("admin.match.close", { matchId, signature });
      res.json({ matchId, status: "closed", signature });
    } catch (error) {
      next(error);
    }
  });
  app.post("/matches", async (req, res, next) => {
    try {
      const matchId = req.body?.matchId;
      const tag = req.body?.tag ?? "";
      const oddsSource = req.body?.oddsSource ?? "txline-polling";
      const validSources = ["random", "txline-polling", "txline-realtime"];
      if (!matchId || typeof matchId !== "string") {
        res.status(400).json({ error: "matchId is required" });
        return;
      }
      if (!validSources.includes(oddsSource)) {
        res.status(400).json({ error: `oddsSource must be one of: ${validSources.join(", ")}` });
        return;
      }
      if (!createMatch) {
        res.status(503).json({ error: "createMatch not available" });
        return;
      }
      if (oddsSource.startsWith("txline")) {
        if (!txlineClient) {
          res.status(503).json({ error: "TxLINE not configured" });
          return;
        }
        const fixtures = await txlineClient.fetchFixturesSnapshot({});
        const validIds = new Set(fixtures.map((f) => String(f.FixtureId)));
        if (!validIds.has(matchId)) {
          res.status(400).json({ error: `FixtureId ${matchId} not found in TxLINE. Available: ${[...validIds].join(", ")}` });
          return;
        }
      }
      const odds = req.body?.odds ?? { home: 3334, away: 3333, draw: 3333 };
      const signature = await createMatch(matchId, odds, tag, oddsSource);
      store.setMatchOddsSource(matchId, oddsSource);
      store.recordTx({ type: "create_match", matchId, signature });
      logger.info("admin.match.create", { matchId, tag, oddsSource, signature });
      res.json({ matchId, tag, oddsSource, signature });
    } catch (error) {
      next(error);
    }
  });
  app.get("/pools", async (_req, res, next) => {
    try {
      if (!fetchPoolState) {
        res.status(503).json({ error: "pool reads not available" });
        return;
      }
      const { pools } = await fetchPoolState();
      const matches = new Map(store.listMatches().map((m) => [m.id, m]));
      res.json({
        ...(poolsMeta ?? {}),
        pools: pools.map((pool) => {
          const match = matches.get(pool.matchId);
          return {
            ...pool,
            tag: match?.tag ?? "",
            odds: match?.odds ?? null,
            status: !match ? "settled" : match.streamStatus === "active" ? "live" : "open",
          };
        }),
      });
    } catch (error) {
      next(error);
    }
  });
  app.get("/pools/positions/:owner", async (req, res, next) => {
    try {
      if (!fetchPoolState) {
        res.status(503).json({ error: "pool reads not available" });
        return;
      }
      const owner = req.params.owner;
      const { pools, positions } = await fetchPoolState();
      const poolsByPubkey = new Map(pools.map((pool) => [pool.pubkey, pool]));
      res.json(
        positions
          .filter((position) => position.owner === owner)
          .map((position) => {
            const pool = poolsByPubkey.get(position.pool);
            return {
              pool: position.pool,
              matchId: pool?.matchId ?? null,
              shares: position.shares,
              depositedAt: position.depositedAt,
              pendingFees: pool ? pendingFees(pool, position) : "0",
            };
          }),
      );
    } catch (error) {
      next(error);
    }
  });
  app.get("/leagues", (_req, res) => {
    res.json(loadLeagues());
  });
  app.get("/fixtures", async (req, res, next) => {
    try {
      if (!txlineClient) {
        res.status(503).json({ error: "TxLINE credentials not configured" });
        return;
      }
      const competitionId = req.query.competitionId ? Number(req.query.competitionId) : undefined;
      const fixtures = await txlineClient.fetchFixturesSnapshot({ competitionId });
      res.json(fixtures);
    } catch (error) {
      next(error);
    }
  });
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
  app.post("/settlement/start", (_req, res) => {
    logger.info("admin.settlement.start");
    settlementWorker.start();
    res.json({ running: true });
  });
  app.post("/settlement/stop", (_req, res) => {
    logger.info("admin.settlement.stop");
    settlementWorker.stop();
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
  app.post("/stream/start/:matchId", async (req, res, next) => {
    try {
      const matchId = req.params.matchId;
      const match = store.getMatch(matchId);
      if (!match) {
        res.status(404).json({ error: `Match not found: ${matchId}` });
        return;
      }

      const fixtureId = store.getFixtureId(matchId) ?? matchId;
      if (match.oddsSource === "txline-realtime") {
        if (!txlineStream) {
          res.status(503).json({ error: "TxLINE stream not configured" });
          return;
        }
        if (!txlineStream.isConnected()) {
          try {
            await txlineStream.connect();
          } catch (error) {
            logger.error("stream.error", { matchId, error: error instanceof Error ? error.message : String(error) });
            res.status(503).json({ error: "Failed to connect to TxLINE stream" });
            return;
          }
        }
        txlineStream.onOdds(fixtureId, (odds) => {
          store.setLatestOdds(matchId, {
            home: odds.Prices?.[0] ?? 0,
            away: odds.Prices?.[1] ?? 0,
            draw: odds.Prices?.[2] ?? 0,
          });
        });
      }

      store.setStreamStatus(matchId, "active");
      logger.info("stream.started", { matchId, fixtureId });
      res.json({ matchId, status: "active", fixtureId });
    } catch (error) {
      next(error);
    }
  });
  app.post("/stream/stop/:matchId", (req, res) => {
    const matchId = req.params.matchId;
    store.setStreamStatus(matchId, "inactive");
    if (txlineStream) {
      txlineStream.offOdds(store.getFixtureId(matchId));
      const activeFixtures = txlineStream.getActiveFixtures();
      if (activeFixtures.length === 0) {
        txlineStream.disconnect();
      }
    }
    logger.info("stream.stopped", { matchId });
    res.json({ matchId, status: "inactive" });
  });
  app.post("/stream/resume/:matchId", async (req, res, next) => {
    try {
      const matchId = req.params.matchId;
      const status = store.getStreamStatus(matchId);
      if (status !== "paused") {
        res.status(400).json({ error: `Stream for ${matchId} is not paused (current: ${status})` });
        return;
      }
      if (!txlineStream) {
        res.status(503).json({ error: "TxLINE stream not configured" });
        return;
      }
      const fixtureId = store.getFixtureId(matchId) ?? matchId;
      if (!fixtureId) {
        res.status(400).json({ error: `Match ${matchId} has no fixtureId configured` });
        return;
      }
      try {
        await txlineStream.connect();
        txlineStream.onOdds(fixtureId, (odds) => {
          store.setLatestOdds(matchId, {
            home: odds.Prices?.[0] ?? 0,
            away: odds.Prices?.[1] ?? 0,
            draw: odds.Prices?.[2] ?? 0,
          });
        });
        store.setStreamStatus(matchId, "active");
        logger.info("stream.resumed", { matchId, fixtureId });
        res.json({ matchId, status: "active" });
      } catch (error) {
        logger.error("stream.error", { matchId, error: error instanceof Error ? error.message : String(error) });
        res.status(503).json({ error: "Failed to reconnect to TxLINE stream" });
      }
    } catch (error) {
      next(error);
    }
  });
  app.get("/stream/status", (_req, res) => {
    const matches = store.listMatches();
    const streams = matches
      .filter((m) => m.oddsSource === "txline")
      .map((m) => ({
        matchId: m.id,
        fixtureId: store.getFixtureId(m.id),
        status: store.getStreamStatus(m.id),
      }));
    res.json({
      connected: txlineStream?.isConnected() ?? false,
      activeFixtures: txlineStream?.getActiveFixtures() ?? [],
      streams,
    });
  });

  app.use((error, _req, res, _next) => {
    store.recordError(error);
    logger.error("http.error", { message: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  });

  return app;
}

export function createRuntime(env = process.env) {
  const config = AppConfig.getInstance(env);
  const connection = createConnection(config.solana.rpcUrl);
  const authority = loadKeypair(config.solana.keypairPath);
  const store = createStore();

  const txlineClient = createTxlineClient(config.txline);
  const txlineStream = createTxlineStream({
    ...config.txline,
    onDisconnect: () => {
      const matches = store.listMatches();
      for (const match of matches) {
        if (store.getStreamStatus(match.id) === "active") {
          store.setStreamStatus(match.id, "paused");
          defaultLogger.error("stream.error", { matchId: match.id, reason: "sse_disconnected" });
        }
      }
    },
  });

  const syncMatches = async () => {
    const all = await fetchOpenMatches(connection);
    const matches = all.filter((m) => m.authority === authority.publicKey.toBase58());
    store.replaceMatches(matches);
    return matches;
  };

  const poller = createOddsPoller({
    store,
    intervalMs: config.solana.pollIntervalMs,
    logger: defaultLogger,
    syncMatches,
    sendUpdateOdds: (matchId, odds, oddsSource) =>
      sendUpdateOdds(connection, authority, matchId, odds, "", oddsSource),
  });

  const settlementWorker = createSettlementWorker({
    store,
    logger: defaultLogger,
    intervalMs: config.solana.settlementIntervalMs,
    fetchOpenBets: () => fetchOpenBets(connection),
    settleBet: (bet, oddsAtExpiryHome) =>
      sendSettleBet(connection, authority, config.solana.mint, bet, oddsAtExpiryHome),
  });

  const healthCheck = () => getRuntimeHealth({ config, connection, authority, store });

  const initialize = () => syncMatches();

  const createMatch = (matchId, odds, tag = "", oddsSource = "txline-polling") =>
    sendUpdateOdds(connection, authority, matchId, odds, tag, oddsSource);
  const closeMatch = (matchId) => sendSetMatchStatus(connection, authority, matchId, 1);
  const poolsMeta = {
    programId: BETTING_PROGRAM_ID.toBase58(),
    rpcUrl: config.solana.rpcUrl,
    mint: config.solana.mint.toBase58(),
  };

  return {
    config,
    store,
    poller,
    settlementWorker,
    txlineClient,
    txlineStream,
    createMatch,
    closeMatch,
    fetchPoolState: () => fetchPoolState(connection),
    poolsMeta,
    healthCheck,
    initialize,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const runtime = createRuntime();
    const app = createApp(runtime);
    defaultLogger.info("app.started", {
      port: runtime.config.backend.port,
      rpcUrl: runtime.config.solana.rpcUrl,
      txlineEnabled: !!runtime.txlineClient,
    });
    runtime
      .initialize()
      .catch((error) => {
        runtime.store.recordError(error);
        defaultLogger.error("error.fatal", { context: "initialize", message: error instanceof Error ? error.message : String(error) });
        return [];
      })
      .then((matches) => {
        runtime.poller.start();
        runtime.settlementWorker.start();
        app.listen(runtime.config.backend.port, () => {
          defaultLogger.info("app.started", {
            port: runtime.config.backend.port,
            rpcUrl: runtime.config.solana.rpcUrl,
            pollIntervalMs: runtime.config.solana.pollIntervalMs,
            matches: matches.map((m) => m.id),
          });
        });
      });
  } catch (error) {
    defaultLogger.error("error.fatal", {
      context: "startup",
      message: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
  }
}

async function getRuntimeHealth({ config, connection, authority, store }) {
  const status = store.status;
  const checkedAt = new Date().toISOString();
  const backend = {
    status: "online",
    uptimeSecs: Math.round(process.uptime()),
    matches: status.matches.length,
    txs: status.txs.length,
    errors: status.errors.length,
  };

  try {
    const [version, latestBlockhash] = await Promise.all([
      connection.getVersion(),
      connection.getLatestBlockhash("confirmed"),
    ]);

    return {
      ok: true,
      checkedAt,
      backend,
      blockchain: {
        status: "online",
        rpcUrl: config.solana.rpcUrl,
        version: version["solana-core"] ?? "unknown",
        latestBlockhash: latestBlockhash.blockhash,
        authority: authority.publicKey.toBase58(),
        oracleProgram: ORACLE_PROGRAM_ID.toBase58(),
        bettingProgram: BETTING_PROGRAM_ID.toBase58(),
      },
      poller: status.poller,
      settlement: status.settlement,
      recentTxs: status.txs.slice(0, 5),
      recentErrors: status.errors.slice(0, 5),
    };
  } catch (error) {
    return {
      ok: false,
      checkedAt,
      backend,
      blockchain: {
        status: "offline",
        rpcUrl: config.solana.rpcUrl,
        error: error instanceof Error ? error.message : String(error),
        authority: authority.publicKey.toBase58(),
        oracleProgram: ORACLE_PROGRAM_ID.toBase58(),
        bettingProgram: BETTING_PROGRAM_ID.toBase58(),
      },
      poller: status.poller,
      settlement: status.settlement,
      recentTxs: status.txs.slice(0, 5),
      recentErrors: status.errors.slice(0, 5),
    };
  }
}

function wantsHtml(req) {
  return req.headers.accept?.includes("text/html") && req.accepts(["html", "json"]) === "html";
}

function renderHealthHtml(health) {
  const blockchain = health.blockchain ?? {};
  const backend = health.backend ?? {};
  const poller = health.poller ?? {};
  const settlement = health.settlement ?? {};

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>FutOdds Backend Health</title>
  <style>
    :root { color: #17211c; background: #eef1ed; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; }
    main { width: min(1180px, calc(100% - 32px)); margin: 0 auto; padding: 28px 0 42px; }
    header { display: flex; align-items: end; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
    h1, h2, p { margin: 0; }
    h1 { font-size: clamp(34px, 5vw, 56px); line-height: .92; }
    h2 { font-size: 18px; }
    .eyebrow, .card span, th { color: #5d6d64; font-family: "SFMono-Regular", Consolas, monospace; font-size: 11px; font-weight: 800; text-transform: uppercase; }
    .pill { border-radius: 999px; padding: 8px 11px; background: ${health.ok ? "#dff0e6" : "#f3deda"}; color: ${health.ok ? "#176849" : "#9e3025"}; font-weight: 800; }
    .grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-bottom: 14px; }
    .panel { border: 1px solid #cbd8cf; border-radius: 8px; background: #fbfdf8; padding: 16px; margin-bottom: 14px; }
    .card { border: 1px solid #d4ded6; border-radius: 8px; background: #f8faf6; padding: 13px; min-width: 0; }
    .card strong { display: block; margin-top: 8px; font-family: "SFMono-Regular", Consolas, monospace; font-size: 18px; overflow-wrap: anywhere; }
    .section-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border-top: 1px solid #dce5de; padding: 10px; text-align: left; vertical-align: top; }
    code { font-family: "SFMono-Regular", Consolas, monospace; overflow-wrap: anywhere; }
    pre { margin: 0; overflow: auto; border-radius: 8px; padding: 12px; background: #13231b; color: #dfe9e1; font-size: 12px; line-height: 1.5; }
    @media (max-width: 860px) { header { display: grid; } .grid { grid-template-columns: 1fr 1fr; } }
    @media (max-width: 560px) { .grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <p class="eyebrow">FutOdds backend</p>
        <h1>Health</h1>
      </div>
      <div class="pill">${escapeHtml(health.ok ? "healthy" : "degraded")}</div>
    </header>

    <section class="grid">
      ${metric("Backend", backend.status ?? "unknown")}
      ${metric("Blockchain", blockchain.status ?? "unknown")}
      ${metric("Poller", poller.running ? "running" : "stopped")}
      ${metric("Settlement", settlement.running ? "running" : "idle")}
      ${metric("Matches", String(backend.matches ?? 0))}
      ${metric("Tracked txs", String(backend.txs ?? 0))}
      ${metric("Errors", String(backend.errors ?? 0))}
      ${metric("Uptime", `${backend.uptimeSecs ?? 0}s`)}
    </section>

    <section class="panel">
      <div class="section-head">
        <h2>Blockchain</h2>
        <span class="eyebrow">${escapeHtml(health.checkedAt ?? "not checked")}</span>
      </div>
      <table>
        <tbody>
          ${row("RPC URL", blockchain.rpcUrl)}
          ${row("Status", blockchain.status)}
          ${row("Version", blockchain.version)}
          ${row("Latest blockhash", blockchain.latestBlockhash)}
          ${row("Authority", blockchain.authority)}
          ${row("oracle-adapter", blockchain.oracleProgram)}
          ${row("betting-engine", blockchain.bettingProgram)}
          ${blockchain.error ? row("Error", blockchain.error) : ""}
        </tbody>
      </table>
    </section>

    <section class="panel">
      <div class="section-head">
        <h2>Workers</h2>
        <span class="eyebrow">runtime state</span>
      </div>
      <table>
        <tbody>
          ${row("Poller running", String(Boolean(poller.running)))}
          ${row("Poller last run", poller.lastRunAt ?? "never")}
          ${row("Settlement running", String(Boolean(settlement.running)))}
          ${row("Settlement last run", settlement.lastRunAt ?? "never")}
        </tbody>
      </table>
    </section>

    <section class="panel">
      <div class="section-head">
        <h2>Recent State</h2>
        <span class="eyebrow">txs + errors</span>
      </div>
      <pre>${escapeHtml(JSON.stringify({ recentTxs: health.recentTxs ?? [], recentErrors: health.recentErrors ?? [] }, null, 2))}</pre>
    </section>
  </main>
</body>
</html>`;
}

function metric(label, value) {
  return `<article class="card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`;
}

function row(label, value) {
  return `<tr><th>${escapeHtml(label)}</th><td><code>${escapeHtml(value ?? "not available")}</code></td></tr>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

import express from "express";
import { loadConfig, loadKeypair } from "./config.js";
import { createOddsPoller } from "./oddsPoller.js";
import { createSettlementWorker } from "./settlementWorker.js";
import { createStore } from "./store.js";
import {
  BETTING_PROGRAM_ID,
  ORACLE_PROGRAM_ID,
  createConnection,
  fetchOpenBets,
  sendSettleBet,
  sendUpdateOdds,
} from "./solana.js";
import { logger as defaultLogger } from "./logger.js";

export function createApp({
  store,
  poller,
  settlementWorker,
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
  app.use((req, res, next) => {
    logger.info("http.request", { method: req.method, path: req.path });
    res.on("finish", () => {
      logger.info("http.response", { method: req.method, path: req.path, status: res.statusCode });
    });
    next();
  });

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

  const healthCheck = () => getRuntimeHealth({ config, connection, authority, store });

  return { config, store, poller, settlementWorker, healthCheck };
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
        rpcUrl: config.rpcUrl,
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
        rpcUrl: config.rpcUrl,
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

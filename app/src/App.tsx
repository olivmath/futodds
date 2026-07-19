import { useCallback, useEffect, useMemo, useState } from "react";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import {
  buildGameEvents,
  buildGameRows,
  currentOddsBars,
  findGameRow,
  formatPercentOdds,
  formatTokenUnits,
  formatUnixTime,
  GameEvent,
  GameRow,
  oddsChartSegments,
  parseCreateGameForm,
  shortenAddress,
  tradingChartSeries,
} from "./backofficeModel";
import {
  BET_ACCOUNT_SIZE,
  BETTING_PROGRAM_ID,
  BetAccount,
  MatchAccount,
  ORACLE_PROGRAM_ID,
  OddsInput,
  buildMatchAccountFilters,
  buildUpdateOddsInstruction,
  decodeBetAccount,
  decodeMatchAccount,
  deriveMatchPda,
  parseAnchorEventFromLogs,
  resolveBackofficeConfig,
} from "./solanaBackoffice";

type BackendMatch = {
  id: string;
  odds: OddsInput;
  updatedAt?: string;
};

type BackendStatus = {
  poller?: { running?: boolean; lastRunAt?: string | null };
  settlement?: { running?: boolean; lastRunAt?: string | null };
  matches?: BackendMatch[];
  txs?: Array<Record<string, unknown>>;
  errors?: Array<{ at?: string; message: string }>;
};

type ChainMatch = {
  pda: PublicKey;
  account: MatchAccount;
};

type ChainBet = {
  pda: PublicKey;
  account: BetAccount;
};

type HealthState = {
  ok: boolean;
  rpcUrl?: string;
  oracleProgram?: string;
  bettingProgram?: string;
};

type LoadState = {
  loading: boolean;
  error: string | null;
  lastLoadedAt: string | null;
};

type RealtimeEventState = {
  at: string;
  matchId: string | null;
  label: string;
  detail: string;
};

type BrowserWallet = {
  publicKey?: PublicKey;
  connect: () => Promise<{ publicKey?: PublicKey } | void>;
  signTransaction?: (transaction: Transaction) => Promise<Transaction>;
  signAndSendTransaction?: (transaction: Transaction) => Promise<{ signature: string }>;
};

declare global {
  interface Window {
    solana?: BrowserWallet;
    solflare?: BrowserWallet;
  }
}

type AppTab = "games" | "create";

export default function App() {
  const config = useMemo(() => resolveBackofficeConfig(), []);
  const connection = useMemo(() => new Connection(config.rpcUrl, "confirmed"), [config.rpcUrl]);
  const [health, setHealth] = useState<HealthState | null>(null);
  const [backendStatus, setBackendStatus] = useState<BackendStatus | null>(null);
  const [backendMatches, setBackendMatches] = useState<BackendMatch[]>([]);
  const [chainMatches, setChainMatches] = useState<ChainMatch[]>([]);
  const [bets, setBets] = useState<ChainBet[]>([]);
  const [loadState, setLoadState] = useState<LoadState>({ loading: true, error: null, lastLoadedAt: null });
  const [lastEvent, setLastEvent] = useState<string>("No realtime event yet");
  const [realtimeEvents, setRealtimeEvents] = useState<RealtimeEventState[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>("games");
  const [walletProvider, setWalletProvider] = useState<BrowserWallet | null>(null);
  const [walletPublicKey, setWalletPublicKey] = useState<PublicKey | null>(null);
  const [createForm, setCreateForm] = useState({ matchId: "", home: "6500", away: "3000", draw: "500" });
  const [createState, setCreateState] = useState<{ busy: boolean; error: string | null; signature: string | null }>({
    busy: false,
    error: null,
    signature: null,
  });

  const backendUrl = config.backendUrl;

  const callBackend = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      const response = await fetch(`${backendUrl}${path}`, init);
      if (!response.ok) {
        throw new Error(`${path} returned ${response.status}`);
      }
      return response.json() as Promise<T>;
    },
    [backendUrl],
  );

  const refresh = useCallback(async () => {
    setLoadState((current) => ({ ...current, loading: true, error: null }));

    const [healthResult, statusResult, matchesResult, chainMatchesResult, betsResult] = await Promise.allSettled([
      callBackend<{ ok?: boolean; blockchain?: { rpcUrl?: string; oracleProgram?: string; bettingProgram?: string } }>("/health"),
      callBackend<BackendStatus>("/status"),
      callBackend<BackendMatch[]>("/matches"),
      connection.getProgramAccounts(ORACLE_PROGRAM_ID, {
        commitment: "confirmed",
        filters: buildMatchAccountFilters(),
      }),
      connection.getProgramAccounts(BETTING_PROGRAM_ID, {
        commitment: "confirmed",
        filters: [{ dataSize: BET_ACCOUNT_SIZE }],
      }),
    ]);

    const errors: string[] = [];

    if (healthResult.status === "fulfilled") {
      setHealth({
        ok: Boolean(healthResult.value.ok),
        rpcUrl: healthResult.value.blockchain?.rpcUrl,
        oracleProgram: healthResult.value.blockchain?.oracleProgram,
        bettingProgram: healthResult.value.blockchain?.bettingProgram,
      });
    } else {
      setHealth({ ok: false });
      errors.push(errorMessage(healthResult.reason));
    }

    if (statusResult.status === "fulfilled") {
      setBackendStatus(statusResult.value);
    } else {
      errors.push(errorMessage(statusResult.reason));
    }

    if (matchesResult.status === "fulfilled") {
      setBackendMatches(matchesResult.value);
    } else {
      errors.push(errorMessage(matchesResult.reason));
    }

    if (chainMatchesResult.status === "fulfilled") {
      setChainMatches(
        chainMatchesResult.value
          .map(({ pubkey, account }) => ({ pda: pubkey, account: decodeMatchAccount(account.data) }))
          .sort((a, b) => a.account.matchId.localeCompare(b.account.matchId)),
      );
    } else {
      errors.push(errorMessage(chainMatchesResult.reason));
    }

    if (betsResult.status === "fulfilled") {
      setBets(betsResult.value.map(({ pubkey, account }) => ({ pda: pubkey, account: decodeBetAccount(account.data) })));
    } else {
      errors.push(errorMessage(betsResult.reason));
    }

    setLoadState({
      loading: false,
      error: errors.length > 0 ? errors.join(" | ") : null,
      lastLoadedAt: new Date().toISOString(),
    });
  }, [callBackend, connection]);

  const startPoller = useCallback(async () => {
    setLoadState((current) => ({ ...current, loading: true, error: null }));
    try {
      await callBackend("/poller/start", { method: "POST" });
      await refresh();
    } catch (error) {
      setLoadState((current) => ({ ...current, loading: false, error: errorMessage(error) }));
    }
  }, [callBackend, refresh]);

  const connectWallet = useCallback(async () => {
    const provider = window.solana ?? window.solflare;
    if (!provider) {
      setCreateState((current) => ({ ...current, error: "Instale Phantom ou Solflare para assinar.", signature: null }));
      return null;
    }

    const result = await provider.connect();
    const publicKey = result?.publicKey ?? provider.publicKey;
    if (!publicKey) {
      setCreateState((current) => ({ ...current, error: "A wallet nao retornou public key.", signature: null }));
      return null;
    }

    setWalletProvider(provider);
    setWalletPublicKey(publicKey);
    setCreateState((current) => ({ ...current, error: null }));
    return { provider, publicKey };
  }, []);

  const createGameOnChain = useCallback(async () => {
    const parsed = parseCreateGameForm(createForm);
    if (!parsed.ok) {
      setCreateState({ busy: false, error: parsed.error, signature: null });
      return;
    }

    setCreateState({ busy: true, error: null, signature: null });
    try {
      const wallet = walletProvider && walletPublicKey ? { provider: walletProvider, publicKey: walletPublicKey } : await connectWallet();
      if (!wallet) {
        setCreateState((current) => ({ ...current, busy: false }));
        return;
      }

      const latestBlockhash = await connection.getLatestBlockhash("confirmed");
      const transaction = new Transaction().add(buildUpdateOddsInstruction(wallet.publicKey, parsed.matchId, parsed.odds));
      transaction.feePayer = wallet.publicKey;
      transaction.recentBlockhash = latestBlockhash.blockhash;

      let signature: string;
      if (wallet.provider.signAndSendTransaction) {
        signature = (await wallet.provider.signAndSendTransaction(transaction)).signature;
      } else if (wallet.provider.signTransaction) {
        const signed = await wallet.provider.signTransaction(transaction);
        signature = await connection.sendRawTransaction(signed.serialize());
      } else {
        throw new Error("A wallet conectada nao consegue assinar transacoes.");
      }

      await connection.confirmTransaction(
        {
          signature,
          blockhash: latestBlockhash.blockhash,
          lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        },
        "confirmed",
      );

      setCreateState({ busy: false, error: null, signature });
      setSelectedMatchId(parsed.matchId);
      setActiveTab("games");
      await refresh();
    } catch (error) {
      setCreateState({ busy: false, error: errorMessage(error), signature: null });
    }
  }, [connectWallet, connection, createForm, refresh, walletProvider, walletPublicKey]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 10_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    const listener = connection.onLogs(
      ORACLE_PROGRAM_ID,
      (logs) => {
        const event = parseAnchorEventFromLogs(logs.logs);
        if (!event || event.type !== "OddsUpdated") return;

        setLastEvent(`OddsUpdated ${event.matchId} ${event.oddsHome}/${event.oddsAway}/${event.oddsDraw}`);
        setRealtimeEvents((current) =>
          [
            {
              at: new Date().toISOString(),
              matchId: event.matchId,
              label: "OddsUpdated",
              detail: `${formatPercentOdds(event.oddsHome)} / ${formatPercentOdds(event.oddsAway)} / ${formatPercentOdds(event.oddsDraw)}`,
            },
            ...current,
          ].slice(0, 20),
        );
        setChainMatches((current) => {
          const next = current.filter((match) => match.account.matchId !== event.matchId);
          return [
            {
              pda: deriveMatchPda(event.matchId),
              account: {
                authority: event.authority,
                matchId: event.matchId,
                oddsHome: event.oddsHome,
                oddsAway: event.oddsAway,
                oddsDraw: event.oddsDraw,
                updatedAt: event.updatedAt,
                bump: current.find((match) => match.account.matchId === event.matchId)?.account.bump ?? 0,
              },
            },
            ...next,
          ].sort((a, b) => a.account.matchId.localeCompare(b.account.matchId));
        });
      },
      "confirmed",
    );

    return () => {
      void connection.removeOnLogsListener(listener);
    };
  }, [connection]);

  useEffect(() => {
    const listener = connection.onLogs(
      BETTING_PROGRAM_ID,
      (logs) => {
        const event = parseAnchorEventFromLogs(logs.logs);
        if (!event || event.type !== "BetSettled") return;
        setLastEvent(`BetSettled ${event.matchId} ${event.won ? "won" : "lost"}`);
        setRealtimeEvents((current) =>
          [
            {
              at: new Date().toISOString(),
              matchId: event.matchId,
              label: "BetSettled",
              detail: `${event.won ? "Won" : "Lost"} ${shortenAddress(event.bet.toBase58(), 5)}`,
            },
            ...current,
          ].slice(0, 20),
        );
        void refresh();
      },
      "confirmed",
    );

    return () => {
      void connection.removeOnLogsListener(listener);
    };
  }, [connection, refresh]);

  const rows = useMemo(
    () =>
      buildGameRows({
        backendMatches,
        onChainMatches: chainMatches.map(({ pda, account }) => ({
          pda: pda.toBase58(),
          matchId: account.matchId,
          oddsHome: account.oddsHome,
          oddsAway: account.oddsAway,
          oddsDraw: account.oddsDraw,
          updatedAt: account.updatedAt,
        })),
        bets: bets.map(({ account }) => ({
          matchId: account.matchId,
          amount: account.amount,
          status: account.status,
        })),
      }),
    [backendMatches, bets, chainMatches],
  );

  const totalStaked = rows.reduce((total, row) => total + row.totalStaked, 0n);
  const openBets = rows.reduce((total, row) => total + row.openBets, 0);
  const events = useMemo(
    () =>
      buildGameEvents({
        backendErrors: backendStatus?.errors,
        backendTxs: backendStatus?.txs,
        realtimeEvents,
      }).slice(0, 24),
    [backendStatus?.errors, backendStatus?.txs, realtimeEvents],
  );
  const selectedRow = findGameRow(rows, selectedMatchId);
  const selectedEvents = events.filter((event) => event.matchId === selectedMatchId);

  return (
    <main className="page-shell">
      <header className="page-head">
        <div>
          <p className="eyebrow">FutOdds local market</p>
          <h1>Jogos</h1>
        </div>
        <div className="status-strip">
          <Status label="Backend" value={health?.ok ? "online" : "offline"} tone={health?.ok ? "good" : "bad"} />
          <Status label="Poller" value={backendStatus?.poller?.running ? "running" : "stopped"} tone={backendStatus?.poller?.running ? "good" : "idle"} />
          <Status label="Apostado" value={formatTokenUnits(totalStaked)} tone="idle" />
          <Status label="Abertas" value={String(openBets)} tone="idle" />
        </div>
      </header>

      <nav className="tabs" aria-label="Secoes">
        <button className={activeTab === "games" ? "active" : ""} type="button" onClick={() => setActiveTab("games")}>
          Jogos
        </button>
        <button className={activeTab === "create" ? "active" : ""} type="button" onClick={() => setActiveTab("create")}>
          Criar jogo
        </button>
      </nav>

      {activeTab === "create" ? (
        <CreateGamePanel
          form={createForm}
          state={createState}
          walletPublicKey={walletPublicKey}
          onConnect={() => void connectWallet()}
          onSubmit={() => void createGameOnChain()}
          onChange={(field, value) => setCreateForm((current) => ({ ...current, [field]: value }))}
        />
      ) : selectedRow ? (
        <GameDetail row={selectedRow} events={selectedEvents} onBack={() => setSelectedMatchId(null)} />
      ) : (
        <section className="table-panel" aria-label="Jogos">
            <div className="table-toolbar">
              <div>
                <strong>{rows.length} jogos</strong>
                <span>{loadState.lastLoadedAt ? `Atualizado ${new Date(loadState.lastLoadedAt).toLocaleTimeString()}` : "Carregando dados"}</span>
              </div>
              <div className="toolbar-actions">
                <button type="button" onClick={() => void refresh()} disabled={loadState.loading}>
                  Atualizar
                </button>
                <button className="secondary" type="button" onClick={() => void startPoller()} disabled={loadState.loading || backendStatus?.poller?.running}>
                  Start poller
                </button>
              </div>
            </div>

            {loadState.error ? <div className="error-line">{loadState.error}</div> : null}

            <div className="games-table">
              <div className="games-row games-head">
                <span>Jogo</span>
                <span>Odds</span>
                <span>Total apostado</span>
                <span>Bets abertas</span>
                <span>Atualizado</span>
                <span>Fonte</span>
                <span>PDA</span>
              </div>

              {rows.map((row) => (
                <div className="games-row" key={row.matchId}>
                  <button className="game-link" type="button" onClick={() => setSelectedMatchId(row.matchId)}>
                    {row.matchId}
                  </button>
                  <CurrentOddsBars home={row.oddsHome} away={row.oddsAway} draw={row.oddsDraw} />
                  <span className="money">{formatTokenUnits(row.totalStaked)}</span>
                  <span>{row.openBets}</span>
                  <span>{row.updatedAt ? formatUnixTime(row.updatedAt) : row.backendUpdatedAt ? new Date(row.backendUpdatedAt).toLocaleString() : "sem registro"}</span>
                  <span><SourceBadge source={row.source} /></span>
                  <code>{row.pda ? shortenAddress(row.pda, 5) : "not created"}</code>
                </div>
              ))}
            </div>

            {rows.length === 0 ? (
              <div className="empty-state">
                Nenhum jogo encontrado. Inicie o backend/poller ou aguarde uma conta `MatchAccount`.
              </div>
            ) : null}
        </section>
      )}

      <footer className="footline">
        <span>RPC: {health?.rpcUrl ?? config.rpcUrl}</span>
        <span>Oracle: {shortenAddress(health?.oracleProgram ?? ORACLE_PROGRAM_ID.toBase58(), 5)}</span>
        <span>Betting: {shortenAddress(health?.bettingProgram ?? BETTING_PROGRAM_ID.toBase58(), 5)}</span>
        <span>{lastEvent}</span>
      </footer>
    </main>
  );
}

function EventRail({ events }: { events: GameEvent[] }) {
  return (
    <aside className="event-rail" aria-label="Novos eventos">
      <div className="rail-head">
        <span>Eventos</span>
        <strong>{events.length}</strong>
      </div>
      <div className="event-list">
        {events.map((event) => (
          <div className={`event-item ${event.tone}`} key={event.id}>
            <span>{new Date(event.at).toLocaleTimeString()}</span>
            <strong>{event.label}</strong>
            <small>{event.matchId ?? "sistema"}</small>
            <code>{event.detail}</code>
          </div>
        ))}
        {events.length === 0 ? <p className="rail-empty">Sem eventos recentes</p> : null}
      </div>
    </aside>
  );
}

function GameDetail({ row, events, onBack }: { row: GameRow; events: GameEvent[]; onBack: () => void }) {
  return (
    <div className="game-detail-layout">
      <EventRail events={events} />
      <section className="game-detail" aria-label={`Detalhes de ${row.matchId}`}>
        <div className="detail-head">
          <button className="secondary" type="button" onClick={onBack}>
            Voltar
          </button>
          <div>
            <span className="eyebrow">Tela do jogo</span>
            <h2>{row.matchId}</h2>
          </div>
          <SourceBadge source={row.source} />
        </div>

        <div className="detail-grid">
          <MetricCard label="Casa" value={formatPercentOdds(row.oddsHome)} tone="home" />
          <MetricCard label="Fora" value={formatPercentOdds(row.oddsAway)} tone="away" />
          <MetricCard label="Empate" value={formatPercentOdds(row.oddsDraw)} tone="draw" />
        </div>

        <div className="detail-section">
          <span className="games-head">Trading odds</span>
          <OddsTradingChart home={row.oddsHome} away={row.oddsAway} draw={row.oddsDraw} />
        </div>

        <div className="detail-grid two">
          <MetricCard label="Total apostado" value={formatTokenUnits(row.totalStaked)} tone="money" />
          <MetricCard label="Bets abertas" value={String(row.openBets)} tone="plain" />
        </div>

        <div className="detail-table">
          <div>
            <span>PDA</span>
            <code>{row.pda ?? "not created"}</code>
          </div>
          <div>
            <span>On-chain update</span>
            <strong>{row.updatedAt ? formatUnixTime(row.updatedAt) : "sem registro"}</strong>
          </div>
          <div>
            <span>Backend update</span>
            <strong>{row.backendUpdatedAt ? new Date(row.backendUpdatedAt).toLocaleString() : "sem registro"}</strong>
          </div>
        </div>
      </section>
    </div>
  );
}

function CreateGamePanel({
  form,
  state,
  walletPublicKey,
  onConnect,
  onSubmit,
  onChange,
}: {
  form: { matchId: string; home: string; away: string; draw: string };
  state: { busy: boolean; error: string | null; signature: string | null };
  walletPublicKey: PublicKey | null;
  onConnect: () => void;
  onSubmit: () => void;
  onChange: (field: "matchId" | "home" | "away" | "draw", value: string) => void;
}) {
  const parsed = parseCreateGameForm(form);
  const formError = parsed.ok ? null : parsed.error;

  return (
    <section className="create-panel" aria-label="Criar jogo">
      <div className="create-head">
        <div>
          <span className="eyebrow">On-chain direto</span>
          <h2>Criar jogo</h2>
        </div>
        <button className="secondary" type="button" onClick={onConnect}>
          {walletPublicKey ? shortenAddress(walletPublicKey.toBase58(), 5) : "Conectar wallet"}
        </button>
      </div>

      <div className="create-grid">
        <label className="field">
          <span>ID do jogo</span>
          <input value={form.matchId} onChange={(event) => onChange("matchId", event.target.value)} placeholder="match_3" />
        </label>
        <label className="field">
          <span>Casa bps</span>
          <input inputMode="numeric" value={form.home} onChange={(event) => onChange("home", event.target.value)} />
        </label>
        <label className="field">
          <span>Fora bps</span>
          <input inputMode="numeric" value={form.away} onChange={(event) => onChange("away", event.target.value)} />
        </label>
        <label className="field">
          <span>Empate bps</span>
          <input inputMode="numeric" value={form.draw} onChange={(event) => onChange("draw", event.target.value)} />
        </label>
      </div>

      <div className="create-preview">
        <CurrentOddsBars
          home={parsed.ok ? parsed.odds.home : 0}
          away={parsed.ok ? parsed.odds.away : 0}
          draw={parsed.ok ? parsed.odds.draw : 0}
        />
      </div>

      {state.error || formError ? <div className="error-line inline">{state.error ?? formError}</div> : null}
      {state.signature ? <div className="success-line">Criado: {shortenAddress(state.signature, 8)}</div> : null}

      <div className="create-actions">
        <button type="button" onClick={onSubmit} disabled={state.busy || !parsed.ok}>
          {state.busy ? "Enviando" : "Criar jogo on-chain"}
        </button>
      </div>
    </section>
  );
}

function MetricCard({ label, value, tone }: { label: string; value: string; tone: "home" | "away" | "draw" | "money" | "plain" }) {
  return (
    <div className={`metric-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function CurrentOddsBars({ home, away, draw }: { home: number; away: number; draw: number }) {
  const bars = currentOddsBars({ home, away, draw });

  return (
    <div className="current-odds" aria-label={`Casa ${formatPercentOdds(home)}, Fora ${formatPercentOdds(away)}, Empate ${formatPercentOdds(draw)}`}>
      {bars.map((bar) => (
        <div className={`current-odds-row ${bar.key}`} key={bar.key}>
          <span>{bar.label}</span>
          <div className="current-odds-track">
            <i style={{ width: bar.width }} />
          </div>
          <strong>{bar.displayValue}</strong>
        </div>
      ))}
    </div>
  );
}

function OddsTradingChart({ home, away, draw }: { home: number; away: number; draw: number }) {
  const segments = oddsChartSegments({ home, away, draw });
  const series = tradingChartSeries({ home, away, draw });

  return (
    <div className="odds-chart" aria-label={`Casa ${formatPercentOdds(home)}, Fora ${formatPercentOdds(away)}, Empate ${formatPercentOdds(draw)}`}>
      <div className="trading-chart">
        <svg viewBox="0 0 120 68" role="img" aria-hidden="true" preserveAspectRatio="none">
          <line x1="0" x2="120" y1="12" y2="12" />
          <line x1="0" x2="120" y1="28" y2="28" />
          <line x1="0" x2="120" y1="44" y2="44" />
          <line x1="0" x2="120" y1="60" y2="60" />
          {series.map((item) => (
            <polyline className={`trading-line ${item.key}`} key={item.key} points={item.points} />
          ))}
        </svg>
        {series.map((item) => (
          <div className={`trading-ticker ${item.key}`} key={item.key}>
            <span>{item.label}</span>
            <strong>{item.displayValue}</strong>
          </div>
        ))}
      </div>
      <div className="odds-legend">
        {segments.map((segment) => (
          <span key={segment.key}>
            <i className={segment.key} />
            {segment.label} {formatPercentOdds(segment.value)}
          </span>
        ))}
      </div>
    </div>
  );
}

function Status({ label, value, tone }: { label: string; value: string; tone: "good" | "bad" | "idle" }) {
  return (
    <div className={`status-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SourceBadge({ source }: { source: "backend" | "chain" | "backend+chain" }) {
  const label = source === "backend+chain" ? "backend + chain" : source;
  return <span className={`source-badge ${source.replace("+", "-")}`}>{label}</span>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

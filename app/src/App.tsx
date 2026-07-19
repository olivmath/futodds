import { useCallback, useEffect, useMemo, useState } from "react";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import {
  betStatusLabel,
  buildBettingView,
  buildGameEvents,
  buildGameRows,
  currentOddsBars,
  directionLabel,
  findGameRow,
  formatPercentOdds,
  formatTokenUnits,
  formatUnixTime,
  GameEvent,
  BettingViewBet,
  GameRow,
  oddsChartSegments,
  parseCreateGameForm,
  parseCreatePoolForm,
  parseDepositForm,
  parsePlaceBetForm,
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
  buildCreateAssociatedTokenAccountInstruction,
  buildCreatePoolInstruction,
  buildDepositInstruction,
  buildPlaceBetInstruction,
  buildUpdateOddsInstruction,
  decodeBetAccount,
  decodeMatchAccount,
  decodeTokenAccountAmount,
  deriveAssociatedTokenAddress,
  deriveVaultAuthorityPda,
  deriveMatchPda,
  parseAnchorEventFromLogs,
  resolveBackofficeConfig,
} from "./solanaBackoffice";
import { GameAdminTab } from "./tabs/GameAdminTab";

type BackendMatch = {
  id: string;
  oddsSource?: "random" | "txline-polling" | "txline-realtime";
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

type AppTab = "games" | "create" | "pool" | "bet" | "game-admin";

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
  const [createForm, setCreateForm] = useState({ matchId: "", tag: "", oddsSource: "random", home: "6500", away: "3000", draw: "500" });
  const [createState, setCreateState] = useState<{ busy: boolean; error: string | null; signature: string | null }>({
    busy: false,
    error: null,
    signature: null,
  });
  const [betForm, setBetForm] = useState({
    matchId: "",
    direction: "0",
    windowSecs: "300",
    amount: "1",
    nonce: String(Math.floor(Date.now() / 1000)),
  });
  const [betState, setBetState] = useState<{ busy: boolean; error: string | null; signature: string | null }>({
    busy: false,
    error: null,
    signature: null,
  });
  const [poolForm, setPoolForm] = useState({ matchId: "", feeRate: "200" });
  const [poolState, setPoolState] = useState<{ busy: boolean; error: string | null; signature: string | null }>({
    busy: false,
    error: null,
    signature: null,
  });
  const [depositForm, setDepositForm] = useState({ matchId: "", amount: "100" });
  const [depositState, setDepositState] = useState<{ busy: boolean; error: string | null; signature: string | null }>({
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
      const result = await callBackend<{ signature: string }>("/matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matchId: parsed.matchId, tag: createForm.tag, oddsSource: parsed.oddsSource, odds: parsed.odds }),
      });
      setCreateState({ busy: false, error: null, signature: result.signature });
      setSelectedMatchId(parsed.matchId);
      setActiveTab("games");
      await refresh();
    } catch (error) {
      setCreateState({ busy: false, error: errorMessage(error), signature: null });
    }
  }, [callBackend, createForm, refresh]);

  const placeBetOnChain = useCallback(async () => {
    const parsed = parsePlaceBetForm(betForm);
    if (!parsed.ok) {
      setBetState({ busy: false, error: parsed.error, signature: null });
      return;
    }

    setBetState({ busy: true, error: null, signature: null });
    try {
      const wallet = walletProvider && walletPublicKey ? { provider: walletProvider, publicKey: walletPublicKey } : await connectWallet();
      if (!wallet) {
        setBetState((current) => ({ ...current, busy: false }));
        return;
      }

      const mint = config.testUsdcMint;
      const userAta = deriveAssociatedTokenAddress(wallet.publicKey, mint);
      const vaultAuthority = deriveVaultAuthorityPda(parsed.matchId);
      const vaultAta = deriveAssociatedTokenAddress(vaultAuthority, mint);
      const [userAtaInfo, vaultAtaInfo, latestBlockhash] = await Promise.all([
        connection.getAccountInfo(userAta, "confirmed"),
        connection.getAccountInfo(vaultAta, "confirmed"),
        connection.getLatestBlockhash("confirmed"),
      ]);

      const userTokenBalance = userAtaInfo ? decodeTokenAccountAmount(userAtaInfo.data) : 0n;
      if (!userAtaInfo) {
        throw new Error(`Sua wallet nao tem conta USDC para o mint ${mint.toBase58()}. Crie a ATA e minte USDC local antes de apostar.`);
      }
      if (userTokenBalance < parsed.input.amount) {
        throw new Error(`Saldo USDC insuficiente: wallet tem ${formatTokenUnits(userTokenBalance)}, aposta pede ${formatTokenUnits(parsed.input.amount)}.`);
      }

      const transaction = new Transaction();
      if (!vaultAtaInfo) {
        transaction.add(buildCreateAssociatedTokenAccountInstruction(wallet.publicKey, vaultAuthority, mint));
      }
      transaction.add(buildPlaceBetInstruction(wallet.publicKey, parsed.matchId, mint, parsed.input));
      transaction.feePayer = wallet.publicKey;
      transaction.recentBlockhash = latestBlockhash.blockhash;

      let signature: string;
      if (wallet.provider.signTransaction) {
        const signed = await wallet.provider.signTransaction(transaction);
        signature = await connection.sendRawTransaction(signed.serialize());
      } else if (wallet.provider.signAndSendTransaction) {
        signature = (await wallet.provider.signAndSendTransaction(transaction)).signature;
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

      setBetState({ busy: false, error: null, signature });
      setBetForm((current) => ({ ...current, nonce: String(Number(current.nonce) + 1) }));
      await refresh();
    } catch (error) {
      const message = errorMessage(error);
      setBetState({ busy: false, error: message, signature: null });
    }
  }, [betForm, config.testUsdcMint, connectWallet, connection, refresh, walletProvider, walletPublicKey]);

  const createPoolOnChain = useCallback(async () => {
    const parsed = parseCreatePoolForm(poolForm);
    if (!parsed.ok) {
      setPoolState({ busy: false, error: parsed.error, signature: null });
      return;
    }
    setPoolState({ busy: true, error: null, signature: null });
    try {
      const wallet = walletProvider && walletPublicKey ? { provider: walletProvider, publicKey: walletPublicKey } : await connectWallet();
      if (!wallet) { setPoolState((s) => ({ ...s, busy: false })); return; }

      const mint = config.testUsdcMint;
      const latestBlockhash = await connection.getLatestBlockhash("confirmed");
      const transaction = new Transaction();
      transaction.add(buildCreatePoolInstruction(wallet.publicKey, parsed.matchId, mint, parsed.feeRate));
      transaction.feePayer = wallet.publicKey;
      transaction.recentBlockhash = latestBlockhash.blockhash;

      let signature: string;
      if (wallet.provider.signTransaction) {
        const signed = await wallet.provider.signTransaction(transaction);
        signature = await connection.sendRawTransaction(signed.serialize());
      } else if (wallet.provider.signAndSendTransaction) {
        signature = (await wallet.provider.signAndSendTransaction(transaction)).signature;
      } else {
        throw new Error("Wallet nao suporta assinatura.");
      }

      await connection.confirmTransaction({ signature, blockhash: latestBlockhash.blockhash, lastValidBlockHeight: latestBlockhash.lastValidBlockHeight }, "confirmed");
      setPoolState({ busy: false, error: null, signature });
    } catch (error) {
      setPoolState({ busy: false, error: errorMessage(error), signature: null });
    }
  }, [poolForm, config.testUsdcMint, connectWallet, connection, walletProvider, walletPublicKey]);

  const depositOnChain = useCallback(async () => {
    const parsed = parseDepositForm(depositForm);
    if (!parsed.ok) {
      setDepositState({ busy: false, error: parsed.error, signature: null });
      return;
    }
    setDepositState({ busy: true, error: null, signature: null });
    try {
      const wallet = walletProvider && walletPublicKey ? { provider: walletProvider, publicKey: walletPublicKey } : await connectWallet();
      if (!wallet) { setDepositState((s) => ({ ...s, busy: false })); return; }

      const mint = config.testUsdcMint;
      const latestBlockhash = await connection.getLatestBlockhash("confirmed");
      const transaction = new Transaction();
      transaction.add(buildDepositInstruction(wallet.publicKey, parsed.matchId, mint, parsed.amount));
      transaction.feePayer = wallet.publicKey;
      transaction.recentBlockhash = latestBlockhash.blockhash;

      let signature: string;
      if (wallet.provider.signTransaction) {
        const signed = await wallet.provider.signTransaction(transaction);
        signature = await connection.sendRawTransaction(signed.serialize());
      } else if (wallet.provider.signAndSendTransaction) {
        signature = (await wallet.provider.signAndSendTransaction(transaction)).signature;
      } else {
        throw new Error("Wallet nao suporta assinatura.");
      }

      await connection.confirmTransaction({ signature, blockhash: latestBlockhash.blockhash, lastValidBlockHeight: latestBlockhash.lastValidBlockHeight }, "confirmed");
      setDepositState({ busy: false, error: null, signature });
    } catch (error) {
      setDepositState({ busy: false, error: errorMessage(error), signature: null });
    }
  }, [depositForm, config.testUsdcMint, connectWallet, connection, walletProvider, walletPublicKey]);

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
          const existing = current.find((match) => match.account.matchId === event.matchId);
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
                tag: existing?.account.tag ?? event.tag ?? "",
                status: existing?.account.status ?? 0,
                bump: existing?.account.bump ?? 0,
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
          tag: account.tag,
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
  const betItems = useMemo<BettingViewBet[]>(
    () =>
      bets.map(({ pda, account }) => ({
        pda: pda.toBase58(),
        user: account.user.toBase58(),
        matchId: account.matchId,
        direction: account.direction,
        oddsAtEntry: account.oddsAtEntry,
        amount: account.amount,
        payout: account.payout,
        windowSecs: account.windowSecs,
        createdAt: account.createdAt,
        expiresAt: account.expiresAt,
        status: account.status,
        nonce: account.nonce,
      })),
    [bets],
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
        <button className={activeTab === "pool" ? "active" : ""} type="button" onClick={() => setActiveTab("pool")}>
          Pool
        </button>
        <button className={activeTab === "bet" ? "active" : ""} type="button" onClick={() => setActiveTab("bet")}>
          Apostar
        </button>
        <button className={activeTab === "game-admin" ? "active" : ""} type="button" onClick={() => setActiveTab("game-admin")}>
          Game Admin
        </button>
      </nav>

      {activeTab === "game-admin" ? (
        <>
          <div className="create-grid" style={{ padding: "20px 20px 0" }}>
            <label className="field">
              <span>Jogo</span>
              <select value={selectedMatchId ?? ""} onChange={(e) => setSelectedMatchId(e.target.value || null)}>
                <option value="">Selecione um jogo</option>
                {rows.map((row) => (
                  <option key={row.matchId} value={row.matchId}>{row.tag || row.matchId}</option>
                ))}
              </select>
            </label>
          </div>
          {selectedMatchId ? (
            <GameAdminTab
              matchId={selectedMatchId}
              chainMatches={chainMatches}
              bets={bets}
              backendStatus={backendStatus}
              connection={connection}
              backendUrl={backendUrl}
            />
          ) : (
            <div style={{ padding: "20px", color: "#999" }}>Selecione um jogo acima</div>
          )}
        </>
      ) : activeTab === "create" ? (
        <CreateGamePanel
          form={createForm}
          state={createState}
          walletPublicKey={walletPublicKey}
          backendUrl={backendUrl}
          onConnect={() => void connectWallet()}
          onSubmit={() => void createGameOnChain()}
          onChange={(field, value) => setCreateForm((current) => {
            if (field === "oddsSource") return { ...current, oddsSource: value, matchId: "", tag: "" };
            return { ...current, [field]: value };
          })}
        />
      ) : activeTab === "pool" ? (
        <PoolPanel
          poolForm={poolForm}
          depositForm={depositForm}
          poolState={poolState}
          depositState={depositState}
          rows={rows.filter((row) => row.pda)}
          walletPublicKey={walletPublicKey}
          onConnect={() => void connectWallet()}
          onCreatePool={() => void createPoolOnChain()}
          onDeposit={() => void depositOnChain()}
          onPoolChange={(field, value) => setPoolForm((current) => ({ ...current, [field]: value }))}
          onDepositChange={(field, value) => setDepositForm((current) => ({ ...current, [field]: value }))}
        />
      ) : activeTab === "bet" ? (
        <BetPanel
          form={betForm}
          rows={rows.filter((row) => row.pda)}
          state={betState}
          bets={betItems}
          walletPublicKey={walletPublicKey}
          onConnect={() => void connectWallet()}
          onSubmit={() => void placeBetOnChain()}
          onChange={(field, value) => setBetForm((current) => ({ ...current, [field]: value }))}
        />
      ) : selectedRow ? (
        <GameDetail
          row={selectedRow}
          events={selectedEvents}
          onBack={() => setSelectedMatchId(null)}
          onClose={async () => {
            try {
              await callBackend(`/matches/${encodeURIComponent(selectedRow.matchId)}/close`, { method: "POST" });
              await refresh();
              setSelectedMatchId(null);
            } catch (error) {
              setLoadState((s) => ({ ...s, error: errorMessage(error) }));
            }
          }}
        />
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
                <span>Feed</span>
                <span>PDA</span>
              </div>

              {rows.map((row) => (
                <div className="games-row" key={row.matchId}>
                  <button className="game-link" type="button" onClick={() => setSelectedMatchId(row.matchId)}>
                    {row.tag || row.matchId}
                  </button>
                  <CurrentOddsBars home={row.oddsHome} away={row.oddsAway} draw={row.oddsDraw} />
                  <span className="money">{formatTokenUnits(row.totalStaked)}</span>
                  <span>{row.openBets}</span>
                  <span>{row.updatedAt ? formatUnixTime(row.updatedAt) : row.backendUpdatedAt ? new Date(row.backendUpdatedAt).toLocaleString() : "sem registro"}</span>
                  <span><SourceBadge source={row.source} /></span>
                  <span><OddsSourceBadge source={row.oddsSource} /></span>
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

function GameDetail({ row, events, onBack, onClose }: { row: GameRow; events: GameEvent[]; onBack: () => void; onClose: () => void }) {
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
            <h2>{row.tag || row.matchId}</h2>
          </div>
          <SourceBadge source={row.source} />
          <button className="danger" type="button" onClick={onClose}>
            Finalizar
          </button>
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

type TxlineFixture = {
  FixtureId: number;
  Competition?: string;
  CompetitionId?: number;
  Participant1?: string;
  Participant2?: string;
  StartTime?: number;
  [key: string]: unknown;
};

function CreateGamePanel({
  form,
  state,
  walletPublicKey,
  backendUrl,
  onConnect,
  onSubmit,
  onChange,
}: {
  form: { matchId: string; tag: string; oddsSource: string; home: string; away: string; draw: string };
  state: { busy: boolean; error: string | null; signature: string | null };
  walletPublicKey: PublicKey | null;
  backendUrl: string;
  onConnect: () => void;
  onSubmit: () => void;
  onChange: (field: "matchId" | "tag" | "oddsSource" | "home" | "away" | "draw", value: string) => void;
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
          <span>Feed</span>
          <select value={form.oddsSource} onChange={(event) => onChange("oddsSource", event.target.value)}>
            <option value="random">Random</option>
            <option value="txline-polling">TxLINE Polling</option>
            <option value="txline-realtime">TxLINE Realtime</option>
          </select>
        </label>
        {form.oddsSource.startsWith("txline") ? (
          <TxlineFixturePicker backendUrl={backendUrl} onSelect={(fixtureId, tag) => { onChange("matchId", fixtureId); onChange("tag", tag); }} />
        ) : (
          <>
            <label className="field">
              <span>Nome do jogo</span>
              <input value={form.tag} onChange={(event) => onChange("tag", event.target.value)} placeholder="Brasil vs Argentina" />
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
          </>
        )}
      </div>

      {form.oddsSource.startsWith("txline") && form.matchId ? (
        <div className="txline-selected">Fixture: <strong>{form.tag || form.matchId}</strong></div>
      ) : null}

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
          {state.busy ? "Enviando" : "Criar jogo"}
        </button>
      </div>
    </section>
  );
}

function TxlineFixturePicker({ backendUrl, onSelect }: { backendUrl: string; onSelect: (fixtureId: string, tag: string) => void }) {
  const [fixtures, setFixtures] = useState<TxlineFixture[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`${backendUrl}/fixtures`)
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status}`);
        return res.json();
      })
      .then((data: TxlineFixture[]) => {
        setFixtures(Array.isArray(data) ? data : []);
        setError(null);
        setLoading(false);
      })
      .catch((err) => {
        setFixtures([]);
        setError(err.message.includes("503") ? "Credenciais TxLINE nao configuradas no backend" : "Erro ao buscar fixtures");
        setLoading(false);
      });
  }, [backendUrl]);

  const competitions = [...new Set(fixtures.map((f) => f.Competition as string ?? ""))].filter(Boolean).sort();

  return (
    <label className="field field-wide">
      <span>Fixture TxLINE</span>
      {error ? (
        <span className="field-error">{error}</span>
      ) : (
        <select disabled={loading} onChange={(e) => {
          const fixture = fixtures.find((f) => String(f.FixtureId) === e.target.value);
          const tag = fixture && fixture.Participant1 && fixture.Participant2 ? `${fixture.Participant1} vs ${fixture.Participant2}` : "";
          onSelect(e.target.value, tag);
        }}>
          <option value="">{loading ? "Carregando..." : `${fixtures.length} jogos disponiveis`}</option>
          {competitions.map((comp) => (
            <optgroup key={comp} label={comp}>
              {fixtures.filter((f) => f.Competition === comp).map((f) => (
                <option key={f.FixtureId} value={String(f.FixtureId)}>
                  {f.Participant1 && f.Participant2 ? `${f.Participant1} vs ${f.Participant2}` : `Fixture ${f.FixtureId}`}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      )}
    </label>
  );
}

function BetPanel({
  form,
  rows,
  state,
  bets,
  walletPublicKey,
  onConnect,
  onSubmit,
  onChange,
}: {
  form: { matchId: string; direction: string; windowSecs: string; amount: string; nonce: string };
  rows: GameRow[];
  state: { busy: boolean; error: string | null; signature: string | null };
  bets: BettingViewBet[];
  walletPublicKey: PublicKey | null;
  onConnect: () => void;
  onSubmit: () => void;
  onChange: (field: "matchId" | "direction" | "windowSecs" | "amount" | "nonce", value: string) => void;
}) {
  const selected = findGameRow(rows, form.matchId);
  const bettingView = buildBettingView({ matchId: form.matchId, bets });
  const parsed = parsePlaceBetForm(form);
  const formError = parsed.ok ? null : parsed.error;

  return (
    <section className="create-panel" aria-label="Apostar">
      <div className="create-head">
        <div>
          <span className="eyebrow">Place bet</span>
          <h2>Apostar</h2>
        </div>
        <button className="secondary" type="button" onClick={onConnect}>
          {walletPublicKey ? shortenAddress(walletPublicKey.toBase58(), 5) : "Conectar wallet"}
        </button>
      </div>

      <div className="create-grid bet-grid">
        <label className="field">
          <span>Jogo</span>
          <select value={form.matchId} onChange={(event) => onChange("matchId", event.target.value)}>
            <option value="">Selecione</option>
            {rows.map((row) => (
              <option key={row.matchId} value={row.matchId}>
                {row.tag || row.matchId}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Direcao</span>
          <select value={form.direction} onChange={(event) => onChange("direction", event.target.value)}>
            <option value="0">UP</option>
            <option value="1">DOWN</option>
          </select>
        </label>
        <label className="field">
          <span>Janela</span>
          <select value={form.windowSecs} onChange={(event) => onChange("windowSecs", event.target.value)}>
            <option value="60">60s</option>
            <option value="300">300s</option>
            <option value="600">600s</option>
            <option value="900">900s</option>
          </select>
        </label>
        <label className="field">
          <span>USDC</span>
          <input inputMode="decimal" value={form.amount} onChange={(event) => onChange("amount", event.target.value)} />
        </label>
        <label className="field">
          <span>Nonce</span>
          <input inputMode="numeric" value={form.nonce} onChange={(event) => onChange("nonce", event.target.value)} />
        </label>
      </div>

      <div className="create-preview">
        {selected ? (
          <CurrentOddsBars home={selected.oddsHome} away={selected.oddsAway} draw={selected.oddsDraw} />
        ) : (
          <p className="empty-state compact">Selecione um jogo com PDA on-chain.</p>
        )}
      </div>

      {state.error || formError ? <div className="error-line inline">{state.error ?? formError}</div> : null}
      {state.signature ? <div className="success-line">Aposta enviada: {shortenAddress(state.signature, 8)}</div> : null}

      <div className="create-actions">
        <button type="button" onClick={onSubmit} disabled={state.busy || !parsed.ok}>
          {state.busy ? "Enviando" : "Apostar on-chain"}
        </button>
      </div>

      <div className="betting-board" aria-label="Apostas do jogo">
        <div className="betting-summary">
          <MetricCard label="Abertas" value={String(bettingView.summary.open)} tone="plain" />
          <MetricCard label="Resolvidas" value={String(bettingView.summary.resolved)} tone="plain" />
          <MetricCard label="Volume" value={formatTokenUnits(bettingView.summary.totalAmount)} tone="money" />
          <MetricCard label="Maior aposta" value={formatTokenUnits(bettingView.summary.largestAmount)} tone="money" />
        </div>

        <div className="bets-table">
          <div className="bets-row bets-head">
            <span>Status</span>
            <span>Direcao</span>
            <span>Valor</span>
            <span>Entrada</span>
            <span>Expira</span>
            <span>Usuario</span>
            <span>Nonce</span>
          </div>
          {bettingView.bets.map((bet) => (
            <div className="bets-row" key={bet.pda}>
              <span>
                <BetStatusPill status={bet.status} />
              </span>
              <strong>{directionLabel(bet.direction)}</strong>
              <span className="money">{formatTokenUnits(bet.amount)}</span>
              <span>{formatPercentOdds(bet.oddsAtEntry)}</span>
              <span>{formatUnixTime(bet.expiresAt)}</span>
              <code>{shortenAddress(bet.user, 5)}</code>
              <code>{bet.nonce}</code>
            </div>
          ))}
          {!form.matchId ? <p className="empty-state compact">Selecione um jogo para ver apostas.</p> : null}
          {form.matchId && bettingView.bets.length === 0 ? <p className="empty-state compact">Nenhuma aposta para este jogo ainda.</p> : null}
        </div>
      </div>
    </section>
  );
}

function PoolPanel({
  poolForm,
  depositForm,
  poolState,
  depositState,
  rows,
  walletPublicKey,
  onConnect,
  onCreatePool,
  onDeposit,
  onPoolChange,
  onDepositChange,
}: {
  poolForm: { matchId: string; feeRate: string };
  depositForm: { matchId: string; amount: string };
  poolState: { busy: boolean; error: string | null; signature: string | null };
  depositState: { busy: boolean; error: string | null; signature: string | null };
  rows: GameRow[];
  walletPublicKey: PublicKey | null;
  onConnect: () => void;
  onCreatePool: () => void;
  onDeposit: () => void;
  onPoolChange: (field: "matchId" | "feeRate", value: string) => void;
  onDepositChange: (field: "matchId" | "amount", value: string) => void;
}) {
  const poolParsed = parseCreatePoolForm(poolForm);
  const depositParsed = parseDepositForm(depositForm);

  return (
    <section className="create-panel" aria-label="Pool de liquidez">
      <div className="create-head">
        <div>
          <span className="eyebrow">Liquidity pool</span>
          <h2>Pool</h2>
        </div>
        <button className="secondary" type="button" onClick={onConnect}>
          {walletPublicKey ? shortenAddress(walletPublicKey.toBase58(), 5) : "Conectar wallet"}
        </button>
      </div>

      <h3 className="pool-section-title">Criar Pool</h3>
      <div className="create-grid">
        <label className="field">
          <span>Jogo</span>
          <select value={poolForm.matchId} onChange={(e) => onPoolChange("matchId", e.target.value)}>
            <option value="">Selecione</option>
            {rows.map((row) => (
              <option key={row.matchId} value={row.matchId}>{row.tag || row.matchId}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Taxa (bps)</span>
          <input inputMode="numeric" value={poolForm.feeRate} onChange={(e) => onPoolChange("feeRate", e.target.value)} />
        </label>
      </div>
      {poolState.error ? <div className="error-line inline">{poolState.error}</div> : null}
      {poolState.signature ? <div className="success-line">Pool criado: {shortenAddress(poolState.signature, 8)}</div> : null}
      <div className="create-actions">
        <button type="button" onClick={onCreatePool} disabled={poolState.busy || !poolParsed.ok}>
          {poolState.busy ? "Criando..." : "Criar Pool"}
        </button>
      </div>

      <hr className="pool-divider" />

      <h3 className="pool-section-title">Depositar Liquidez</h3>
      <div className="create-grid">
        <label className="field">
          <span>Jogo</span>
          <select value={depositForm.matchId} onChange={(e) => onDepositChange("matchId", e.target.value)}>
            <option value="">Selecione</option>
            {rows.map((row) => (
              <option key={row.matchId} value={row.matchId}>{row.tag || row.matchId}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>USDC</span>
          <input inputMode="decimal" value={depositForm.amount} onChange={(e) => onDepositChange("amount", e.target.value)} />
        </label>
      </div>
      {depositState.error ? <div className="error-line inline">{depositState.error}</div> : null}
      {depositState.signature ? <div className="success-line">Deposito: {shortenAddress(depositState.signature, 8)}</div> : null}
      <div className="create-actions">
        <button type="button" onClick={onDeposit} disabled={depositState.busy || !depositParsed.ok}>
          {depositState.busy ? "Depositando..." : "Depositar"}
        </button>
      </div>
    </section>
  );
}

function BetStatusPill({ status }: { status: number }) {
  const tone = status === 0 ? "open" : status === 1 ? "won" : status === 2 ? "lost" : "idle";
  return <span className={`bet-status ${tone}`}>{betStatusLabel(status)}</span>;
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
        <div className="trading-bars">
          {series.map((item) => (
            <div className={`trading-bar ${item.key}`} key={item.key}>
              <span className="bar-value">{item.displayValue}</span>
              <span className="bar-fill" style={{ height: `${item.value / 100}%` }} />
              <span className="bar-label">{item.label}</span>
            </div>
          ))}
        </div>
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

function OddsSourceBadge({ source }: { source: "random" | "txline-polling" | "txline-realtime" }) {
  const labels: Record<string, string> = { random: "Random", "txline-polling": "TxLINE Poll", "txline-realtime": "TxLINE RT" };
  return <span className={`source-badge odds-${source}`}>{labels[source] ?? source}</span>;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    const logs = errorLogs(error);
    return logs.length > 0 ? `${error.message} | logs: ${logs.join(" | ")}` : error.message;
  }

  return String(error);
}

function errorLogs(error: Error): string[] {
  const maybeLogs = (error as Error & { logs?: unknown }).logs;
  return Array.isArray(maybeLogs) ? maybeLogs.map(String) : [];
}

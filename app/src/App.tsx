import { useCallback, useEffect, useMemo, useState } from "react";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import {
  BETTING_ENGINE_PROGRAM_ID,
  BetAccount,
  Direction,
  MatchAccount,
  OddsInput,
  PROGRAM_ID,
  TEST_USDC_MINT,
  TESTNET_RPC_URL,
  buildCreateAssociatedTokenAccountInstruction,
  buildMatchAccountFilters,
  buildMintToInstruction,
  buildPlaceBetInstruction,
  buildSettleBetInstruction,
  buildUpdateOddsInstruction,
  buildUserBetFilters,
  decodeBetAccount,
  decodeMatchAccount,
  deriveAssociatedTokenAddress,
  deriveMatchPda,
  deriveVaultAuthorityPda,
  formatTokenUnits,
  oddsAreValid,
  oddsSum,
  parseAnchorEventFromLogs,
  resolveWalletPublicKey,
  usdcToUnits,
} from "./testnetOracle";

type BrowserWallet = {
  isPhantom?: boolean;
  isSolflare?: boolean;
  publicKey?: PublicKey;
  connect: () => Promise<{ publicKey?: PublicKey } | void>;
  disconnect?: () => Promise<void>;
  signTransaction?: (transaction: Transaction) => Promise<Transaction>;
  signAndSendTransaction?: (transaction: Transaction) => Promise<{ signature: string }>;
};

declare global {
  interface Window {
    solana?: BrowserWallet;
    solflare?: BrowserWallet;
  }
}

type CheckState = "idle" | "pass" | "fail" | "blocked";

type Check = {
  label: string;
  state: CheckState;
  detail: string;
};

type LogEntry = {
  title: string;
  body: string;
  kind: "info" | "success" | "error";
};

type ListedBet = {
  pda: PublicKey;
  account: BetAccount;
};

type ListedMatch = {
  pda: PublicKey;
  account: MatchAccount;
};

type BalanceSnapshot = {
  walletAta: PublicKey | null;
  walletBalance: bigint | null;
  vaultAta: PublicKey | null;
  vaultBalance: bigint | null;
};

type BackendSnapshot = {
  ok?: boolean;
  poller?: { running?: boolean; lastRunAt?: string | null };
  settlement?: { running?: boolean; lastRunAt?: string | null };
  matches?: Array<{ id: string; odds: OddsInput; updatedAt?: string }>;
  txs?: Array<Record<string, unknown>>;
  errors?: Array<{ at?: string; message: string }>;
};

const initialChecks: Check[] = [
  { label: "Create match", state: "idle", detail: "Run update_odds on a new match ID." },
  { label: "Update odds", state: "idle", detail: "Run update_odds again on the same PDA." },
  { label: "Reject invalid odds", state: "idle", detail: "Submit odds that do not sum to 10000." },
  { label: "Reject unauthorized signer", state: "idle", detail: "Try updating a match owned by another wallet." },
];

function App() {
  const connection = useMemo(() => new Connection(TESTNET_RPC_URL, "confirmed"), []);
  const [walletProvider, setWalletProvider] = useState<BrowserWallet | null>(null);
  const [walletPublicKey, setWalletPublicKey] = useState<PublicKey | null>(null);
  const [matchId, setMatchId] = useState(() => `browser_demo_${Date.now()}`);
  const [odds, setOdds] = useState<OddsInput>({ home: 6500, away: 3000, draw: 500 });
  const [checks, setChecks] = useState<Check[]>(initialChecks);
  const [account, setAccount] = useState<MatchAccount | null>(null);
  const [testMint, setTestMint] = useState(TEST_USDC_MINT.toBase58());
  const [direction, setDirection] = useState<Direction>(0);
  const [windowSecs, setWindowSecs] = useState(60);
  const [betAmount, setBetAmount] = useState("1");
  const [nonce, setNonce] = useState(() => Math.floor(Date.now() / 1000));
  const [settleOdds, setSettleOdds] = useState(6700);
  const [bets, setBets] = useState<ListedBet[]>([]);
  const [matches, setMatches] = useState<ListedMatch[]>([]);
  const [backendUrl, setBackendUrl] = useState("http://localhost:8787");
  const [backendFramePath, setBackendFramePath] = useState("/status");
  const [backendStatus, setBackendStatus] = useState<BackendSnapshot | null>(null);
  const [backendReachable, setBackendReachable] = useState<boolean | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const [balances, setBalances] = useState<BalanceSnapshot>({
    walletAta: null,
    walletBalance: null,
    vaultAta: null,
    vaultBalance: null,
  });
  const [isBusy, setIsBusy] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([
    {
      title: "Ready",
      body: "Install Phantom or Solflare for Chrome, set it to testnet, then connect.",
      kind: "info",
    },
  ]);

  const matchPda = useMemo(() => deriveMatchPda(matchId), [matchId]);
  const sum = oddsSum(odds);
  const hasWallet = Boolean(walletPublicKey && walletProvider);
  const parsedMint = useMemo(() => {
    if (!testMint.trim()) {
      return null;
    }

    try {
      return new PublicKey(testMint.trim());
    } catch {
      return null;
    }
  }, [testMint]);

  const pushLog = useCallback((entry: LogEntry) => {
    setLog((items) => [entry, ...items].slice(0, 8));
  }, []);

  const markCheck = useCallback((label: string, state: CheckState, detail: string) => {
    setChecks((items) =>
      items.map((item) => (item.label === label ? { ...item, state, detail } : item)),
    );
  }, []);

  const connectWallet = useCallback(
    async (kind: "phantom" | "solflare") => {
      const provider = kind === "phantom" ? window.solana : window.solflare;
      if (!provider) {
        pushLog({
          title: `${kind} not found`,
          body: "Install the Chrome extension, switch it to testnet, then reload this page.",
          kind: "error",
        });
        return;
      }

      const result = await provider.connect();
      const publicKey = resolveWalletPublicKey(result?.publicKey, provider.publicKey);
      setWalletProvider(provider);
      setWalletPublicKey(publicKey);
      pushLog({
        title: "Wallet connected",
        body: publicKey.toBase58(),
        kind: "success",
      });
    },
    [pushLog],
  );

  const fetchMatch = useCallback(async () => {
    const info = await connection.getAccountInfo(matchPda, "confirmed");
    if (!info) {
      setAccount(null);
      pushLog({
        title: "PDA not found",
        body: matchPda.toBase58(),
        kind: "info",
      });
      return null;
    }

    const decoded = decodeMatchAccount(info.data);
    setAccount(decoded);
    pushLog({
      title: "Match account fetched",
      body: `${decoded.matchId}: ${decoded.oddsHome}/${decoded.oddsAway}/${decoded.oddsDraw}`,
      kind: "success",
    });
    return decoded;
  }, [connection, matchPda, pushLog]);

  const sendTransaction = useCallback(
    async (transaction: Transaction) => {
      if (!walletPublicKey || !walletProvider) {
        throw new Error("Connect a wallet first.");
      }

      const latestBlockhash = await connection.getLatestBlockhash("confirmed");
      transaction.feePayer = walletPublicKey;
      transaction.recentBlockhash = latestBlockhash.blockhash;

      let signature: string;
      if (walletProvider.signAndSendTransaction) {
        signature = (await walletProvider.signAndSendTransaction(transaction)).signature;
      } else if (walletProvider.signTransaction) {
        const signed = await walletProvider.signTransaction(transaction);
        signature = await connection.sendRawTransaction(signed.serialize());
      } else {
        throw new Error("Connected wallet cannot sign transactions.");
      }

      await connection.confirmTransaction(
        {
          signature,
          blockhash: latestBlockhash.blockhash,
          lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        },
        "confirmed",
      );

      return signature;
    },
    [connection, walletProvider, walletPublicKey],
  );

  const sendUpdateOdds = useCallback(
    async (nextOdds: OddsInput) => {
      if (!walletPublicKey) {
        throw new Error("Connect a wallet first.");
      }

      return sendTransaction(
        new Transaction().add(buildUpdateOddsInstruction(walletPublicKey, matchId, nextOdds)),
      );
    },
    [matchId, sendTransaction, walletPublicKey],
  );

  const refreshBalances = useCallback(async () => {
    setIsBusy(true);
    try {
      if (!walletPublicKey) {
        throw new Error("Connect a wallet first.");
      }
      if (!parsedMint) {
        throw new Error("Enter a valid test USDC mint.");
      }

      const walletAta = deriveAssociatedTokenAddress(walletPublicKey, parsedMint);
      const vaultAta = deriveAssociatedTokenAddress(deriveVaultAuthorityPda(matchId), parsedMint);

      const [walletToken, vaultToken] = await Promise.all([
        readTokenBalance(connection, walletAta),
        readTokenBalance(connection, vaultAta),
      ]);

      setBalances({
        walletAta,
        walletBalance: walletToken,
        vaultAta,
        vaultBalance: vaultToken,
      });
      pushLog({
        title: "Balances refreshed",
        body: `Wallet ${formatBalance(walletToken)} / vault ${formatBalance(vaultToken)}`,
        kind: "success",
      });
    } catch (error) {
      pushLog({
        title: "balance refresh failed",
        body: error instanceof Error ? error.message : String(error),
        kind: "error",
      });
    } finally {
      setIsBusy(false);
    }
  }, [connection, matchId, parsedMint, pushLog, walletPublicKey]);

  const listMatches = useCallback(async () => {
    setIsBusy(true);
    try {
      const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
        commitment: "confirmed",
        filters: buildMatchAccountFilters(),
      });
      const decoded = accounts
        .map(({ pubkey, account: matchAccount }) => ({
          pda: pubkey,
          account: decodeMatchAccount(matchAccount.data),
        }))
        .sort((left, right) => Number(right.account.updatedAt - left.account.updatedAt));

      setMatches(decoded);
      pushLog({ title: "Matches listed", body: `${decoded.length} match(es) found.`, kind: "success" });
    } catch (error) {
      pushLog({
        title: "list matches failed",
        body: error instanceof Error ? error.message : String(error),
        kind: "error",
      });
    } finally {
      setIsBusy(false);
    }
  }, [connection, pushLog]);

  const selectMatch = useCallback(
    (listed: ListedMatch) => {
      setMatchId(listed.account.matchId);
      setAccount(listed.account);
      pushLog({
        title: "Match selected",
        body: `${listed.account.matchId} / ${listed.pda.toBase58()}`,
        kind: "info",
      });
    },
    [pushLog],
  );

  const runCreateOrUpdate = useCallback(async () => {
    setIsBusy(true);
    try {
      const existed = Boolean(await connection.getAccountInfo(matchPda, "confirmed"));
      const signature = await sendUpdateOdds(odds);
      const decoded = await fetchMatch();
      const label = existed ? "Update odds" : "Create match";
      markCheck(label, "pass", `Confirmed: ${signature}`);
      if (walletPublicKey && decoded?.authority.equals(walletPublicKey)) {
        pushLog({
          title: existed ? "Odds updated" : "Match created",
          body: `Tx ${signature}`,
          kind: "success",
        });
      }
    } catch (error) {
      pushLog({
        title: "update_odds failed",
        body: error instanceof Error ? error.message : String(error),
        kind: "error",
      });
    } finally {
      setIsBusy(false);
    }
  }, [
    connection,
    fetchMatch,
    markCheck,
    matchPda,
    odds,
    pushLog,
    sendUpdateOdds,
    walletPublicKey,
  ]);

  const runInvalidOdds = useCallback(async () => {
    setIsBusy(true);
    const invalidOdds = { home: 6500, away: 3000, draw: 600 };

    try {
      await sendUpdateOdds(invalidOdds);
      markCheck("Reject invalid odds", "fail", "Transaction unexpectedly succeeded.");
      pushLog({
        title: "Invalid odds were accepted",
        body: "Expected InvalidOddsSum, but the transaction confirmed.",
        kind: "error",
      });
    } catch (error) {
      markCheck("Reject invalid odds", "pass", "Program rejected odds sum 10100.");
      pushLog({
        title: "Invalid odds rejected",
        body: error instanceof Error ? error.message : String(error),
        kind: "success",
      });
    } finally {
      setIsBusy(false);
    }
  }, [markCheck, pushLog, sendUpdateOdds]);

  const runUnauthorized = useCallback(async () => {
    setIsBusy(true);
    try {
      const decoded = account ?? (await fetchMatch());
      if (!decoded) {
        markCheck("Reject unauthorized signer", "blocked", "Create or fetch an existing match first.");
        return;
      }

      if (!walletPublicKey || decoded.authority.equals(walletPublicKey)) {
        markCheck(
          "Reject unauthorized signer",
          "blocked",
          "Connect a different wallet than the account authority, then run this test.",
        );
        return;
      }

      try {
        await sendUpdateOdds(odds);
        markCheck("Reject unauthorized signer", "fail", "Unauthorized update unexpectedly succeeded.");
      } catch (error) {
        markCheck("Reject unauthorized signer", "pass", "Program rejected non-authority signer.");
        pushLog({
          title: "Unauthorized signer rejected",
          body: error instanceof Error ? error.message : String(error),
          kind: "success",
        });
      }
    } finally {
      setIsBusy(false);
    }
  }, [account, fetchMatch, markCheck, odds, sendUpdateOdds, walletPublicKey]);

  const placeBet = useCallback(async () => {
    setIsBusy(true);
    try {
      if (!walletPublicKey) {
        throw new Error("Connect a wallet first.");
      }
      if (!account) {
        throw new Error("Fetch or create the Match PDA first.");
      }
      if (!parsedMint) {
        throw new Error("Enter a valid test USDC mint.");
      }

      const amount = usdcToUnits(betAmount);
      if (amount < 1_000_000n) {
        throw new Error("Minimum bet is 1 test USDC.");
      }

      const userTokenAccount = deriveAssociatedTokenAddress(walletPublicKey, parsedMint);
      const tokenInfo = await connection.getAccountInfo(userTokenAccount, "confirmed");
      const transaction = new Transaction();
      if (!tokenInfo) {
        transaction.add(
          buildCreateAssociatedTokenAccountInstruction(walletPublicKey, walletPublicKey, parsedMint),
        );
      }
      transaction.add(
        buildPlaceBetInstruction(walletPublicKey, matchId, parsedMint, {
          direction,
          windowSecs,
          amount,
          nonce,
        }),
      );

      const signature = await sendTransaction(transaction);
      pushLog({ title: "Bet placed", body: `Tx ${signature}`, kind: "success" });
      setNonce((current) => current + 1);
      await refreshBalances();
    } catch (error) {
      pushLog({
        title: "place_bet failed",
        body: error instanceof Error ? error.message : String(error),
        kind: "error",
      });
    } finally {
      setIsBusy(false);
    }
  }, [
    account,
    betAmount,
    connection,
    direction,
    matchId,
    nonce,
    parsedMint,
    pushLog,
    refreshBalances,
    sendTransaction,
    walletPublicKey,
    windowSecs,
  ]);

  const fetchBets = useCallback(async () => {
    setIsBusy(true);
    try {
      if (!walletPublicKey) {
        throw new Error("Connect a wallet first.");
      }

      const accounts = await connection.getProgramAccounts(BETTING_ENGINE_PROGRAM_ID, {
        commitment: "confirmed",
        filters: buildUserBetFilters(walletPublicKey),
      });
      const decoded = accounts.map(({ pubkey, account: betAccount }) => ({
        pda: pubkey,
        account: decodeBetAccount(betAccount.data),
      }));
      setBets(decoded);
      pushLog({ title: "Bets fetched", body: `${decoded.length} bet(s) found.`, kind: "success" });
    } catch (error) {
      pushLog({
        title: "fetch bets failed",
        body: error instanceof Error ? error.message : String(error),
        kind: "error",
      });
    } finally {
      setIsBusy(false);
    }
  }, [connection, pushLog, walletPublicKey]);

  useEffect(() => {
    const oracleListener = connection.onLogs(PROGRAM_ID, (logs) => {
      const event = parseAnchorEventFromLogs(logs.logs);
      if (event?.type !== "OddsUpdated") {
        void fetchMatch();
        return;
      }
      if (event.matchId !== matchId) {
        return;
      }

      setAccount((current) => ({
        authority: event.authority,
        matchId: event.matchId,
        oddsHome: event.oddsHome,
        oddsAway: event.oddsAway,
        oddsDraw: event.oddsDraw,
        updatedAt: event.updatedAt,
        bump: current?.bump ?? 0,
      }));
      setOdds({ home: event.oddsHome, away: event.oddsAway, draw: event.oddsDraw });
      pushLog({
        title: "Realtime odds",
        body: `${event.matchId}: ${event.oddsHome}/${event.oddsAway}/${event.oddsDraw}`,
        kind: "success",
      });
    }, "confirmed");

    const bettingListener = connection.onLogs(BETTING_ENGINE_PROGRAM_ID, (logs) => {
      const event = parseAnchorEventFromLogs(logs.logs);
      if (!walletPublicKey) {
        return;
      }
      if (event?.type !== "BetSettled") {
        void fetchBets();
        return;
      }
      if (!event.user.equals(walletPublicKey)) {
        return;
      }

      void fetchBets();
      pushLog({
        title: "Realtime settlement",
        body: `${event.matchId}: ${event.won ? "won" : "lost"} at ${event.oddsAtExpiryHome}`,
        kind: "success",
      });
    }, "confirmed");

    return () => {
      void connection.removeOnLogsListener(oracleListener);
      void connection.removeOnLogsListener(bettingListener);
    };
  }, [connection, fetchBets, fetchMatch, matchId, pushLog, walletPublicKey]);

  const settleBet = useCallback(
    async (bet: ListedBet) => {
      setIsBusy(true);
      try {
        if (!walletPublicKey) {
          throw new Error("Connect a wallet first.");
        }
        if (!parsedMint) {
          throw new Error("Enter a valid test USDC mint.");
        }

        const signature = await sendTransaction(
          new Transaction().add(
            buildSettleBetInstruction(
              walletPublicKey,
              bet.account.user,
              bet.account.matchId,
              parsedMint,
              bet.account.nonce,
              settleOdds,
            ),
          ),
        );
        pushLog({ title: "Bet settled", body: `Tx ${signature}`, kind: "success" });
        await fetchBets();
        await refreshBalances();
      } catch (error) {
        pushLog({
          title: "settle_bet failed",
          body: error instanceof Error ? error.message : String(error),
          kind: "error",
        });
      } finally {
        setIsBusy(false);
      }
    },
    [fetchBets, parsedMint, pushLog, refreshBalances, sendTransaction, settleOdds, walletPublicKey],
  );

  const createWalletTokenAccount = useCallback(async () => {
    setIsBusy(true);
    try {
      if (!walletPublicKey) {
        throw new Error("Connect a wallet first.");
      }
      if (!parsedMint) {
        throw new Error("Enter a valid test USDC mint.");
      }

      const userTokenAccount = deriveAssociatedTokenAddress(walletPublicKey, parsedMint);
      const tokenInfo = await connection.getAccountInfo(userTokenAccount, "confirmed");
      if (tokenInfo) {
        pushLog({
          title: "Token account already exists",
          body: userTokenAccount.toBase58(),
          kind: "info",
        });
        await refreshBalances();
        return;
      }

      const signature = await sendTransaction(
        new Transaction().add(
          buildCreateAssociatedTokenAccountInstruction(walletPublicKey, walletPublicKey, parsedMint),
        ),
      );
      pushLog({ title: "Token account created", body: `Tx ${signature}`, kind: "success" });
      await refreshBalances();
    } catch (error) {
      pushLog({
        title: "create token account failed",
        body: error instanceof Error ? error.message : String(error),
        kind: "error",
      });
    } finally {
      setIsBusy(false);
    }
  }, [connection, parsedMint, pushLog, refreshBalances, sendTransaction, walletPublicKey]);

  const mintToWallet = useCallback(async () => {
    setIsBusy(true);
    try {
      if (!walletPublicKey) {
        throw new Error("Connect a wallet first.");
      }
      if (!parsedMint) {
        throw new Error("Enter a valid test USDC mint.");
      }

      const userTokenAccount = deriveAssociatedTokenAddress(walletPublicKey, parsedMint);
      const tokenInfo = await connection.getAccountInfo(userTokenAccount, "confirmed");
      const transaction = new Transaction();
      if (!tokenInfo) {
        transaction.add(
          buildCreateAssociatedTokenAccountInstruction(walletPublicKey, walletPublicKey, parsedMint),
        );
      }
      transaction.add(buildMintToInstruction(parsedMint, userTokenAccount, walletPublicKey, 100_000_000n));

      const signature = await sendTransaction(transaction);
      pushLog({ title: "Dev test USDC minted", body: `Tx ${signature}`, kind: "success" });
      await refreshBalances();
    } catch (error) {
      pushLog({
        title: "dev mint failed",
        body: error instanceof Error ? error.message : String(error),
        kind: "error",
      });
    } finally {
      setIsBusy(false);
    }
  }, [connection, parsedMint, pushLog, refreshBalances, sendTransaction, walletPublicKey]);

  const callBackend = useCallback(
    async (path: string, init?: RequestInit) => {
      const response = await fetch(`${backendUrl}${path}`, init);
      if (!response.ok) {
        throw new Error(`${path} returned ${response.status}`);
      }
      return response.json() as Promise<BackendSnapshot>;
    },
    [backendUrl],
  );

  const checkBackendHealth = useCallback(async () => {
    setIsBusy(true);
    try {
      const health = await callBackend("/health");
      setBackendReachable(Boolean(health.ok));
      pushLog({ title: "Backend health", body: `${backendUrl}/health OK`, kind: "success" });
    } catch (error) {
      setBackendReachable(false);
      pushLog({
        title: "backend health failed",
        body: error instanceof Error ? error.message : String(error),
        kind: "error",
      });
    } finally {
      setIsBusy(false);
    }
  }, [backendUrl, callBackend, pushLog]);

  const fetchBackendStatus = useCallback(async () => {
    setIsBusy(true);
    try {
      const status = await callBackend("/status");
      setBackendStatus(status);
      setBackendReachable(true);
      pushLog({ title: "Backend status fetched", body: `${status.txs?.length ?? 0} tx(s) tracked`, kind: "success" });
    } catch (error) {
      setBackendReachable(false);
      pushLog({
        title: "backend status failed",
        body: error instanceof Error ? error.message : String(error),
        kind: "error",
      });
    } finally {
      setIsBusy(false);
    }
  }, [callBackend, pushLog]);

  const postBackendAction = useCallback(
    async (path: string, title: string) => {
      setIsBusy(true);
      try {
        const result = await callBackend(path, { method: "POST" });
        pushLog({ title, body: JSON.stringify(result), kind: "success" });
        await fetchBackendStatus();
      } catch (error) {
        setBackendReachable(false);
        pushLog({
          title: `${title} failed`,
          body: error instanceof Error ? error.message : String(error),
          kind: "error",
        });
      } finally {
        setIsBusy(false);
      }
    },
    [callBackend, fetchBackendStatus, pushLog],
  );

  const updateOddsField = (field: keyof OddsInput, value: string) => {
    const parsed = Number(value);
    setOdds((current) => ({
      ...current,
      [field]: Number.isFinite(parsed) ? parsed : 0,
    }));
  };

  const flowSteps = [
    {
      label: "Connect wallet",
      state: hasWallet ? "pass" : "idle",
      detail: walletPublicKey ? shorten(walletPublicKey.toBase58()) : "Phantom or Solflare on testnet",
    },
    {
      label: "Load match",
      state: account ? "pass" : "idle",
      detail: account ? `${account.oddsHome}/${account.oddsAway}/${account.oddsDraw}` : "Fetch or create a match PDA",
    },
    {
      label: "Update odds",
      state: checks.some((check) => check.label === "Update odds" && check.state === "pass") ? "pass" : "idle",
      detail: oddsAreValid(odds) ? "ready" : `sum ${sum}`,
    },
    {
      label: "Place bet",
      state: bets.length > 0 ? "pass" : "idle",
      detail: bets.length > 0 ? `${bets.length} bet(s)` : "fund wallet and place a bet",
    },
    {
      label: "Settle",
      state: bets.some((bet) => bet.account.status !== 0) ? "pass" : "idle",
      detail: "manual or backend worker",
    },
  ] satisfies Array<{ label: string; state: CheckState; detail: string }>;

  return (
    <main className="app-shell">
      <section className="backoffice-header">
        <div>
          <p className="kicker">FutOdds Backoffice</p>
          <h1>Test console</h1>
          <p className="subtitle">Validate oracle updates, bet placement, settlement, and canonical Solana realtime.</p>
        </div>
        <div className="wallet-actions">
          <button type="button" onClick={() => void connectWallet("phantom")}>
            Phantom
          </button>
          <button type="button" onClick={() => void connectWallet("solflare")}>
            Solflare
          </button>
        </div>
      </section>

      <section className="status-strip">
        <StatusItem label="Cluster" value="testnet" />
        <StatusItem label="Oracle" value={shorten(PROGRAM_ID.toBase58())} />
        <StatusItem label="Betting" value={shorten(BETTING_ENGINE_PROGRAM_ID.toBase58())} />
        <StatusItem label="Backend" value={backendReachable === null ? "not checked" : backendReachable ? "online" : "offline"} />
        <StatusItem label="Wallet" value={walletPublicKey ? shorten(walletPublicKey.toBase58()) : "not connected"} />
        <StatusItem label="Wallet USDC" value={formatBalance(balances.walletBalance)} />
        <StatusItem label="Vault USDC" value={formatBalance(balances.vaultBalance)} />
        <StatusItem label="Odds sum" value={`${sum} ${oddsAreValid(odds) ? "OK" : "INVALID"}`} />
      </section>

      <section className="flow-panel">
        {flowSteps.map((step, index) => (
          <div className={`flow-step ${step.state}`} key={step.label}>
            <span>{index + 1}</span>
            <strong>{step.label}</strong>
            <p>{step.detail}</p>
          </div>
        ))}
      </section>

      <section className="backoffice-grid">
        <div className="panel primary-panel">
          <div className="panel-header">
            <div>
              <p className="section-label">Step 2-3</p>
              <h2>Match + Oracle</h2>
            </div>
            <div className="panel-header-actions">
              <button className="ghost-button" type="button" onClick={() => void fetchMatch()}>
                Fetch match
              </button>
              <button className="ghost-button" type="button" disabled={isBusy} onClick={() => void listMatches()}>
                List matches
              </button>
            </div>
          </div>

          <label className="field">
            <span>Match ID</span>
            <input value={matchId} onChange={(event) => setMatchId(event.target.value)} />
          </label>

          <div className="odds-board">
            <Metric label="Home" value={String(odds.home)} />
            <Metric label="Away" value={String(odds.away)} />
            <Metric label="Draw" value={String(odds.draw)} />
          </div>

          <div className="odds-grid">
            <label className="field">
              <span>Home</span>
              <input type="number" min="0" max="10000" value={odds.home} onChange={(event) => updateOddsField("home", event.target.value)} />
            </label>
            <label className="field">
              <span>Away</span>
              <input type="number" min="0" max="10000" value={odds.away} onChange={(event) => updateOddsField("away", event.target.value)} />
            </label>
            <label className="field">
              <span>Draw</span>
              <input type="number" min="0" max="10000" value={odds.draw} onChange={(event) => updateOddsField("draw", event.target.value)} />
            </label>
          </div>

          <div className="button-row">
            <button disabled={!hasWallet || isBusy || !oddsAreValid(odds)} onClick={() => void runCreateOrUpdate()}>
              Create or update odds
            </button>
            <button disabled={!hasWallet || isBusy} onClick={() => void runInvalidOdds()}>
              Invalid odds test
            </button>
            <button disabled={!hasWallet || isBusy} onClick={() => void runUnauthorized()}>
              Unauthorized test
            </button>
          </div>

          <div className="data-line">
            <span>Match PDA</span>
            <code>{matchPda.toBase58()}</code>
          </div>
        </div>

        <div className="panel backend-panel">
          <div className="panel-header">
            <div>
              <p className="section-label">Backend</p>
              <h2>Poller + Worker</h2>
            </div>
            <span className={`health-pill ${backendReachable ? "online" : backendReachable === false ? "offline" : ""}`}>
              {backendReachable === null ? "not checked" : backendReachable ? "online" : "offline"}
            </span>
          </div>

          <label className="field">
            <span>Backend URL</span>
            <input value={backendUrl} onChange={(event) => setBackendUrl(event.target.value)} />
          </label>

          <div className="button-grid">
            <button className="ghost-button" type="button" disabled={isBusy} onClick={() => void checkBackendHealth()}>
              Health
            </button>
            <button className="ghost-button" type="button" disabled={isBusy} onClick={() => void fetchBackendStatus()}>
              Status
            </button>
            <button type="button" disabled={isBusy} onClick={() => void postBackendAction("/poller/start", "Poller started")}>
              Start poller
            </button>
            <button className="ghost-button" type="button" disabled={isBusy} onClick={() => void postBackendAction("/poller/stop", "Poller stopped")}>
              Stop poller
            </button>
            <button className="wide-button" type="button" disabled={isBusy} onClick={() => void postBackendAction("/settlement/run-once", "Settlement run")}>
              Run settlement once
            </button>
          </div>

          <div className="backend-summary">
            <Metric label="Poller" value={backendStatus?.poller?.running ? "running" : "stopped"} />
            <Metric label="Tracked txs" value={String(backendStatus?.txs?.length ?? 0)} />
            <Metric label="Errors" value={String(backendStatus?.errors?.length ?? 0)} />
          </div>
        </div>
      </section>

      <section className="backoffice-grid">
        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="section-label">Step 1</p>
              <h2>Wallet + Tokens</h2>
            </div>
            <button className="ghost-button" type="button" disabled={!hasWallet || isBusy || !parsedMint} onClick={() => void refreshBalances()}>
              Refresh balances
            </button>
          </div>

          <label className="field">
            <span>Test USDC mint</span>
            <input value={testMint} onChange={(event) => setTestMint(event.target.value)} placeholder="Mint address on testnet" />
          </label>

          <div className="resource-grid">
            <ResourceItem label="Wallet ATA" address={balances.walletAta?.toBase58() ?? "not checked"} value={formatBalance(balances.walletBalance)} />
            <ResourceItem label="Escrow vault ATA" address={balances.vaultAta?.toBase58() ?? "not checked"} value={formatBalance(balances.vaultBalance)} />
          </div>
          <div className="button-row">
            <button disabled={!hasWallet || isBusy || !parsedMint} onClick={() => void createWalletTokenAccount()}>
              Create token account
            </button>
            <button className="dev-button" disabled={!hasWallet || isBusy || !parsedMint} onClick={() => void mintToWallet()}>
              Dev: mint test USDC
            </button>
          </div>
          <p className="helper-text">
            Vault funding is not exposed here. Real product liquidity belongs in the pool phase.
          </p>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="section-label">Step 4-5</p>
              <h2>Bet Testing</h2>
            </div>
            <button className="ghost-button" type="button" disabled={!hasWallet || isBusy} onClick={() => void fetchBets()}>
              Fetch bets
            </button>
          </div>

          <div className="odds-grid">
            <label className="field">
              <span>Direction</span>
              <select value={direction} onChange={(event) => setDirection(Number(event.target.value) as Direction)}>
                <option value={0}>UP</option>
                <option value={1}>DOWN</option>
              </select>
            </label>
            <label className="field">
              <span>Window</span>
              <select value={windowSecs} onChange={(event) => setWindowSecs(Number(event.target.value))}>
                <option value={60}>60s</option>
                <option value={300}>300s</option>
                <option value={600}>600s</option>
                <option value={900}>900s</option>
              </select>
            </label>
            <label className="field">
              <span>Amount</span>
              <input value={betAmount} onChange={(event) => setBetAmount(event.target.value)} />
            </label>
          </div>

          <div className="odds-grid">
            <label className="field">
              <span>Nonce</span>
              <input type="number" value={nonce} onChange={(event) => setNonce(Number(event.target.value))} />
            </label>
            <label className="field">
              <span>Settle odds</span>
              <input type="number" min="0" max="10000" value={settleOdds} onChange={(event) => setSettleOdds(Number(event.target.value))} />
            </label>
            <div className="field derived-field">
              <span>Escrow authority</span>
              <strong>{parsedMint ? shorten(deriveVaultAuthorityPda(matchId).toBase58()) : "mint required"}</strong>
            </div>
          </div>

          <div className="button-row">
            <button disabled={!hasWallet || isBusy || !account || !parsedMint} onClick={() => void placeBet()}>
              Place bet
            </button>
            <button className="ghost-button" disabled={!hasWallet || isBusy || !parsedMint} onClick={() => void refreshBalances()}>
              Refresh balances
            </button>
          </div>
        </div>
      </section>

      <section className="backoffice-grid">
        <div className="panel realtime-panel">
          <div className="panel-header">
            <div>
              <p className="section-label">Realtime</p>
              <h2>Event Feed</h2>
            </div>
            <span className="small-label">latest first</span>
          </div>
          <div className="log-list">
            {log.map((entry, index) => (
              <article className={`log-entry ${entry.kind}`} key={`${entry.title}-${index}`}>
                <strong>{entry.title}</strong>
                <p>{entry.body}</p>
              </article>
            ))}
          </div>
        </div>

        <div className="panel checks-panel">
          <div className="panel-header">
            <div>
              <p className="section-label">Assertions</p>
              <h2>Program Checks</h2>
            </div>
            <span className="small-label">oracle constraints</span>
          </div>
          <div className="checks">
            {checks.map((check) => (
              <div className={`check ${check.state}`} key={check.label}>
                <span>{stateLabel(check.state)}</span>
                <strong>{check.label}</strong>
                <p>{check.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="panel backend-frame-panel">
        <div className="panel-header">
          <div>
            <p className="section-label">Backend view</p>
            <h2>Embedded API responses</h2>
          </div>
          <div className="panel-header-actions">
            <button className="ghost-button" type="button" onClick={() => setBackendFramePath("/health")}>
              Health
            </button>
            <button className="ghost-button" type="button" onClick={() => setBackendFramePath("/status")}>
              Status
            </button>
            <button className="ghost-button" type="button" onClick={() => setBackendFramePath("/matches")}>
              Matches
            </button>
          </div>
        </div>
        <div className="iframe-toolbar">
          <code>{`${backendUrl}${backendFramePath}`}</code>
          <a href={`${backendUrl}${backendFramePath}`} target="_blank" rel="noreferrer">
            Open
          </a>
        </div>
        <iframe className="backend-frame" title="Backend API response" src={`${backendUrl}${backendFramePath}`} />
      </section>

      <section className="debug-section">
        <button className="debug-toggle" type="button" onClick={() => setDebugOpen((current) => !current)}>
          {debugOpen ? "Hide debug data" : "Show debug data"}
        </button>

        {debugOpen ? (
          <div className="debug-grid">
            <div className="panel account-panel">
              <div className="panel-header">
                <h2>Match PDA</h2>
                <span className="mono">{shorten(matchPda.toBase58())}</span>
              </div>
              <pre>{formatAccount(account, matchPda.toBase58())}</pre>
            </div>

            <div className="panel">
              <div className="panel-header">
                <h2>Listed matches</h2>
                <span className="small-label">{matches.length} found</span>
              </div>
              <div className="match-list">
                {matches.length === 0 ? (
                  <pre>{JSON.stringify({ status: "not listed" }, null, 2)}</pre>
                ) : (
                  matches.map((listed) => (
                    <article className="match-entry" key={listed.pda.toBase58()}>
                      <button className="ghost-button" type="button" onClick={() => selectMatch(listed)}>
                        Select
                      </button>
                      <div>
                        <strong>{listed.account.matchId}</strong>
                        <span>
                          {listed.account.oddsHome}/{listed.account.oddsAway}/{listed.account.oddsDraw}
                        </span>
                        <code>{shorten(listed.pda.toBase58())}</code>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </div>

            <div className="panel account-panel">
              <div className="panel-header">
                <h2>Bet accounts</h2>
                <span className="small-label">{bets.length} found</span>
              </div>
              <div className="bet-list">
                {bets.length === 0 ? (
                  <pre>{JSON.stringify({ status: "not fetched" }, null, 2)}</pre>
                ) : (
                  bets.map((bet) => (
                    <article className="bet-entry" key={bet.pda.toBase58()}>
                      <pre>{formatBet(bet)}</pre>
                      <button disabled={!hasWallet || isBusy || bet.account.status !== 0 || !parsedMint} onClick={() => void settleBet(bet)}>
                        Settle
                      </button>
                    </article>
                  ))
                )}
              </div>
            </div>

            <div className="panel account-panel">
              <div className="panel-header">
                <h2>Backend raw</h2>
                <span className="small-label">status JSON</span>
              </div>
              <pre>{JSON.stringify(backendStatus ?? { status: "not fetched" }, null, 2)}</pre>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function StatusItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="status-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ResourceItem({ label, address, value }: { label: string; address: string; value: string }) {
  return (
    <div className="resource-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <code>{address}</code>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function shorten(value: string) {
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

async function readTokenBalance(connection: Connection, tokenAccount: PublicKey): Promise<bigint | null> {
  const info = await connection.getAccountInfo(tokenAccount, "confirmed");
  if (!info) {
    return null;
  }

  const balance = await connection.getTokenAccountBalance(tokenAccount, "confirmed");
  return BigInt(balance.value.amount);
}

function formatBalance(amount: bigint | null) {
  return amount === null ? "missing" : formatTokenUnits(amount);
}

function stateLabel(state: CheckState) {
  const labels: Record<CheckState, string> = {
    idle: "idle",
    pass: "pass",
    fail: "fail",
    blocked: "need setup",
  };
  return labels[state];
}

function formatAccount(account: MatchAccount | null, pda: string) {
  if (!account) {
    return JSON.stringify({ pda, status: "not fetched" }, null, 2);
  }

  return JSON.stringify(
    {
      pda,
      authority: account.authority.toBase58(),
      matchId: account.matchId,
      oddsHome: account.oddsHome,
      oddsAway: account.oddsAway,
      oddsDraw: account.oddsDraw,
      updatedAt: account.updatedAt.toString(),
      bump: account.bump,
    },
    null,
    2,
  );
}

function formatBet(bet: ListedBet) {
  return JSON.stringify(
    {
      pda: bet.pda.toBase58(),
      user: bet.account.user.toBase58(),
      authority: bet.account.authority.toBase58(),
      matchId: bet.account.matchId,
      direction: bet.account.direction === 0 ? "UP" : "DOWN",
      oddsAtEntry: bet.account.oddsAtEntry,
      amount: bet.account.amount.toString(),
      payout: bet.account.payout.toString(),
      windowSecs: bet.account.windowSecs,
      createdAt: bet.account.createdAt.toString(),
      expiresAt: bet.account.expiresAt.toString(),
      status: betStatusLabel(bet.account.status),
      nonce: bet.account.nonce,
      bump: bet.account.bump,
    },
    null,
    2,
  );
}

function betStatusLabel(status: number) {
  if (status === 0) return "Open";
  if (status === 1) return "Won";
  if (status === 2) return "Lost";
  if (status === 3) return "Cancelled";
  return `Unknown ${status}`;
}

export default App;

import { useCallback, useMemo, useState } from "react";
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
  buildMintToInstruction,
  buildPlaceBetInstruction,
  buildSettleBetInstruction,
  buildUpdateOddsInstruction,
  decodeBetAccount,
  decodeMatchAccount,
  deriveAssociatedTokenAddress,
  deriveMatchPda,
  deriveVaultAuthorityPda,
  oddsAreValid,
  oddsSum,
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
      if (!tokenInfo) {
        throw new Error(`Create/fund your token account first: ${userTokenAccount.toBase58()}`);
      }

      const signature = await sendTransaction(
        new Transaction().add(
          buildPlaceBetInstruction(walletPublicKey, matchId, parsedMint, {
            direction,
            windowSecs,
            amount,
            nonce,
          }),
        ),
      );
      pushLog({ title: "Bet placed", body: `Tx ${signature}`, kind: "success" });
      setNonce((current) => current + 1);
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
        filters: [
          { dataSize: 157 },
          { memcmp: { offset: 8, bytes: walletPublicKey.toBase58() } },
        ],
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
    [fetchBets, parsedMint, pushLog, sendTransaction, settleOdds, walletPublicKey],
  );

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
      if (!tokenInfo) {
        throw new Error(`Create your token account first: ${userTokenAccount.toBase58()}`);
      }

      const signature = await sendTransaction(
        new Transaction().add(
          buildMintToInstruction(parsedMint, userTokenAccount, walletPublicKey, 100_000_000n),
        ),
      );
      pushLog({ title: "Test USDC minted", body: `Tx ${signature}`, kind: "success" });
    } catch (error) {
      pushLog({
        title: "mint_to wallet failed",
        body: error instanceof Error ? error.message : String(error),
        kind: "error",
      });
    } finally {
      setIsBusy(false);
    }
  }, [connection, parsedMint, pushLog, sendTransaction, walletPublicKey]);

  const fundVault = useCallback(async () => {
    setIsBusy(true);
    try {
      if (!walletPublicKey) {
        throw new Error("Connect a wallet first.");
      }
      if (!parsedMint) {
        throw new Error("Enter a valid test USDC mint.");
      }

      const vault = deriveAssociatedTokenAddress(deriveVaultAuthorityPda(matchId), parsedMint);
      const vaultInfo = await connection.getAccountInfo(vault, "confirmed");
      if (!vaultInfo) {
        throw new Error("Place a bet first so the vault token account exists.");
      }

      const signature = await sendTransaction(
        new Transaction().add(
          buildMintToInstruction(parsedMint, vault, walletPublicKey, 100_000_000n),
        ),
      );
      pushLog({ title: "Vault funded", body: `Tx ${signature}`, kind: "success" });
    } catch (error) {
      pushLog({
        title: "fund vault failed",
        body: error instanceof Error ? error.message : String(error),
        kind: "error",
      });
    } finally {
      setIsBusy(false);
    }
  }, [connection, matchId, parsedMint, pushLog, sendTransaction, walletPublicKey]);

  const updateOddsField = (field: keyof OddsInput, value: string) => {
    const parsed = Number(value);
    setOdds((current) => ({
      ...current,
      [field]: Number.isFinite(parsed) ? parsed : 0,
    }));
  };

  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <p className="kicker">FutOdds / Oracle Adapter</p>
          <h1>Phase 0 testnet console</h1>
        </div>
        <div className="wallet-actions">
          <button type="button" onClick={() => void connectWallet("phantom")}>
            Connect Phantom
          </button>
          <button type="button" onClick={() => void connectWallet("solflare")}>
            Connect Solflare
          </button>
        </div>
      </section>

      <section className="status-strip">
        <StatusItem label="Cluster" value="testnet" />
        <StatusItem label="Program" value={shorten(PROGRAM_ID.toBase58())} />
        <StatusItem label="Wallet" value={walletPublicKey ? shorten(walletPublicKey.toBase58()) : "not connected"} />
        <StatusItem label="Odds sum" value={`${sum} ${oddsAreValid(odds) ? "OK" : "INVALID"}`} />
      </section>

      <section className="workspace">
        <div className="panel controls-panel">
          <div className="panel-header">
            <h2>Inputs</h2>
            <button className="ghost-button" type="button" onClick={() => void fetchMatch()}>
              Fetch PDA
            </button>
          </div>

          <label className="field">
            <span>Match ID</span>
            <input value={matchId} onChange={(event) => setMatchId(event.target.value)} />
          </label>

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
              Create / update
            </button>
            <button disabled={!hasWallet || isBusy} onClick={() => void runInvalidOdds()}>
              Test invalid odds
            </button>
            <button disabled={!hasWallet || isBusy} onClick={() => void runUnauthorized()}>
              Test unauthorized
            </button>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2>Phase 0 checks</h2>
            <span className="small-label">4 criteria</span>
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

      <section className="workspace lower">
        <div className="panel account-panel">
          <div className="panel-header">
            <h2>Match PDA</h2>
            <span className="mono">{shorten(matchPda.toBase58())}</span>
          </div>
          <pre>{formatAccount(account, matchPda.toBase58())}</pre>
        </div>

        <div className="panel log-panel">
          <div className="panel-header">
            <h2>Run log</h2>
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
      </section>

      <section className="workspace lower">
        <div className="panel controls-panel">
          <div className="panel-header">
            <h2>Phase 1 bets</h2>
            <button className="ghost-button" type="button" disabled={!hasWallet || isBusy} onClick={() => void fetchBets()}>
              Fetch bets
            </button>
          </div>

          <label className="field">
            <span>Test USDC mint</span>
            <input value={testMint} onChange={(event) => setTestMint(event.target.value)} placeholder="Mint address on testnet" />
          </label>

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
              <span>Vault</span>
              <strong>{parsedMint ? shorten(deriveVaultAuthorityPda(matchId).toBase58()) : "mint required"}</strong>
            </div>
          </div>

          <div className="button-row">
            <button disabled={!hasWallet || isBusy || !parsedMint} onClick={() => void mintToWallet()}>
              Mint test USDC
            </button>
            <button disabled={!hasWallet || isBusy || !account || !parsedMint} onClick={() => void placeBet()}>
              Place bet
            </button>
            <button disabled={!hasWallet || isBusy || !parsedMint} onClick={() => void fundVault()}>
              Fund vault
            </button>
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

function shorten(value: string) {
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
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

"use client";

import { useState } from "react";
import { Connection, PublicKey } from "@solana/web3.js";
import {
  availableLiquidity,
  formatUsdc,
  fromUsdc,
  positionValue,
  sharePrice,
  sharesForDeposit,
  sharesForWithdrawAmount,
  toUsdc,
  type LpPosition,
  type Pool,
  type PoolsMeta,
} from "@/lib/pools";
import {
  buildClaimFeesInstruction,
  buildDepositInstruction,
  buildWithdrawInstruction,
  sendInstructions,
  shortenAddress,
  type ConnectedWallet,
} from "@/lib/solana";

type TxState =
  | { phase: "idle" }
  | { phase: "building" }
  | { phase: "pending"; sig: string }
  | { phase: "confirmed"; sig: string; summary: string }
  | { phase: "error"; message: string };

type PoolDetailProps = {
  pool: Pool;
  position?: LpPosition;
  meta: PoolsMeta;
  connection: Connection | null;
  wallet: ConnectedWallet | null;
  walletBalance: bigint | null;
  onConnect: () => void;
  onTxConfirmed: () => void;
};

const CHIP_AMOUNTS = [100, 500, 1000];
const MIN_DEPOSIT_USDC = 1; // betting_engine::MIN_DEPOSIT_AMOUNT

function TxBanner({ tx }: { tx: TxState }) {
  if (tx.phase === "idle") return null;
  const tone =
    tx.phase === "confirmed"
      ? "border-primary/40 text-primary"
      : tx.phase === "error"
        ? "border-down/40 text-down"
        : "border-fg/20 text-fg-muted";
  return (
    <div className={`mt-3 rounded-xl border bg-bg/60 px-4 py-3 text-[13px] ${tone}`}>
      {tx.phase === "building" && "Building transaction — approve it in your wallet…"}
      {tx.phase === "pending" && (
        <>
          Pending · sig <span className="num">{shortenAddress(tx.sig)}</span> · waiting
          for <span className="num">confirmed</span>
        </>
      )}
      {tx.phase === "confirmed" && (
        <>
          ✓ Confirmed · {tx.summary} · sig{" "}
          <span className="num">{shortenAddress(tx.sig)}</span>
        </>
      )}
      {tx.phase === "error" && tx.message}
    </div>
  );
}

export default function PoolDetail({
  pool,
  position,
  meta,
  connection,
  wallet,
  walletBalance,
  onConnect,
  onTxConfirmed,
}: PoolDetailProps) {
  const [tab, setTab] = useState<"deposit" | "withdraw">("deposit");
  const [amount, setAmount] = useState("");
  const [tx, setTx] = useState<TxState>({ phase: "idle" });

  const amountNum = Number(amount) || 0;
  const amountRaw = fromUsdc(amountNum);
  const posValue = position ? positionValue(pool, position.shares) : 0n;
  const pendingFees = position?.pendingFees ?? 0n;
  const available = availableLiquidity(pool);
  // withdraw pays principal + pending fees, both capped by unlocked liquidity
  const withdrawCap = available > pendingFees ? available - pendingFees : 0n;
  const withdrawable = posValue < withdrawCap ? posValue : withdrawCap;
  const depositDisabled = pool.status === "settled";
  const balance = walletBalance ?? 0n;

  const previewShares = amountRaw > 0n ? sharesForDeposit(pool, amountRaw) : 0n;
  const poolShareAfter =
    amountRaw > 0n
      ? (toUsdc(previewShares + (position?.shares ?? 0n)) /
          toUsdc(pool.totalShares + previewShares)) *
        100
      : 0;

  const accounts = wallet
    ? {
        programId: new PublicKey(meta.programId),
        owner: wallet.publicKey,
        pool: new PublicKey(pool.pubkey),
        matchId: pool.matchId,
        mint: new PublicKey(pool.mint),
        vault: new PublicKey(pool.vault),
      }
    : null;

  async function runTx(
    summary: string,
    build: () => Parameters<typeof sendInstructions>[2],
  ) {
    if (!connection || !accounts) return;
    setTx({ phase: "building" });
    try {
      const sig = await sendInstructions(connection, wallet!, build(), (pending) =>
        setTx({ phase: "pending", sig: pending }),
      );
      setTx({ phase: "confirmed", sig, summary });
      setAmount("");
      onTxConfirmed();
    } catch (error) {
      setTx({
        phase: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  function submit() {
    if (!wallet || !accounts) {
      onConnect();
      return;
    }
    if (tab === "deposit") {
      if (amountNum <= 0) return;
      if (amountNum < MIN_DEPOSIT_USDC) {
        setTx({ phase: "error", message: `Minimum deposit is ${MIN_DEPOSIT_USDC} USDC.` });
        return;
      }
      if (amountRaw > balance) {
        setTx({ phase: "error", message: "Amount exceeds wallet balance." });
        return;
      }
      void runTx(`deposited ${formatUsdc(amountNum)} USDC`, () => [
        buildDepositInstruction(accounts, amountRaw),
      ]);
    } else {
      if (amountNum <= 0 || !position) return;
      if (amountRaw + pendingFees > available) {
        setTx({
          phase: "error",
          message: `Only ${formatUsdc(toUsdc(available))} USDC is unlocked — the rest is backing open bets until settlement.`,
        });
        return;
      }
      let sharesToBurn = sharesForWithdrawAmount(pool, amountRaw);
      if (sharesToBurn > position.shares) sharesToBurn = position.shares;
      if (sharesToBurn <= 0n) return;
      void runTx(`withdrew ${formatUsdc(amountNum)} USDC`, () => [
        buildWithdrawInstruction(accounts, sharesToBurn),
      ]);
    }
  }

  return (
    <div className="rounded-[1.5rem] bg-surface p-6">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{pool.tag || pool.matchId}</h2>
          <p className="num mt-0.5 text-xs text-fg-muted">
            pool <span title={pool.pubkey}>{shortenAddress(pool.pubkey)}</span> · fee{" "}
            {(pool.feeRateBps / 100).toFixed(2)}% (
            {((pool.feeRateBps * 0.75) / 100).toFixed(2)} LP /{" "}
            {((pool.feeRateBps * 0.25) / 100).toFixed(2)} protocol)
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            pool.status === "live"
              ? "bg-primary/15 text-primary"
              : pool.status === "open"
                ? "bg-chip text-fg"
                : "bg-chip text-fg-muted"
          }`}
        >
          {pool.status === "live" ? "● Live" : pool.status === "open" ? "Open" : "Settled"}
        </span>
      </div>

      {/* metrics */}
      <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total liquidity", value: formatUsdc(toUsdc(pool.totalLiquidity)) },
          { label: "Locked", value: formatUsdc(toUsdc(pool.lockedLiquidity)) },
          { label: "Share price", value: sharePrice(pool).toFixed(4) },
          { label: "LP fees accrued", value: formatUsdc(toUsdc(pool.lpFeesAccumulated)) },
        ].map((m) => (
          <div key={m.label} className="rounded-xl bg-bg/60 px-3.5 py-3">
            <dt className="text-[11px] text-fg-muted">{m.label}</dt>
            <dd className="num mt-0.5 text-[15px] font-semibold">{m.value}</dd>
          </div>
        ))}
      </dl>

      {/* locked liquidity bar */}
      <div className="mt-4">
        <div className="flex justify-between text-[11px] text-fg-muted">
          <span>
            Locked (backing open bets){" "}
            <span className="num">{formatUsdc(toUsdc(pool.lockedLiquidity))}</span>
          </span>
          <span>
            Unlocked <span className="num">{formatUsdc(toUsdc(available))}</span>
          </span>
        </div>
        <div className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-bg/60">
          {pool.totalLiquidity > 0n && (
            <>
              <div
                className="bg-down/60"
                style={{
                  width: `${Number((pool.lockedLiquidity * 100n) / pool.totalLiquidity)}%`,
                }}
              />
              <div className="flex-1 bg-cyan-series/80" />
            </>
          )}
        </div>
      </div>

      {/* my position */}
      {position && (
        <div className="mt-5 rounded-xl border border-fg/10 bg-bg/40 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-fg-muted">
            My position
          </p>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <p className="text-[11px] text-fg-muted">Shares</p>
              <p className="num text-[15px] font-semibold">
                {formatUsdc(toUsdc(position.shares))}
              </p>
            </div>
            <div>
              <p className="text-[11px] text-fg-muted">Value</p>
              <p className="num text-[15px] font-semibold">{formatUsdc(toUsdc(posValue))}</p>
            </div>
            <div>
              <p className="text-[11px] text-fg-muted">Pending fees</p>
              <p
                className={`num text-[15px] font-semibold ${
                  pendingFees > 0n ? "text-primary" : ""
                }`}
              >
                {formatUsdc(toUsdc(pendingFees))}
              </p>
            </div>
            <div className="flex items-end">
              <button
                type="button"
                disabled={pendingFees <= 0n}
                onClick={() =>
                  void runTx(
                    `claimed ${formatUsdc(toUsdc(pendingFees))} USDC in fees`,
                    () => [buildClaimFeesInstruction(accounts!)],
                  )
                }
                className="rounded-lg bg-chip px-3 py-1.5 text-xs font-semibold transition-colors duration-200 hover:bg-primary hover:text-[#081310] disabled:opacity-40 disabled:hover:bg-chip disabled:hover:text-fg"
              >
                Claim fees · <span className="num">{formatUsdc(toUsdc(pendingFees))}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* deposit / withdraw */}
      <div className="mt-5">
        <div className="flex rounded-xl bg-bg/60 p-1 text-center text-[13px] font-semibold">
          {(["deposit", "withdraw"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setTab(t);
                setTx({ phase: "idle" });
              }}
              className={`flex-1 rounded-lg py-2 capitalize transition-colors duration-200 ${
                tab === t ? "bg-fg text-[#081310]" : "text-fg-muted hover:text-fg"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {tab === "deposit" && depositDisabled ? (
          <p className="mt-4 text-sm text-fg-muted">
            This pool is settled — deposits are closed.
          </p>
        ) : (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                type="number"
                inputMode="decimal"
                min={0}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Amount, USDC"
                className="num w-40 rounded-xl border border-fg/15 bg-bg/60 px-3.5 py-2.5 text-[15px] outline-none placeholder:font-sans placeholder:text-fg-muted focus:border-primary"
              />
              {CHIP_AMOUNTS.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setAmount(String(v))}
                  className="num rounded-lg bg-chip px-3 py-2 text-xs font-semibold transition-colors duration-200 hover:bg-fg hover:text-[#081310]"
                >
                  {v}
                </button>
              ))}
              <button
                type="button"
                onClick={() =>
                  setAmount(
                    tab === "deposit"
                      ? toUsdc(balance).toFixed(2)
                      : toUsdc(withdrawable).toFixed(2),
                  )
                }
                className="rounded-lg bg-chip px-3 py-2 text-xs font-semibold transition-colors duration-200 hover:bg-fg hover:text-[#081310]"
              >
                Max
              </button>
            </div>

            {tab === "deposit" && amountNum > 0 && (
              <div className="num mt-3 grid grid-cols-2 gap-3 rounded-xl bg-bg/40 p-3 text-[13px] sm:grid-cols-3">
                <span>
                  → shares <strong>{formatUsdc(toUsdc(previewShares))}</strong>
                </span>
                <span>
                  → pool share <strong>{poolShareAfter.toFixed(2)}%</strong>
                </span>
                <span>
                  fee rate <strong>{(pool.feeRateBps / 100).toFixed(2)}%</strong>
                </span>
              </div>
            )}
            {tab === "withdraw" && position && (
              <p className="mt-3 text-[13px] text-fg-muted">
                Unlocked and withdrawable now:{" "}
                <span className="num text-fg">{formatUsdc(toUsdc(withdrawable))} USDC</span>
                {pool.lockedLiquidity > 0n && (
                  <> — the rest is backing open bets until settlement.</>
                )}
                {pendingFees > 0n && (
                  <>
                    {" "}
                    Withdrawing also pays out your{" "}
                    <span className="num text-fg">
                      {formatUsdc(toUsdc(pendingFees))} USDC
                    </span>{" "}
                    in pending fees.
                  </>
                )}
              </p>
            )}

            <button
              type="button"
              onClick={submit}
              disabled={tx.phase === "building" || tx.phase === "pending"}
              className="cta-gradient mt-4 w-full rounded-xl py-3.5 text-[15px] font-bold text-[#081310] transition-transform duration-200 hover:scale-[1.01] disabled:opacity-60"
            >
              {!wallet
                ? "Connect wallet"
                : tab === "deposit"
                  ? "Deposit USDC"
                  : "Withdraw"}
            </button>
            <TxBanner tx={tx} />

            {tab === "deposit" && (
              <p className="mt-3 text-[11px] leading-relaxed text-fg-muted">
                Risk disclosure: LPs are the counterparty of every trade in this
                match. Liquidity backing open bets is locked until settlement,
                and returns can be negative when traders win.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

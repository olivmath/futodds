"use client";

import { useState } from "react";
import {
  formatUsdc,
  positionValue,
  sharePrice,
  sharesForDeposit,
  unlockedRatio,
  type LpPosition,
  type Pool,
} from "@/lib/pools";

type TxState =
  | { phase: "idle" }
  | { phase: "building" }
  | { phase: "pending"; sig: string }
  | { phase: "confirmed"; sig: string; summary: string }
  | { phase: "error"; message: string };

type PoolDetailProps = {
  pool: Pool;
  position?: LpPosition;
  connected: boolean;
  walletBalance: number;
  onConnect: () => void;
  onDeposit: (matchId: string, amount: number) => void;
  onWithdraw: (matchId: string, shares: number) => void;
  onClaim: (matchId: string) => void;
};

const CHIP_AMOUNTS = [100, 500, 1000];

function fakeSig(): string {
  const chars = "abcdefghjkmnpqrstuvwxyz123456789";
  let s = "";
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `${s}…${s.split("").reverse().join("").slice(0, 4)}`;
}

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
      {tx.phase === "building" && "Building transaction from the liquidity-pool IDL…"}
      {tx.phase === "pending" && (
        <>
          Pending · sig <span className="num">{tx.sig}</span> · waiting for{" "}
          <span className="num">confirmed</span>
        </>
      )}
      {tx.phase === "confirmed" && (
        <>
          ✓ Confirmed · {tx.summary} · sig <span className="num">{tx.sig}</span>
        </>
      )}
      {tx.phase === "error" && tx.message}
    </div>
  );
}

export default function PoolDetail({
  pool,
  position,
  connected,
  walletBalance,
  onConnect,
  onDeposit,
  onWithdraw,
  onClaim,
}: PoolDetailProps) {
  const [tab, setTab] = useState<"deposit" | "withdraw">("deposit");
  const [amount, setAmount] = useState("");
  const [tx, setTx] = useState<TxState>({ phase: "idle" });

  const amountNum = Number(amount) || 0;
  const unlocked = unlockedRatio(pool);
  const posValue = position ? positionValue(pool, position.shares) : 0;
  const withdrawable = posValue * unlocked;
  const depositDisabled = pool.status === "settled";

  const preview = amountNum > 0 ? sharesForDeposit(pool, amountNum) : 0;
  const poolShareAfter =
    amountNum > 0
      ? ((preview + (position?.shares ?? 0)) / (pool.totalShares + preview)) * 100
      : 0;

  function runTx(summary: string, apply: () => void) {
    const sig = fakeSig();
    setTx({ phase: "building" });
    window.setTimeout(() => setTx({ phase: "pending", sig }), 500);
    window.setTimeout(() => {
      apply();
      setTx({ phase: "confirmed", sig, summary });
      setAmount("");
    }, 1500);
  }

  function submit() {
    if (!connected) {
      onConnect();
      return;
    }
    if (tab === "deposit") {
      if (amountNum <= 0) return;
      if (amountNum > walletBalance) {
        setTx({ phase: "error", message: "Amount exceeds wallet balance." });
        return;
      }
      if (amountNum < 100) {
        setTx({ phase: "error", message: "Minimum deposit is 100 USDC." });
        return;
      }
      runTx(`deposited ${formatUsdc(amountNum)} USDC`, () =>
        onDeposit(pool.matchId, amountNum),
      );
    } else {
      if (amountNum <= 0 || !position) return;
      if (amountNum > withdrawable + 0.005) {
        setTx({
          phase: "error",
          message: `Only ${formatUsdc(withdrawable)} USDC is unlocked — the rest is backing open bets until settlement.`,
        });
        return;
      }
      const sharesToBurn = amountNum / sharePrice(pool);
      runTx(`withdrew ${formatUsdc(amountNum)} USDC`, () =>
        onWithdraw(pool.matchId, sharesToBurn),
      );
    }
  }

  return (
    <div className="rounded-[1.5rem] bg-surface p-6">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">
            {pool.home} × {pool.away}
          </h2>
          <p className="num mt-0.5 text-xs text-fg-muted">
            pool PDA ["pool", "{pool.matchId}"] · fee{" "}
            {(pool.feeRateBps / 100).toFixed(2)}% (1.5 LP / 0.5 protocol)
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
          { label: "Total liquidity", value: `${formatUsdc(pool.totalLiquidity)}` },
          { label: "Locked", value: `${formatUsdc(pool.lockedLiquidity)}` },
          { label: "Share price", value: sharePrice(pool).toFixed(4) },
          { label: "LP fees accrued", value: `${formatUsdc(pool.feesAccruedLp)}` },
        ].map((m) => (
          <div key={m.label} className="rounded-xl bg-bg/60 px-3.5 py-3">
            <dt className="text-[11px] text-fg-muted">{m.label}</dt>
            <dd className="num mt-0.5 text-[15px] font-semibold">{m.value}</dd>
          </div>
        ))}
      </dl>

      {/* exposure bar */}
      <div className="mt-4">
        <div className="flex justify-between text-[11px] text-fg-muted">
          <span>
            ↑ UP exposure <span className="num">{formatUsdc(pool.exposureUp)}</span>
          </span>
          <span>
            ↓ DOWN exposure <span className="num">{formatUsdc(pool.exposureDown)}</span>
          </span>
        </div>
        <div className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-bg/60">
          {pool.exposureUp + pool.exposureDown > 0 && (
            <>
              <div
                className="bg-cyan-series/80"
                style={{
                  width: `${(pool.exposureUp / (pool.exposureUp + pool.exposureDown)) * 100}%`,
                }}
              />
              <div className="flex-1 bg-down/60" />
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
              <p className="num text-[15px] font-semibold">{formatUsdc(position.shares)}</p>
            </div>
            <div>
              <p className="text-[11px] text-fg-muted">Value</p>
              <p className="num text-[15px] font-semibold">{formatUsdc(posValue)}</p>
            </div>
            <div>
              <p className="text-[11px] text-fg-muted">PnL</p>
              <p
                className={`num text-[15px] font-semibold ${
                  posValue - position.depositedUsdc >= 0 ? "text-primary" : "text-down"
                }`}
              >
                {posValue - position.depositedUsdc >= 0 ? "↑ +" : "↓ "}
                {formatUsdc(posValue - position.depositedUsdc)}
              </p>
            </div>
            <div className="flex items-end">
              <button
                type="button"
                disabled={position.claimableFees <= 0}
                onClick={() =>
                  runTx(`claimed ${formatUsdc(position.claimableFees)} USDC in fees`, () =>
                    onClaim(pool.matchId),
                  )
                }
                className="rounded-lg bg-chip px-3 py-1.5 text-xs font-semibold transition-colors duration-200 hover:bg-primary hover:text-[#081310] disabled:opacity-40 disabled:hover:bg-chip disabled:hover:text-fg"
              >
                Claim fees · <span className="num">{formatUsdc(position.claimableFees)}</span>
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
                      ? walletBalance.toFixed(2)
                      : withdrawable.toFixed(2),
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
                  → shares <strong>{formatUsdc(preview)}</strong>
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
                <span className="num text-fg">{formatUsdc(withdrawable)} USDC</span>
                {pool.lockedLiquidity > 0 && (
                  <> — the rest is backing open bets until settlement.</>
                )}
              </p>
            )}

            <button
              type="button"
              onClick={submit}
              className="cta-gradient mt-4 w-full rounded-xl py-3.5 text-[15px] font-bold text-[#081310] transition-transform duration-200 hover:scale-[1.01]"
            >
              {!connected
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

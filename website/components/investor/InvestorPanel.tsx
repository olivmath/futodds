"use client";

import { useMemo, useState } from "react";
import Logo from "@/components/Logo";
import PoolDetail from "./PoolDetail";
import {
  MOCK_POOLS,
  MOCK_POSITIONS,
  formatUsdc,
  positionValue,
  sharesForDeposit,
  unlockedRatio,
  type LpPosition,
  type Pool,
} from "@/lib/pools";

const MOCK_WALLET = "7xKp…3fQd";
const START_BALANCE = 25_000;

function StatusPill({ status }: { status: Pool["status"] }) {
  if (status === "live")
    return (
      <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
        ● Live
      </span>
    );
  if (status === "open")
    return (
      <span className="rounded-full bg-chip px-2.5 py-0.5 text-[11px] font-semibold text-fg">
        Open
      </span>
    );
  return (
    <span className="rounded-full bg-chip px-2.5 py-0.5 text-[11px] font-semibold text-fg-muted">
      Settled
    </span>
  );
}

export default function InvestorPanel() {
  const [connected, setConnected] = useState(false);
  const [balance, setBalance] = useState(START_BALANCE);
  const [pools, setPools] = useState<Pool[]>(MOCK_POOLS);
  const [positions, setPositions] = useState<LpPosition[]>(MOCK_POSITIONS);
  const [selectedId, setSelectedId] = useState<string>(MOCK_POOLS[0].matchId);

  const selected = pools.find((p) => p.matchId === selectedId) ?? pools[0];
  const selectedPos = positions.find((p) => p.matchId === selectedId);

  const stats = useMemo(() => {
    const tvl = pools.reduce((s, p) => s + p.totalLiquidity, 0);
    const myValue = positions.reduce((s, pos) => {
      const pool = pools.find((p) => p.matchId === pos.matchId);
      return s + (pool ? positionValue(pool, pos.shares) : 0);
    }, 0);
    const myFees = positions.reduce((s, p) => s + p.claimableFees, 0);
    return { tvl, myValue, myFees };
  }, [pools, positions]);

  function handleDeposit(matchId: string, amount: number) {
    setPools((prev) =>
      prev.map((p) => {
        if (p.matchId !== matchId) return p;
        const minted = sharesForDeposit(p, amount);
        setPositions((pos) => {
          const existing = pos.find((x) => x.matchId === matchId);
          if (existing) {
            return pos.map((x) =>
              x.matchId === matchId
                ? {
                    ...x,
                    shares: x.shares + minted,
                    depositedUsdc: x.depositedUsdc + amount,
                  }
                : x,
            );
          }
          return [
            ...pos,
            { matchId, shares: minted, depositedUsdc: amount, claimableFees: 0 },
          ];
        });
        return {
          ...p,
          totalLiquidity: p.totalLiquidity + amount,
          totalShares: p.totalShares + minted,
        };
      }),
    );
    setBalance((b) => b - amount);
  }

  function handleWithdraw(matchId: string, shares: number) {
    const pool = pools.find((p) => p.matchId === matchId);
    if (!pool) return;
    const amount = positionValue(pool, shares);
    setPools((prev) =>
      prev.map((p) =>
        p.matchId === matchId
          ? {
              ...p,
              totalLiquidity: p.totalLiquidity - amount,
              totalShares: p.totalShares - shares,
            }
          : p,
      ),
    );
    setPositions((prev) =>
      prev
        .map((x) =>
          x.matchId === matchId
            ? {
                ...x,
                shares: x.shares - shares,
                depositedUsdc: Math.max(0, x.depositedUsdc - amount),
              }
            : x,
        )
        .filter((x) => x.shares > 0.01),
    );
    setBalance((b) => b + amount);
  }

  function handleClaim(matchId: string) {
    const pos = positions.find((x) => x.matchId === matchId);
    if (!pos) return;
    setBalance((b) => b + pos.claimableFees);
    setPositions((prev) =>
      prev.map((x) => (x.matchId === matchId ? { ...x, claimableFees: 0 } : x)),
    );
  }

  return (
    <div className="min-h-svh">
      {/* panel header */}
      <header className="sticky top-0 z-40 border-b border-surface bg-bg/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-3 px-5">
          <div className="flex items-center gap-3">
            <a href="/" aria-label="oddsdex — home">
              <Logo />
            </a>
            <span className="hidden rounded-full bg-chip px-3 py-1 text-[11px] font-semibold text-fg-muted sm:inline">
              Investor panel · Devnet (mocked)
            </span>
          </div>
          <div className="flex items-center gap-3">
            {connected && (
              <span className="num hidden text-[13px] text-fg-muted sm:inline">
                {formatUsdc(balance)} USDC
              </span>
            )}
            <button
              type="button"
              onClick={() => setConnected((c) => !c)}
              className={`rounded-xl px-4 py-2 text-[13px] font-semibold transition-colors duration-200 ${
                connected
                  ? "bg-chip text-fg hover:bg-surface"
                  : "bg-primary text-[#081310] hover:bg-primary-soft"
              }`}
            >
              {connected ? (
                <span className="num">{MOCK_WALLET}</span>
              ) : (
                "Connect wallet"
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1200px] px-5 pb-20 pt-8">
        <h1 className="text-2xl font-semibold tracking-tight">Match pools</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Fund the pools that back every trade. Reads mirror{" "}
          <span className="num text-[12px]">GET /pools</span> — writes will be{" "}
          <span className="num text-[12px]">deposit / withdraw / claim_fees</span>{" "}
          on the liquidity-pool program.
        </p>

        {/* stats strip */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Total TVL", value: `$${formatUsdc(stats.tvl)}` },
            { label: "My positions", value: `$${formatUsdc(stats.myValue)}` },
            { label: "Claimable fees", value: `$${formatUsdc(stats.myFees)}` },
            {
              label: "Active pools",
              value: String(pools.filter((p) => p.status !== "settled").length),
            },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl bg-surface px-5 py-4">
              <p className="text-[11px] text-fg-muted">{s.label}</p>
              <p className="num mt-1 text-xl font-bold">{s.value}</p>
            </div>
          ))}
        </div>

        {/* pools table */}
        <div className="mt-8 overflow-x-auto rounded-2xl bg-surface">
          <table className="w-full min-w-[720px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-fg/10 text-[11px] uppercase tracking-wide text-fg-muted">
                <th className="px-5 py-3.5 font-semibold">Match</th>
                <th className="px-4 py-3.5 font-semibold">Status</th>
                <th className="px-4 py-3.5 text-right font-semibold">TVL</th>
                <th className="px-4 py-3.5 text-right font-semibold">Locked</th>
                <th className="px-4 py-3.5 text-right font-semibold">Unlocked</th>
                <th className="px-4 py-3.5 text-right font-semibold">My value</th>
                <th className="px-5 py-3.5" />
              </tr>
            </thead>
            <tbody>
              {pools.map((pool) => {
                const pos = positions.find((x) => x.matchId === pool.matchId);
                const isSelected = pool.matchId === selectedId;
                return (
                  <tr
                    key={pool.matchId}
                    onClick={() => setSelectedId(pool.matchId)}
                    className={`cursor-pointer border-b border-fg/5 transition-colors duration-150 last:border-0 ${
                      isSelected ? "bg-chip/70" : "hover:bg-chip/40"
                    }`}
                  >
                    <td className="px-5 py-4">
                      <p className="font-semibold text-fg">
                        {pool.home} × {pool.away}
                      </p>
                      <p className="num text-[11px] text-fg-muted">{pool.kickoff}</p>
                    </td>
                    <td className="px-4 py-4">
                      <StatusPill status={pool.status} />
                    </td>
                    <td className="num px-4 py-4 text-right font-semibold">
                      {formatUsdc(pool.totalLiquidity)}
                    </td>
                    <td className="num px-4 py-4 text-right text-fg-muted">
                      {formatUsdc(pool.lockedLiquidity)}
                    </td>
                    <td className="num px-4 py-4 text-right text-fg-muted">
                      {(unlockedRatio(pool) * 100).toFixed(0)}%
                    </td>
                    <td className="num px-4 py-4 text-right">
                      {pos ? (
                        <span className="font-semibold text-fg">
                          {formatUsdc(positionValue(pool, pos.shares))}
                        </span>
                      ) : (
                        <span className="text-fg-muted">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <span
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                          isSelected
                            ? "bg-primary text-[#081310]"
                            : "bg-chip text-fg"
                        }`}
                      >
                        {isSelected ? "Selected" : "Manage"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* selected pool detail */}
        <div className="mt-6">
          <PoolDetail
            key={selected.matchId}
            pool={selected}
            position={selectedPos}
            connected={connected}
            walletBalance={balance}
            onConnect={() => setConnected(true)}
            onDeposit={handleDeposit}
            onWithdraw={handleWithdraw}
            onClaim={handleClaim}
          />
        </div>

        <p className="mt-8 text-[11px] leading-relaxed text-fg-muted">
          This panel runs on mocked data shaped exactly like the on-chain
          accounts (Pool, LpPosition) and the backend&apos;s /pools API. No real
          funds are involved. LP returns are variable and can be negative when
          traders win.
        </p>
      </main>
    </div>
  );
}

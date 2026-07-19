"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Connection, PublicKey } from "@solana/web3.js";
import Logo from "@/components/Logo";
import PoolDetail from "./PoolDetail";
import {
  clusterLabel,
  fetchPools,
  fetchPositions,
  formatUsdc,
  positionValue,
  toUsdc,
  type LpPosition,
  type Pool,
  type PoolsMeta,
} from "@/lib/pools";
import {
  connectWallet,
  fetchTokenBalance,
  shortenAddress,
  type ConnectedWallet,
} from "@/lib/solana";

const POOLS_POLL_MS = 10_000;

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
  const [meta, setMeta] = useState<PoolsMeta | null>(null);
  const [pools, setPools] = useState<Pool[]>([]);
  const [positions, setPositions] = useState<LpPosition[]>([]);
  const [wallet, setWallet] = useState<ConnectedWallet | null>(null);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? meta?.rpcUrl;
  const connection = useMemo(
    () => (rpcUrl ? new Connection(rpcUrl, "confirmed") : null),
    [rpcUrl],
  );

  const refreshPools = useCallback(async () => {
    try {
      const result = await fetchPools();
      setMeta(result.meta);
      setPools(result.pools);
      setLoadError(null);
      setSelectedId((current) =>
        current && result.pools.some((p) => p.matchId === current)
          ? current
          : (result.pools[0]?.matchId ?? null),
      );
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoaded(true);
    }
  }, []);

  const refreshWalletState = useCallback(async () => {
    if (!wallet) return;
    try {
      setPositions(await fetchPositions(wallet.publicKey.toBase58()));
    } catch {
      // backend hiccup — keep last known positions
    }
    if (connection && meta) {
      setBalance(
        await fetchTokenBalance(connection, wallet.publicKey, new PublicKey(meta.mint)),
      );
    }
  }, [wallet, connection, meta]);

  useEffect(() => {
    const initial = window.setTimeout(() => void refreshPools(), 0);
    const timer = window.setInterval(() => void refreshPools(), POOLS_POLL_MS);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [refreshPools]);

  useEffect(() => {
    const initial = window.setTimeout(() => void refreshWalletState(), 0);
    return () => window.clearTimeout(initial);
  }, [refreshWalletState]);

  const handleConnect = useCallback(async () => {
    try {
      setWallet(await connectWallet());
      setWalletError(null);
    } catch (error) {
      setWalletError(error instanceof Error ? error.message : String(error));
    }
  }, []);

  const handleTxConfirmed = useCallback(async () => {
    await Promise.all([refreshPools(), refreshWalletState()]);
  }, [refreshPools, refreshWalletState]);

  const selected = pools.find((p) => p.matchId === selectedId) ?? pools[0];
  const selectedPos = selected
    ? positions.find((p) => p.pool === selected.pubkey)
    : undefined;

  const stats = useMemo(() => {
    const tvl = pools.reduce((s, p) => s + toUsdc(p.totalLiquidity), 0);
    const myValue = positions.reduce((s, pos) => {
      const pool = pools.find((p) => p.pubkey === pos.pool);
      return s + (pool ? toUsdc(positionValue(pool, pos.shares) + pos.pendingFees) : 0);
    }, 0);
    const myFees = positions.reduce((s, p) => s + toUsdc(p.pendingFees), 0);
    return { tvl, myValue, myFees };
  }, [pools, positions]);

  return (
    <div className="min-h-svh">
      {/* panel header */}
      <header className="sticky top-0 z-40 border-b border-surface bg-bg/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-3 px-5">
          <div className="flex items-center gap-3">
            <Link href="/" aria-label="oddsdex — home">
              <Logo />
            </Link>
            <span className="hidden rounded-full bg-chip px-3 py-1 text-[11px] font-semibold text-fg-muted sm:inline">
              Investor panel{meta ? ` · ${clusterLabel(meta.rpcUrl)}` : ""}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {wallet && balance !== null && (
              <span className="num hidden text-[13px] text-fg-muted sm:inline">
                {formatUsdc(toUsdc(balance))} USDC
              </span>
            )}
            <button
              type="button"
              onClick={() => void handleConnect()}
              className={`rounded-xl px-4 py-2 text-[13px] font-semibold transition-colors duration-200 ${
                wallet
                  ? "bg-chip text-fg hover:bg-surface"
                  : "bg-primary text-[#081310] hover:bg-primary-soft"
              }`}
            >
              {wallet ? (
                <span className="num">{shortenAddress(wallet.publicKey.toBase58())}</span>
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
          Fund the pools that back every trade. Deposits, withdrawals and fee
          claims are on-chain transactions signed by your wallet.
        </p>

        {walletError && (
          <div className="mt-4 rounded-xl border border-down/40 bg-bg/60 px-4 py-3 text-[13px] text-down">
            {walletError}
          </div>
        )}
        {loadError && (
          <div className="mt-4 rounded-xl border border-down/40 bg-bg/60 px-4 py-3 text-[13px] text-down">
            Could not load pools from the backend (
            <span className="num">{loadError}</span>) — retrying automatically.
          </div>
        )}

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
              {pools.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-10 text-center text-fg-muted">
                    {loaded
                      ? "No liquidity pools on-chain yet."
                      : "Loading pools…"}
                  </td>
                </tr>
              )}
              {pools.map((pool) => {
                const pos = positions.find((x) => x.pool === pool.pubkey);
                const isSelected = pool.matchId === selected?.matchId;
                const unlockedPct =
                  pool.totalLiquidity === 0n
                    ? 100
                    : Number(
                        ((pool.totalLiquidity - pool.lockedLiquidity) * 100n) /
                          pool.totalLiquidity,
                      );
                return (
                  <tr
                    key={pool.pubkey}
                    onClick={() => setSelectedId(pool.matchId)}
                    className={`cursor-pointer border-b border-fg/5 transition-colors duration-150 last:border-0 ${
                      isSelected ? "bg-chip/70" : "hover:bg-chip/40"
                    }`}
                  >
                    <td className="px-5 py-4">
                      <p className="font-semibold text-fg">
                        {pool.tag || pool.matchId}
                      </p>
                      <p className="num text-[11px] text-fg-muted">{pool.matchId}</p>
                    </td>
                    <td className="px-4 py-4">
                      <StatusPill status={pool.status} />
                    </td>
                    <td className="num px-4 py-4 text-right font-semibold">
                      {formatUsdc(toUsdc(pool.totalLiquidity))}
                    </td>
                    <td className="num px-4 py-4 text-right text-fg-muted">
                      {formatUsdc(toUsdc(pool.lockedLiquidity))}
                    </td>
                    <td className="num px-4 py-4 text-right text-fg-muted">
                      {unlockedPct}%
                    </td>
                    <td className="num px-4 py-4 text-right">
                      {pos ? (
                        <span className="font-semibold text-fg">
                          {formatUsdc(toUsdc(positionValue(pool, pos.shares)))}
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
        {selected && meta && (
          <div className="mt-6">
            <PoolDetail
              key={selected.pubkey}
              pool={selected}
              position={selectedPos}
              meta={meta}
              connection={connection}
              wallet={wallet}
              walletBalance={balance}
              onConnect={() => void handleConnect()}
              onTxConfirmed={() => void handleTxConfirmed()}
            />
          </div>
        )}

        <p className="mt-8 text-[11px] leading-relaxed text-fg-muted">
          Pools, positions and fees are read from the betting-engine program
          on-chain via the oddsdex backend. LP returns are variable and can be
          negative when traders win.
        </p>
      </main>
    </div>
  );
}

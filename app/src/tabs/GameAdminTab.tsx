import { useState, useEffect } from "react";
import { Connection } from "@solana/web3.js";
import { GameScore } from "../components/GameScore";
import { OddsChart } from "../components/OddsChart";
import { PoolInfo } from "../components/PoolInfo";
import { BetsCounter } from "../components/BetsCounter";
import { EventsLog } from "../components/EventsLog";
import { StreamControls } from "../components/StreamControls";

type ChainMatch = { pda: any; account: any };
type ChainBet = { pda: any; account: any };
type EventLogEntry = { timestamp: string; type: string; label: string; detail: string };

export function GameAdminTab({
  matchId,
  chainMatches,
  bets,
  backendStatus,
  connection,
  backendUrl,
}: {
  matchId: string;
  chainMatches: ChainMatch[];
  bets: ChainBet[];
  backendStatus: any;
  connection: Connection;
  backendUrl: string;
}) {
  const match = chainMatches.find((m) => m.account?.matchId === matchId);
  const matchBets = bets.filter((b) => b.account?.matchId === matchId);
  const isTxline = false; // oddsSource removed from chain; controlled via backend now

  const [score, setScore] = useState({ home: 0, away: 0 });
  const [oddsSeries, setOddsSeries] = useState<any[]>([]);
  const [poolData, setPoolData] = useState({ tvl: 0, feeRate: 0 });
  const [betsCount, setBetsCount] = useState({ home: 0, away: 0, draw: 0 });
  const [streamStatus, setStreamStatus] = useState<"active" | "paused" | "inactive">("inactive");
  const [events, setEvents] = useState<EventLogEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const addEvent = (timestamp: string, type: string, label: string, detail: string) => {
    setEvents((prev) => [{ timestamp, type, label, detail }, ...prev.slice(0, 19)]);
  };

  useEffect(() => {
    if (!match) return;
    const subscriptionId = connection.onLogs(
      match.pda,
      (logs) => {
        logs.logs.forEach((log: string) => {
          if (log.includes("OddsUpdated")) {
            const now = new Date().toLocaleTimeString();
            setOddsSeries((prev) => [
              ...prev,
              {
                timestamp: Date.now() / 1000,
                home: match.account?.home_odds / 1000 || 0,
                away: match.account?.away_odds / 1000 || 0,
                draw: match.account?.draw_odds / 1000 || 0,
              },
            ]);
            addEvent(now, "odds", "oracle.updated", `home=${match.account?.home_odds}`);
          }
        });
      },
    );
    return () => { void connection.removeOnLogsListener(subscriptionId); };
  }, [match, connection]);

  useEffect(() => {
    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`${backendUrl}/status`);
        const status = await res.json();
        const m = status.matches?.find((x: any) => x.id === matchId);
        if (m) {
          setStreamStatus(m.streamStatus || "inactive");
          setPoolData({ tvl: m.poolTvl || 0, feeRate: m.feeRate || 0 });
        }
      } catch (e) { /* polling failure is non-fatal */ }
    }, 5000);
    return () => clearInterval(pollInterval);
  }, [matchId]);

  useEffect(() => {
    const homeCount = matchBets.filter((b) => b.account?.direction === 0).length;
    const awayCount = matchBets.filter((b) => b.account?.direction === 1).length;
    const drawCount = matchBets.filter((b) => b.account?.direction === 2).length;
    setBetsCount({ home: homeCount, away: awayCount, draw: drawCount });
  }, [matchBets.length]);

  const callStream = async (action: string, eventLabel: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${backendUrl}/stream/${action}/${matchId}`, { method: "POST" });
      if (res.ok) {
        const newStatus = action === "stop" ? "inactive" : "active";
        setStreamStatus(newStatus as any);
        addEvent(new Date().toLocaleTimeString(), "stream", eventLabel, matchId);
      }
    } catch (e) {
      addEvent(new Date().toLocaleTimeString(), "error", "stream.error", String(e));
    }
    setLoading(false);
  };

  const handleClose = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${backendUrl}/matches/${matchId}/close`, { method: "POST" });
      if (res.ok) addEvent(new Date().toLocaleTimeString(), "info", "game.closed", matchId);
    } catch (e) {
      addEvent(new Date().toLocaleTimeString(), "error", "error", String(e));
    }
    setLoading(false);
  };

  if (!match) return <div style={{ padding: "20px" }}>No match selected</div>;

  return (
    <div style={{ padding: "20px" }}>
      <h2 style={{ margin: "0 0 20px 0" }}>Game Admin Dashboard</h2>
      <div style={{ display: "flex", gap: "0", marginBottom: "20px" }}>
        <GameScore homeScore={score.home} awayScore={score.away} streamStatus={streamStatus} />
        <OddsChart oddsSeries={oddsSeries} />
        <div style={{ flex: "0 0 30%", display: "flex", flexDirection: "column" }}>
          <PoolInfo tvl={poolData.tvl} feeRate={poolData.feeRate} decimals={6} />
          <BetsCounter homeCount={betsCount.home} awayCount={betsCount.away} drawCount={betsCount.draw} />
        </div>
      </div>
      <StreamControls
        streamStatus={streamStatus}
        onStart={() => callStream("start", "stream.started")}
        onStop={() => callStream("stop", "stream.stopped")}
        onResume={() => callStream("resume", "stream.resumed")}
        onClose={handleClose}
        loading={loading}
      />
      <div style={{ fontSize: "11px", color: "#888", marginTop: "4px" }}>
        Feed: {isTxline ? "TxLINE (realtime SSE)" : "Random (poller gera odds a cada ciclo)"}
      </div>
      <EventsLog events={events} />
    </div>
  );
}

# Admin Game Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a real-time admin dashboard for a single game showing score, live odds chart, pool data, open bets counter, and event log with stream control buttons.

**Architecture:** Component-based React dashboard (7 focused components) integrated into App.tsx as a new "game-admin" tab. Real-time updates via on-chain WebSocket listeners (OddsUpdated events) + periodic backend API polling (5s intervals). State management with React hooks (useState). Single-page layout: left 40% (score + buttons), top-right 30% (odds chart), bottom-right 30% (pool/bets), bottom 100% (events log).

**Tech Stack:** React 18+, recharts (odds chart), Solana Web3.js (on-chain listeners), fetch (backend API), TypeScript

## Global Constraints

- Max component file size: 150 lines (per project CLAUDE.md)
- Component reuse: check `app/src/components/` before creating new UI primitives
- No shadcn/ui components — use existing project patterns (CSS + simple HTML)
- All components receive data as props, no API calls inside components (data flows down from App.tsx)
- Real-time updates: on-chain events drive UI (OddsUpdated), backend polling is fallback
- Env var access: use config from resolveBackofficeConfig() (no process.env)

---

## File Structure

**New files (create):**
- `app/src/tabs/GameAdminTab.tsx` — main dashboard container (layout + orchestration)
- `app/src/components/GameScore.tsx` — large score display + stream status indicator
- `app/src/components/OddsChart.tsx` — recharts line chart for home/away/draw odds over time
- `app/src/components/PoolInfo.tsx` — TVL, fee rate, pool status
- `app/src/components/BetsCounter.tsx` — open bets count by direction
- `app/src/components/EventsLog.tsx` — scrollable list of last 20 events
- `app/src/components/StreamControls.tsx` — buttons: Start/Stop/Resume/Close + loading state

**Modified files:**
- `app/src/App.tsx` — add "game-admin" tab, hook up state + listeners, polling logic

**Test files (create):**
- `app/src/tabs/GameAdminTab.test.tsx`
- `app/src/components/GameScore.test.tsx`
- `app/src/components/OddsChart.test.tsx`
- `app/src/components/PoolInfo.test.tsx`
- `app/src/components/BetsCounter.test.tsx`
- `app/src/components/EventsLog.test.tsx`
- `app/src/components/StreamControls.test.tsx`

---

## Task 1: Add "game-admin" Tab to App.tsx

**Files:**
- Modify: `app/src/App.tsx:107` (AppTab type), line 121 (activeTab state)

**Interfaces:**
- Consumes: existing App.tsx state (selectedMatchId, chainMatches, etc.)
- Produces: tab render switch statement that shows GameAdminTab when activeTab === "game-admin"

- [ ] **Step 1: Update AppTab type to include "game-admin"**

Find line 107 in App.tsx:
```typescript
type AppTab = "games" | "create" | "pool" | "bet";
```

Change to:
```typescript
type AppTab = "games" | "create" | "pool" | "bet" | "game-admin";
```

- [ ] **Step 2: Add tab button in the UI header**

Find the line that renders tab buttons (near line 1200, inside JSX). Add a new button:
```typescript
<button onClick={() => setActiveTab("game-admin")} className={activeTab === "game-admin" ? "active" : ""}>
  Game Admin
</button>
```

- [ ] **Step 3: Add render case for game-admin tab**

Find the render switch statement (near line 1300). Add:
```typescript
{activeTab === "game-admin" && selectedMatchId && (
  <GameAdminTab
    matchId={selectedMatchId}
    chainMatches={chainMatches}
    bets={bets}
    backendStatus={backendStatus}
    connection={connection}
  />
)}
```

- [ ] **Step 4: Add GameAdminTab import at top**

Add to imports (line 1):
```typescript
import { GameAdminTab } from "./tabs/GameAdminTab";
```

- [ ] **Step 5: Commit**

```bash
git add app/src/App.tsx
git commit -m "feat: add game-admin tab to App navigation"
```

---

## Task 2: Create GameScore Component

**Files:**
- Create: `app/src/components/GameScore.tsx`
- Create: `app/src/components/GameScore.test.tsx`

**Interfaces:**
- Consumes: `{ homeScore: number, awayScore: number, streamStatus: "active" | "paused" | "inactive" }`
- Produces: React component rendering large score display with status indicator

- [ ] **Step 1: Write the test**

Create `app/src/components/GameScore.test.tsx`:
```typescript
import { render, screen } from "@testing-library/react";
import { GameScore } from "./GameScore";

test("renders home and away scores in large font", () => {
  render(<GameScore homeScore={2} awayScore={1} streamStatus="active" />);
  expect(screen.getByText("2")).toBeInTheDocument();
  expect(screen.getByText("1")).toBeInTheDocument();
});

test("shows ACTIVE indicator when stream is active", () => {
  render(<GameScore homeScore={0} awayScore={0} streamStatus="active" />);
  expect(screen.getByText("ACTIVE")).toBeInTheDocument();
});

test("shows PAUSED indicator when stream is paused", () => {
  render(<GameScore homeScore={0} awayScore={0} streamStatus="paused" />);
  expect(screen.getByText("PAUSED")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- GameScore.test.tsx
```

Expected: Error "GameScore not found"

- [ ] **Step 3: Create GameScore component**

Create `app/src/components/GameScore.tsx`:
```typescript
const statusColors = {
  active: "#22c55e",
  paused: "#f97316",
  inactive: "#6b7280",
};

export function GameScore({
  homeScore,
  awayScore,
  streamStatus,
}: {
  homeScore: number;
  awayScore: number;
  streamStatus: "active" | "paused" | "inactive";
}) {
  const statusText = streamStatus.toUpperCase();
  const statusColor = statusColors[streamStatus];

  return (
    <div style={{ flex: "0 0 40%", padding: "20px", borderRight: "1px solid #ddd" }}>
      <div style={{ fontSize: "72px", fontWeight: "bold", textAlign: "center", marginBottom: "20px" }}>
        <span>{homeScore}</span>
        <span style={{ margin: "0 20px" }}>-</span>
        <span>{awayScore}</span>
      </div>

      <div
        style={{
          textAlign: "center",
          padding: "12px",
          backgroundColor: statusColor,
          color: "white",
          borderRadius: "8px",
          fontWeight: "bold",
          fontSize: "14px",
        }}
      >
        {statusText}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- GameScore.test.tsx
```

Expected: PASS (all 3 tests)

- [ ] **Step 5: Commit**

```bash
git add app/src/components/GameScore.tsx app/src/components/GameScore.test.tsx
git commit -m "feat: create GameScore component with stream status indicator"
```

---

## Task 3: Create OddsChart Component

**Files:**
- Create: `app/src/components/OddsChart.tsx`
- Create: `app/src/components/OddsChart.test.tsx`

**Interfaces:**
- Consumes: `{ oddsSeries: Array<{ timestamp: number, home: number, away: number, draw: number }> }`
- Produces: LineChart component (recharts) plotting odds over time

- [ ] **Step 1: Write the test**

Create `app/src/components/OddsChart.test.tsx`:
```typescript
import { render, screen } from "@testing-library/react";
import { OddsChart } from "./OddsChart";

test("renders chart title", () => {
  const data = [];
  render(<OddsChart oddsSeries={data} />);
  expect(screen.getByText("Odds Over Time")).toBeInTheDocument();
});

test("renders empty chart when no data", () => {
  render(<OddsChart oddsSeries={[]} />);
  const chart = screen.getByRole("img", { hidden: true });
  expect(chart).toBeInTheDocument();
});

test("renders chart with 3 lines (home, away, draw)", () => {
  const data = [
    { timestamp: 1000, home: 1.85, away: 2.1, draw: 3.2 },
    { timestamp: 2000, home: 1.8, away: 2.15, draw: 3.25 },
  ];
  render(<OddsChart oddsSeries={data} />);
  const svg = document.querySelector("svg");
  expect(svg).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- OddsChart.test.tsx
```

Expected: Error "OddsChart not found"

- [ ] **Step 3: Create OddsChart component with recharts**

Create `app/src/components/OddsChart.tsx`:
```typescript
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

export function OddsChart({
  oddsSeries,
}: {
  oddsSeries: Array<{ timestamp: number; home: number; away: number; draw: number }>;
}) {
  const formattedData = oddsSeries.map((item) => ({
    ...item,
    time: new Date(item.timestamp * 1000).toLocaleTimeString(),
  }));

  return (
    <div style={{ flex: "0 0 30%", padding: "20px", borderRight: "1px solid #ddd" }}>
      <h3 style={{ margin: "0 0 12px 0", fontSize: "14px", color: "#666" }}>Odds Over Time</h3>
      {formattedData.length === 0 ? (
        <div style={{ height: "200px", display: "flex", alignItems: "center", justifyContent: "center", color: "#999" }}>
          No data yet
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={formattedData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="time" tick={{ fontSize: 11 }} />
            <YAxis domain={[1, 4]} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="home" stroke="#3b82f6" dot={false} strokeWidth={2} name="Home" />
            <Line type="monotone" dataKey="away" stroke="#ef4444" dot={false} strokeWidth={2} name="Away" />
            <Line type="monotone" dataKey="draw" stroke="#8b5cf6" dot={false} strokeWidth={2} name="Draw" />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- OddsChart.test.tsx
```

Expected: PASS (all 3 tests)

- [ ] **Step 5: Commit**

```bash
git add app/src/components/OddsChart.tsx app/src/components/OddsChart.test.tsx
git commit -m "feat: create OddsChart component with recharts line chart"
```

---

## Task 4: Create PoolInfo Component

**Files:**
- Create: `app/src/components/PoolInfo.tsx`
- Create: `app/src/components/PoolInfo.test.tsx`

**Interfaces:**
- Consumes: `{ tvl: number, feeRate: number, decimals: number }`
- Produces: Component showing TVL and fee rate in formatted text

- [ ] **Step 1: Write the test**

Create `app/src/components/PoolInfo.test.tsx`:
```typescript
import { render, screen } from "@testing-library/react";
import { PoolInfo } from "./PoolInfo";

test("renders TVL label and value", () => {
  render(<PoolInfo tvl={1000000000} feeRate={200} decimals={6} />);
  expect(screen.getByText("TVL")).toBeInTheDocument();
  expect(screen.getByText("1,000")).toBeInTheDocument();
});

test("renders fee rate as percentage", () => {
  render(<PoolInfo tvl={0} feeRate={200} decimals={6} />);
  expect(screen.getByText("Fee: 2.0%")).toBeInTheDocument();
});

test("formats TVL with decimals", () => {
  render(<PoolInfo tvl={5500000} feeRate={150} decimals={6} />);
  expect(screen.getByText("5.5")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- PoolInfo.test.tsx
```

Expected: Error "PoolInfo not found"

- [ ] **Step 3: Create PoolInfo component**

Create `app/src/components/PoolInfo.tsx`:
```typescript
export function PoolInfo({
  tvl,
  feeRate,
  decimals,
}: {
  tvl: number;
  feeRate: number;
  decimals: number;
}) {
  const tvlFormatted = (tvl / Math.pow(10, decimals)).toLocaleString("en-US", { maximumFractionDigits: 2 });
  const feePercent = (feeRate / 100).toFixed(1);

  return (
    <div style={{ flex: "0 0 30%", padding: "20px", borderBottom: "1px solid #ddd" }}>
      <div style={{ marginBottom: "12px" }}>
        <div style={{ fontSize: "12px", color: "#666", marginBottom: "4px" }}>TVL</div>
        <div style={{ fontSize: "18px", fontWeight: "bold" }}>{tvlFormatted}</div>
      </div>
      <div>
        <div style={{ fontSize: "12px", color: "#666", marginBottom: "4px" }}>Fee Rate</div>
        <div style={{ fontSize: "18px", fontWeight: "bold" }}>Fee: {feePercent}%</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- PoolInfo.test.tsx
```

Expected: PASS (all 3 tests)

- [ ] **Step 5: Commit**

```bash
git add app/src/components/PoolInfo.tsx app/src/components/PoolInfo.test.tsx
git commit -m "feat: create PoolInfo component showing TVL and fee rate"
```

---

## Task 5: Create BetsCounter Component

**Files:**
- Create: `app/src/components/BetsCounter.tsx`
- Create: `app/src/components/BetsCounter.test.tsx`

**Interfaces:**
- Consumes: `{ homeCount: number, awayCount: number, drawCount: number }`
- Produces: Component showing bet counts by direction

- [ ] **Step 1: Write the test**

Create `app/src/components/BetsCounter.test.tsx`:
```typescript
import { render, screen } from "@testing-library/react";
import { BetsCounter } from "./BetsCounter";

test("renders bet counts for all directions", () => {
  render(<BetsCounter homeCount={5} awayCount={3} drawCount={2} />);
  expect(screen.getByText("5")).toBeInTheDocument();
  expect(screen.getByText("3")).toBeInTheDocument();
  expect(screen.getByText("2")).toBeInTheDocument();
});

test("renders direction labels", () => {
  render(<BetsCounter homeCount={0} awayCount={0} drawCount={0} />);
  expect(screen.getByText("Home")).toBeInTheDocument();
  expect(screen.getByText("Away")).toBeInTheDocument();
  expect(screen.getByText("Draw")).toBeInTheDocument();
});

test("renders total count", () => {
  render(<BetsCounter homeCount={5} awayCount={3} drawCount={2} />);
  expect(screen.getByText("Total: 10")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- BetsCounter.test.tsx
```

Expected: Error "BetsCounter not found"

- [ ] **Step 3: Create BetsCounter component**

Create `app/src/components/BetsCounter.tsx`:
```typescript
export function BetsCounter({
  homeCount,
  awayCount,
  drawCount,
}: {
  homeCount: number;
  awayCount: number;
  drawCount: number;
}) {
  const total = homeCount + awayCount + drawCount;

  return (
    <div style={{ flex: "0 0 30%", padding: "20px" }}>
      <div style={{ fontSize: "12px", color: "#666", marginBottom: "12px", fontWeight: "bold" }}>Open Bets</div>

      <div style={{ marginBottom: "12px" }}>
        <div style={{ fontSize: "12px", color: "#666" }}>Home</div>
        <div style={{ fontSize: "20px", fontWeight: "bold" }}>{homeCount}</div>
      </div>

      <div style={{ marginBottom: "12px" }}>
        <div style={{ fontSize: "12px", color: "#666" }}>Away</div>
        <div style={{ fontSize: "20px", fontWeight: "bold" }}>{awayCount}</div>
      </div>

      <div style={{ marginBottom: "12px" }}>
        <div style={{ fontSize: "12px", color: "#666" }}>Draw</div>
        <div style={{ fontSize: "20px", fontWeight: "bold" }}>{drawCount}</div>
      </div>

      <div style={{ fontSize: "12px", color: "#999", paddingTop: "12px", borderTop: "1px solid #ddd" }}>
        Total: {total}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- BetsCounter.test.tsx
```

Expected: PASS (all 3 tests)

- [ ] **Step 5: Commit**

```bash
git add app/src/components/BetsCounter.tsx app/src/components/BetsCounter.test.tsx
git commit -m "feat: create BetsCounter component showing open bets by direction"
```

---

## Task 6: Create EventsLog Component

**Files:**
- Create: `app/src/components/EventsLog.tsx`
- Create: `app/src/components/EventsLog.test.tsx`

**Interfaces:**
- Consumes: `{ events: Array<{ timestamp: string, type: string, label: string, detail: string }> }`
- Produces: Scrollable log of last 20 events with timestamps

- [ ] **Step 1: Write the test**

Create `app/src/components/EventsLog.test.tsx`:
```typescript
import { render, screen } from "@testing-library/react";
import { EventsLog } from "./EventsLog";

test("renders events log header", () => {
  render(<EventsLog events={[]} />);
  expect(screen.getByText("Events Log")).toBeInTheDocument();
});

test("renders event timestamps and labels", () => {
  const events = [
    { timestamp: "10:45:23", type: "stream", label: "stream.started", detail: "fixtureId=12345" },
  ];
  render(<EventsLog events={events} />);
  expect(screen.getByText("10:45:23")).toBeInTheDocument();
  expect(screen.getByText("stream.started")).toBeInTheDocument();
});

test("shows empty state when no events", () => {
  render(<EventsLog events={[]} />);
  expect(screen.getByText("No events yet")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- EventsLog.test.tsx
```

Expected: Error "EventsLog not found"

- [ ] **Step 3: Create EventsLog component**

Create `app/src/components/EventsLog.tsx`:
```typescript
export function EventsLog({
  events,
}: {
  events: Array<{ timestamp: string; type: string; label: string; detail: string }>;
}) {
  const typeEmoji = {
    stream: "🌐",
    odds: "📈",
    bet: "🎲",
    pool: "💰",
    error: "❌",
    info: "ℹ️",
  };

  return (
    <div style={{ flex: "0 0 100%", padding: "20px", backgroundColor: "#f9fafb", borderTop: "1px solid #ddd" }}>
      <h3 style={{ margin: "0 0 12px 0", fontSize: "14px", fontWeight: "bold" }}>Events Log</h3>

      <div
        style={{
          height: "200px",
          overflowY: "auto",
          border: "1px solid #e5e7eb",
          borderRadius: "6px",
          backgroundColor: "white",
        }}
      >
        {events.length === 0 ? (
          <div style={{ padding: "20px", textAlign: "center", color: "#999", fontSize: "14px" }}>No events yet</div>
        ) : (
          <div>
            {events.map((event, idx) => (
              <div
                key={idx}
                style={{
                  padding: "12px",
                  borderBottom: "1px solid #f0f0f0",
                  fontSize: "12px",
                  fontFamily: "monospace",
                  display: "flex",
                  gap: "12px",
                }}
              >
                <span style={{ color: "#999", minWidth: "70px" }}>{event.timestamp}</span>
                <span style={{ minWidth: "20px" }}>{typeEmoji[event.type as keyof typeof typeEmoji] || "•"}</span>
                <span style={{ fontWeight: "bold", color: "#333", flex: 1 }}>{event.label}</span>
                <span style={{ color: "#666", flex: 1 }}>{event.detail}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- EventsLog.test.tsx
```

Expected: PASS (all 3 tests)

- [ ] **Step 5: Commit**

```bash
git add app/src/components/EventsLog.tsx app/src/components/EventsLog.test.tsx
git commit -m "feat: create EventsLog component with scrollable event history"
```

---

## Task 7: Create StreamControls Component

**Files:**
- Create: `app/src/components/StreamControls.tsx`
- Create: `app/src/components/StreamControls.test.tsx`

**Interfaces:**
- Consumes: `{ streamStatus: "active" | "paused" | "inactive", onStart: () => void, onStop: () => void, onResume: () => void, onClose: () => void, loading: boolean }`
- Produces: 4 buttons (Start/Stop/Resume/Close) with conditional enabling based on streamStatus

- [ ] **Step 1: Write the test**

Create `app/src/components/StreamControls.test.tsx`:
```typescript
import { render, screen, fireEvent } from "@testing-library/react";
import { StreamControls } from "./StreamControls";

test("renders all 4 buttons", () => {
  render(
    <StreamControls
      streamStatus="inactive"
      onStart={() => {}}
      onStop={() => {}}
      onResume={() => {}}
      onClose={() => {}}
      loading={false}
    />,
  );
  expect(screen.getByText("START")).toBeInTheDocument();
  expect(screen.getByText("STOP")).toBeInTheDocument();
  expect(screen.getByText("RESUME")).toBeInTheDocument();
  expect(screen.getByText("CLOSE GAME")).toBeInTheDocument();
});

test("enables START button only when inactive", () => {
  render(
    <StreamControls
      streamStatus="inactive"
      onStart={() => {}}
      onStop={() => {}}
      onResume={() => {}}
      onClose={() => {}}
      loading={false}
    />,
  );
  const startBtn = screen.getByText("START") as HTMLButtonElement;
  expect(startBtn.disabled).toBe(false);
});

test("calls onStart when START button clicked", () => {
  const onStart = jest.fn();
  render(
    <StreamControls
      streamStatus="inactive"
      onStart={onStart}
      onStop={() => {}}
      onResume={() => {}}
      onClose={() => {}}
      loading={false}
    />,
  );
  fireEvent.click(screen.getByText("START"));
  expect(onStart).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- StreamControls.test.tsx
```

Expected: Error "StreamControls not found"

- [ ] **Step 3: Create StreamControls component**

Create `app/src/components/StreamControls.tsx`:
```typescript
export function StreamControls({
  streamStatus,
  onStart,
  onStop,
  onResume,
  onClose,
  loading,
}: {
  streamStatus: "active" | "paused" | "inactive";
  onStart: () => void;
  onStop: () => void;
  onResume: () => void;
  onClose: () => void;
  loading: boolean;
}) {
  const buttonStyle = {
    padding: "8px 12px",
    marginRight: "8px",
    marginBottom: "8px",
    fontSize: "12px",
    fontWeight: "bold",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    transition: "opacity 0.2s",
  };

  return (
    <div style={{ display: "flex", gap: "8px", marginTop: "12px", flexWrap: "wrap" }}>
      <button
        onClick={onStart}
        disabled={streamStatus !== "inactive" || loading}
        style={{
          ...buttonStyle,
          backgroundColor: "#10b981",
          color: "white",
          opacity: streamStatus !== "inactive" || loading ? 0.5 : 1,
        }}
      >
        {loading ? "..." : "START"}
      </button>

      <button
        onClick={onStop}
        disabled={streamStatus !== "active" || loading}
        style={{
          ...buttonStyle,
          backgroundColor: "#ef4444",
          color: "white",
          opacity: streamStatus !== "active" || loading ? 0.5 : 1,
        }}
      >
        {loading ? "..." : "STOP"}
      </button>

      <button
        onClick={onResume}
        disabled={streamStatus !== "paused" || loading}
        style={{
          ...buttonStyle,
          backgroundColor: "#f59e0b",
          color: "white",
          opacity: streamStatus !== "paused" || loading ? 0.5 : 1,
        }}
      >
        {loading ? "..." : "RESUME"}
      </button>

      <button
        onClick={onClose}
        disabled={loading}
        style={{
          ...buttonStyle,
          backgroundColor: "#6b7280",
          color: "white",
          opacity: loading ? 0.5 : 1,
        }}
      >
        {loading ? "..." : "CLOSE GAME"}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- StreamControls.test.tsx
```

Expected: PASS (all 3 tests)

- [ ] **Step 5: Commit**

```bash
git add app/src/components/StreamControls.tsx app/src/components/StreamControls.test.tsx
git commit -m "feat: create StreamControls component with conditional button states"
```

---

## Task 8: Create GameAdminTab Container

**Files:**
- Create: `app/src/tabs/GameAdminTab.tsx`
- Create: `app/src/tabs/GameAdminTab.test.tsx`

**Interfaces:**
- Consumes: `{ matchId: string, chainMatches: ChainMatch[], bets: ChainBet[], backendStatus: BackendStatus, connection: Connection }`
- Produces: Main dashboard component orchestrating all child components, state management, real-time listeners, polling

- [ ] **Step 1: Write the test**

Create `app/src/tabs/GameAdminTab.test.tsx`:
```typescript
import { render, screen } from "@testing-library/react";
import { GameAdminTab } from "./GameAdminTab";
import { Connection } from "@solana/web3.js";

test("renders all child components", () => {
  const mockMatch = {
    pda: { toBase58: () => "match-pda" },
    account: { home_odds: 6500, away_odds: 3000, draw_odds: 500, status: 0 },
  };

  render(
    <GameAdminTab
      matchId="test-match"
      chainMatches={[mockMatch]}
      bets={[]}
      backendStatus={null}
      connection={new Connection("http://127.0.0.1:8899")}
    />,
  );

  expect(screen.getByText("Game Admin Dashboard")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- GameAdminTab.test.tsx
```

Expected: Error or component not found

- [ ] **Step 3: Create GameAdminTab component with state + listeners**

Create `app/src/tabs/GameAdminTab.tsx`:
```typescript
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
type BackendStatus = any;
type EventLogEntry = { timestamp: string; type: string; label: string; detail: string };

export function GameAdminTab({
  matchId,
  chainMatches,
  bets,
  backendStatus,
  connection,
}: {
  matchId: string;
  chainMatches: ChainMatch[];
  bets: ChainBet[];
  backendStatus: BackendStatus;
  connection: Connection;
}) {
  const match = chainMatches.find((m) => m.account?.id === matchId);
  const matchBets = bets.filter((b) => b.account?.match_id === matchId);

  const [score, setScore] = useState({ home: 0, away: 0 });
  const [oddsSeries, setOddsSeries] = useState<any[]>([]);
  const [poolData, setPoolData] = useState({ tvl: 0, feeRate: 0 });
  const [betsCount, setBetsCount] = useState({ home: 0, away: 0, draw: 0 });
  const [streamStatus, setStreamStatus] = useState<"active" | "paused" | "inactive">("inactive");
  const [events, setEvents] = useState<EventLogEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!match) return;

    const subscriptionId = connection.onLogs(
      { mentions: [match.pda] },
      (logs) => {
        logs.logs.forEach((log) => {
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

    return () => connection.removeLogsListener(subscriptionId);
  }, [match, connection]);

  useEffect(() => {
    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch("/status");
        const status = await res.json();
        const m = status.matches?.find((x: any) => x.id === matchId);
        if (m) {
          setStreamStatus(m.streamStatus || "inactive");
          setPoolData({ tvl: m.poolTvl || 0, feeRate: m.feeRate || 0 });
        }
      } catch (e) {
        console.error("Poll error:", e);
      }
    }, 5000);

    return () => clearInterval(pollInterval);
  }, [matchId]);

  useEffect(() => {
    const homeCount = matchBets.filter((b) => b.account?.direction === 0).length;
    const awayCount = matchBets.filter((b) => b.account?.direction === 1).length;
    const drawCount = matchBets.filter((b) => b.account?.direction === 2).length;
    setBetsCount({ home: homeCount, away: awayCount, draw: drawCount });
  }, [matchBets]);

  const addEvent = (timestamp: string, type: string, label: string, detail: string) => {
    setEvents((prev) => [{ timestamp, type, label, detail }, ...prev.slice(0, 19)]);
  };

  const handleStart = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/stream/start/${matchId}`, { method: "POST" });
      if (res.ok) {
        setStreamStatus("active");
        addEvent(new Date().toLocaleTimeString(), "stream", "stream.started", matchId);
      }
    } catch (e) {
      addEvent(new Date().toLocaleTimeString(), "error", "stream.error", String(e));
    }
    setLoading(false);
  };

  const handleStop = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/stream/stop/${matchId}`, { method: "POST" });
      if (res.ok) {
        setStreamStatus("inactive");
        addEvent(new Date().toLocaleTimeString(), "stream", "stream.stopped", matchId);
      }
    } catch (e) {
      addEvent(new Date().toLocaleTimeString(), "error", "stream.error", String(e));
    }
    setLoading(false);
  };

  const handleResume = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/stream/resume/${matchId}`, { method: "POST" });
      if (res.ok) {
        setStreamStatus("active");
        addEvent(new Date().toLocaleTimeString(), "stream", "stream.resumed", matchId);
      }
    } catch (e) {
      addEvent(new Date().toLocaleTimeString(), "error", "stream.error", String(e));
    }
    setLoading(false);
  };

  const handleClose = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/matches/${matchId}/close`, { method: "POST" });
      if (res.ok) {
        addEvent(new Date().toLocaleTimeString(), "info", "game.closed", matchId);
      }
    } catch (e) {
      addEvent(new Date().toLocaleTimeString(), "error", "error", String(e));
    }
    setLoading(false);
  };

  if (!match) {
    return <div style={{ padding: "20px" }}>No match selected</div>;
  }

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
        onStart={handleStart}
        onStop={handleStop}
        onResume={handleResume}
        onClose={handleClose}
        loading={loading}
      />

      <EventsLog events={events} />
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- GameAdminTab.test.tsx
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/src/tabs/GameAdminTab.tsx app/src/tabs/GameAdminTab.test.tsx
git commit -m "feat: create GameAdminTab container with state, listeners, and polling"
```

---

## Task 9: Integration & Final Testing

**Files:**
- Modify: `app/src/App.tsx` (already partially done in Task 1, complete integration)
- Test: full dashboard flow

**Interfaces:**
- Consumes: GameAdminTab production ready
- Produces: fully functional dashboard integrated into App

- [ ] **Step 1: Verify GameAdminTab is imported and wired in App.tsx**

Check that App.tsx has:
```typescript
import { GameAdminTab } from "./tabs/GameAdminTab";
```

And in render:
```typescript
{activeTab === "game-admin" && selectedMatchId && (
  <GameAdminTab
    matchId={selectedMatchId}
    chainMatches={chainMatches}
    bets={bets}
    backendStatus={backendStatus}
    connection={connection}
  />
)}
```

- [ ] **Step 2: Run all component tests**

```bash
npm test -- --testPathPattern="components|tabs"
```

Expected: All tests pass

- [ ] **Step 3: Manual integration test**

1. Start backend: `npm start` (from backend/)
2. Start frontend: `npm run dev` (from app/)
3. Navigate to "Games" tab, select a game
4. Click "Game Admin" tab
5. Verify dashboard renders:
   - Score visible (should show 0-0 initially)
   - Status indicator shows (should be INACTIVE)
   - Odds chart renders
   - Pool info displays
   - Bets counter shows
   - Events log visible
   - 4 buttons visible (START/STOP/RESUME/CLOSE)
6. Click "START" button, verify:
   - Status changes to ACTIVE
   - Event log records "stream.started"
   - Button becomes disabled
7. Click "STOP" button, verify status changes to INACTIVE

- [ ] **Step 4: Commit final integration**

```bash
git add app/src/
git commit -m "feat: integrate admin game dashboard into App, all tests passing"
```

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-19-admin-game-dashboard.md`.

**Two execution options:**

**1. Subagent-Driven (recommended)** - Dispatch fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute all tasks in this session

Which approach?

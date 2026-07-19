# Backoffice Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Vite frontend as a clear FutOdds operational backoffice with a dashboard overview plus focused Oracle, Betting, Backend, Events, and Debug workspaces.

**Architecture:** Keep the existing Solana helpers in `app/src/testnetOracle.ts` as the typed integration boundary. Replace the current monolithic test-console screen with a dashboard-oriented `App.tsx`, and extract small pure status/formatting helpers into `app/src/backofficeModel.ts` for focused tests.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, `@solana/web3.js`.

## Global Constraints

- Do not change Anchor programs or backend APIs for this task.
- Reuse existing program IDs, PDA derivation, instruction builders, account decoders, and Anchor event parser.
- Backoffice is not the final user app; optimize for validation and operational visibility.
- Dashboard must show the whole system at a glance: backend health, poller, settlement, wallet, balances, matches, bets, txs, errors, and realtime events.
- UI copy must be short, operational, and scannable.
- Preserve browser wallet support for Phantom and Solflare.
- Preserve existing app commands: `npm run test` and `npm run build`.

---

### Task 1: Dashboard Model Helpers

**Files:**
- Create: `app/src/backofficeModel.ts`
- Modify: `app/src/backofficeModel.test.ts`

**Interfaces:**
- Produces: `betStatusLabel(status: number): string`
- Produces: `directionLabel(direction: 0 | 1): string`
- Produces: `systemReadiness(input: SystemReadinessInput): SystemReadiness`
- Produces: `formatUnixTime(value: bigint | number | null): string`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import {
  betStatusLabel,
  directionLabel,
  formatUnixTime,
  systemReadiness,
} from "./backofficeModel";

describe("backoffice model", () => {
  it("labels bet status and direction for operational tables", () => {
    expect(betStatusLabel(0)).toBe("Open");
    expect(betStatusLabel(1)).toBe("Won");
    expect(betStatusLabel(2)).toBe("Lost");
    expect(betStatusLabel(3)).toBe("Cancelled");
    expect(betStatusLabel(9)).toBe("Unknown 9");
    expect(directionLabel(0)).toBe("UP");
    expect(directionLabel(1)).toBe("DOWN");
  });

  it("summarizes system readiness for the dashboard", () => {
    expect(
      systemReadiness({
        backendReachable: true,
        walletConnected: true,
        matchLoaded: true,
        walletBalance: 1_000_000n,
        openBets: 2,
        backendErrors: 0,
      }),
    ).toEqual({
      level: "ready",
      label: "Ready",
      detail: "Backend, wallet, match, token balance, and open bets are available.",
    });
  });

  it("surfaces the first blocking readiness condition", () => {
    expect(
      systemReadiness({
        backendReachable: false,
        walletConnected: true,
        matchLoaded: true,
        walletBalance: 1_000_000n,
        openBets: 0,
        backendErrors: 0,
      }).label,
    ).toBe("Backend offline");
  });

  it("formats unix timestamps without throwing on empty values", () => {
    expect(formatUnixTime(null)).toBe("not set");
    expect(formatUnixTime(1_700_000_000)).toMatch(/2023|2024/);
    expect(formatUnixTime(1_700_000_000n)).toMatch(/2023|2024/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd app && npm run test -- src/backofficeModel.test.ts`
Expected: FAIL because `app/src/backofficeModel.ts` does not exist.

- [ ] **Step 3: Implement model helpers**

Create `app/src/backofficeModel.ts` with exported helper types/functions.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd app && npm run test -- src/backofficeModel.test.ts`
Expected: PASS.

### Task 2: Backoffice React Screen

**Files:**
- Modify: `app/src/App.tsx`

**Interfaces:**
- Consumes: existing exports from `app/src/testnetOracle.ts`
- Consumes: `betStatusLabel`, `directionLabel`, `formatUnixTime`, `systemReadiness` from `app/src/backofficeModel.ts`
- Produces: a dashboard-first backoffice UI with tabbed workspaces.

- [ ] **Step 1: Replace layout state**

Use a `ViewId` union: `"dashboard" | "oracle" | "betting" | "backend" | "events" | "debug"`.

- [ ] **Step 2: Keep operational actions**

Preserve wallet connect, fetch/list matches, update odds, create ATA, mint dev USDC, place bet, fetch bets, manual settle, backend health/status/start/stop/run-once, and Solana logs subscriptions.

- [ ] **Step 3: Add dashboard overview**

Show metric tiles for readiness, backend, poller, settlement, wallet USDC, vault USDC, matches, wallet bets, txs, errors, and realtime event count.

- [ ] **Step 4: Split workspaces**

Move detailed controls into focused views: Oracle, Betting, Backend, Events, Debug.

- [ ] **Step 5: Run app typecheck/build**

Run: `cd app && npm run build`
Expected: PASS.

### Task 3: Backoffice Styling

**Files:**
- Modify: `app/src/styles.css`

**Interfaces:**
- Consumes class names from `App.tsx`.
- Produces responsive dashboard layout.

- [ ] **Step 1: Replace old long-page styles**

Use an operational shell with top header, horizontal tabs, dense dashboard grid, tables, compact forms, status pills, and raw debug panes.

- [ ] **Step 2: Verify mobile layout**

Use CSS grid collapse at `980px` and `680px`.

- [ ] **Step 3: Run build**

Run: `cd app && npm run build`
Expected: PASS.

### Task 4: Verification

**Files:**
- Verify only.

- [ ] **Step 1: Run frontend tests**

Run: `cd app && npm run test`
Expected: all Vitest tests pass.

- [ ] **Step 2: Run frontend build**

Run: `cd app && npm run build`
Expected: TypeScript and Vite build pass.

- [ ] **Step 3: Start dev server**

Run: `cd app && npm run dev -- --port 5173`
Expected: Vite serves on `http://127.0.0.1:5173/`.

- [ ] **Step 4: Inspect rendered UI**

Open the local app and verify the dashboard renders without obvious broken layout or blank screen.

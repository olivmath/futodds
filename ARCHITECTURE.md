# FutOdds — Architecture & Decisions

## Concept
Binary options on sports odds movements. Users bet if odds will go UP or DOWN within a time window (1/5/10/20 min).

## Decisions

| Decision | Choice |
|---|---|
| Token | USDC |
| Oracle | Backend as sole authority |
| Odds on-chain | Only entry + expiry (cheap) |
| Realtime | Canonical Anchor events via Solana RPC WebSocket |
| Exposure limit | 80% max on net exposure |
| Payout | Dynamic (based on UP/DOWN ratio) |

## Programs (Solana)

### 1. LiquidityPool
- `create_pool(match_id)` → creates vault + pool PDA
- `deposit(amount)` → mint LP shares
- `withdraw(shares)` → burn shares, return USDC (only unlocked)
- `claim_fees()` → withdraw accumulated fees

### 2. BettingEngine
- `place_bet(match_id, direction, window, amount)`
  1. Read current odds from Match PDA
  2. Calculate dynamic payout based on UP/DOWN distribution
  3. Check exposure: `|total_payout_UP - total_payout_DOWN| < 80% pool`
  4. Lock liquidity in pool
  5. Create Bet PDA with odds_at_entry
- `settle_bet(bet_id, odds_at_expiry)`
  1. Backend calls with signed odds at expiry timestamp
  2. Compare direction vs actual movement
  3. Won → transfer payout from vault to user
  4. Lost → unlock liquidity + distribute fees
- emits `BetSettled(authority, user, match_id, bet, direction, odds_at_entry, odds_at_expiry_home, status, won, settled_at)`

### 3. OracleAdapter
- `update_odds(match_id, snapshot, timestamp)` — backend authority only
- `push_event(match_id, event_type, timestamp)` — goal, card, etc.
- current MVP emits `OddsUpdated(authority, match_id, odds_home, odds_away, odds_draw, updated_at)`

## Accounts (PDAs)

```
Match (seed: match_id)
├── match_id: String
├── sport: enum
├── teams: [Team; 2]
├── status: Upcoming | Live | Settled
├── current_odds: { home: u16, away: u16, draw: u16 }
├── pool: Pubkey
└── events: Vec<MatchEvent>

LiquidityPool (seed: match_id + "pool")
├── total_liquidity: u64
├── locked_liquidity: u64
├── exposure_up: u64          # sum of all UP payouts
├── exposure_down: u64        # sum of all DOWN payouts
├── fee_rate: u16             # 200 = 2%
├── lp_shares: Vec<(Pubkey, u64)>
└── vault: Pubkey             # USDC token account

Bet (seed: match_id + user + nonce)
├── user: Pubkey
├── direction: Up | Down
├── market: MatchOdds | NextGoal | Cards | ...
├── odds_at_entry: OddsSnapshot
├── amount: u64
├── payout: u64
├── window: 1min | 5min | 10min | 20min
├── created_at: i64
├── expires_at: i64
└── status: Open | Won | Lost | Cancelled
```

## Dynamic Payout Formula

```
total_up   = sum of all active UP bet amounts
total_down = sum of all active DOWN bet amounts

If user bets UP:
  payout = amount * (1 + total_down / (total_up + amount))

If user bets DOWN:
  payout = amount * (1 + total_up / (total_down + amount))

Fee deducted before calculation:
  effective_amount = amount * (1 - fee_rate)
```

## Exposure Check

```
net_exposure = |exposure_up - exposure_down|
max_allowed  = total_liquidity * 0.80

if net_exposure + new_bet_payout > max_allowed:
    reject bet
```

## Fee Split

```
Fee: 2% of each bet
├── Protocol: 0.5%
└── LPs: 1.5% (pro-rata by shares)
```

## Backend Services

| Service | Role |
|---|---|
| **Odds Poller** | Generates/fetches configured odds and sends `update_odds` transactions |
| **Settlement Cron** | Scan expired bets, call `settle_bet` with odds at expiry |
| **Event Listener** | Listen for match events (goal, card) from TxLINE |
| **Risk Engine** | Monitor pool exposure, pause bets if needed |
| **Express Admin API** | Health/status, configured matches, poller controls, manual settlement |

## Canonical Realtime

```txt
backend odds poller
  -> update_odds
  -> OddsUpdated event
  -> frontend connection.onLogs(oracle_adapter)

backend settlement worker
  -> settle_bet
  -> BetSettled event
  -> frontend connection.onLogs(betting_engine)
```

The frontend does not depend on a custom backend WebSocket. It parses Anchor `Program data:` logs and falls back to refetching on-chain accounts when an event cannot be decoded.

## TxODDS Integration

Backend consumes TxLINE API:
- `GET /matches` → available matches
- `GET /odds/{id}` → current odds
- `WS /live/{id}` → real-time odds + events

Converts decimal odds → percentage, stores snapshots with timestamps.

## Markets

| Phase | Market | Settlement |
|---|---|---|
| **MVP** | Match odds Up/Down | Compare entry vs expiry odds |
| **V2** | Next goal (Yes/No in X min) | `goal` event from TxLINE |
| **V2** | Total cards (Over/Under) | `card` event count |
| **V2** | Corners, possession, etc. | TxLINE feed data |

## Time Windows (MVP)
- 1 minute
- 5 minutes
- 10 minutes
- 20 minutes

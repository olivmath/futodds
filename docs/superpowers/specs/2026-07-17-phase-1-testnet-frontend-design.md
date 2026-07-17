# Phase 1 Testnet Frontend Design

## Current Status

| Area | Status | Notes |
|---|---|---|
| `oracle-adapter` | Done | Testnet program id: `6BVWCCQDjQDcjQYhmbzJ9DFWY9LyDojM3mYoWivrASaG` |
| `betting-engine` | Done | Program id in code/config: `GoccKzkMS5BWRmrbLdGKzqKUUcksZB3DftW82F7boCoQ` |
| Rust tests | Done | Phase 0, `place_bet`, and `settle_bet` covered with LiteSVM tests |
| Browser app | Partial | Can create/update odds, place bets, fetch bets, and settle bets |
| Product readiness | Not done | Still has test mint/fund actions and manual token account setup |

## Goal

Implement Phase 1 end to end so a browser user can test real `betting-engine`
transactions on Solana testnet:

- create or reuse an oracle match from Phase 0
- place an UP/DOWN bet using a test USDC mint
- list created bets
- settle expired bets through the authorized oracle wallet

## Scope

| Area | Included |
|---|---|
| Oracle | Reuse `oracle-adapter` and `MatchAccount` from Phase 0 |
| Betting | Use `place_bet` and `settle_bet` from `betting-engine` |
| Token | Use a test mint that represents USDC; do not use real USDC |
| Frontend | Add betting controls to the existing Phase 0 console |
| Tests | Add/maintain Rust and TypeScript coverage for Phase 1 helpers |
| Deploy | Produce a real testnet program id for `betting-engine` |

## Out Of Scope

- mainnet deployment
- real USDC integration
- dynamic payout math from Phase 3
- pool liquidity management from Phase 2
- production wallet onboarding flows

## Program Design

`betting-engine` must have a real program id instead of the placeholder
`11111111111111111111111111111111`.

The current Phase 1 instructions remain the core API:

| Instruction | Purpose |
|---|---|
| `place_bet(direction, window_secs, amount, nonce)` | Creates a `Bet` PDA and transfers test USDC into the escrow vault |
| `settle_bet(odds_at_expiry_home)` | Marks a bet won/lost and pays the user when the bet wins |

PDA contracts:

```txt
Bet PDA:
["bet", match_id, user, nonce]

Vault PDA:
["escrow", match_id]
```

## Frontend Design

The existing app is currently a test console. It has Phase 1 controls below the
Phase 0 oracle controls.

| Control | Status | Behavior |
|---|---|
| Match input | Done | Uses the current `matchId` and fetched `MatchAccount` |
| Match listing | Missing | Needs `getProgramAccounts(PROGRAM_ID)` list of `MatchAccount`s |
| Direction | Done | `UP` or `DOWN` |
| Window | Done | `60`, `300`, `600`, `900` seconds |
| Amount | Done | Test USDC amount, converted to 6-decimal token units |
| Nonce | Done | Auto-filled timestamp; editable |
| Place bet | Done | Sends `place_bet` through the connected wallet |
| Fetch bets | Done | Lists `Bet` accounts owned by the connected wallet |
| Settle bet | Done | Sends `settle_bet` for an open bet |
| Wallet USDC balance | Missing | Needs token balance display for wallet ATA |
| Vault balance | Missing | Needs token balance display for vault ATA |
| Create token account | Missing in UI | Helper work started, but `App.tsx` still asks for manual setup |
| Mint test USDC | Present, dev-only | Should move out of product path |
| Fund vault | Present, dev-only | Should be removed from product path after pool integration |

## Data Flow

```txt
Wallet
  -> creates or fetches MatchAccount through oracle-adapter
  -> owns a test USDC token account
  -> sends place_bet to betting-engine
  -> betting-engine reads MatchAccount odds_home
  -> betting-engine transfers test USDC to escrow vault
  -> frontend lists Bet accounts
  -> authorized oracle wallet settles expired bets
```

## Error Handling

| Case | Frontend behavior |
|---|---|
| Wallet not connected | Disable transaction buttons |
| No fetched match | Block bet placement until a match exists |
| Missing token account | Currently shows clear error; product UI should create ATA |
| Insufficient token balance | Show failed transaction in run log |
| Invalid window | Disable invalid options |
| Amount below 1 test USDC | Disable place bet |
| Bet not expired | Show transaction rejection |
| Unauthorized settle signer | Show transaction rejection |

## Testing

Rust coverage should validate:

- successful UP bet
- successful DOWN bet
- invalid window rejection
- amount below minimum rejection
- insufficient token balance rejection
- UP won/lost settlement
- DOWN won/lost settlement
- settle before expiry rejection
- already-settled rejection
- unauthorized settlement rejection

Frontend TypeScript coverage should validate:

- `place_bet` instruction encoding
- `settle_bet` instruction encoding
- Bet PDA derivation
- escrow vault PDA derivation
- `Bet` account decoding
- test USDC amount conversion
- associated token account creation instruction
- wallet bet listing filters
- `MatchAccount` size used by frontend listing

## Success Criteria

| Command | Expected |
|---|---|
| `anchor build` | both programs compile |
| `anchor test` or equivalent focused tests | Phase 0 and Phase 1 tests pass |
| `npm test` in `app/` | frontend helper tests pass |
| `npm run build` in `app/` | frontend builds |

Manual browser success:

```txt
connect wallet
create/fetch match
place UP or DOWN bet with test USDC
fetch bet account
settle after expiry with authorized wallet
see status update and payout behavior
```

## Product-Ready Gap List

| Gap | Why it matters | Target |
|---|---|---|
| Remove fake vault funding | It creates test money and hides liquidity risk | Fase 2 pool integration |
| Show balances | User should see wallet and vault/pool state without terminal | Frontend Phase 1 polish |
| List matches | User should not need to know `matchId` manually | Frontend Phase 1 polish |
| Create token account in app | First-time wallet should work without setup scripts | Frontend Phase 1 polish |
| Rename dev UI actions | Product UI should not expose `Mint test USDC` / `Fund vault` as normal flow | Frontend Phase 1 polish |

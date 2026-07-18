# ARCHITECTURE.md — `oddsdex` mobile app (Solana Seeker, Kotlin native)

Client-side architecture for the odds-trading app described in `PRD.md`, built as a **native Android app in Kotlin**, targeting the **Solana Seeker** and the **Solana dApp Store**. Grounded in the official Solana Mobile docs (https://docs.solanamobile.com, last checked 2026-07-17). Working rules live in `AGENT.md`.

**Why native Kotlin (decision, 2026-07-17):** the core screen is a sub-second real-time odds chart — the exact workload where React Native breaks (PRD §8.1 flagged this). Native gives us direct control of the render loop (Compose/Canvas on the UI thread with no bridge), first-class MWA support via the official Kotlin SDK, and we have a physical Seeker for on-device testing.

---

## 1. System overview

```
┌─────────────────────────────── Seeker device ───────────────────────────────┐
│                                                                             │
│  ┌───────────────────────── oddsdex app (this repo) ─────────────────────┐  │
│  │                                                                       │  │
│  │   ui/ (Jetpack Compose screens, odds chart)                           │  │
│  │     │            │             │                                      │  │
│  │   domain/     realtime/      chain/         wallet/                   │  │
│  │   (position   (WS odds       (tx build,     (MobileWalletAdapter,     │  │
│  │    state       stream)        PDA reads,     authToken, balance)      │  │
│  │    machine)                   log subs)         │                     │  │
│  └─────────────────────────────────────────────────┼─────────────────────┘  │
│                                                    │ MWA protocol (intent)  │
│                                          ┌─────────▼──────────┐             │
│                                          │  Seed Vault Wallet │             │
│                                          │  (system wallet)   │             │
│                                          └─────────┬──────────┘             │
│                                                    │ biometric approval     │
│                                          ┌─────────▼──────────┐             │
│                                          │     Seed Vault     │             │
│                                          │  (secure enclave)  │             │
│                                          └────────────────────┘             │
└─────────────────────────────────────────────────────────────────────────────┘
        │ REST (catalog, quotes,       │ WebSocket            │ JSON-RPC
        │ positions index)             │ (live odds)          │ (accounts, txs, logs)
┌───────▼──────────────────────────────▼───────┐    ┌─────────▼──────────────┐
│           Back-end (other dev)               │    │  Solana RPC node        │
│  odds ingestion · streaming · API · indexer  │    │  Anchor program         │
└──────────────────────────────────────────────┘    │  (other dev)            │
                                                    └─────────────────────────┘
```

Three external surfaces (contracts in PRD §7): **REST API**, **WebSocket odds stream**, **on-chain Anchor program**. The app renders, collects input, builds transactions, and reconciles state — it never computes business rules (multiplier, payout, settlement outcome).

Custody fact from the docs: the app talks to **Seed Vault only indirectly, through Mobile Wallet Adapter**. The Seed Vault SDK is for wallet developers, not dApps. Private keys never enter this app's process.

---

## 2. Stack

| Concern | Choice | Notes |
|---|---|---|
| Language / min SDK | Kotlin, single-module to start; Android minSdk aligned with Seeker (Android 15 / API 35 device) | Any Android device/emulator works for dev; Seeker in hand for real testing |
| UI | **Jetpack Compose** + Material 3 | Single-activity, Compose Navigation |
| MWA client | `com.solanamobile:mobile-wallet-adapter-clientlib-ktx:2.0.3` | `MobileWalletAdapter` + `transact` / `connect` / `signIn` |
| Solana primitives | `com.solanamobile:web3-solana:0.2.5` | `Transaction`, `Message.Builder`, `TransactionInstruction`, `SolanaPublicKey`, `AccountMeta` |
| RPC | `com.solanamobile:rpc-core:0.2.7` (`SolanaRpcClient` + `KtorNetworkDriver`) | Blockhash, account reads, sendTransaction, custom RPC methods via rpc-core primitives |
| Base58 | `io.github.funkatronics:multimult:0.2.3` | Signature/address encoding |
| HTTP + WS | **Ktor client** (OkHttp engine) | One stack for REST and WebSocket; Ktor already pulled in by rpc-core's driver |
| Serialization | `kotlinx.serialization` | Strict schemas for API/WS payloads |
| Async | Kotlin coroutines + `Flow` / `StateFlow` | WS stream = cold `Flow` → `StateFlow` per market |
| DI | Hilt | ViewModels + layer wiring |
| Chart | **Custom Compose `Canvas`** renderer | See §5 — no charting lib; we control the frame loop |
| Secure storage | Android Keystore-backed `EncryptedSharedPreferences` (or DataStore + Tink) | Persists MWA `authToken` only — never key material |

### Anchor program access without an Anchor Kotlin SDK

There is no official Anchor client for Kotlin. The program surface is small (PRD §7.3: `open_position`, `withdraw`, one position account type, two events), so we hand-roll it against the program's **IDL checked into the repo** (`chain/idl/`, versioned):

- Instruction data = 8-byte Anchor discriminator (`sha256("global:<name>")[0..8]`) + Borsh-encoded args. Implemented once in `chain/anchor/` with unit tests against fixtures generated from the TS Anchor client by the program dev.
- Account decode = 8-byte account discriminator check + Borsh field decode into Kotlin data classes.
- Any IDL change is a cross-team contract change (AGENT.md §1) — PR must update fixtures and flag it.

---

## 3. Module structure (packages)

```
app/src/main/kotlin/com/oddsdex/app/
├── ui/                    # Compose only — no business logic
│   ├── onboarding/        # value props, connect wallet, age-gate
│   ├── discovery/         # home: live / upcoming tabs
│   ├── trade/             # trade screen + chart composables
│   ├── positions/         # open positions, countdowns
│   ├── result/            # WIN/LOSS sheet, explorer link
│   ├── history/ profile/ deposit/ withdraw/
│   └── theme/ components/ # design system
├── wallet/                # MWA session + balance
│   ├── WalletSessionManager.kt   # MobileWalletAdapter wrapper, authToken persist/restore
│   ├── AuthTokenStore.kt         # EncryptedSharedPreferences
│   └── UsdcBalanceRepository.kt  # ATA read + polling/subscription, foreground refresh
├── realtime/              # WS odds client
│   ├── OddsSocket.kt             # Ktor WS: SUB match:{id}:market:{id}, snapshot+deltas
│   ├── Reconnector.kt            # backoff, staleness, connection StateFlow
│   └── SeriesBuffer.kt           # ring buffer + decimation feeding the chart
├── chain/                 # Solana access
│   ├── anchor/                   # discriminators, Borsh encode/decode (tested vs fixtures)
│   ├── idl/                      # program IDL, versioned
│   ├── OpenPositionTx.kt WithdrawTx.kt   # tx builders (Message.Builder + blockhash)
│   ├── PositionAccounts.kt       # PDA derivation + fetch/decode
│   ├── ProgramEvents.kt          # PositionOpened/PositionSettled log subscription
│   └── ChainConfig.kt            # program id, USDC mint, cluster per build variant
├── domain/                # pure Kotlin, zero Android imports, fully unit-tested
│   ├── PositionStateMachine.kt   # idle → building → pending → open → settling → settled
│   ├── Catalog.kt                # match/market/selection models
│   ├── Reconciler.kt             # optimistic vs on-chain truth
│   └── ServerClock.kt            # server-ts offset; device clock never used for game time
├── api/                   # REST client (Ktor + kotlinx.serialization, validated)
│   ├── OddsdexApi.kt             # /matches, /markets/{id}/quote, /positions, ...
│   └── dto/
└── core/                  # analytics, logging, dispatchers, build config
```

Dependency direction: `ui → viewmodels → (wallet | realtime | chain | api | domain)`. `domain/` is a pure Kotlin module candidate (`:domain`) — no Android dependencies, testable on JVM.

---

## 4. Wallet & session layer (MWA / Seed Vault)

Per the Kotlin docs:

```kotlin
val walletAdapter = MobileWalletAdapter(
    connectionIdentity = ConnectionIdentity(
        identityUri = Uri.parse("https://<app-domain>"),
        iconUri = Uri.parse("favicon.ico"),
        identityName = "oddsdex",
    )
)
```

- `WalletSessionManager` owns the single `MobileWalletAdapter` instance and an `ActivityResultSender` scoped to the single activity.
- **Connect**: `walletAdapter.connect(sender)` → `TransactionResult.Success(authResult)` with the account; `NoWalletFound` maps to a dedicated UI state with a dApp Store deep link (PRD §7.4); `Failure` maps to typed wallet errors.
- **Session persistence** (PRD §6.1 silent reconnect): on success, persist `walletAdapter.authToken` in `AuthTokenStore` (encrypted prefs); on app start, restore it (`walletAdapter.authToken = stored`) so subsequent `transact` calls skip the approval dialog while the token is valid. On `disconnect`, revoke and clear.
- **Signing**: all txs go through `walletAdapter.transact(sender) { signAndSendTransactions(arrayOf(tx.serialize())) }` → Seed Vault Wallet → biometric approval. Result signatures come back as bytes → Base58 via multimult.
- **SIWS**: `walletAdapter.signIn(sender, SignInWithSolana.Payload(domain, statement))` reserved for flows needing proven ownership (e.g. Seeker Genesis Token gating, §8); plain `connect` suffices for trading.
- USDC balance: `UsdcBalanceRepository` reads the user's ATA via `SolanaRpcClient`, refreshes on foreground and after every confirmed tx; account-change subscription via WS RPC if the endpoint supports it, else short polling while the app is visible.

---

## 5. Realtime layer + chart

- Ktor WebSocket, `SUB match:{id}:market:{id}` (PRD §7.2): snapshot then deltas `{ selection_id, odd, ts, movement, status }`, all `kotlinx.serialization`-validated before entering state (PRD §13).
- `OddsSocket` exposes `Flow<OddsTick>` per subscription; `Reconnector` wraps it with exponential backoff and a `ConnectionState` StateFlow (`connected | reconnecting | stale(lastTs)`).
- **Clock discipline**: `ServerClock` keeps `server_ts − elapsedRealtime()` offset; countdowns, chart x-axis, and staleness use it exclusively (PRD §10) — `elapsedRealtime` is monotonic and immune to device clock changes.
- **Chart**: custom Compose `Canvas`. `SeriesBuffer` (ring buffer, decimation to ≤ device refresh rate) is updated off the main thread; the composable redraws via `withFrameNanos` reading a snapshot — no recomposition per tick, only redraw. Native rendering is the reason we chose Kotlin; keep the chart free of allocations in the draw path.
- **Disconnect behavior** (PRD §10): freeze chart with "last update at {ts}", reconnecting banner, trade CTA hard-disabled until re-subscribed with a fresh snapshot. `status: suspended | closed` flows into domain → CTA disabled + suspension banner.

---

## 6. Chain layer

- `OpenPositionTx` / `WithdrawTx`: fetch blockhash (`rpcClient.getLatestBlockhash()`), build `Message.Builder().addInstruction(...).setRecentBlockhash(...).build()`, wrap in `Transaction`, serialize for `signAndSendTransactions`.
- Instruction data encoded by `chain/anchor/` (discriminator + Borsh, §2). Accounts lists follow the IDL exactly.
- `PositionAccounts` derives position PDAs from documented seeds so the app reads user positions **directly from chain**, independent of the back-end indexer (PRD §7.3). REST `/positions` is a convenience index; the PDA is the truth.
- `ProgramEvents` subscribes to program logs (WS RPC `logsSubscribe`, built with rpc-core primitives) for `PositionOpened` / `PositionSettled`; on foreground, a full PDA re-fetch reconciles anything missed while backgrounded.
- Confirmation tracking: after `signAndSendTransactions`, poll `getSignatureStatuses` until confirmed, feeding the position state machine.
- Explorer verifiability (PRD §7.3): result screen links the settlement tx/account; presumes `odd_entry`/`odd_exit` on-chain (open question PRD §16.5 — UI degrades to "indexed result" copy if off-chain).

---

## 7. Domain layer — position lifecycle

```
idle ── user confirms ──▶ building ── signAndSendTransactions ──▶ pending
                              │ (wallet declined / build error)      │ tx confirmed (sig status / PositionOpened)
                              ▼                                      ▼
                            idle  ◀── revert optimistic UI         open ── expiry reached ──▶ settling
                                                                                               │ PositionSettled / account status
                                                                                               ▼
                                                                                            settled (WIN | LOSS | tie: pending §5.4)
```

- Transitions driven only by **observed facts** (wallet result, signature status, program event, account state) — never timers alone. Countdown hitting zero moves UI into `settling` optics; `settled` requires on-chain confirmation.
- Every optimistic transition records enough context to revert (PRD §6.3 step 10).
- `Reconciler` runs on foreground/reconnect: fetch PDAs, diff against local machine states, force-correct — on-chain always wins.
- Pure Kotlin, exhaustive JVM unit tests (sealed classes make illegal transitions non-compilable where possible). UI observes via `StateFlow`.

---

## 8. Seeker-specific integrations

- **Seeker detection (UI-only)**: `Build.MODEL == "Seeker"` / `Build.BRAND == "solanamobile"` — spoofable; cosmetic treatment and analytics only, never gating value.
- **Verified Seeker ownership** (only if a feature requires it): SIWS via MWA + back-end verification of the **Seeker Genesis Token** (checking mint uniqueness — SGTs are transferable). Verification is back-end work; the app only performs `signIn`.
- **Seed Vault**: never direct — always via MWA (the Seed Vault SDK is for wallet apps).

---

## 9. Build, environments, and distribution

### Development
- Standard Android Studio flow; run on the physical Seeker over ADB (or any emulator — a Seeker is not required by the SDKs). The Seeker's built-in **Seed Vault Wallet** is the MWA wallet for on-device testing.
- Build variants: `devnetDebug`, `mainnetRelease` (flavor dimension `cluster`), injecting `ChainConfig` + API/WS base URLs via `BuildConfig`. No runtime cluster switching in release builds.

| | cluster | RPC | USDC mint | API/WS |
|---|---|---|---|---|
| dev | devnet | devnet RPC | devnet mint (from program dev) | staging back-end |
| prod | mainnet-beta | dedicated RPC provider | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` (confirm, PRD §7.3) | prod back-end |

### Release / dApp Store
1. Signed release APK — own the signing keystore and back it up (no Play-style key escrow on the dApp Store).
2. Publish via the **dApp Store Publisher Portal / publishing CLI**: publisher account + wallet, app listing, release submissions; updates through the same flow.
3. Compliance gate before first submission: dApp Store **publisher policy** review — for a betting-shaped product, the 18+ age-gate and geo-gating from PRD §14 are part of the release checklist, not an afterthought.

---

## 10. Non-functional commitments (PRD §11)

| Requirement | Architectural answer |
|---|---|
| Odds latency < 1s, 60fps chart | Native Canvas render loop via `withFrameNanos`; ring buffer + decimation; zero allocation in draw path; no bridge |
| Resilience | WS auto-reconnect with snapshot re-sync; PDA reconciliation on foreground; state machine driven by observed facts |
| Security | MWA-only signing; authToken in encrypted storage; kotlinx.serialization strict validation of all external data; no key material in-process; anonymized analytics |
| Settlement trust | Direct PDA reads independent of indexer; program log subscriptions; explorer links on results |
| Offline/error | Every fetch surface has loading/empty/error states; trade CTA hard-disabled when stream stale or market suspended |

---

## 11. Doc references

- Kotlin installation (Gradle deps): https://docs.solanamobile.com/get-started/kotlin/installation
- Kotlin MWA setup (`MobileWalletAdapter`, `ConnectionIdentity`, `transact`, authToken): https://docs.solanamobile.com/get-started/kotlin/setup
- Kotlin quickstart (connect, signIn/SIWS, signAndSendTransactions): https://docs.solanamobile.com/get-started/kotlin/quickstart
- Building transactions (`web3-solana`): https://docs.solanamobile.com/android-native/building_transactions
- RPC client (`rpc-core`, `SolanaRpcClient`): https://docs.solanamobile.com/android-native/rpc-requests and `/building-json-rpc-requests` for custom methods
- Seed Vault (dApps use MWA, not the SDK): https://docs.solanamobile.com/solana-mobile-stack/seed-vault
- Detecting Seeker users / SGT: https://docs.solanamobile.com/recipes/general/detecting-seeker-users
- dApp Store publishing: https://docs.solanamobile.com/dapp-store/intro

# TODO.md — Seeker development setup

Checklist to go from zero to running the `oddsdex` Kotlin app on the physical Seeker with a working wallet-signing loop. Based on `ARCHITECTURE.md` and the Solana Mobile [Development Setup](https://docs.solanamobile.com/get-started/development-setup) guide. Work through it top to bottom — each phase unblocks the next. Per `AGENT.md`: every code change lands via PR, in English.

## Phase 0 — Machine (host) setup

- [x] Android SDK installed **headless** at `~/Library/Android/sdk` (cmdline-tools, platform-tools, platform android-35, build-tools 35.0.0) — Android Studio itself still optional, install when IDE features are wanted
- [x] JDK: Homebrew OpenJDK 21 works as the Gradle JDK
- [x] `adb` available at `~/Library/Android/sdk/platform-tools/adb` (add to `PATH` in shell profile for convenience)
- [ ] (Optional) Install Android Studio for IDE support — it will pick up the existing SDK
- [ ] Note: the Seeker runs **Android 16 / API 36** (post-OTA, ahead of the docs) — consider bumping compile/targetSdk to 36 in a future PR

## Phase 1 — Repo bootstrap

> Remote hosting is deferred — the destination host is the owner's choice, to be added later. Until then: local git only, but keep the AGENT.md discipline (English commits, Conventional Commits, feature branches merged into `main`). Keep the history clean and self-contained so it can be attached to any remote without surprises (`git remote add` + push, or merge with `--allow-unrelated-histories` if the destination already has commits).

- [x] `git init` + initial commit with the existing docs (`PRD.md`, `AGENT.md`, `ARCHITECTURE.md`, `TODO.md`, `imagens-app/`)
- [x] Add Android `.gitignore` (Android Studio template: `.gradle/`, `build/`, `local.properties`, `.idea/` partial, keystores)
- [x] Scaffold the Android project: Kotlin, Jetpack Compose, single activity, package `com.oddsdex.app`, minSdk 31 / target & compile SDK 35 — Gradle 8.11.1 wrapper committed; `./gradlew :app:tasks` configures cleanly
- [x] Add Gradle deps from ARCHITECTURE.md §2 (version catalog `gradle/libs.versions.toml`):
  - [x] `com.solanamobile:mobile-wallet-adapter-clientlib-ktx:2.0.3`
  - [x] `com.solanamobile:web3-solana:0.2.5`
  - [x] `com.solanamobile:rpc-core:0.2.7`
  - [x] `io.github.funkatronics:multimult:0.2.3`
  - [x] Ktor client (OkHttp engine + WebSockets), `kotlinx.serialization`, Hilt, coroutines
- [x] Confirm the project **compiles**: `./gradlew assembleDevnetDebug` → BUILD SUCCESSFUL (2026-07-17)
- [x] Set up build flavors `devnet` / `mainnet` (flavor dimension `cluster`) with `BuildConfig` fields: RPC URL, USDC mint, API base URL, WS URL (API/WS/devnet-mint are placeholders until Phase 4)
- [ ] Local quality gate until CI exists: `./gradlew lint test assembleDevnetDebug` must pass before every merge to `main` (becomes a CI workflow once the remote repo is set up — see "Later")

## Phase 2 — Seeker device setup

- [ ] Finish Seeker onboarding on the device (creates the Seed Vault Wallet — this is the MWA wallet we test against) — confirm wallet exists before Phase 3
- [x] Enable Developer Options (`Settings > About phone > tap Build number 7×`)
- [x] Enable USB debugging; connect via USB and accept the RSA fingerprint prompt
- [x] Verify `adb devices` lists the Seeker as `device` (serial `SM02G4061961054`; optionally set up `adb` over Wi-Fi for cable-free deploys)
- [x] Run the scaffolded app on the Seeker (installed `devnetDebug` via `adb install`, launched, smoke-test screen verified by screenshot)
- [x] Confirmed on-device: `Build.MODEL == "Seeker"`, `Build.BRAND == "solanamobile"` — matches ARCHITECTURE.md §8 detection values

## Phase 3 — Wallet + devnet loop (first real milestone)

- [ ] Switch the Seed Vault Wallet to **devnet** for testing (or install the [Mock MWA Wallet](https://github.com/solana-mobile/mock-mwa-wallet) / Solflare as a fallback dev wallet — the mock wallet also simulates connection/signing errors, useful for the error-state UI)
- [ ] Implement minimal `WalletSessionManager`: `MobileWalletAdapter` + `ConnectionIdentity`, `connect` / `disconnect`
- [ ] Handle all three `TransactionResult` branches (`Success`, `NoWalletFound`, `Failure`) with visible UI states
- [ ] Persist `authToken` in `EncryptedSharedPreferences`; restore on app start; verify silent reconnect (no approval dialog on second launch)
- [ ] Airdrop devnet SOL to the wallet address (`solana airdrop` or faucet.solana.com) for tx fees
- [ ] Smoke test signing end-to-end: build a Memo transaction (`web3-solana`), `signAndSendTransactions` via Seed Vault (biometric prompt appears), confirm the signature on explorer devnet
- [ ] Read a token balance via `SolanaRpcClient` (devnet USDC mint — get it from the program dev, or any devnet SPL token for now)

**Exit criterion: connect → biometric sign → confirmed devnet tx → balance read, all on the physical Seeker.**

## Phase 4 — Contract alignment (parallel with Phase 3 — blocks everything after)

PRD Phase 0: no feature work beyond the wallet loop until these are locked with the other dev (PRD §7, §16):

- [ ] REST schemas agreed (`/matches`, `/markets/{id}/quote`, `/positions`)
- [ ] WS protocol agreed (`SUB match:{id}:market:{id}`, snapshot + deltas, `status` values)
- [ ] Anchor IDL delivered → check into `chain/idl/`, generate Borsh fixtures from the TS client for `chain/anchor/` unit tests
- [ ] PDA seeds documented; devnet program id + devnet USDC mint received
- [ ] Open decisions answered: matching model, tie handling, suspension behavior, slippage policy, `odd_entry`/`odd_exit` on-chain? (PRD §5.4, §10, §16)

## Phase 5 — Ready-to-build checkpoints

- [ ] Package skeleton per ARCHITECTURE.md §3 (`ui/ wallet/ realtime/ chain/ domain/ api/ core/`) with `domain/` free of Android imports
- [ ] `ServerClock` + `PositionStateMachine` implemented with JVM unit tests (pure Kotlin, no device needed)
- [ ] Chart spike: Compose `Canvas` + `withFrameNanos` rendering a fake sub-second tick stream at 60fps on the Seeker — validate the render approach before building the trade screen around it
- [ ] WS spike against the staging back-end (or a local mock server if staging isn't up): subscribe, reconnect, staleness banner

## Later (not setup — tracked here so it isn't lost)

- [ ] Attach to the chosen remote host (`git remote add` + push; `--allow-unrelated-histories` merge if it has prior commits); protect `main` (PRs required — AGENT.md §2) and turn the local quality gate into CI (`lint test assembleDevnetDebug` on every PR)
- [ ] dApp Store publisher account + publisher wallet; read the [publisher policy](https://docs.solanamobile.com/dapp-store/publisher-policy) early (betting-shaped app — see PRD §14)
- [ ] Generate and back up the release signing keystore (no key escrow on the dApp Store)
- [ ] Age-gate (18+) and geo-gating requirements from PRD §14 into the release checklist

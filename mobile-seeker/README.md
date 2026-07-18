# oddsdex — mobile app (Solana Seeker)

Native Android app in **Kotlin + Jetpack Compose** for real-time odds trading, built for the **Solana Seeker** and the **Solana dApp Store**. Wallet integration uses the **Mobile Wallet Adapter (MWA)** — no private key material ever enters the app process (see `ARCHITECTURE.md`).

## Prerequisites

| Tool | Version |
|---|---|
| Android Studio | Ladybug (2024.2) or newer |
| JDK | 17 |
| Android SDK | compileSdk 35 (installed by Android Studio itself) |
| Device/emulator | Android 12+ (API 31, `minSdk`) |
| Gradle | 8.11.1 via wrapper (`./gradlew`, no install needed) |

The `local.properties` file (with the SDK path) is **not versioned**. Android Studio generates it automatically when opening the project; to run from the command line only, create it at the root of `mobile-seeker/`:

```properties
sdk.dir=/Users/YOUR_USER/Library/Android/sdk
```

(or export `ANDROID_HOME` pointing to the SDK.)

## Flavors and variants

The project has a `cluster` flavor dimension with two flavors:

- **`devnet`** — `applicationId com.oddsdex.app.devnet`, RPC `api.devnet.solana.com`. **Use this one for development.**
- **`mainnet`** — `com.oddsdex.app`, RPC `api.mainnet-beta.solana.com`, production USDC mint.

The resulting variants are `devnetDebug`, `devnetRelease`, `mainnetDebug`, `mainnetRelease`. In Android Studio, pick one under **Build > Select Build Variant…** (use `devnetDebug` for day-to-day work).

---

## Running on the Solana Seeker (physical device)

The Seeker is the primary target: it ships with the **Seed Vault Wallet** as the system wallet, so the MWA connect/sign flow works with nothing extra to install.

1. **Enable developer mode on the Seeker**
   - Settings > About phone > tap "Build number" 7 times.
   - Settings > System > Developer options > enable **USB debugging**.
2. **Connect via USB** and accept the debugging authorization prompt on the device. Confirm with:
   ```bash
   adb devices
   ```
3. **Install and run** (from `mobile-seeker/`):
   ```bash
   ./gradlew installDevnetDebug
   adb shell monkey -p com.oddsdex.app.devnet 1
   ```
   Or, in Android Studio: select the Seeker as the device, variant `devnetDebug`, and click **Run ▶**.
4. **Connect the wallet**: when tapping connect, MWA opens the Seed Vault Wallet; approve with biometrics. On the `devnet` flavor, make sure the wallet is also pointed at devnet and has devnet SOL (`solana airdrop` or a faucet).

> Cable-free alternative: **Wireless debugging** (Developer options > Wireless debugging) plus `adb pair` / `adb connect`.

---

## Running in Android Studio (emulator)

1. **Open the project**: File > Open > select the `mobile-seeker/` folder (not the repository root). Wait for the Gradle sync.
2. **Create an AVD**: Device Manager > Create Virtual Device.
   - Any phone profile (e.g. Pixel 7).
   - **System image with API 31 or higher** (the app won't install below Android 12). Prefer an image **with Google Play** if you want to install a wallet from the Play Store.
3. **Select the `devnetDebug` variant** (Build > Select Build Variant…) and click **Run ▶**.

   Via CLI:
   ```bash
   ./gradlew installDevnetDebug
   ```

### Wallet on the emulator (important)

The emulator has **no Seed Vault**, so the MWA flow needs a wallet app installed — without one, connecting returns "no wallet found" (`NoWalletFound`, handled by the app). Options:

- **fakewallet (recommended for dev)** — Solana Mobile's official test wallet:
  ```bash
  git clone https://github.com/solana-mobile/mobile-wallet-adapter.git
  cd mobile-wallet-adapter/android
  ./gradlew :fakewallet:installDebug
  ```
- **Real wallet** (Phantom, Solflare…): install from the Play Store on a Google Play image and switch the wallet's network to devnet.

The rest of the app (odds chart, onboarding, screens) runs fine on the emulator even without a wallet — odds data comes from `SimulatedTickSource` until the back-end is wired up.

---

## Tests and verification

```bash
./gradlew testDevnetDebugUnitTest   # unit tests (JVM)
./gradlew lintDevnetDebug           # Android lint
./gradlew assembleDevnetDebug       # just build the APK (app/build/outputs/apk/)
```

## Troubleshooting

- **`SDK location not found`** — create `local.properties` as described above.
- **Gradle sync fails on Java version** — confirm JDK 17 under Settings > Build Tools > Gradle > Gradle JDK.
- **`INSTALL_FAILED_OLDER_SDK`** — the device/AVD is below Android 12 (API 31).
- **Wallet connect does nothing / fails on the emulator** — install the fakewallet (above); on the Seeker, confirm the Seed Vault Wallet is set up.
- **App connects but transactions fail on devnet** — the account needs devnet SOL for fees.

## Project documentation

- `PRD.md` — product and scope
- `ARCHITECTURE.md` — client architecture (layers, MWA, chart rendering)
- `AGENT.md` — repository working rules
- `TODO.md` / `TODO-ONBOARDING.md` — current phase status

# Repository Guidelines

## Project Structure & Module Organization

This repository is an Anchor/Rust workspace for FutOdds, a Solana sports-odds betting prototype.

- `programs/oracle-adapter/`: Anchor program that stores and updates match odds.
- `programs/betting-engine/`: Anchor program for placing and settling bets.
- `programs/*/src/lib.rs`: Program instructions, accounts, state, and errors.
- `programs/*/tests/`: Rust integration/unit tests for each program.
- `docs/`: Phase plans and implementation notes.
- `Anchor.toml`, `Cargo.toml`, `rust-toolchain.toml`: Workspace, Anchor, and Rust toolchain configuration.

## Build, Test, and Development Commands

- `anchor build`: Builds all Anchor programs and generated artifacts.
- `anchor test`: Runs the configured Anchor test script.
- `cargo test`: Runs Rust tests directly; this is also the `Anchor.toml` test script.
- `cargo fmt --all`: Formats all Rust crates.
- `cargo clippy --workspace --all-targets`: Runs Rust lints across the workspace.

Use Rust `1.89.0`; it is pinned in `rust-toolchain.toml`.

## Coding Style & Naming Conventions

Use standard Rust formatting from `rustfmt` with 4-space indentation. Keep Anchor code idiomatic:

- Program modules use snake_case, e.g. `oracle_adapter`.
- Account structs use PascalCase, e.g. `MatchAccount`, `Bet`.
- Constants use SCREAMING_SNAKE_CASE, e.g. `MIN_BET_AMOUNT`.
- PDA seed literals should be short and stable, e.g. `b"match"`, `b"bet"`, `b"escrow"`.

Keep validation close to the instruction that depends on it, using `require!` and explicit error codes.

## Testing Guidelines

Tests live beside each program in `programs/<program>/tests/`. Prefer focused tests that cover instruction success paths, account constraints, authorization failures, and invalid input. Name tests after the behavior being verified, for example `test_update_odds_rejects_invalid_sum`.

Run `cargo test` before opening a PR. For program changes that affect IDLs or deployment artifacts, also run `anchor build`.

## Commit & Pull Request Guidelines

The current history uses Conventional Commits, for example `feat: initial project setup with oracle-adapter program and architecture docs`. Continue using `type: short summary` such as `feat: add settle bet instruction` or `test: cover invalid odds sum`.

PRs should include:

- A short description of the behavior changed.
- Linked issue or phase doc when applicable, e.g. `Refs docs/fase-1a-place-bet.md`.
- Test commands run and their result.
- Screenshots only for visual docs or rendered architecture artifacts.

## Security & Configuration Tips

Do not commit private keys, wallets, RPC secrets, or API credentials. The default wallet path is `~/.config/solana/id.json`; keep it local. Treat oracle authority checks and token-account constraints as security-sensitive code paths.

<!-- token-policy: v1.0 -->

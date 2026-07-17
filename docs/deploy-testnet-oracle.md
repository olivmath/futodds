# Deploy Testnet — Oracle Adapter

Este guia sobe apenas o `oracle_adapter` na Solana testnet. Use este fluxo para a Fase 0, porque o `betting_engine` ainda não está pronto para deploy completo do workspace.

## Pré-requisitos

- Solana CLI instalado.
- Anchor CLI instalado.
- Wallet local em `~/.config/solana/id.json`.
- Fase 0 validada localmente:

```bash
anchor build -p oracle_adapter
cargo test -p oracle_adapter
```

## 1. Configurar Cluster

O CLI estava apontando para mainnet. Antes de qualquer deploy, configure testnet:

```bash
solana config set --url https://api.testnet.solana.com
solana config get
```

Confirme:

```text
RPC URL: https://api.testnet.solana.com
```

## 2. Fundar Wallet

```bash
solana address
solana airdrop 2
solana balance
```

Se o faucet falhar, tente novamente depois ou use o faucet oficial da Solana.

## 3. Build Do Oracle

```bash
anchor build -p oracle_adapter
```

Artefatos esperados:

```text
target/deploy/oracle_adapter.so
target/deploy/oracle_adapter-keypair.json
target/idl/oracle_adapter.json
```

## 4. Deploy

```bash
anchor deploy \
  -p oracle_adapter \
  --provider.cluster testnet \
  --program-keypair target/deploy/oracle_adapter-keypair.json
```

Program ID esperado:

```text
6BVWCCQDjQDcjQYhmbzJ9DFWY9LyDojM3mYoWivrASaG
```

## 5. Confirmar Deploy

```bash
solana program show 6BVWCCQDjQDcjQYhmbzJ9DFWY9LyDojM3mYoWivrASaG \
  --url https://api.testnet.solana.com
```

## 6. Atualizar Anchor.toml

Depois do deploy, adicione a seção de testnet:

```toml
[programs.testnet]
oracle_adapter = "6BVWCCQDjQDcjQYhmbzJ9DFWY9LyDojM3mYoWivrASaG"
```

Se o foco do ambiente for testnet, atualize também:

```toml
[provider]
cluster = "testnet"
wallet = "~/.config/solana/id.json"
```

## Observações

- Não rode `anchor deploy` sem `-p oracle_adapter` enquanto o `betting_engine` estiver desalinhado.
- Não use mainnet para testes.
- Não commite wallets, keypairs privadas ou arquivos com segredo.

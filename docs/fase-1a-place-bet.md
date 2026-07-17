# Fase 1a — place_bet com Escrow

## Status

Concluida no programa `betting-engine` e coberta por testes Rust em `programs/betting-engine/tests/test_betting.rs`.

| Area | Estado |
|---|---|
| **On-chain** | Implementado |
| **Testes Rust** | Implementados |
| **Frontend** | Implementado: envia `place_bet`, cria ATA da wallet, lista matches e mostra saldos |
| **Produto real** | Ainda depende da Fase 2 para pool de liquidez real |

## Objetivo
User consegue apostar UP/DOWN com USDC depositado num vault do program.

## Implementacao

| Item | Detalhe |
|---|---|
| **Program** | `betting-engine` |
| **PDA Bet** | seeds: `["bet", match_id, user, nonce]` |
| **PDA Vault authority** | seeds: `["escrow", match_id]` |
| **Vault token account** | ATA do PDA `["escrow", match_id]` para o mint USDC |
| **Instruction** | `place_bet(direction, window_secs, amount, nonce)` |
| **Payout** | Fixo 1.8x (hardcoded, substituido na fase 3a) |
| **CPI** | Le Match PDA do oracle-adapter pra pegar odds_at_entry |
| **Transferencia** | `user_token_account` → vault ATA via SPL Token |
| **Minimo** | `1_000_000` unidades = 1 USDC com 6 decimais |
| **Windows validos** | `60`, `300`, `600`, `900` segundos |

## Account Schema

```rust
pub struct Bet {
    pub user: Pubkey,           // 32
    pub authority: Pubkey,      // 32
    pub match_id: String,       // 4 + 36
    pub direction: u8,          // 1 (0=Up, 1=Down)
    pub odds_at_entry: u16,     // 2
    pub amount: u64,            // 8
    pub payout: u64,            // 8
    pub window_secs: u32,       // 4
    pub created_at: i64,        // 8
    pub expires_at: i64,        // 8
    pub status: u8,             // 1 (0=Open, 1=Won, 2=Lost, 3=Cancelled)
    pub nonce: u32,             // 4
    pub bump: u8,               // 1
}
```

## Plano de Teste

| # | Teste | Input | Expected |
|---|---|---|---|
| 1 | Apostar UP com sucesso | `place_bet(Up, 60, 100_USDC)` | Bet PDA criado, USDC saiu da wallet, payout=180 |
| 2 | Apostar DOWN com sucesso | `place_bet(Down, 300, 50_USDC)` | Bet PDA criado com direction=Down |
| 3 | Rejeitar window invalido | `place_bet(Up, 120, 100)` | Erro: InvalidWindow |
| 4 | Rejeitar amount abaixo do min | `place_bet(Up, 60, 0.5_USDC)` | Erro: BetTooSmall |
| 5 | Rejeitar se user sem USDC | wallet vazia | Erro: InsufficientFunds |

## Criterios de Sucesso

- [x] `place_bet` implementado em `programs/betting-engine/src/lib.rs`
- [x] Bet PDA contem `odds_at_entry` lido do `MatchAccount`
- [x] Bet PDA guarda `authority` do oracle para uso no `settle_bet`
- [x] USDC transferido do usuario para o vault escrow
- [x] Vault ATA criado com `init_if_needed`
- [x] Testes cobrem UP, DOWN, window invalido, amount abaixo do minimo e saldo insuficiente

## Evidencia No Codigo

| Arquivo | O que valida |
|---|---|
| `programs/betting-engine/src/lib.rs` | Instrucao `place_bet`, constraints, PDA seeds, transferencia SPL |
| `programs/betting-engine/tests/test_betting.rs` | 5 testes de `place_bet` |
| `app/src/App.tsx` | UI consegue montar e enviar `place_bet` |
| `app/src/testnetOracle.ts` | Deriva PDAs/ATAs e codifica instrucao Anchor |

## Pendencias De Produto

| Falta | Motivo |
|---|---|
| Pool real de liquidez | Fase 1 usa escrow por match; Fase 2 troca para pool |
| Oracle/backend de liquidacao | Settlement ainda recebe odds de expiracao manualmente |

## Frontend Resolvido

| Item | Evidencia |
|---|---|
| `Fund vault` fake removido | `app/src/App.tsx` nao expoe mint direto para vault |
| Criar ATA pelo app | Botao `Create token account` e criacao automatica antes de `place_bet` |
| Mostrar saldo na UI | `Token readiness` e status strip mostram wallet/vault USDC |
| Listar jogos na UI | `List matches` usa `getProgramAccounts` para `MatchAccount` |

# Fase 1a — place_bet com Escrow

## Objetivo
User consegue apostar UP/DOWN com USDC depositado num vault do program.

## Implementacao

| Item | Detalhe |
|---|---|
| **Program** | `betting-engine` |
| **PDA Bet** | seeds: `["bet", match_id, user, nonce]` |
| **PDA Vault** | seeds: `["escrow", match_id]` (token account USDC) |
| **Instruction** | `place_bet(direction, window_secs, amount)` |
| **Payout** | Fixo 1.8x (hardcoded, substituido na fase 3a) |
| **CPI** | Le Match PDA do oracle-adapter pra pegar odds_at_entry |

## Account Schema

```rust
pub struct Bet {
    pub user: Pubkey,           // 32
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

- [ ] `anchor build` compila (2 programs)
- [ ] `anchor test` — 5/5 novos + 4 anteriores passando
- [ ] Bet PDA contem odds_at_entry lido do Match PDA
- [ ] USDC transferido do user pro vault escrow

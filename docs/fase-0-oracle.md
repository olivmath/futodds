# Fase 0 — Oracle Smoke Test

## Objetivo
Provar que o backend consegue gravar e ler odds on-chain.

## Implementação

| Item | Detalhe |
|---|---|
| **Program** | `oracle-adapter` |
| **PDA** | `Match` — seeds: `["match", match_id]` |
| **Instruction** | `update_odds(match_id, odds_home, odds_away, odds_draw)` |
| **Guard** | signer == authority (backend keypair) |
| **Behavior** | `init_if_needed` — cria na 1a chamada, atualiza nas seguintes |

## Account Schema

```rust
pub struct MatchAccount {
    pub authority: Pubkey,      // 32
    pub match_id: String,       // 4 + 36
    pub odds_home: u16,         // 2  (6500 = 65.00%)
    pub odds_away: u16,         // 2
    pub odds_draw: u16,         // 2
    pub updated_at: i64,        // 8
    pub bump: u8,               // 1
}
// Total: ~87 bytes + discriminator
```

## Plano de Teste

| # | Teste | Input | Expected |
|---|---|---|---|
| 1 | Criar match com odds iniciais | `update_odds("match_1", 6500, 3000, 500)` | Match PDA criado, odds_home=6500 |
| 2 | Atualizar odds existentes | `update_odds("match_1", 6700, 2800, 500)` | odds_home=6700 |
| 3 | Rejeitar signer nao-autorizado | `update_odds` com wallet random | Erro: Unauthorized |
| 4 | Rejeitar odds invalidas | `update_odds("match_1", 6500, 3000, 600)` | Erro: InvalidOddsSum (soma=10100) |

## Criterios de Sucesso

- [ ] `anchor build` compila sem erros
- [ ] `anchor test` — 4/4 testes passando
- [ ] Match PDA legivel via `program.account.matchAccount.fetch()`

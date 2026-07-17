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

- [x] `anchor build -p oracle_adapter` compila sem erros
- [x] `cargo test -p oracle_adapter` — 4/4 testes passando
- [x] Match PDA legivel nos testes via desserializacao de `MatchAccount`
- [x] Program deployado em testnet: `6BVWCCQDjQDcjQYhmbzJ9DFWY9LyDojM3mYoWivrASaG`

## Status

Concluida. O programa esta deployado em testnet. A IDL on-chain nao foi publicada em testnet porque o Program Metadata Program (`ProgM6JCCvbYkfKqJYHePx4xxSUSqJp7rh8Lyv7nk7S`) nao existe nesse cluster; use `target/idl/oracle_adapter.json` localmente ou publique em devnet se precisar de IDL on-chain.

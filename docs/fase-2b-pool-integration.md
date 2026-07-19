# Fase 2b — Integrar BettingEngine com Pool

## Objetivo
place_bet e settle_bet usam o vault do pool, nao escrow proprio.

## Status

Concluida no programa `betting-engine`. O pool ativo fica no mesmo programa das apostas para que o programa dono consiga alterar `Pool` e assinar pelo vault PDA sem CPI entre programas.

## Implementacao

| Item | Detalhe |
|---|---|
| **Refactor place_bet** | USDC vai pro vault do Pool, lock liquidity no Pool PDA |
| **Refactor settle_bet** | Paga do vault do Pool, unlock liquidity |
| **Fee** | 2% por bet (amount * fee_rate / 10000) |
| **Remover** | Vault escrow do betting-engine |
| **Pool PDA** | `locked_liquidity`, fees e shares no `betting-engine` |

## Fluxo de USDC

```
place_bet:  user wallet ---(amount)---> pool vault
            pool.locked_liquidity += payout

settle Won: pool vault ---(payout)---> user wallet
            pool.locked_liquidity -= payout

settle Lost: pool.locked_liquidity -= payout
             (USDC fica no vault → LPs lucram)
```

## Plano de Teste

| # | Teste | Input | Expected |
|---|---|---|---|
| 1 | Aposta usa vault do pool | `place_bet(Up, 60, 100)` | vault do pool recebe USDC, locked_liquidity aumenta |
| 2 | Fee cobrado corretamente | aposta de 100 | fee=2, effective=98 |
| 3 | Settle paga do vault do pool | settle Won | user recebe payout do vault do pool |
| 4 | Settle Lost unlock liquidity | settle Lost | locked_liquidity diminui, USDC fica |
| 5 | Rejeitar aposta se pool sem liquidity | pool vazio | Erro |

## Criterios de Sucesso

- [x] `cargo test -p betting_engine` — 17/17 testes passando
- [x] locked_liquidity no Pool PDA reflete bets abertas
- [x] USDC flui: user → pool vault → winner

## Evidencia No Codigo

| Arquivo | O que valida |
|---|---|
| `programs/betting-engine/src/lib.rs` | `place_bet` transfere para pool vault e trava payout |
| `programs/betting-engine/src/lib.rs` | `settle_bet` destrava payout e paga do pool vault |
| `programs/betting-engine/tests/test_betting.rs` | Testa fee, locked liquidity, payout e pool sem liquidez |
| `backend/src/solana.js` | Settlement backend passa `Pool` e vault PDA seed `["vault", match_id]` |

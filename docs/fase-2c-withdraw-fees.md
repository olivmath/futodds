# Fase 2c — withdraw + claim_fees

## Objetivo
LPs sacam USDC e coletam fees acumulados.

## Status

Concluida no programa `betting-engine`.

## Implementacao

| Item | Detalhe |
|---|---|
| **withdraw(shares)** | Burn shares, devolve USDC pro-rata (so unlocked) |
| **claim_fees()** | Calcula fee acumulado pro-rata, transfer pro LP |
| **Pool PDA** | `protocol_fees_accumulated`, `lp_fees_accumulated`, `fees_per_share` |
| **LpPosition** | Adicionar `fees_claimed_per_share: u128` |

## Formula de Fees

```
Na aposta:
  fee = amount * fee_rate / 10000
  protocol_fee = fee * 25 / 100        (0.5% do total)
  lp_fee = fee - protocol_fee          (1.5% do total)
  pool.protocol_fees_accumulated += protocol_fee
  pool.lp_fees_accumulated += lp_fee
  pool.fees_per_share += lp_fee * 1e12 / pool.total_shares

No claim:
  pending = (pool.fees_per_share - lp.fees_claimed_per_share) * lp.shares / 1e12
  transfer pending → LP
  lp.fees_claimed_per_share = pool.fees_per_share
  pool.lp_fees_accumulated -= pending
```

## Plano de Teste

| # | Teste | Input | Expected |
|---|---|---|---|
| 1 | Withdraw com liquidity disponivel | `withdraw(5_000 shares)` | LP recebe USDC proporcional, shares burned |
| 2 | Rejeitar withdraw se locked | withdraw > disponivel | Erro: InsufficientLiquidity |
| 3 | Claim fees apos aposta | deposit → bet → claim | LP recebe 1.5% da aposta |
| 4 | Fee split correto | bet de 100 USDC | LP fee=1.5 USDC, protocolo=0.5 USDC |
| 5 | Fluxo E2E coberto | deposit → bet → settle/claim/withdraw | tudo bate nos testes Rust |

## Criterios de Sucesso

- [x] `cargo test -p betting_engine` — 17/17 testes passando
- [x] Fee split correto: 1.5% LP, 0.5% protocolo
- [x] Withdraw bloqueado se liquidity locked, liberado quando ha liquidity disponivel

## Evidencia No Codigo

| Arquivo | O que valida |
|---|---|
| `programs/betting-engine/src/lib.rs` | `claim_fees`, `withdraw`, `pending_fees` |
| `programs/betting-engine/tests/test_betting.rs` | `test_claim_fees_after_bet` |
| `programs/betting-engine/tests/test_betting.rs` | `test_withdraw_unlocked_liquidity` |
| `programs/betting-engine/tests/test_betting.rs` | `test_reject_withdraw_when_liquidity_locked` |

# Fase 2c — withdraw + claim_fees

## Objetivo
LPs sacam USDC e coletam fees acumulados.

## Implementacao

| Item | Detalhe |
|---|---|
| **withdraw(shares)** | Burn shares, devolve USDC pro-rata (so unlocked) |
| **claim_fees()** | Calcula fee acumulado pro-rata, transfer pro LP |
| **Pool PDA** | Adicionar `total_fees_accumulated: u64`, `fees_per_share: u128` |
| **LpPosition** | Adicionar `fees_claimed_per_share: u128` |

## Formula de Fees

```
Na aposta:
  fee = amount * fee_rate / 10000
  protocol_fee = fee * 25 / 100        (0.5% do total)
  lp_fee = fee - protocol_fee          (1.5% do total)
  pool.fees_per_share += lp_fee * 1e12 / pool.total_shares

No claim:
  pending = (pool.fees_per_share - lp.fees_claimed_per_share) * lp.shares / 1e12
  transfer pending → LP
  lp.fees_claimed_per_share = pool.fees_per_share
```

## Plano de Teste

| # | Teste | Input | Expected |
|---|---|---|---|
| 1 | Withdraw com liquidity disponivel | `withdraw(5_000 shares)` | LP recebe USDC proporcional, shares burned |
| 2 | Rejeitar withdraw se locked | withdraw > disponivel | Erro: InsufficientLiquidity |
| 3 | Claim fees apos aposta | deposit → bet → settle → claim | LP recebe 1.5% da aposta |
| 4 | Claim fees pro-rata | 2 LPs com shares diferentes | cada um recebe proporcional |
| 5 | Fluxo E2E completo | deposit → bet → settle → claim → withdraw | tudo bate |

## Criterios de Sucesso

- [ ] `anchor test` — 5/5 novos + 26 anteriores passando
- [ ] Fee split correto: 1.5% LP, 0.5% protocolo
- [ ] Withdraw bloqueado se liquidity locked, liberado apos settle

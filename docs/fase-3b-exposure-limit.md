# Fase 3b — Exposure Limit 80%

## Objetivo
Pool rejeita bets quando exposicao liquida > 80% da liquidity.

## Implementacao

| Item | Detalhe |
|---|---|
| **Check no place_bet** | `\|exposure_up - exposure_down\| + new_payout <= total_liquidity * 80 / 100` |
| **Erro** | `ExposureLimitExceeded` |

## Logica

```
pool.total_liquidity = 10,000
pool.exposure_up     = 7,200
pool.exposure_down   = 3,600

net_exposure = |7200 - 3600| = 3,600
max_allowed  = 10000 * 80 / 100 = 8,000

Nova bet UP com payout 2,000:
  new_net = 3600 + 2000 = 5,600
  5,600 < 8,000 → ACEITA

Nova bet UP com payout 5,000:
  new_net = 3600 + 5000 = 8,600
  8,600 > 8,000 → REJEITA

Nova bet DOWN (qualquer valor):
  Reduz net_exposure → SEMPRE ACEITA (enquanto pool tiver USDC)
```

## Plano de Teste

| # | Teste | Setup | Expected |
|---|---|---|---|
| 1 | Aceita bet dentro do limite | pool=10k, net_exp=5k, payout=2k | OK (7k < 8k) |
| 2 | Rejeita bet que estoura | pool=10k, net_exp=7k, payout=2k | Erro: ExposureLimitExceeded |
| 3 | Aceita bet no lado oposto | pool=10k, net_exp UP=7k, bet DOWN | OK (reduz exposicao) |
| 4 | Edge case exato | net_exp + payout == 80% | OK (aceita no limite) |

## Criterios de Sucesso

- [ ] `anchor test` — 4/4 novos + 36 anteriores passando
- [ ] Pool nunca fica com exposicao > 80%
- [ ] Bets no lado oposto sempre aceitas

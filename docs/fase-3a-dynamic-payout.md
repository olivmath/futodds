# Fase 3a — Payout Dinamico

## Objetivo
Payout baseado na proporcao UP/DOWN, nao mais fixo 1.8x.

## Implementacao

| Item | Detalhe |
|---|---|
| **Pool PDA** | Adicionar `exposure_up: u64`, `exposure_down: u64` |
| **Formula** | `payout = effective * (1 + opposite_total / (same_total + effective))` |
| **Remover** | Payout fixo 1.8x do place_bet |
| **Atualizar** | exposure no place_bet e settle_bet |

## Exemplos

```
Pool: total_up=8000, total_down=2000
Fee: 2%

Aposta 100 USDC UP:
  effective = 98
  payout = 98 * (1 + 2000 / (8000 + 98)) = 98 * 1.247 = 122 USDC

Aposta 100 USDC DOWN:
  effective = 98
  payout = 98 * (1 + 8000 / (2000 + 98)) = 98 * 4.81 = 471 USDC

Maioria aposta → menor retorno
Minoria aposta → maior retorno
```

## Plano de Teste

| # | Teste | Setup | Expected |
|---|---|---|---|
| 1 | Payout equilibrado | 0 UP, 0 DOWN, bet UP 100 | payout = 98 (1.0x — sem oposicao) |
| 2 | Payout com oposicao | 1000 UP, 1000 DOWN, bet UP 100 | payout ~ 189 (~1.93x) |
| 3 | Maioria UP → payout UP cai | 8000 UP, 2000 DOWN, bet UP 100 | payout ~ 122 (~1.25x) |
| 4 | Minoria DOWN → payout DOWN sobe | 8000 UP, 2000 DOWN, bet DOWN 100 | payout ~ 471 (~4.81x) |
| 5 | Exposure atualiza no settle | settle Won | exposure_up ou _down diminui |

## Criterios de Sucesso

- [ ] `anchor test` — 5/5 novos + 31 anteriores passando
- [ ] Payout varia conforme distribuicao UP/DOWN
- [ ] exposure_up e exposure_down consistentes apos place e settle

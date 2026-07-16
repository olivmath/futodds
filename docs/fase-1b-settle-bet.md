# Fase 1b — settle_bet

## Objetivo
Backend consegue liquidar a aposta comparando odds entry vs expiry.

## Implementacao

| Item | Detalhe |
|---|---|
| **Instruction** | `settle_bet(odds_at_expiry_home)` |
| **Guard** | signer == authority, status == Open, now >= expires_at |
| **Won** | direction=Up e odds subiram → vault → user (payout) |
| **Lost** | direction=Up e odds cairam/igual → USDC fica no vault |
| **Down** | logica inversa |

## Plano de Teste

| # | Teste | Setup -> Action | Expected |
|---|---|---|---|
| 1 | UP ganha (odds subiram) | entry=6500, expiry=6700 | status=Won, user recebe 180 USDC |
| 2 | UP perde (odds cairam) | entry=6500, expiry=6300 | status=Lost, USDC fica no vault |
| 3 | DOWN ganha (odds cairam) | entry=6500, expiry=6300 | status=Won, user recebe payout |
| 4 | DOWN perde (odds subiram) | entry=6500, expiry=6700 | status=Lost |
| 5 | Rejeitar settle antes de expirar | now < expires_at | Erro: BetNotExpired |
| 6 | Rejeitar settle de bet ja settled | status=Won | Erro: BetAlreadySettled |
| 7 | Rejeitar signer nao-autorizado | wallet random | Erro: Unauthorized |

## Criterios de Sucesso

- [ ] `anchor test` — 7/7 novos + 9 anteriores passando
- [ ] Fluxo E2E completo: update_odds → place_bet → update_odds → settle_bet → user recebe USDC
- [ ] Bet PDA status atualizado corretamente

# Fase 3c — cancel_bet

## Objetivo
User cancela aposta antes de expirar e recebe refund.

## Implementacao

| Item | Detalhe |
|---|---|
| **Instruction** | `cancel_bet()` |
| **Guard** | status == Open, now < expires_at, signer == user OR authority |
| **Acao** | Refund amount vault → user (sem fee de cancelamento no MVP) |
| **Atualizar** | Unlock liquidity, ajustar exposure |

## Fluxo

```
cancel_bet():
  1. require!(bet.status == Open)
  2. require!(clock.unix_timestamp < bet.expires_at)
  3. require!(signer == bet.user || signer == authority)
  4. transfer bet.amount do vault → user
  5. pool.locked_liquidity -= bet.payout
  6. pool.exposure_{direction} -= bet.payout
  7. bet.status = Cancelled
```

## Plano de Teste

| # | Teste | Setup | Expected |
|---|---|---|---|
| 1 | User cancela propria bet | bet Open, now < expires | status=Cancelled, USDC devolvido |
| 2 | Backend cancela bet | authority assina | OK |
| 3 | Rejeitar cancel apos expirar | now >= expires_at | Erro: BetExpired |
| 4 | Rejeitar cancel de bet settled | status=Won | Erro: BetAlreadySettled |
| 5 | Exposure/locked ajustados | cancelar bet UP | exposure_up diminui, locked diminui |

## Criterios de Sucesso

- [ ] `anchor test` — 5/5 novos + 40 anteriores passando
- [ ] Fluxo completo: place → cancel → refund → exposure ajustado
- [ ] Pool consistente apos cancel (locked e exposure corretos)

# Fase 1b — settle_bet

## Status

Concluida no programa `betting-engine` e coberta por testes Rust em `programs/betting-engine/tests/test_betting.rs`.

| Area | Estado |
|---|---|
| **On-chain** | Implementado |
| **Testes Rust** | Implementados |
| **Frontend** | Parcial: lista bets da wallet e envia settle, mas depende de input manual de odds de expiracao |
| **Produto real** | Ainda precisa precificacao/oracle automatizado no backend |

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
| **Payout** | Transfere `bet.payout` do vault ATA para `user_token_account` |
| **Signer PDA** | `vault_authority` assina com seeds `["escrow", bet.match_id]` |
| **Status** | `0=Open`, `1=Won`, `2=Lost`, `3=Cancelled` |

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

- [x] `settle_bet` implementado em `programs/betting-engine/src/lib.rs`
- [x] Guard de authority implementado
- [x] Guard de expiracao implementado
- [x] Guard de status Open implementado
- [x] Logica UP/DOWN implementada
- [x] Payout via vault PDA implementado
- [x] Bet PDA status atualizado corretamente
- [x] Testes cobrem 7 cenarios de settlement
- [x] Fluxo E2E local em teste: `update_odds` → `place_bet` → `settle_bet` → payout/status

## Evidencia No Codigo

| Arquivo | O que valida |
|---|---|
| `programs/betting-engine/src/lib.rs` | Instrucao `settle_bet`, guards, status, payout SPL |
| `programs/betting-engine/tests/test_betting.rs` | 7 testes de settlement |
| `app/src/App.tsx` | UI lista bets da wallet e envia `settle_bet` |
| `app/src/testnetOracle.ts` | Codifica `settle_bet` e deriva PDAs/ATAs |

## Pendencias De Produto

| Falta | Motivo |
|---|---|
| Oracle/backend de liquidacao | A UI recebe `settleOdds` manualmente |
| Liquidez real | Fase 1 exige vault com saldo suficiente para pagar 1.8x |
| Remover funding fake da UI | `Fund vault` ainda mascara falta de pool real |
| UX de expiracao | UI nao calcula/filtra automaticamente bets expiradas |

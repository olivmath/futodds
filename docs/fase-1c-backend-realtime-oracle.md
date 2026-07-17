# Fase 1c — Backend Oracle + Realtime Canonico

## Status

Planejada. Esta fase conecta o backend JS ao fluxo on-chain e troca realtime proprio por eventos canonicos emitidos pelos programas Solana.

| Area | Estado |
|---|---|
| **On-chain** | Pendente: eventos Anchor em `oracle-adapter` e `betting-engine` |
| **Backend** | Pendente: Express + odds poller + settlement worker |
| **Frontend** | Pendente: listener Solana WebSocket para eventos Anchor |
| **Docs** | Este documento define o escopo |

## Objetivo

Backend atualiza odds automaticamente, liquida bets expiradas e o frontend recebe realtime a partir de eventos emitidos pelos programas on-chain.

## Fluxo Final

```txt
backend poller
  -> tx update_odds
      -> oracle-adapter emits OddsUpdated
          -> frontend logsSubscribe le evento

backend settlement worker
  -> tx settle_bet
      -> betting-engine emits BetSettled
          -> frontend logsSubscribe atualiza bet/status
```

## Decisoes

| Item | Decisao |
|---|---|
| **Backend** | JS com Express simples |
| **Realtime** | Solana RPC WebSocket, nao SSE/WebSocket proprio |
| **Fonte da verdade** | Eventos e contas on-chain |
| **Odds MVP** | Gerador/poller configuravel por match |
| **Settlement MVP** | Worker varre bets `Open` expiradas e chama `settle_bet` |
| **Fallback frontend** | Refetch de conta on-chain se parse do evento falhar |

## Eventos On-chain

| Programa | Evento | Quando emite | Dados |
|---|---|---|---|
| `oracle-adapter` | `OddsUpdated` | Depois de `update_odds` salvar odds | `authority`, `match_id`, `odds_home`, `odds_away`, `odds_draw`, `updated_at` |
| `betting-engine` | `BetSettled` | Depois de `settle_bet` definir status | `authority`, `user`, `match_id`, `bet`, `direction`, `odds_at_entry`, `odds_at_expiry_home`, `status`, `won`, `settled_at` |

## Backend

| Modulo | Funcao |
|---|---|
| `server.js` | Express app, health/status/admin |
| `config.js` | RPC, keypair, intervalos, match IDs, mint |
| `solana.js` | Connection, signer, PDAs, tx builders |
| `oddsPoller.js` | Gera/busca odds e envia `update_odds` |
| `settlementWorker.js` | Varre bets abertas expiradas e chama `settle_bet` |
| `store.js` | Estado em memoria para matches, txs e erros recentes |

## Endpoints

| Metodo | Rota | Uso |
|---|---|---|
| `GET` | `/health` | Healthcheck |
| `GET` | `/status` | Estado do poller/worker, ultimas txs e erros |
| `GET` | `/matches` | Matches configurados no backend |
| `POST` | `/poller/start` | Iniciar odds poller |
| `POST` | `/poller/stop` | Parar odds poller |
| `POST` | `/settlement/run-once` | Rodar settlement manual |

## Frontend Realtime

| Item | Decisao |
|---|---|
| **Transporte** | Solana RPC WebSocket |
| **Metodo** | `connection.onLogs(programId, callback)` |
| **Fontes** | `oracle-adapter` para odds; `betting-engine` para settlement |
| **Parser** | Decodificador de eventos Anchor usando IDL/discriminator |
| **UI** | Atualiza odds e status de bets sem refresh |

## Task List

| # | Etapa | Entrega | Validacao |
|---|---|---|---|
| 1 | Eventos on-chain | Adicionar eventos Anchor em `oracle-adapter` e `betting-engine` | `cargo test` |
| 2 | IDL/artifacts | Rodar `anchor build` para atualizar IDLs com eventos | `target/idl/*.json` atualizado |
| 3 | Redeploy | Fazer deploy dos programas no cluster configurado | Confirmar program IDs e tx signatures |
| 4 | Backend JS/Express | Criar `backend/` com oracle poller + settlement worker | Testes unitarios + healthcheck |
| 5 | Oracle poller | Backend chama `update_odds` periodicamente | Eventos `OddsUpdated` aparecem nos logs |
| 6 | Settlement worker | Backend encontra bets expiradas e chama `settle_bet` | Eventos `BetSettled` aparecem nos logs |
| 7 | Frontend realtime | Frontend usa Solana WebSocket `logsSubscribe` e parseia eventos Anchor | Odds/status mudam sem refresh |
| 8 | Docs | Atualizar `README.md`, `ARCHITECTURE.md` e docs de fase | Comandos e fluxo documentados |
| 9 | CI local | Rodar Rust + frontend + backend checks | Tudo verde |
| 10 | Commit | Commit assinado com identidade correta | `git log -1 --show-signature` |

## Criterios De Sucesso

- [ ] `oracle-adapter` emite `OddsUpdated`.
- [ ] `betting-engine` emite `BetSettled`.
- [ ] IDLs incluem os eventos novos.
- [ ] Programas redeployados no cluster alvo.
- [ ] Backend JS envia `update_odds` automaticamente.
- [ ] Backend JS executa settlement de bets expiradas.
- [ ] Frontend recebe eventos canonicos via Solana WebSocket.
- [ ] Frontend atualiza odds/status sem refresh manual.
- [ ] README e arquitetura refletem backend JS e realtime on-chain.

## Riscos E Pre-condicoes

| Risco | Impacto |
|---|---|
| Sem SOL na authority/deploy wallet | Deploy ou tx do backend falha |
| Deploy authority diferente | Redeploy pode falhar |
| Program ID muda | Frontend, backend e docs precisam atualizar IDs |
| RPC publico com rate limit | Logs/poller podem oscilar |
| Anchor event parsing no browser | Precisa IDL atualizado e testes focados |
| Authority errada no backend | `update_odds` ou `settle_bet` rejeitam por `Unauthorized` |

## Ordem De Execucao

```txt
1. Contratos + eventos
2. Build + testes Rust
3. Deploy
4. Backend oracle/settlement
5. Frontend logsSubscribe
6. Docs + CI + commit
```

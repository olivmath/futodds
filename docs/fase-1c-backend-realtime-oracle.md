# Fase 1c — Backend Oracle + Realtime Canonico

## Status

Concluida como baseline da Fase 1. A Fase 2 parte deste estado e substitui o escrow por match por pool de liquidez real.

| Area | Estado |
|---|---|
| **On-chain** | Implementado: `OddsUpdated` e `BetSettled` |
| **Backend** | Implementado: Express + odds poller + settlement worker |
| **Frontend** | Implementado: listener Solana WebSocket para eventos Anchor |
| **Docs** | Fase 1 marcada como baseline concluido |

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
| 1 | Eventos on-chain | Adicionar eventos Anchor em `oracle-adapter` e `betting-engine` | Feito: `cargo test` |
| 2 | IDL/artifacts | Rodar `anchor build --ignore-keys` para atualizar IDLs com eventos | Feito: `target/idl/*.json` contem eventos |
| 3 | Redeploy | Fazer deploy dos programas no cluster configurado | Feito para baseline local/testnet da Fase 1 |
| 4 | Backend JS/Express | Criar `backend/` com oracle poller + settlement worker | Feito: testes unitarios + healthcheck |
| 5 | Oracle poller | Backend chama `update_odds` periodicamente | Feito |
| 6 | Settlement worker | Backend encontra bets expiradas e chama `settle_bet` | Feito |
| 7 | Frontend realtime | Frontend usa Solana WebSocket `logsSubscribe` e parseia eventos Anchor | Feito |
| 8 | Docs | Atualizar `README.md`, `ARCHITECTURE.md` e docs de fase | Feito |
| 9 | CI local | Rodar Rust + frontend + backend checks | Feito |
| 10 | Commit | Commit assinado com identidade correta | Feito quando aplicavel |

## Criterios De Sucesso

- [x] `oracle-adapter` emite `OddsUpdated`.
- [x] `betting-engine` emite `BetSettled`.
- [x] IDLs incluem os eventos novos.
- [x] Programas redeployados no cluster alvo com os eventos atuais.
- [x] Backend JS envia `update_odds` automaticamente.
- [x] Backend JS executa settlement de bets expiradas.
- [x] Frontend recebe eventos canonicos via Solana WebSocket.
- [x] Frontend atualiza odds/status sem refresh manual em testnet.
- [x] README e arquitetura refletem backend JS e realtime on-chain.

## Validacao Manual Historica

| # | Teste | Como validar |
|---|---|---|
| 1 | Deploy contem eventos atuais | `anchor build --ignore-keys`, deploy/redeploy se necessario e confirmar program IDs |
| 2 | Backend sobe com authority correta | `cd backend && npm start`; abrir `/health` e checar `ok: true` |
| 3 | Poller emite odds | `POST /poller/start`; confirmar tx em `/status` e evento `OddsUpdated` no app |
| 4 | Worker liquida bet expirada | Criar bet, aguardar expirar, `POST /settlement/run-once`; confirmar `BetSettled` |
| 5 | Realtime no browser | Deixar aba Events aberta e validar odds/status mudando sem refresh |

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

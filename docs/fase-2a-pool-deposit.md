# Fase 2a — create_pool + deposit

## Objetivo
LPs conseguem criar pool e depositar USDC, recebendo shares.

## Implementacao

| Item | Detalhe |
|---|---|
| **Program** | `liquidity-pool` |
| **PDA Pool** | seeds: `["pool", match_id]` |
| **PDA LpPosition** | seeds: `["lp", pool, owner]` |
| **PDA Vault** | seeds: `["vault", match_id]` (token account USDC) |
| **Instructions** | `create_pool(match_id, fee_rate)`, `deposit(amount)` |
| **Shares** | 1o deposit: shares = amount. Depois: shares = amount * total_shares / total_liquidity |

## Account Schemas

```rust
pub struct Pool {
    pub authority: Pubkey,
    pub match_id: String,
    pub vault: Pubkey,
    pub total_liquidity: u64,
    pub locked_liquidity: u64,
    pub fee_rate: u16,           // 200 = 2.00%
    pub total_shares: u64,
    pub bump: u8,
}

pub struct LpPosition {
    pub owner: Pubkey,
    pub pool: Pubkey,
    pub shares: u64,
    pub deposited_at: i64,
    pub bump: u8,
}
```

## Plano de Teste

| # | Teste | Input | Expected |
|---|---|---|---|
| 1 | Criar pool | `create_pool("match_1", 200)` | Pool PDA criado, fee_rate=200 |
| 2 | Primeiro deposit | `deposit(10_000)` | shares=10_000, vault saldo=10_000 |
| 3 | Segundo deposit (outro LP) | `deposit(5_000)` | shares=5_000, vault saldo=15_000 |
| 4 | Rejeitar deposit com match settled | status=Settled | Erro |
| 5 | Rejeitar deposit abaixo do minimo | `deposit(50)` | Erro |

## Criterios de Sucesso

- [ ] `anchor build` compila (3 programs)
- [ ] `anchor test` — 5/5 novos + 16 anteriores passando
- [ ] LpPosition PDA criado com shares corretas
- [ ] USDC no vault confere com total deposits

## Status

Concluida no programa `liquidity-pool` (PR feat/pool-deposit) e coberta por testes Rust em `programs/liquidity-pool/tests/test_pool.rs` (11 testes: matriz da fase + fee-rate invalido, match inexistente, pool em partida settled, deposito repetido, saldo insuficiente). Decisao: shares via `LpPosition` PDA conforme esta spec; a matematica de shares usa u128 intermediario. `create_pool` e permissionless (quem cria paga o rent), mas `pool.authority` e a authority do oraculo.

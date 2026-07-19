# Fase 2a — create_pool + deposit

## Objetivo
LPs conseguem criar pool e depositar USDC, recebendo shares.

## Status

Concluida no fluxo ativo do programa `betting-engine`. Um crate `liquidity-pool` tambem existe como scaffold/teste isolado, mas a implementacao usada por apostas fica no `betting-engine` para que o mesmo programa controle `Pool`, `Bet` e o vault PDA.

## Implementacao

| Item | Detalhe |
|---|---|
| **Program ativo** | `betting-engine` |
| **Program auxiliar** | `liquidity-pool` scaffold/teste isolado |
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
    pub mint: Pubkey,
    pub vault: Pubkey,
    pub total_liquidity: u64,
    pub locked_liquidity: u64,
    pub fee_rate: u16,           // 200 = 2.00%
    pub protocol_fees_accumulated: u64,
    pub lp_fees_accumulated: u64,
    pub fees_per_share: u128,
    pub total_shares: u64,
    pub bump: u8,
    pub vault_authority_bump: u8,
}

pub struct LpPosition {
    pub owner: Pubkey,
    pub pool: Pubkey,
    pub shares: u64,
    pub deposited_at: i64,
    pub fees_claimed_per_share: u128,
    pub bump: u8,
}
```

## Plano de Teste

| # | Teste | Input | Expected |
|---|---|---|---|
| 1 | Criar pool | `create_pool("match_1", 200)` | Pool PDA criado, fee_rate=200 |
| 2 | Primeiro deposit | `deposit(10_000)` | shares=10_000, vault saldo=10_000 |
| 3 | Segundo deposit (outro LP) | `deposit(5_000)` | shares=5_000, vault saldo=15_000 |
| 4 | Rejeitar fee invalida | `create_pool("match_1", 1001)` | Erro: InvalidFeeRate |
| 5 | Rejeitar deposit abaixo do minimo | `deposit(50)` | Erro |

## Criterios de Sucesso

- [x] `anchor build` compila (3 programs)
- [x] `cargo test` — oracle, betting e liquidity-pool passando
- [x] LpPosition PDA criado com shares corretas
- [x] USDC no vault confere com total deposits

## Evidencia No Codigo

| Arquivo | O que valida |
|---|---|
| `programs/betting-engine/src/lib.rs` | `create_pool`, `deposit`, `Pool`, `LpPosition` ativos |
| `programs/betting-engine/tests/test_betting.rs` | Pool usado no fluxo real de apostas |
| `programs/liquidity-pool/src/lib.rs` | Scaffold isolado de pool |
| `programs/liquidity-pool/tests/test_liquidity_pool.rs` | 5 testes isolados de create/deposit |

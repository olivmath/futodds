use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use oracle_adapter::{MatchAccount, MATCH_STATUS_SETTLED};

declare_id!("8AAJ5doFwKPNHJ3gZyrfkJTM32ZQB81VU76dHsWvyi4L");

const MIN_DEPOSIT: u64 = 1_000_000; // 1 USDC (6 decimals)
const MAX_FEE_RATE: u16 = 1_000; // 10.00% — sanity cap, product default is 200 (2%)

#[program]
pub mod liquidity_pool {
    use super::*;

    pub fn create_pool(ctx: Context<CreatePool>, match_id: String, fee_rate: u16) -> Result<()> {
        require!(fee_rate <= MAX_FEE_RATE, PoolError::InvalidFeeRate);

        let match_account = &ctx.accounts.match_account;
        require!(
            match_account.status != MATCH_STATUS_SETTLED,
            PoolError::MatchAlreadySettled
        );

        let pool = &mut ctx.accounts.pool;
        // Admin operations (fee claims, pauses) belong to the oracle authority,
        // regardless of who paid the rent to create the pool.
        pool.authority = match_account.authority;
        pool.match_id = match_id;
        pool.vault = ctx.accounts.vault.key();
        pool.total_liquidity = 0;
        pool.locked_liquidity = 0;
        pool.fee_rate = fee_rate;
        pool.total_shares = 0;
        pool.bump = ctx.bumps.pool;

        emit!(PoolCreated {
            match_id: pool.match_id.clone(),
            pool: pool.key(),
            vault: pool.vault,
            fee_rate,
        });

        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        require!(amount >= MIN_DEPOSIT, PoolError::DepositTooSmall);
        require!(
            ctx.accounts.match_account.status != MATCH_STATUS_SETTLED,
            PoolError::MatchAlreadySettled
        );

        let pool = &mut ctx.accounts.pool;

        // First deposit prices shares 1:1; later deposits are pro-rata so a
        // share always represents the same slice of the pool.
        let shares = if pool.total_shares == 0 {
            amount
        } else {
            // u128 intermediate: amount × total_shares overflows u64 at
            // realistic pool sizes (e.g. 5k USDC × 10k-share pool).
            let wide = (amount as u128)
                .checked_mul(pool.total_shares as u128)
                .ok_or(PoolError::MathOverflow)?
                .checked_div(pool.total_liquidity as u128)
                .ok_or(PoolError::MathOverflow)?;
            u64::try_from(wide).map_err(|_| PoolError::MathOverflow)?
        };
        require!(shares > 0, PoolError::ZeroShares);

        pool.total_liquidity = pool
            .total_liquidity
            .checked_add(amount)
            .ok_or(PoolError::MathOverflow)?;
        pool.total_shares = pool
            .total_shares
            .checked_add(shares)
            .ok_or(PoolError::MathOverflow)?;

        let position = &mut ctx.accounts.lp_position;
        if position.owner == Pubkey::default() {
            position.owner = ctx.accounts.owner.key();
            position.pool = pool.key();
            position.deposited_at = Clock::get()?.unix_timestamp;
            position.bump = ctx.bumps.lp_position;
        }
        position.shares = position
            .shares
            .checked_add(shares)
            .ok_or(PoolError::MathOverflow)?;

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.owner_token_account.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.owner.to_account_info(),
                },
            ),
            amount,
        )?;

        emit!(PoolDeposited {
            match_id: pool.match_id.clone(),
            owner: ctx.accounts.owner.key(),
            amount,
            shares,
            total_liquidity: pool.total_liquidity,
            total_shares: pool.total_shares,
        });

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(match_id: String)]
pub struct CreatePool<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// The oracle match this pool backs — must exist and not be settled
    #[account(
        seeds = [b"match", match_id.as_bytes()],
        bump = match_account.bump,
        seeds::program = oracle_adapter::ID,
    )]
    pub match_account: Account<'info, MatchAccount>,

    #[account(
        init,
        payer = payer,
        space = 8 + Pool::INIT_SPACE,
        seeds = [b"pool", match_id.as_bytes()],
        bump,
    )]
    pub pool: Account<'info, Pool>,

    pub mint: Account<'info, Mint>,

    #[account(
        init,
        payer = payer,
        seeds = [b"vault", match_id.as_bytes()],
        bump,
        token::mint = mint,
        token::authority = pool,
    )]
    pub vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [b"pool", pool.match_id.as_bytes()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, Pool>,

    /// The oracle match backing this pool — deposits close once it settles
    #[account(
        seeds = [b"match", pool.match_id.as_bytes()],
        bump = match_account.bump,
        seeds::program = oracle_adapter::ID,
    )]
    pub match_account: Account<'info, MatchAccount>,

    #[account(
        init_if_needed,
        payer = owner,
        space = 8 + LpPosition::INIT_SPACE,
        seeds = [b"lp", pool.key().as_ref(), owner.key().as_ref()],
        bump,
    )]
    pub lp_position: Account<'info, LpPosition>,

    #[account(
        mut,
        seeds = [b"vault", pool.match_id.as_bytes()],
        bump,
        constraint = vault.key() == pool.vault @ PoolError::VaultMismatch,
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = owner_token_account.owner == owner.key(),
        constraint = owner_token_account.mint == vault.mint,
    )]
    pub owner_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[account]
#[derive(InitSpace)]
pub struct Pool {
    pub authority: Pubkey,
    #[max_len(36)]
    pub match_id: String,
    pub vault: Pubkey,
    pub total_liquidity: u64,
    pub locked_liquidity: u64,
    /// 200 = 2.00%
    pub fee_rate: u16,
    pub total_shares: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct LpPosition {
    pub owner: Pubkey,
    pub pool: Pubkey,
    pub shares: u64,
    pub deposited_at: i64,
    pub bump: u8,
}

#[event]
pub struct PoolCreated {
    pub match_id: String,
    pub pool: Pubkey,
    pub vault: Pubkey,
    pub fee_rate: u16,
}

#[event]
pub struct PoolDeposited {
    pub match_id: String,
    pub owner: Pubkey,
    pub amount: u64,
    pub shares: u64,
    pub total_liquidity: u64,
    pub total_shares: u64,
}

#[error_code]
pub enum PoolError {
    #[msg("Fee rate must be at most 1000 (10%)")]
    InvalidFeeRate,
    #[msg("Minimum deposit is 1 USDC (1_000_000 units)")]
    DepositTooSmall,
    #[msg("Match is settled — pool no longer accepts deposits")]
    MatchAlreadySettled,
    #[msg("Deposit is too small to mint any share")]
    ZeroShares,
    #[msg("Vault does not match the pool")]
    VaultMismatch,
    #[msg("Arithmetic overflow")]
    MathOverflow,
}

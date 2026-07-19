use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("B4LZJT28Ucqe3eCpSrhQCiBhZ2dfCxH1eMVWfQqShgy9");

pub const MIN_DEPOSIT_AMOUNT: u64 = 1_000_000;
pub const MAX_FEE_RATE: u16 = 1_000;
pub const FEE_SCALE: u128 = 1_000_000_000_000;

#[program]
pub mod liquidity_pool {
    use super::*;

    pub fn create_pool(ctx: Context<CreatePool>, match_id: String, fee_rate: u16) -> Result<()> {
        require!(
            fee_rate <= MAX_FEE_RATE,
            LiquidityPoolError::InvalidFeeRate
        );

        let pool = &mut ctx.accounts.pool;
        pool.authority = ctx.accounts.authority.key();
        pool.match_id = match_id;
        pool.mint = ctx.accounts.mint.key();
        pool.vault = ctx.accounts.vault.key();
        pool.total_liquidity = 0;
        pool.locked_liquidity = 0;
        pool.fee_rate = fee_rate;
        pool.protocol_fees_accumulated = 0;
        pool.fees_per_share = 0;
        pool.total_shares = 0;
        pool.bump = ctx.bumps.pool;
        pool.vault_authority_bump = ctx.bumps.vault_authority;

        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        require!(
            amount >= MIN_DEPOSIT_AMOUNT,
            LiquidityPoolError::DepositTooSmall
        );

        let pool = &mut ctx.accounts.pool;
        let shares = if pool.total_shares == 0 {
            amount
        } else {
            checked_u128_to_u64(
                (amount as u128)
                    .checked_mul(pool.total_shares as u128)
                    .ok_or(LiquidityPoolError::MathOverflow)?
                    .checked_div(pool.total_liquidity as u128)
                    .ok_or(LiquidityPoolError::MathOverflow)?,
            )?
        };

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

        let lp_position = &mut ctx.accounts.lp_position;
        lp_position.owner = ctx.accounts.owner.key();
        lp_position.pool = pool.key();
        lp_position.shares = lp_position
            .shares
            .checked_add(shares)
            .ok_or(LiquidityPoolError::MathOverflow)?;
        lp_position.deposited_at = Clock::get()?.unix_timestamp;
        lp_position.fees_claimed_per_share = pool.fees_per_share;
        lp_position.bump = ctx.bumps.lp_position;

        pool.total_liquidity = pool
            .total_liquidity
            .checked_add(amount)
            .ok_or(LiquidityPoolError::MathOverflow)?;
        pool.total_shares = pool
            .total_shares
            .checked_add(shares)
            .ok_or(LiquidityPoolError::MathOverflow)?;

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(match_id: String)]
pub struct CreatePool<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + Pool::INIT_SPACE,
        seeds = [b"pool", match_id.as_bytes()],
        bump,
    )]
    pub pool: Account<'info, Pool>,

    pub mint: Account<'info, Mint>,

    #[account(
        seeds = [b"vault", match_id.as_bytes()],
        bump,
    )]
    /// CHECK: PDA authority for the pool vault token account.
    pub vault_authority: UncheckedAccount<'info>,

    #[account(
        init,
        payer = authority,
        associated_token::mint = mint,
        associated_token::authority = vault_authority,
    )]
    pub vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(mut, has_one = mint, has_one = vault)]
    pub pool: Account<'info, Pool>,

    #[account(
        init_if_needed,
        payer = owner,
        space = 8 + LpPosition::INIT_SPACE,
        seeds = [b"lp", pool.key().as_ref(), owner.key().as_ref()],
        bump,
    )]
    pub lp_position: Account<'info, LpPosition>,

    pub mint: Account<'info, Mint>,

    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = owner_token_account.owner == owner.key(),
        constraint = owner_token_account.mint == mint.key(),
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
    pub mint: Pubkey,
    pub vault: Pubkey,
    pub total_liquidity: u64,
    pub locked_liquidity: u64,
    pub fee_rate: u16,
    pub protocol_fees_accumulated: u64,
    pub fees_per_share: u128,
    pub total_shares: u64,
    pub bump: u8,
    pub vault_authority_bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct LpPosition {
    pub owner: Pubkey,
    pub pool: Pubkey,
    pub shares: u64,
    pub deposited_at: i64,
    pub fees_claimed_per_share: u128,
    pub bump: u8,
}

#[error_code]
pub enum LiquidityPoolError {
    #[msg("Fee rate is too high")]
    InvalidFeeRate,
    #[msg("Deposit is below the minimum amount")]
    DepositTooSmall,
    #[msg("Withdraw amount must be greater than zero")]
    WithdrawTooSmall,
    #[msg("LP position does not have enough shares")]
    InsufficientShares,
    #[msg("Pool does not have enough unlocked liquidity")]
    InsufficientLiquidity,
    #[msg("LP shares are required")]
    NoLpShares,
    #[msg("Math overflow")]
    MathOverflow,
}

pub fn checked_u128_to_u64(value: u128) -> Result<u64> {
    u64::try_from(value).map_err(|_| LiquidityPoolError::MathOverflow.into())
}

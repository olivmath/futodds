use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use oracle_adapter::MatchAccount;

declare_id!("H3ekojbWVFfzYnTmiNUejMkiB2pEQuf6wyH7QyyMQkz1");

const VALID_WINDOWS: [u32; 4] = [60, 300, 600, 900];
const MIN_BET_AMOUNT: u64 = 1_000_000; // 1 USDC (6 decimals)
const MIN_DEPOSIT_AMOUNT: u64 = 1_000_000; // 1 USDC (6 decimals)
const MAX_FEE_RATE: u16 = 1_000; // 10.00%
const PAYOUT_NUMERATOR: u64 = 18;
const PAYOUT_DENOMINATOR: u64 = 10;
const BPS_DENOMINATOR: u64 = 10_000;
const PROTOCOL_FEE_BPS_SHARE: u64 = 2_500; // 25% of the bet fee
pub const FEE_SCALE: u128 = 1_000_000_000_000;

#[program]
pub mod betting_engine {
    use super::*;

    pub fn create_pool(ctx: Context<CreatePool>, match_id: String, fee_rate: u16) -> Result<()> {
        require!(fee_rate <= MAX_FEE_RATE, BettingError::InvalidFeeRate);

        let pool = &mut ctx.accounts.pool;
        pool.authority = ctx.accounts.authority.key();
        pool.match_id = match_id;
        pool.mint = ctx.accounts.mint.key();
        pool.vault = ctx.accounts.vault.key();
        pool.total_liquidity = 0;
        pool.locked_liquidity = 0;
        pool.fee_rate = fee_rate;
        pool.protocol_fees_accumulated = 0;
        pool.lp_fees_accumulated = 0;
        pool.fees_per_share = 0;
        pool.total_shares = 0;
        pool.bump = ctx.bumps.pool;
        pool.vault_authority_bump = ctx.bumps.vault_authority;

        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        require!(amount >= MIN_DEPOSIT_AMOUNT, BettingError::DepositTooSmall);

        let pool = &mut ctx.accounts.pool;
        let shares = if pool.total_shares == 0 {
            amount
        } else {
            checked_u128_to_u64(
                (amount as u128)
                    .checked_mul(pool.total_shares as u128)
                    .ok_or(BettingError::MathOverflow)?
                    .checked_div(pool.total_liquidity as u128)
                    .ok_or(BettingError::MathOverflow)?,
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
            .ok_or(BettingError::MathOverflow)?;
        lp_position.deposited_at = Clock::get()?.unix_timestamp;
        lp_position.fees_claimed_per_share = pool.fees_per_share;
        lp_position.bump = ctx.bumps.lp_position;

        pool.total_liquidity = pool
            .total_liquidity
            .checked_add(amount)
            .ok_or(BettingError::MathOverflow)?;
        pool.total_shares = pool
            .total_shares
            .checked_add(shares)
            .ok_or(BettingError::MathOverflow)?;

        Ok(())
    }

    pub fn place_bet(
        ctx: Context<PlaceBet>,
        direction: u8,
        window_secs: u32,
        amount: u64,
        nonce: u32,
    ) -> Result<()> {
        require!(direction <= 1, BettingError::InvalidDirection);
        require!(
            VALID_WINDOWS.contains(&window_secs),
            BettingError::InvalidWindow
        );
        require!(amount >= MIN_BET_AMOUNT, BettingError::BetTooSmall);

        let match_account = &ctx.accounts.match_account;
        let clock = Clock::get()?;
        let pool = &mut ctx.accounts.pool;
        require!(
            pool.match_id == match_account.match_id,
            BettingError::PoolMatchMismatch
        );
        require!(
            pool.mint == ctx.accounts.mint.key(),
            BettingError::PoolMintMismatch
        );
        require!(pool.total_shares > 0, BettingError::NoLiquidity);

        let fee = amount
            .checked_mul(pool.fee_rate as u64)
            .ok_or(BettingError::MathOverflow)?
            .checked_div(BPS_DENOMINATOR)
            .ok_or(BettingError::MathOverflow)?;
        let protocol_fee = fee
            .checked_mul(PROTOCOL_FEE_BPS_SHARE)
            .ok_or(BettingError::MathOverflow)?
            .checked_div(BPS_DENOMINATOR)
            .ok_or(BettingError::MathOverflow)?;
        let lp_fee = fee
            .checked_sub(protocol_fee)
            .ok_or(BettingError::MathOverflow)?;
        let effective_amount = amount.checked_sub(fee).ok_or(BettingError::MathOverflow)?;
        let payout = effective_amount
            .checked_mul(PAYOUT_NUMERATOR)
            .ok_or(BettingError::MathOverflow)?
            .checked_div(PAYOUT_DENOMINATOR)
            .ok_or(BettingError::MathOverflow)?;
        let available_liquidity = pool
            .total_liquidity
            .checked_sub(pool.locked_liquidity)
            .ok_or(BettingError::MathOverflow)?;
        require!(
            available_liquidity >= payout,
            BettingError::InsufficientLiquidity
        );

        let bet = &mut ctx.accounts.bet;
        bet.user = ctx.accounts.user.key();
        bet.authority = match_account.authority;
        bet.match_id = match_account.match_id.clone();
        bet.direction = direction;
        bet.odds_at_entry = match_account.odds_home;
        bet.amount = amount;
        bet.payout = payout;
        bet.window_secs = window_secs;
        bet.created_at = clock.unix_timestamp;
        bet.expires_at = clock.unix_timestamp + window_secs as i64;
        bet.status = 0; // Open
        bet.nonce = nonce;
        bet.bump = ctx.bumps.bet;

        // Transfer USDC from user to vault
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.user_token_account.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            amount,
        )?;

        pool.total_liquidity = pool
            .total_liquidity
            .checked_add(amount)
            .ok_or(BettingError::MathOverflow)?;
        pool.locked_liquidity = pool
            .locked_liquidity
            .checked_add(payout)
            .ok_or(BettingError::MathOverflow)?;
        pool.protocol_fees_accumulated = pool
            .protocol_fees_accumulated
            .checked_add(protocol_fee)
            .ok_or(BettingError::MathOverflow)?;
        pool.lp_fees_accumulated = pool
            .lp_fees_accumulated
            .checked_add(lp_fee)
            .ok_or(BettingError::MathOverflow)?;
        pool.fees_per_share = pool
            .fees_per_share
            .checked_add(
                (lp_fee as u128)
                    .checked_mul(FEE_SCALE)
                    .ok_or(BettingError::MathOverflow)?
                    .checked_div(pool.total_shares as u128)
                    .ok_or(BettingError::MathOverflow)?,
            )
            .ok_or(BettingError::MathOverflow)?;

        Ok(())
    }

    pub fn settle_bet(ctx: Context<SettleBet>, odds_at_expiry_home: u16) -> Result<()> {
        let bet = &mut ctx.accounts.bet;
        require!(
            ctx.accounts.authority.key() == bet.authority,
            BettingError::Unauthorized
        );
        require!(bet.status == 0, BettingError::BetAlreadySettled);
        let pool = &mut ctx.accounts.pool;
        require!(
            pool.match_id == bet.match_id,
            BettingError::PoolMatchMismatch
        );
        require!(
            pool.mint == ctx.accounts.mint.key(),
            BettingError::PoolMintMismatch
        );

        let clock = Clock::get()?;
        require!(
            clock.unix_timestamp >= bet.expires_at,
            BettingError::BetNotExpired
        );

        let won = match bet.direction {
            0 => odds_at_expiry_home > bet.odds_at_entry, // Up
            1 => odds_at_expiry_home < bet.odds_at_entry, // Down
            _ => false,
        };

        pool.locked_liquidity = pool
            .locked_liquidity
            .checked_sub(bet.payout)
            .ok_or(BettingError::MathOverflow)?;

        if won {
            bet.status = 1; // Won

            let match_id = bet.match_id.as_bytes();
            let seeds: &[&[u8]] = &[b"vault", match_id, &[pool.vault_authority_bump]];
            let signer_seeds = &[seeds];

            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.key(),
                    Transfer {
                        from: ctx.accounts.vault.to_account_info(),
                        to: ctx.accounts.user_token_account.to_account_info(),
                        authority: ctx.accounts.vault_authority.to_account_info(),
                    },
                    signer_seeds,
                ),
                bet.payout,
            )?;
            pool.total_liquidity = pool
                .total_liquidity
                .checked_sub(bet.payout)
                .ok_or(BettingError::MathOverflow)?;
        } else {
            bet.status = 2; // Lost
        }

        emit!(BetSettled {
            authority: ctx.accounts.authority.key(),
            user: bet.user,
            match_id: bet.match_id.clone(),
            bet: bet.key(),
            direction: bet.direction,
            odds_at_entry: bet.odds_at_entry,
            odds_at_expiry_home,
            status: bet.status,
            won,
            settled_at: clock.unix_timestamp,
        });

        Ok(())
    }

    pub fn claim_fees(ctx: Context<ClaimFees>) -> Result<()> {
        let pending = pending_fees(&ctx.accounts.pool, &ctx.accounts.lp_position)?;
        ctx.accounts.lp_position.fees_claimed_per_share = ctx.accounts.pool.fees_per_share;

        if pending == 0 {
            return Ok(());
        }

        let match_id = ctx.accounts.pool.match_id.as_bytes();
        let seeds: &[&[u8]] = &[
            b"vault",
            match_id,
            &[ctx.accounts.pool.vault_authority_bump],
        ];
        let signer_seeds = &[seeds];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.owner_token_account.to_account_info(),
                    authority: ctx.accounts.vault_authority.to_account_info(),
                },
                signer_seeds,
            ),
            pending,
        )?;

        ctx.accounts.pool.total_liquidity = ctx
            .accounts
            .pool
            .total_liquidity
            .checked_sub(pending)
            .ok_or(BettingError::MathOverflow)?;
        ctx.accounts.pool.lp_fees_accumulated = ctx
            .accounts
            .pool
            .lp_fees_accumulated
            .checked_sub(pending)
            .ok_or(BettingError::MathOverflow)?;

        Ok(())
    }

    pub fn withdraw(ctx: Context<Withdraw>, shares: u64) -> Result<()> {
        require!(shares > 0, BettingError::WithdrawTooSmall);
        require!(
            ctx.accounts.lp_position.shares >= shares,
            BettingError::InsufficientShares
        );

        let pending = pending_fees(&ctx.accounts.pool, &ctx.accounts.lp_position)?;
        let principal_liquidity = ctx
            .accounts
            .pool
            .total_liquidity
            .checked_sub(ctx.accounts.pool.protocol_fees_accumulated)
            .ok_or(BettingError::MathOverflow)?
            .checked_sub(ctx.accounts.pool.lp_fees_accumulated)
            .ok_or(BettingError::MathOverflow)?;
        let withdraw_amount = checked_u128_to_u64(
            (shares as u128)
                .checked_mul(principal_liquidity as u128)
                .ok_or(BettingError::MathOverflow)?
                .checked_div(ctx.accounts.pool.total_shares as u128)
                .ok_or(BettingError::MathOverflow)?,
        )?;
        let total_transfer = withdraw_amount
            .checked_add(pending)
            .ok_or(BettingError::MathOverflow)?;
        let available = ctx
            .accounts
            .pool
            .total_liquidity
            .checked_sub(ctx.accounts.pool.locked_liquidity)
            .ok_or(BettingError::MathOverflow)?;
        require!(
            total_transfer <= available,
            BettingError::InsufficientLiquidity
        );

        ctx.accounts.lp_position.shares = ctx
            .accounts
            .lp_position
            .shares
            .checked_sub(shares)
            .ok_or(BettingError::MathOverflow)?;
        ctx.accounts.lp_position.fees_claimed_per_share = ctx.accounts.pool.fees_per_share;
        ctx.accounts.pool.total_shares = ctx
            .accounts
            .pool
            .total_shares
            .checked_sub(shares)
            .ok_or(BettingError::MathOverflow)?;
        ctx.accounts.pool.total_liquidity = ctx
            .accounts
            .pool
            .total_liquidity
            .checked_sub(total_transfer)
            .ok_or(BettingError::MathOverflow)?;
        ctx.accounts.pool.lp_fees_accumulated = ctx
            .accounts
            .pool
            .lp_fees_accumulated
            .checked_sub(pending)
            .ok_or(BettingError::MathOverflow)?;

        let match_id = ctx.accounts.pool.match_id.as_bytes();
        let seeds: &[&[u8]] = &[
            b"vault",
            match_id,
            &[ctx.accounts.pool.vault_authority_bump],
        ];
        let signer_seeds = &[seeds];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.key(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.owner_token_account.to_account_info(),
                    authority: ctx.accounts.vault_authority.to_account_info(),
                },
                signer_seeds,
            ),
            total_transfer,
        )?;

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

#[derive(Accounts)]
pub struct ClaimFees<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(mut, has_one = mint, has_one = vault)]
    pub pool: Account<'info, Pool>,

    #[account(
        mut,
        seeds = [b"lp", pool.key().as_ref(), owner.key().as_ref()],
        bump = lp_position.bump,
    )]
    pub lp_position: Account<'info, LpPosition>,

    pub mint: Account<'info, Mint>,

    #[account(
        seeds = [b"vault", pool.match_id.as_bytes()],
        bump = pool.vault_authority_bump,
    )]
    /// CHECK: PDA authority for the pool vault token account.
    pub vault_authority: UncheckedAccount<'info>,

    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = owner_token_account.owner == owner.key(),
        constraint = owner_token_account.mint == mint.key(),
    )]
    pub owner_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(mut, has_one = mint, has_one = vault)]
    pub pool: Account<'info, Pool>,

    #[account(
        mut,
        seeds = [b"lp", pool.key().as_ref(), owner.key().as_ref()],
        bump = lp_position.bump,
    )]
    pub lp_position: Account<'info, LpPosition>,

    pub mint: Account<'info, Mint>,

    #[account(
        seeds = [b"vault", pool.match_id.as_bytes()],
        bump = pool.vault_authority_bump,
    )]
    /// CHECK: PDA authority for the pool vault token account.
    pub vault_authority: UncheckedAccount<'info>,

    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = owner_token_account.owner == owner.key(),
        constraint = owner_token_account.mint == mint.key(),
    )]
    pub owner_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[event]
pub struct BetSettled {
    pub authority: Pubkey,
    pub user: Pubkey,
    pub match_id: String,
    pub bet: Pubkey,
    pub direction: u8,
    pub odds_at_entry: u16,
    pub odds_at_expiry_home: u16,
    pub status: u8,
    pub won: bool,
    pub settled_at: i64,
}

#[derive(Accounts)]
#[instruction(direction: u8, window_secs: u32, amount: u64, nonce: u32)]
pub struct PlaceBet<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        init,
        payer = user,
        space = 8 + Bet::INIT_SPACE,
        seeds = [b"bet", match_account.match_id.as_bytes(), user.key().as_ref(), &nonce.to_le_bytes()],
        bump,
    )]
    pub bet: Account<'info, Bet>,

    /// The oracle match account to read odds from
    pub match_account: Account<'info, MatchAccount>,

    pub mint: Account<'info, Mint>,

    #[account(mut, has_one = mint, has_one = vault)]
    pub pool: Account<'info, Pool>,

    #[account(
        seeds = [b"vault", pool.match_id.as_bytes()],
        bump = pool.vault_authority_bump,
    )]
    /// CHECK: PDA authority for the liquidity pool token account.
    pub vault_authority: UncheckedAccount<'info>,

    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = user_token_account.owner == user.key(),
        constraint = user_token_account.mint == mint.key(),
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SettleBet<'info> {
    pub authority: Signer<'info>,

    #[account(mut)]
    pub bet: Account<'info, Bet>,

    #[account(mut, has_one = mint, has_one = vault)]
    pub pool: Account<'info, Pool>,

    #[account(
        seeds = [b"vault", pool.match_id.as_bytes()],
        bump = pool.vault_authority_bump,
    )]
    /// CHECK: PDA authority for the liquidity pool token account.
    pub vault_authority: UncheckedAccount<'info>,

    #[account(mut)]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = user_token_account.owner == bet.user,
        constraint = user_token_account.mint == mint.key(),
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    pub mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
}

#[account]
#[derive(InitSpace)]
pub struct Bet {
    pub user: Pubkey,
    pub authority: Pubkey,
    #[max_len(36)]
    pub match_id: String,
    pub direction: u8,
    pub odds_at_entry: u16,
    pub amount: u64,
    pub payout: u64,
    pub window_secs: u32,
    pub created_at: i64,
    pub expires_at: i64,
    pub status: u8,
    pub nonce: u32,
    pub bump: u8,
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
    pub lp_fees_accumulated: u64,
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
pub enum BettingError {
    #[msg("Direction must be 0 (Up) or 1 (Down)")]
    InvalidDirection,
    #[msg("Window must be one of: 60, 300, 600, 900 seconds")]
    InvalidWindow,
    #[msg("Minimum bet is 1 USDC (1_000_000 lamports)")]
    BetTooSmall,
    #[msg("Bet has not expired yet")]
    BetNotExpired,
    #[msg("Bet has already been settled")]
    BetAlreadySettled,
    #[msg("Unauthorized signer")]
    Unauthorized,
    #[msg("Fee rate is too high")]
    InvalidFeeRate,
    #[msg("Deposit is below the minimum amount")]
    DepositTooSmall,
    #[msg("Withdraw amount must be greater than zero")]
    WithdrawTooSmall,
    #[msg("LP position does not have enough shares")]
    InsufficientShares,
    #[msg("Pool match does not match bet match")]
    PoolMatchMismatch,
    #[msg("Pool mint does not match token mint")]
    PoolMintMismatch,
    #[msg("Pool does not have liquidity")]
    NoLiquidity,
    #[msg("Pool does not have enough unlocked liquidity")]
    InsufficientLiquidity,
    #[msg("Math overflow")]
    MathOverflow,
}

pub fn checked_u128_to_u64(value: u128) -> Result<u64> {
    u64::try_from(value).map_err(|_| BettingError::MathOverflow.into())
}

pub fn pending_fees(pool: &Pool, lp_position: &LpPosition) -> Result<u64> {
    let delta = pool
        .fees_per_share
        .checked_sub(lp_position.fees_claimed_per_share)
        .ok_or(BettingError::MathOverflow)?;
    checked_u128_to_u64(
        delta
            .checked_mul(lp_position.shares as u128)
            .ok_or(BettingError::MathOverflow)?
            .checked_div(FEE_SCALE)
            .ok_or(BettingError::MathOverflow)?,
    )
}

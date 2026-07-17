use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use oracle_adapter::MatchAccount;

declare_id!("GoccKzkMS5BWRmrbLdGKzqKUUcksZB3DftW82F7boCoQ");

const VALID_WINDOWS: [u32; 4] = [60, 300, 600, 900];
const MIN_BET_AMOUNT: u64 = 1_000_000; // 1 USDC (6 decimals)
const PAYOUT_NUMERATOR: u64 = 18;
const PAYOUT_DENOMINATOR: u64 = 10;

#[program]
pub mod betting_engine {
    use super::*;

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

        let bet = &mut ctx.accounts.bet;
        bet.user = ctx.accounts.user.key();
        bet.authority = match_account.authority;
        bet.match_id = match_account.match_id.clone();
        bet.direction = direction;
        bet.odds_at_entry = match_account.odds_home;
        bet.amount = amount;
        bet.payout = amount * PAYOUT_NUMERATOR / PAYOUT_DENOMINATOR;
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

        Ok(())
    }

    pub fn settle_bet(ctx: Context<SettleBet>, odds_at_expiry_home: u16) -> Result<()> {
        let bet = &mut ctx.accounts.bet;
        require!(
            ctx.accounts.authority.key() == bet.authority,
            BettingError::Unauthorized
        );
        require!(bet.status == 0, BettingError::BetAlreadySettled);

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

        if won {
            bet.status = 1; // Won

            let match_id = bet.match_id.as_bytes();
            let seeds: &[&[u8]] = &[b"escrow", match_id, &[ctx.bumps.vault_authority]];
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
        } else {
            bet.status = 2; // Lost
        }

        Ok(())
    }
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

    #[account(
        seeds = [b"escrow", match_account.match_id.as_bytes()],
        bump,
    )]
    /// CHECK: PDA authority for the match escrow token account.
    pub vault_authority: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = mint,
        associated_token::authority = vault_authority,
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = user_token_account.owner == user.key(),
        constraint = user_token_account.mint == mint.key(),
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SettleBet<'info> {
    pub authority: Signer<'info>,

    #[account(mut)]
    pub bet: Account<'info, Bet>,

    #[account(
        seeds = [b"escrow", bet.match_id.as_bytes()],
        bump,
    )]
    /// CHECK: PDA authority for the match escrow token account.
    pub vault_authority: UncheckedAccount<'info>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = vault_authority,
    )]
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
}

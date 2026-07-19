use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use oracle_adapter::{MatchAccount, MATCH_STATUS_LIVE};

declare_id!("GoccKzkMS5BWRmrbLdGKzqKUUcksZB3DftW82F7boCoQ");

const VALID_WINDOWS: [u32; 4] = [60, 300, 600, 1200];
const MIN_BET_AMOUNT: u64 = 1_000_000; // 1 USDC (6 decimals)
const MAX_BET_AMOUNT: u64 = 100_000_000; // 100 USDC (6 decimals)
const PAYOUT_NUMERATOR: u64 = 18;
const PAYOUT_DENOMINATOR: u64 = 10;

pub const DIRECTION_UP: u8 = 0;
pub const DIRECTION_DOWN: u8 = 1;

pub const SELECTION_HOME: u8 = 0;
pub const SELECTION_AWAY: u8 = 1;
pub const SELECTION_DRAW: u8 = 2;

pub const BET_STATUS_OPEN: u8 = 0;
pub const BET_STATUS_WON: u8 = 1;
pub const BET_STATUS_LOST: u8 = 2;
pub const BET_STATUS_REFUNDED: u8 = 3;

fn selection_odds(match_account: &MatchAccount, selection: u8) -> Result<u16> {
    match selection {
        SELECTION_HOME => Ok(match_account.odds_home),
        SELECTION_AWAY => Ok(match_account.odds_away),
        SELECTION_DRAW => Ok(match_account.odds_draw),
        _ => Err(BettingError::InvalidSelection.into()),
    }
}

#[program]
pub mod betting_engine {
    use super::*;

    pub fn place_bet(
        ctx: Context<PlaceBet>,
        direction: u8,
        selection: u8,
        window_secs: u32,
        amount: u64,
        nonce: u32,
    ) -> Result<()> {
        require!(direction <= DIRECTION_DOWN, BettingError::InvalidDirection);
        require!(selection <= SELECTION_DRAW, BettingError::InvalidSelection);
        require!(
            VALID_WINDOWS.contains(&window_secs),
            BettingError::InvalidWindow
        );
        require!(amount >= MIN_BET_AMOUNT, BettingError::BetTooSmall);
        require!(amount <= MAX_BET_AMOUNT, BettingError::BetTooLarge);

        let match_account = &ctx.accounts.match_account;
        require!(
            match_account.status == MATCH_STATUS_LIVE,
            BettingError::MatchNotLive
        );

        let clock = Clock::get()?;

        // Fixed 1.8x until the dynamic payout lands (fase 3a)
        let payout = amount
            .checked_mul(PAYOUT_NUMERATOR)
            .ok_or(BettingError::MathOverflow)?
            / PAYOUT_DENOMINATOR;

        let bet = &mut ctx.accounts.bet;
        bet.user = ctx.accounts.user.key();
        bet.authority = match_account.authority;
        bet.match_id = match_account.match_id.clone();
        bet.direction = direction;
        bet.selection = selection;
        bet.odds_at_entry = selection_odds(match_account, selection)?;
        bet.odds_at_expiry = 0;
        bet.amount = amount;
        bet.payout = payout;
        bet.window_secs = window_secs;
        bet.created_at = clock.unix_timestamp;
        bet.expires_at = clock.unix_timestamp + window_secs as i64;
        bet.status = BET_STATUS_OPEN;
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

        emit!(BetPlaced {
            user: bet.user,
            match_id: bet.match_id.clone(),
            nonce,
            direction,
            selection,
            odds_at_entry: bet.odds_at_entry,
            amount,
            payout,
            expires_at: bet.expires_at,
        });

        Ok(())
    }

    pub fn settle_bet(ctx: Context<SettleBet>) -> Result<()> {
        let match_account = &ctx.accounts.match_account;
        require!(
            ctx.accounts.authority.key() == match_account.authority,
            BettingError::Unauthorized
        );

        let bet = &mut ctx.accounts.bet;
        require!(
            bet.status == BET_STATUS_OPEN,
            BettingError::BetAlreadySettled
        );

        let clock = Clock::get()?;
        require!(
            clock.unix_timestamp >= bet.expires_at,
            BettingError::BetNotExpired
        );
        // The settlement snapshot must be at or after expiry — the odd used to
        // settle is the one on-chain, verifiable by anyone via the Match PDA.
        require!(
            match_account.updated_at >= bet.expires_at,
            BettingError::StaleOracleSnapshot
        );

        let odds_at_expiry = selection_odds(match_account, bet.selection)?;
        bet.odds_at_expiry = odds_at_expiry;

        // Tie refunds the stake (fee retention arrives with the pool, fase 2b)
        let (status, transfer_amount) = if odds_at_expiry == bet.odds_at_entry {
            (BET_STATUS_REFUNDED, bet.amount)
        } else {
            let won = match bet.direction {
                DIRECTION_UP => odds_at_expiry > bet.odds_at_entry,
                _ => odds_at_expiry < bet.odds_at_entry,
            };
            if won {
                (BET_STATUS_WON, bet.payout)
            } else {
                (BET_STATUS_LOST, 0)
            }
        };

        bet.status = status;

        if transfer_amount > 0 {
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
                transfer_amount,
            )?;
        }

        emit!(BetSettled {
            user: bet.user,
            match_id: bet.match_id.clone(),
            nonce: bet.nonce,
            status,
            odds_at_entry: bet.odds_at_entry,
            odds_at_expiry,
            amount_paid: transfer_amount,
        });

        Ok(())
    }

    pub fn close_bet(_ctx: Context<CloseBet>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(direction: u8, selection: u8, window_secs: u32, amount: u64, nonce: u32)]
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

    /// The oracle match account holding the settlement snapshot for this bet
    #[account(
        seeds = [b"match", bet.match_id.as_bytes()],
        bump = match_account.bump,
        seeds::program = oracle_adapter::ID,
    )]
    pub match_account: Account<'info, MatchAccount>,

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

#[derive(Accounts)]
pub struct CloseBet<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        close = user,
        constraint = bet.user == user.key() @ BettingError::Unauthorized,
        constraint = bet.status != BET_STATUS_OPEN @ BettingError::BetStillOpen,
    )]
    pub bet: Account<'info, Bet>,
}

#[account]
#[derive(InitSpace)]
pub struct Bet {
    pub user: Pubkey,
    pub authority: Pubkey,
    #[max_len(36)]
    pub match_id: String,
    /// 0 = Up, 1 = Down
    pub direction: u8,
    /// 0 = Home, 1 = Away, 2 = Draw
    pub selection: u8,
    pub odds_at_entry: u16,
    /// 0 until settled
    pub odds_at_expiry: u16,
    pub amount: u64,
    pub payout: u64,
    pub window_secs: u32,
    pub created_at: i64,
    pub expires_at: i64,
    /// 0 = Open, 1 = Won, 2 = Lost, 3 = Refunded
    pub status: u8,
    pub nonce: u32,
    pub bump: u8,
}

#[event]
pub struct BetPlaced {
    pub user: Pubkey,
    pub match_id: String,
    pub nonce: u32,
    pub direction: u8,
    pub selection: u8,
    pub odds_at_entry: u16,
    pub amount: u64,
    pub payout: u64,
    pub expires_at: i64,
}

#[event]
pub struct BetSettled {
    pub user: Pubkey,
    pub match_id: String,
    pub nonce: u32,
    pub status: u8,
    pub odds_at_entry: u16,
    pub odds_at_expiry: u16,
    pub amount_paid: u64,
}

#[error_code]
pub enum BettingError {
    #[msg("Direction must be 0 (Up) or 1 (Down)")]
    InvalidDirection,
    #[msg("Selection must be 0 (Home), 1 (Away) or 2 (Draw)")]
    InvalidSelection,
    #[msg("Window must be one of: 60, 300, 600, 1200 seconds")]
    InvalidWindow,
    #[msg("Minimum bet is 1 USDC (1_000_000 units)")]
    BetTooSmall,
    #[msg("Maximum bet is 100 USDC (100_000_000 units)")]
    BetTooLarge,
    #[msg("Match is not live")]
    MatchNotLive,
    #[msg("Bet has not expired yet")]
    BetNotExpired,
    #[msg("Bet has already been settled")]
    BetAlreadySettled,
    #[msg("Oracle snapshot predates bet expiry")]
    StaleOracleSnapshot,
    #[msg("Bet is still open")]
    BetStillOpen,
    #[msg("Arithmetic overflow")]
    MathOverflow,
    #[msg("Unauthorized signer")]
    Unauthorized,
}

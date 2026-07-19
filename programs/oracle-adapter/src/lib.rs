use anchor_lang::prelude::*;

declare_id!("6BVWCCQDjQDcjQYhmbzJ9DFWY9LyDojM3mYoWivrASaG");

pub const MATCH_STATUS_UPCOMING: u8 = 0;
pub const MATCH_STATUS_LIVE: u8 = 1;
pub const MATCH_STATUS_SETTLED: u8 = 2;

#[program]
pub mod oracle_adapter {
    use super::*;

    pub fn update_odds(
        ctx: Context<UpdateOdds>,
        match_id: String,
        odds_home: u16,
        odds_away: u16,
        odds_draw: u16,
    ) -> Result<()> {
        require!(
            odds_home as u32 + odds_away as u32 + odds_draw as u32 == 10000,
            OracleError::InvalidOddsSum
        );

        let match_account = &mut ctx.accounts.match_account;
        let is_new = match_account.authority == Pubkey::default();
        require!(
            is_new || match_account.status != MATCH_STATUS_SETTLED,
            OracleError::MatchAlreadySettled
        );

        match_account.authority = ctx.accounts.authority.key();
        match_account.match_id = match_id;
        if is_new {
            match_account.status = MATCH_STATUS_UPCOMING;
        }
        match_account.odds_home = odds_home;
        match_account.odds_away = odds_away;
        match_account.odds_draw = odds_draw;
        match_account.updated_at = Clock::get()?.unix_timestamp;
        match_account.bump = ctx.bumps.match_account;

        emit!(OddsUpdated {
            match_id: match_account.match_id.clone(),
            odds_home,
            odds_away,
            odds_draw,
            updated_at: match_account.updated_at,
        });

        Ok(())
    }

    pub fn set_match_status(ctx: Context<MutateMatch>, new_status: u8) -> Result<()> {
        require!(
            new_status <= MATCH_STATUS_SETTLED,
            OracleError::InvalidMatchStatus
        );

        let match_account = &mut ctx.accounts.match_account;
        match_account.status = new_status;

        emit!(MatchStatusChanged {
            match_id: match_account.match_id.clone(),
            status: new_status,
        });

        Ok(())
    }

    pub fn set_authority(ctx: Context<MutateMatch>, new_authority: Pubkey) -> Result<()> {
        require!(
            new_authority != Pubkey::default(),
            OracleError::InvalidAuthority
        );

        ctx.accounts.match_account.authority = new_authority;

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(match_id: String)]
pub struct UpdateOdds<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + MatchAccount::INIT_SPACE,
        seeds = [b"match", match_id.as_bytes()],
        bump,
        constraint = match_account.authority == Pubkey::default()
            || match_account.authority == authority.key()
            @ OracleError::Unauthorized,
    )]
    pub match_account: Account<'info, MatchAccount>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MutateMatch<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        has_one = authority @ OracleError::Unauthorized,
    )]
    pub match_account: Account<'info, MatchAccount>,
}

#[account]
#[derive(InitSpace)]
pub struct MatchAccount {
    pub authority: Pubkey,
    #[max_len(36)]
    pub match_id: String,
    /// 0 = Upcoming, 1 = Live, 2 = Settled
    pub status: u8,
    pub odds_home: u16,
    pub odds_away: u16,
    pub odds_draw: u16,
    pub updated_at: i64,
    pub bump: u8,
}

#[event]
pub struct OddsUpdated {
    pub match_id: String,
    pub odds_home: u16,
    pub odds_away: u16,
    pub odds_draw: u16,
    pub updated_at: i64,
}

#[event]
pub struct MatchStatusChanged {
    pub match_id: String,
    pub status: u8,
}

#[error_code]
pub enum OracleError {
    #[msg("Unauthorized signer")]
    Unauthorized,
    #[msg("Odds must sum to 10000")]
    InvalidOddsSum,
    #[msg("Status must be 0 (Upcoming), 1 (Live) or 2 (Settled)")]
    InvalidMatchStatus,
    #[msg("Match is settled and can no longer be updated")]
    MatchAlreadySettled,
    #[msg("New authority must not be the default pubkey")]
    InvalidAuthority,
}

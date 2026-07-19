use anchor_lang::prelude::*;

declare_id!("Df1gfgegKEBJvKtyHdxUiwaohUkDQj9Pigdpgszk7XUL");

#[program]
pub mod oracle_adapter {
    use super::*;

    pub fn update_odds(
        ctx: Context<UpdateOdds>,
        match_id: String,
        odds_home: u16,
        odds_away: u16,
        odds_draw: u16,
        tag: String,
        odds_source: OddsSource,
    ) -> Result<()> {
        require!(
            odds_home as u32 + odds_away as u32 + odds_draw as u32 == 10000,
            OracleError::InvalidOddsSum
        );

        let match_account = &mut ctx.accounts.match_account;
        let is_new_match = match_account.authority == Pubkey::default();
        match_account.authority = ctx.accounts.authority.key();
        match_account.match_id = match_id;
        if is_new_match || !tag.is_empty() {
            match_account.tag = tag;
        }
        if is_new_match || odds_source != match_account.odds_source {
            match_account.odds_source = odds_source;
        }
        match_account.odds_home = odds_home;
        match_account.odds_away = odds_away;
        match_account.odds_draw = odds_draw;
        match_account.updated_at = Clock::get()?.unix_timestamp;
        if is_new_match {
            match_account.status = MatchStatus::Open;
        }
        match_account.bump = ctx.bumps.match_account;

        emit!(OddsUpdated {
            authority: match_account.authority,
            match_id: match_account.match_id.clone(),
            tag: match_account.tag.clone(),
            odds_home: match_account.odds_home,
            odds_away: match_account.odds_away,
            odds_draw: match_account.odds_draw,
            odds_source: match_account.odds_source,
            updated_at: match_account.updated_at,
        });

        Ok(())
    }

    pub fn set_match_status(
        ctx: Context<SetMatchStatus>,
        match_id: String,
        status: MatchStatus,
    ) -> Result<()> {
        let _ = match_id;
        let match_account = &mut ctx.accounts.match_account;
        match_account.status = status;
        match_account.updated_at = Clock::get()?.unix_timestamp;

        Ok(())
    }
}

#[event]
pub struct OddsUpdated {
    pub authority: Pubkey,
    pub match_id: String,
    pub tag: String,
    pub odds_home: u16,
    pub odds_away: u16,
    pub odds_draw: u16,
    pub odds_source: OddsSource,
    pub updated_at: i64,
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
#[instruction(match_id: String)]
pub struct SetMatchStatus<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [b"match", match_id.as_bytes()],
        bump = match_account.bump,
        constraint = match_account.authority == authority.key()
            @ OracleError::Unauthorized,
    )]
    pub match_account: Account<'info, MatchAccount>,
}

#[account]
#[derive(InitSpace)]
pub struct MatchAccount {
    pub authority: Pubkey,
    #[max_len(36)]
    pub match_id: String,
    #[max_len(64)]
    pub tag: String,
    pub odds_home: u16,
    pub odds_away: u16,
    pub odds_draw: u16,
    pub updated_at: i64,
    pub status: MatchStatus,
    pub odds_source: OddsSource,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum MatchStatus {
    Open,
    Closed,
}

impl Default for MatchStatus {
    fn default() -> Self {
        MatchStatus::Open
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum OddsSource {
    Random,
    Txline,
}

impl Default for OddsSource {
    fn default() -> Self {
        OddsSource::Random
    }
}

#[error_code]
pub enum OracleError {
    #[msg("Unauthorized signer")]
    Unauthorized,
    #[msg("Odds must sum to 10000")]
    InvalidOddsSum,
    #[msg("Invalid match status")]
    InvalidMatchStatus,
}

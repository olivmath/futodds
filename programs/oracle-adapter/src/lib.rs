use anchor_lang::prelude::*;

declare_id!("6BVWCCQDjQDcjQYhmbzJ9DFWY9LyDojM3mYoWivrASaG");

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
        match_account.authority = ctx.accounts.authority.key();
        match_account.match_id = match_id;
        match_account.odds_home = odds_home;
        match_account.odds_away = odds_away;
        match_account.odds_draw = odds_draw;
        match_account.updated_at = Clock::get()?.unix_timestamp;
        match_account.bump = ctx.bumps.match_account;

        emit!(OddsUpdated {
            authority: match_account.authority,
            match_id: match_account.match_id.clone(),
            odds_home: match_account.odds_home,
            odds_away: match_account.odds_away,
            odds_draw: match_account.odds_draw,
            updated_at: match_account.updated_at,
        });

        Ok(())
    }
}

#[event]
pub struct OddsUpdated {
    pub authority: Pubkey,
    pub match_id: String,
    pub odds_home: u16,
    pub odds_away: u16,
    pub odds_draw: u16,
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

#[account]
#[derive(InitSpace)]
pub struct MatchAccount {
    pub authority: Pubkey,
    #[max_len(36)]
    pub match_id: String,
    pub odds_home: u16,
    pub odds_away: u16,
    pub odds_draw: u16,
    pub updated_at: i64,
    pub bump: u8,
}

#[error_code]
pub enum OracleError {
    #[msg("Unauthorized signer")]
    Unauthorized,
    #[msg("Odds must sum to 10000")]
    InvalidOddsSum,
}

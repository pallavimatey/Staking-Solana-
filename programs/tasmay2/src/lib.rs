use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token};

declare_id!("dBBN8fLnpN1rafGY5uatPSkdto3MFU3g3a6cWcFtbLU");

#[program]
pub mod staking_program {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, staking_start_time: i64, staking_end_time: i64, lock_duration: i64, apy: u64) -> Result<()> {
        let staking_account = &mut ctx.accounts.staking_account;
        staking_account.admin = *ctx.accounts.admin.key;
        staking_account.staking_start_time = staking_start_time;
        staking_account.staking_end_time = staking_end_time;
        staking_account.lock_duration = lock_duration;
        staking_account.apy = apy;
        staking_account.total_staked = 0;
        staking_account.total_rewards = 0;
        Ok(())
    }

    pub fn stake_tokens(ctx: Context<StakeTokens>, user_id: Pubkey, amount: u64) -> Result<()> {
        let current_time = Clock::get()?.unix_timestamp;
        let staking_account = &ctx.accounts.staking_account;

        if current_time < staking_account.staking_start_time || current_time > staking_account.staking_end_time {
            return Err(StakingError::StakingPeriodInactive.into());
        }

        let user_stake = &mut ctx.accounts.user_stake;
        // Allow only one active stake at a time
        if user_stake.amount > 0 {
            return Err(StakingError::ActiveStakeAlreadyExists.into());
        }

        // Transfer tokens from the user to the staking pool
        let cpi_accounts = token::Transfer {
            from: ctx.accounts.token_account.to_account_info(),
            to: ctx.accounts.staking_account.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        token::transfer(CpiContext::new(cpi_program, cpi_accounts), amount)?;

        // Update staking account
        let staking_account = &mut ctx.accounts.staking_account;
        staking_account.total_staked += amount;

        // Update user's stake information
        user_stake.user_id = user_id;
        user_stake.amount = amount;
        user_stake.staked_at = current_time;
        user_stake.claimed_rewards = 0;

        Ok(())
    }

    pub fn unstake_tokens(ctx: Context<UnstakeTokens>, amount: u64) -> Result<()> {
        let user_stake = &mut ctx.accounts.user_stake;

        if user_stake.amount < amount {
            return Err(StakingError::InsufficientBalance.into());
        }

        let current_time = Clock::get()?.unix_timestamp;
        let staking_account = &ctx.accounts.staking_account;

        if current_time < staking_account.staking_start_time + staking_account.lock_duration {
            return Err(StakingError::LockDurationNotPassed.into());
        }

        // Transfer tokens back to the user
        let cpi_accounts = token::Transfer {
            from: ctx.accounts.staking_account.to_account_info(),
            to: ctx.accounts.token_account.to_account_info(),
            authority: ctx.accounts.staking_account.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        token::transfer(CpiContext::new(cpi_program, cpi_accounts), amount)?;

        // Update total staked
        let staking_account = &mut ctx.accounts.staking_account;
        staking_account.total_staked -= amount;

        // Update user's stake information
        user_stake.amount -= amount;

        Ok(())
    }

    pub fn claim_rewards(ctx: Context<ClaimRewards>) -> Result<()> {
        let user_stake = &mut ctx.accounts.user_stake;
        let current_time = Clock::get()?.unix_timestamp;

        // Calculate rewards based on APY and staking duration
        let staking_duration = current_time - user_stake.staked_at;
        let yearly_seconds = 365 * 24 * 60 * 60;
        let apy = ctx.accounts.staking_account.apy;
        let reward_percentage = apy as u64;

        // Calculate rewards
        let rewards = (user_stake.amount * reward_percentage * staking_duration) / (100 * yearly_seconds);

        if rewards <= 0 {
            return Err(StakingError::NoRewards.into());
        }

        // Transfer rewards to the user
        let cpi_accounts = token::Transfer {
            from: ctx.accounts.staking_account.to_account_info(),
            to: ctx.accounts.token_account.to_account_info(),
            authority: ctx.accounts.staking_account.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        token::transfer(CpiContext::new(cpi_program, cpi_accounts), rewards)?;

        // Update total rewards
        let staking_account = &mut ctx.accounts.staking_account;
        staking_account.total_rewards += rewards;

        // Update user's claimed rewards
        user_stake.claimed_rewards += rewards;

        Ok(())
    }

    pub fn admin_update_staking_parameters(
        ctx: Context<AdminUpdateStakingParameters>, 
        new_staking_start_time: i64, 
        new_staking_end_time: i64, 
        new_lock_duration: i64,
        new_apy: u64
    ) -> Result<()> {
        let staking_account = &mut ctx.accounts.staking_account;
        // Admin can update staking start and end time, lock duration, and APY
        staking_account.staking_start_time = new_staking_start_time;
        staking_account.staking_end_time = new_staking_end_time;
        staking_account.lock_duration = new_lock_duration;
        staking_account.apy = new_apy;
        
        Ok(())
    }
}

#[account]
pub struct StakingAccount {
    pub admin: Pubkey,
    pub staking_start_time: i64,
    pub staking_end_time: i64,
    pub lock_duration: i64, // Lock duration in seconds
    pub apy: u64, // APY rate (e.g., 20% APY = 20)
    pub total_staked: u64,
    pub total_rewards: u64,
}

#[account]
pub struct UserStake {
    pub user_id: Pubkey,
    pub amount: u64,
    pub staked_at: i64,
    pub claimed_rewards: u64,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = admin, space = 8 + 32 + 8 + 8 + 8 + 8 + 8)]
    pub staking_account: Account<'info, StakingAccount>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub rent: Sysvar<'info, Rent>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct StakeTokens<'info> {
    #[account(mut)]
    pub staking_account: Account<'info, StakingAccount>,
    #[account(init, payer = user, space = 8 + 32 + 8 + 8)]
    pub user_stake: Account<'info, UserStake>,
    #[account(mut)]
    pub token_account: AccountInfo<'info>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UnstakeTokens<'info> {
    #[account(mut)]
    pub staking_account: Account<'info, StakingAccount>,
    #[account(mut)]
    pub user_stake: Account<'info, UserStake>,
    #[account(mut)]
    pub token_account: AccountInfo<'info>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ClaimRewards<'info> {
    #[account(mut)]
    pub staking_account: Account<'info, StakingAccount>,
    #[account(mut)]
    pub user_stake: Account<'info, UserStake>,
    #[account(mut)]
    pub token_account: AccountInfo<'info>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct AdminUpdateStakingParameters<'info> {
    #[account(mut)]
    pub staking_account: Account<'info, StakingAccount>,
    #[account(mut)]
    pub admin: Signer<'info>,
}

#[error_code]
pub enum StakingError {
    #[msg("The staking period is not active.")]
    StakingPeriodInactive,
    #[msg("User already has an active stake.")]
    ActiveStakeAlreadyExists,
    #[msg("Lock duration period not yet passed.")]
    LockDurationNotPassed,
    #[msg("Insufficient balance.")]
    InsufficientBalance,
    #[msg("No rewards to claim.")]
    NoRewards,
}

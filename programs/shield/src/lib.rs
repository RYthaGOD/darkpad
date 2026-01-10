use anchor_lang::prelude::*;
use anchor_spl::token_2022::{self, Token2022, MintTo, Burn, TransferChecked};
use anchor_spl::token_interface::{Mint, TokenAccount};

declare_id!("4NDPAihZpfejxGmZjN6n7MKHeRvjuxb6JSS3CtyYrdAg");

#[program]
pub mod shield {
    use super::*;

    /// Initialize the Shield Vault
    /// Creates a new cJitoSOL mint and vault to hold JitoSOL
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let vault_state = &mut ctx.accounts.vault_state;
        vault_state.authority = ctx.accounts.authority.key();
        vault_state.jito_mint = ctx.accounts.jito_mint.key();
        vault_state.cjito_mint = ctx.accounts.cjito_mint.key();
        vault_state.vault = ctx.accounts.vault.key();
        vault_state.total_deposited = 0;
        vault_state.bump = ctx.bumps.vault_state;

        msg!("Shield Vault initialized");
        Ok(())
    }

    /// Deposit JitoSOL and receive cJitoSOL
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        // Transfer JitoSOL from user to vault
        let transfer_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.user_jito_account.to_account_info(),
                mint: ctx.accounts.jito_mint.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        );
        token_2022::transfer_checked(transfer_ctx, amount, ctx.accounts.jito_mint.decimals)?;

        // Mint cJitoSOL to user
        let seeds = &[
            b"vault_state".as_ref(),
            ctx.accounts.jito_mint.to_account_info().key.as_ref(),
            &[ctx.accounts.vault_state.bump],
        ];
        let signer_seeds = &[&seeds[..]];

        let mint_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.cjito_mint.to_account_info(),
                to: ctx.accounts.user_cjito_account.to_account_info(),
                authority: ctx.accounts.vault_state.to_account_info(),
            },
            signer_seeds,
        );
        token_2022::mint_to(mint_ctx, amount)?;

        // Update state
        let vault_state = &mut ctx.accounts.vault_state;
        vault_state.total_deposited = vault_state.total_deposited.checked_add(amount).unwrap();

        msg!("Deposited {} JitoSOL, minted {} cJitoSOL", amount, amount);
        Ok(())
    }

    /// Withdraw JitoSOL by burning cJitoSOL
    pub fn withdraw(ctx: Context<Withdraw>, amount: u64) -> Result<()> {
        // Burn cJitoSOL from user
        let burn_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.cjito_mint.to_account_info(),
                from: ctx.accounts.user_cjito_account.to_account_info(),
                authority: ctx.accounts.user.to_account_info(),
            },
        );
        token_2022::burn(burn_ctx, amount)?;

        // Transfer JitoSOL from vault to user
        let seeds = &[
            b"vault_state".as_ref(),
            ctx.accounts.jito_mint.to_account_info().key.as_ref(),
            &[ctx.accounts.vault_state.bump],
        ];
        let signer_seeds = &[&seeds[..]];

        let transfer_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.vault.to_account_info(),
                mint: ctx.accounts.jito_mint.to_account_info(),
                to: ctx.accounts.user_jito_account.to_account_info(),
                authority: ctx.accounts.vault_state.to_account_info(),
            },
            signer_seeds,
        );
        token_2022::transfer_checked(transfer_ctx, amount, ctx.accounts.jito_mint.decimals)?;

        // Update state
        let vault_state = &mut ctx.accounts.vault_state;
        vault_state.total_deposited = vault_state.total_deposited.checked_sub(amount).unwrap();

        msg!("Burned {} cJitoSOL, withdrew {} JitoSOL", amount, amount);
        Ok(())
    }
}

// ============================================================================
// ACCOUNTS
// ============================================================================

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The JitoSOL mint (or mock mint for testing)
    pub jito_mint: InterfaceAccount<'info, Mint>,

    /// The cJitoSOL mint - created by this program
    #[account(
        init,
        payer = authority,
        mint::decimals = 9,
        mint::authority = vault_state,
        mint::token_program = token_program,
    )]
    pub cjito_mint: InterfaceAccount<'info, Mint>,

    /// Vault to hold JitoSOL
    #[account(
        init,
        payer = authority,
        token::mint = jito_mint,
        token::authority = vault_state,
        token::token_program = token_program,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    /// Vault state PDA
    #[account(
        init,
        payer = authority,
        space = 8 + VaultState::INIT_SPACE,
        seeds = [b"vault_state", jito_mint.key().as_ref()],
        bump,
    )]
    pub vault_state: Account<'info, VaultState>,

    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"vault_state", jito_mint.key().as_ref()],
        bump = vault_state.bump,
    )]
    pub vault_state: Account<'info, VaultState>,

    pub jito_mint: InterfaceAccount<'info, Mint>,

    // Note: jito_mint is validated implicitly via vault_state PDA seeds
    // The PDA only exists for the correct jito_mint, so if seeds match, mint is valid

    #[account(
        mut,
        constraint = cjito_mint.key() == vault_state.cjito_mint,
    )]
    pub cjito_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        constraint = vault.key() == vault_state.vault,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = jito_mint,
        token::authority = user,
    )]
    pub user_jito_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = cjito_mint,
        token::authority = user,
    )]
    pub user_cjito_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Program<'info, Token2022>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub user: Signer<'info>,

    #[account(
        mut,
        seeds = [b"vault_state", jito_mint.key().as_ref()],
        bump = vault_state.bump,
    )]
    pub vault_state: Account<'info, VaultState>,

    pub jito_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        constraint = cjito_mint.key() == vault_state.cjito_mint,
    )]
    pub cjito_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        constraint = vault.key() == vault_state.vault,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = jito_mint,
        token::authority = user,
    )]
    pub user_jito_account: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = cjito_mint,
        token::authority = user,
    )]
    pub user_cjito_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Program<'info, Token2022>,
}

// ============================================================================
// STATE
// ============================================================================

#[account]
#[derive(InitSpace)]
pub struct VaultState {
    pub authority: Pubkey,
    pub jito_mint: Pubkey,
    pub cjito_mint: Pubkey,
    pub vault: Pubkey,
    pub total_deposited: u64,
    pub bump: u8,
}

// ============================================================================
// ERRORS
// ============================================================================

#[error_code]
pub enum ShieldError {
    #[msg("Invalid JitoSOL mint")]
    InvalidJitoMint,
    #[msg("Invalid cJitoSOL mint")]
    InvalidCjitoMint,
    #[msg("Invalid vault")]
    InvalidVault,
    #[msg("Amount too small")]
    AmountTooSmall,
}


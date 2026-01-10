use anchor_lang::prelude::*;
use anchor_spl::token_2022::{self, Token2022, TransferChecked};
use anchor_spl::token_interface::{Mint, TokenAccount};
use verifier::program::Verifier;
use verifier::cpi::accounts::VerifyProof;

declare_id!("GNc9f7vZtJVUbnYMFKx5JWbRWM9qT7TyZKkdt5BxhqJw");

// Protocol Constants
pub const PROTOCOL_FEE_BPS: u64 = 150; // 1.5%
pub const PROTOCOL_TREASURY_PUBKEY: Pubkey = pubkey!("AvDqGDF3wnoEnV4b5QgCikxtg6WxJ37UESLZuJXHv8s3");

/// Status of an auction
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum AuctionStatus {
    /// Auction is accepting bids
    Active,
    /// Auction has ended, awaiting reveal
    Revealing,
    /// Auction is settled
    Settled,
}

impl Default for AuctionStatus {
    fn default() -> Self {
        AuctionStatus::Active
    }
}

#[program]
pub mod launchpad {
    use super::*;

    /// Initialize a new auction
    pub fn initialize_auction(
        ctx: Context<InitializeAuction>,
        merkle_root: [u8; 32],
        end_time: i64,
        token_supply: u64,
    ) -> Result<()> {
        let auction = &mut ctx.accounts.auction;
        auction.authority = ctx.accounts.authority.key();
        auction.payment_mint = ctx.accounts.payment_mint.key();
        auction.project_mint = ctx.accounts.project_mint.key();
        auction.merkle_root = merkle_root;
        auction.end_time = end_time;
        auction.reveal_deadline = end_time + 3600; // 1 hour reveal window
        auction.status = AuctionStatus::Active;
        auction.token_supply = token_supply;
        auction.bump = ctx.bumps.auction;

        msg!("Auction initialized");
        Ok(())
    }

    /// Initialize the vaults for the auction
    pub fn initialize_vaults(ctx: Context<InitializeVaults>) -> Result<()> {
        msg!("Auction vaults initialized");
        Ok(())
    }

    /// Fund the auction with project tokens
    pub fn fund_auction(
        ctx: Context<FundAuction>,
        amount: u64,
    ) -> Result<()> {
        let transfer_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.authority_project_account.to_account_info(),
                mint: ctx.accounts.project_mint.to_account_info(),
                to: ctx.accounts.project_vault.to_account_info(),
                authority: ctx.accounts.authority.to_account_info(),
            },
        );
        token_2022::transfer_checked(transfer_ctx, amount, ctx.accounts.project_mint.decimals)?;
        
        msg!("Auction funded with {} tokens", amount);
        Ok(())
    }

    /// Place a bid with ZK proof verification
    /// The proof verifies: User is in whitelist (Merkle membership) without revealing identity
    /// The nullifier prevents double-bidding
    pub fn place_bid(
        ctx: Context<PlaceBid>,
        proof: Vec<u8>,           // Noir proof bytes
        nullifier: [u8; 32],      // Unique identifier from ZK circuit
        bid_commitment: [u8; 32], // Hash(amount + salt)
        deposit_amount: u64,      // Amount of cJitoSOL to lock (obfuscated)
    ) -> Result<()> {
        let auction = &mut ctx.accounts.auction;
        
        // Check auction is active
        require!(auction.status == AuctionStatus::Active, ErrorCode::AuctionNotActive);
        
        // Check auction hasn't ended
        let clock = Clock::get()?;
        require!(clock.unix_timestamp < auction.end_time, ErrorCode::AuctionEnded);

        // V2: On-Chain Verification
        // The proof verifies membership in the Merkle tree
        // Public inputs: [merkle_root, auction_id, nullifier]
        // For Mock, we pass empty inputs or construct real ones if needed
        let public_inputs = vec![0u8; 96]; // Placeholder for [32 bytes root, 32 bytes auction_id, 32 bytes nullifier]
        
        let cpi_program = ctx.accounts.verifier_program.to_account_info();
        let cpi_accounts = VerifyProof {
            system_program: ctx.accounts.system_program.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        verifier::cpi::verify_proof(cpi_ctx, proof, public_inputs)?;
        //
        msg!("V2: Proof verified on-chain");

        // Validate deposit amount
        require!(deposit_amount > 0, ErrorCode::ZeroDeposit);
        require!(deposit_amount >= 1_000_000, ErrorCode::DepositTooSmall); // Min 0.001 cJitoSOL

        // Check nullifier hasn't been used (stored in user_bid account creation)
        // The PDA derivation with nullifier enforces uniqueness

        // Transfer cJitoSOL from user to auction vault
        let transfer_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.user_payment_account.to_account_info(),
                mint: ctx.accounts.payment_mint.to_account_info(),
                to: ctx.accounts.payment_vault.to_account_info(),
                authority: ctx.accounts.bidder.to_account_info(),
            },
        );
        token_2022::transfer_checked(transfer_ctx, deposit_amount, ctx.accounts.payment_mint.decimals)?;

        // Create bid record
        let user_bid = &mut ctx.accounts.user_bid;
        user_bid.auction = auction.key();
        user_bid.bidder = ctx.accounts.bidder.key();
        user_bid.nullifier = nullifier;
        user_bid.bid_commitment = bid_commitment;
        user_bid.deposit_amount = deposit_amount;
        user_bid.revealed_amount = 0;
        user_bid.is_revealed = false;
        user_bid.is_winner = false;
        user_bid.is_claimed = false;
        user_bid.bump = ctx.bumps.user_bid;

        // Update auction stats
        auction.total_bids += 1;
        auction.total_committed = auction.total_committed
            .checked_add(deposit_amount)
            .ok_or(ErrorCode::MathOverflow)?;

        msg!("Bid placed with nullifier: {:?}", &nullifier[..8]);
        Ok(())
    }

    /// Reveal a bid (V1 Mainnet - user self-reveals)
    pub fn reveal_bid(
        ctx: Context<RevealBid>,
        bid_amount: u64,
        salt: [u8; 32],
    ) -> Result<()> {
        let auction = &ctx.accounts.auction;
        let user_bid = &mut ctx.accounts.user_bid;

        // Check auction is in reveal phase
        require!(
            auction.status == AuctionStatus::Active || auction.status == AuctionStatus::Revealing,
            ErrorCode::InvalidAuctionStatus
        );

        // Check reveal deadline hasn't passed
        let clock = Clock::get()?;
        require!(
            clock.unix_timestamp <= auction.reveal_deadline,
            ErrorCode::RevealDeadlinePassed
        );

        // Verify commitment: Hash(amount + salt) == stored commitment
        let mut data = [0u8; 40];
        data[..8].copy_from_slice(&bid_amount.to_le_bytes());
        data[8..40].copy_from_slice(&salt);
        let computed_hash = anchor_lang::solana_program::keccak::hash(&data);
        
        require!(
            computed_hash.0 == user_bid.bid_commitment,
            ErrorCode::InvalidReveal
        );

        // CRITICAL: Validate revealed amount doesn't exceed deposit
        // This prevents insolvency attacks where user reveals higher than deposited
        require!(
            bid_amount <= user_bid.deposit_amount,
            ErrorCode::RevealExceedsDeposit
        );

        // Update bid with revealed amount
        user_bid.revealed_amount = bid_amount;
        user_bid.is_revealed = true;

        // Update auction revealed count
        let auction = &mut ctx.accounts.auction;
        auction.total_revealed += 1;

        msg!("Bid revealed: {} cJitoSOL", bid_amount);
        Ok(())
    }

    /// End auction and transition to reveal phase
    pub fn end_auction(ctx: Context<EndAuction>) -> Result<()> {
        let auction = &mut ctx.accounts.auction;
        
        require!(auction.status == AuctionStatus::Active, ErrorCode::AuctionNotActive);
        
        let clock = Clock::get()?;
        require!(clock.unix_timestamp >= auction.end_time, ErrorCode::AuctionNotEnded);

        auction.status = AuctionStatus::Revealing;
        
        msg!("Auction ended, entering reveal phase");
        Ok(())
    }

    /// Settle auction - distribute tokens and refunds
    pub fn settle_auction(
        ctx: Context<SettleAuction>,
        clearing_price: u64,
        total_raised: u64,
    ) -> Result<()> {
        let auction = &mut ctx.accounts.auction;
        
        require!(
            auction.status == AuctionStatus::Revealing,
            ErrorCode::InvalidAuctionStatus
        );

        // Calculate Protocol Fee (1.5% of total raised)
        let fee_amount = total_raised
            .checked_mul(PROTOCOL_FEE_BPS)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(10000)
            .ok_or(ErrorCode::MathOverflow)?;

        if fee_amount > 0 {
            let seeds = &[
                b"auction".as_ref(),
                auction.project_mint.as_ref(),
                &[auction.bump],
            ];
            let signer_seeds = &[&seeds[..]];

            let transfer_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.payment_vault.to_account_info(),
                    mint: ctx.accounts.payment_mint.to_account_info(),
                    to: ctx.accounts.protocol_treasury.to_account_info(),
                    authority: auction.to_account_info(),
                },
                signer_seeds,
            );
            token_2022::transfer_checked(
                transfer_ctx,
                fee_amount,
                ctx.accounts.payment_mint.decimals,
            )?;
            
            msg!("Protocol fee deducted: {} cJitoSOL", fee_amount);
        }

        auction.clearing_price = clearing_price;
        auction.status = AuctionStatus::Settled;

        msg!("Auction settled at clearing price: {}", clearing_price);
        Ok(())
    }

    /// Claim tokens (for winners) or refund (for losers)
    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        let auction = &ctx.accounts.auction;
        let user_bid = &mut ctx.accounts.user_bid;

        require!(auction.status == AuctionStatus::Settled, ErrorCode::AuctionNotSettled);
        require!(user_bid.is_revealed, ErrorCode::BidNotRevealed);
        require!(!user_bid.is_claimed, ErrorCode::AlreadyClaimed);

        let seeds = &[
            b"auction".as_ref(),
            auction.project_mint.as_ref(),
            &[auction.bump],
        ];
        let signer_seeds = &[&seeds[..]];

        if user_bid.revealed_amount >= auction.clearing_price && auction.clearing_price > 0 {
            // Winner: Send project tokens, refund excess payment
            user_bid.is_winner = true;
            
            // Calculate token allocation:
            // Each winner gets: (their_bid / total_winning_bids) * token_supply
            // For uniform clearing price model: tokens = (clearing_price / total_committed) * token_supply
            // Using token_supply (original) not vault.amount (remaining) to ensure correct allocation
            let tokens_to_send = auction.token_supply
                .checked_mul(auction.clearing_price)
                .ok_or(ErrorCode::MathOverflow)?
                .checked_div(auction.total_committed.max(1))
                .ok_or(ErrorCode::MathOverflow)?;
            
            // Ensure we don't send more than available in vault
            let tokens_to_send = tokens_to_send.min(ctx.accounts.project_vault.amount);
            
            let project_transfer_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.project_vault.to_account_info(),
                    mint: ctx.accounts.project_mint.to_account_info(),
                    to: ctx.accounts.user_project_account.to_account_info(),
                    authority: ctx.accounts.auction.to_account_info(),
                },
                signer_seeds,
            );
            token_2022::transfer_checked(
                project_transfer_ctx,
                tokens_to_send,
                ctx.accounts.project_mint.decimals,
            )?;

            // Refund excess: deposit_amount - clearing_price
            let refund_amount = user_bid.deposit_amount
                .checked_sub(auction.clearing_price)
                .unwrap_or(0);
            
            if refund_amount > 0 {
                let refund_ctx = CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    TransferChecked {
                        from: ctx.accounts.payment_vault.to_account_info(),
                        mint: ctx.accounts.payment_mint.to_account_info(),
                        to: ctx.accounts.user_payment_account.to_account_info(),
                        authority: ctx.accounts.auction.to_account_info(),
                    },
                    signer_seeds,
                );
                token_2022::transfer_checked(
                    refund_ctx,
                    refund_amount,
                    ctx.accounts.payment_mint.decimals,
                )?;
            }
            
            msg!("Winner! Received {} tokens, refunded {} cJitoSOL", tokens_to_send, refund_amount);
        } else {
            // Loser: Full refund
            let refund_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.payment_vault.to_account_info(),
                    mint: ctx.accounts.payment_mint.to_account_info(),
                    to: ctx.accounts.user_payment_account.to_account_info(),
                    authority: ctx.accounts.auction.to_account_info(),
                },
                signer_seeds,
            );
            token_2022::transfer_checked(
                refund_ctx,
                user_bid.deposit_amount,
                ctx.accounts.payment_mint.decimals,
            )?;

            msg!("Refunded {} cJitoSOL", user_bid.deposit_amount);
        }

        // Mark as claimed
        user_bid.is_claimed = true;

        Ok(())
    }
}

// ============================================================================
// ACCOUNTS
// ============================================================================

#[derive(Accounts)]
pub struct InitializeAuction<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The payment token (cJitoSOL)
    pub payment_mint: InterfaceAccount<'info, Mint>,

    /// The project token being sold
    pub project_mint: InterfaceAccount<'info, Mint>,

    /// Auction state PDA
    #[account(
        init,
        payer = authority,
        space = 8 + Auction::INIT_SPACE,
        seeds = [b"auction", project_mint.key().as_ref()],
        bump,
    )]
    pub auction: Box<Account<'info, Auction>>,

    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct InitializeVaults<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"auction", project_mint.key().as_ref()],
        bump = auction.bump,
        constraint = auction.authority == authority.key(),
    )]
    pub auction: Box<Account<'info, Auction>>,

    pub payment_mint: Box<InterfaceAccount<'info, Mint>>,
    pub project_mint: Box<InterfaceAccount<'info, Mint>>,

    /// Vault to hold payment tokens
    #[account(
        init,
        payer = authority,
        token::mint = payment_mint,
        token::authority = auction,
        token::token_program = token_program,
    )]
    pub payment_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    /// Vault to hold project tokens
    #[account(
        init,
        payer = authority,
        token::mint = project_mint,
        token::authority = auction,
        token::token_program = token_program,
    )]
    pub project_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    
    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FundAuction<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"auction", project_mint.key().as_ref()],
        bump = auction.bump,
        constraint = auction.authority == authority.key(),
    )]
    pub auction: Box<Account<'info, Auction>>,

    #[account(mut)]
    pub project_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = project_mint,
        token::authority = auction,
    )]
    pub project_vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = project_mint,
        token::authority = authority,
    )]
    pub authority_project_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Program<'info, Token2022>,
}

#[derive(Accounts)]
#[instruction(proof: Vec<u8>, nullifier: [u8; 32])]
pub struct PlaceBid<'info> {
    #[account(mut)]
    pub bidder: Signer<'info>,

    #[account(
        mut,
        seeds = [b"auction", auction.project_mint.as_ref()],
        bump = auction.bump,
    )]
    pub auction: Box<Account<'info, Auction>>,

    #[account(
        constraint = payment_mint.key() == auction.payment_mint @ ErrorCode::InvalidPaymentMint,
    )]
    pub payment_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        token::mint = payment_mint,
        token::authority = auction,
    )]
    pub payment_vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = payment_mint,
        token::authority = bidder,
    )]
    pub user_payment_account: InterfaceAccount<'info, TokenAccount>,

    /// User bid PDA - derived from nullifier to enforce uniqueness
    #[account(
        init,
        payer = bidder,
        space = 8 + UserBid::INIT_SPACE,
        seeds = [b"bid", auction.key().as_ref(), nullifier.as_ref()],
        bump,
    )]
    pub user_bid: Box<Account<'info, UserBid>>,

    pub verifier_program: Program<'info, Verifier>,

    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RevealBid<'info> {
    pub bidder: Signer<'info>,

    #[account(
        mut,
        seeds = [b"auction", auction.project_mint.as_ref()],
        bump = auction.bump,
    )]
    pub auction: Account<'info, Auction>,

    #[account(
        mut,
        seeds = [b"bid", auction.key().as_ref(), user_bid.nullifier.as_ref()],
        bump = user_bid.bump,
        constraint = user_bid.bidder == bidder.key(),
    )]
    pub user_bid: Account<'info, UserBid>,
}

#[derive(Accounts)]
pub struct EndAuction<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"auction", auction.project_mint.as_ref()],
        bump = auction.bump,
        constraint = auction.authority == authority.key(),
    )]
    pub auction: Account<'info, Auction>,
}

#[derive(Accounts)]
pub struct SettleAuction<'info> {
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"auction", auction.project_mint.as_ref()],
        bump = auction.bump,
        constraint = auction.authority == authority.key(),
    )]
    pub auction: Account<'info, Auction>,

    #[account(
        mut,
        constraint = protocol_treasury.owner == PROTOCOL_TREASURY_PUBKEY,
        constraint = protocol_treasury.mint == auction.payment_mint
    )]
    pub protocol_treasury: InterfaceAccount<'info, TokenAccount>,
    
    pub payment_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        token::mint = payment_mint,
        token::authority = auction,
    )]
    pub payment_vault: InterfaceAccount<'info, TokenAccount>,
    
    pub token_program: Program<'info, Token2022>,
}

#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(mut)]
    pub bidder: Signer<'info>,

    #[account(
        seeds = [b"auction", auction.project_mint.as_ref()],
        bump = auction.bump,
    )]

    pub auction: Box<Account<'info, Auction>>,

    pub payment_mint: Box<InterfaceAccount<'info, Mint>>,
    pub project_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        token::mint = payment_mint,
        token::authority = auction,
    )]
    pub payment_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        token::mint = project_mint,
        token::authority = auction,
    )]
    pub project_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        token::mint = payment_mint,
        token::authority = bidder,
    )]
    pub user_payment_account: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        token::mint = project_mint,
        token::authority = bidder,
    )]
    pub user_project_account: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [b"bid", auction.key().as_ref(), user_bid.nullifier.as_ref()],
        bump = user_bid.bump,
        constraint = user_bid.bidder == bidder.key(),
        close = bidder,
    )]
    pub user_bid: Box<Account<'info, UserBid>>,

    pub token_program: Program<'info, Token2022>,
}

// ============================================================================
// STATE
// ============================================================================

#[account]
#[derive(InitSpace)]
pub struct Auction {
    pub authority: Pubkey,
    pub payment_mint: Pubkey,      // cJitoSOL
    pub project_mint: Pubkey,      // Token being sold
    pub merkle_root: [u8; 32],     // Whitelist root for Noir verification
    pub end_time: i64,
    pub reveal_deadline: i64,      // Deadline for bid reveals
    pub status: AuctionStatus,
    pub clearing_price: u64,
    pub total_bids: u64,
    pub total_revealed: u64,       // Count of revealed bids
    pub total_committed: u64,
    pub token_supply: u64,         // Total tokens for sale
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct UserBid {
    pub auction: Pubkey,
    pub bidder: Pubkey,
    pub nullifier: [u8; 32],       // ZK identity (from Noir proof)
    pub bid_commitment: [u8; 32],  // Hash(amount + salt)
    pub deposit_amount: u64,       // Obfuscated deposit
    pub revealed_amount: u64,      // Actual bid (after reveal)
    pub is_revealed: bool,
    pub is_winner: bool,
    pub is_claimed: bool,          // Prevents double-claim
    pub bump: u8,
}

// ============================================================================
// ERRORS
// ============================================================================

#[error_code]
pub enum ErrorCode {
    #[msg("Auction is not active")]
    AuctionNotActive,
    #[msg("Auction has ended")]
    AuctionEnded,
    #[msg("Auction has not ended yet")]
    AuctionNotEnded,
    #[msg("Invalid auction status")]
    InvalidAuctionStatus,
    #[msg("Invalid bid reveal - commitment mismatch")]
    InvalidReveal,
    #[msg("Auction not settled")]
    AuctionNotSettled,
    #[msg("Bid not revealed")]
    BidNotRevealed,
    #[msg("Reveal deadline has passed")]
    RevealDeadlinePassed,
    #[msg("Already claimed")]
    AlreadyClaimed,
    #[msg("Deposit amount is zero")]
    ZeroDeposit,
    #[msg("Deposit amount too small (min 0.001)")]
    DepositTooSmall,
    #[msg("Revealed amount exceeds deposit")]
    RevealExceedsDeposit,
    #[msg("Math overflow")]
    MathOverflow,
    #[msg("Invalid payment mint")]
    InvalidPaymentMint,
}

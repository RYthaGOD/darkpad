/**
 * Darkpool Launchpad SDK
 * Main entry point for interacting with the launchpad
 */

export * from "./noir-utils";

import {
    Connection,
    PublicKey,
    Transaction,
    TransactionInstruction,
    SystemProgram,
    Keypair,
} from "@solana/web3.js";
import {
    TOKEN_2022_PROGRAM_ID,
    getAssociatedTokenAddressSync,
    createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import {
    computeNullifier,
    computeBidCommitment,
    generateSalt,
    MerkleTree,
    fieldToBytes32,
    computeLeaf,
    initPoseidon,
} from "./noir-utils";

/**
 * Launchpad Client Configuration
 */
export interface LaunchpadConfig {
    connection: Connection;
    programId: PublicKey;
    shieldProgramId: PublicKey;
}

/**
 * Bid Parameters
 */
export interface BidParams {
    auctionId: bigint;
    bidAmount: bigint;
    depositAmount: bigint;
    userSecret: bigint;
    merkleTree: MerkleTree;
    leafIndex: number;
}

/**
 * Main Launchpad Client
 */
export class LaunchpadClient {
    private config: LaunchpadConfig;

    constructor(config: LaunchpadConfig) {
        this.config = config;
    }

    /**
     * Derive auction PDA
     */
    getAuctionAddress(projectMint: PublicKey): PublicKey {
        const [address] = PublicKey.findProgramAddressSync(
            [Buffer.from("auction"), projectMint.toBuffer()],
            this.config.programId
        );
        return address;
    }

    /**
     * Derive user bid PDA
     */
    getUserBidAddress(auction: PublicKey, nullifier: Uint8Array): PublicKey {
        const [address] = PublicKey.findProgramAddressSync(
            [Buffer.from("bid"), auction.toBuffer(), nullifier],
            this.config.programId
        );
        return address;
    }

    /**
     * Prepare bid data for submission
     * This generates all the cryptographic components client-side
     */
    prepareBid(params: BidParams): {
        nullifier: Uint8Array;
        bidCommitment: Uint8Array;
        salt: Uint8Array;
        proof: Uint8Array; // Mock for V1
        noirInputs: object;
    } {
        // Compute nullifier
        const nullifierField = computeNullifier(params.userSecret, params.auctionId);
        const nullifier = fieldToBytes32(nullifierField);

        // Generate salt and commitment
        const salt = generateSalt();
        const bidCommitment = computeBidCommitment(params.bidAmount, salt);

        // Get Merkle proof
        const { pathElements, pathIndices } = params.merkleTree.getProof(params.leafIndex);

        // Format for Noir (for actual proof generation)
        const noirInputs = {
            root: params.merkleTree.getRoot().toString(),
            auction_id: params.auctionId.toString(),
            secret: params.userSecret.toString(),
            path_elements: pathElements.map((e) => e.toString()),
            path_indices: pathIndices,
        };

        // Mock proof for V1 (in production, use noir_wasm to generate real proof)
        const proof = new Uint8Array(128).fill(0);

        return {
            nullifier,
            bidCommitment,
            salt,
            proof,
            noirInputs,
        };
    }

    /**
     * Create a whitelist Merkle tree from user secrets
     */
    createWhitelist(userSecrets: bigint[]): MerkleTree {
        const leaves = userSecrets.map((secret) => computeLeaf(secret));
        return new MerkleTree(leaves);
    }
}

/**
 * Shield Client for wrapping JitoSOL
 */
export class ShieldClient {
    private connection: Connection;
    private programId: PublicKey;

    constructor(connection: Connection, programId: PublicKey) {
        this.connection = connection;
        this.programId = programId;
    }

    /**
     * Derive vault state PDA
     */
    getVaultStateAddress(jitoMint: PublicKey): PublicKey {
        const [address] = PublicKey.findProgramAddressSync(
            [Buffer.from("vault_state"), jitoMint.toBuffer()],
            this.programId
        );
        return address;
    }

    /**
     * Get the cJitoSOL mint and vault addresses from vault state
     * Call this after initialization to get the addresses
     */
    async getVaultInfo(jitoMint: PublicKey): Promise<{
        vaultState: PublicKey;
        cjitoMint: PublicKey;
        vault: PublicKey;
    } | null> {
        const vaultState = this.getVaultStateAddress(jitoMint);
        try {
            const accountInfo = await this.connection.getAccountInfo(vaultState);
            if (!accountInfo) return null;

            // Parse the account data (simplified - in production use Anchor's IDL)
            // VaultState: authority(32) + jito_mint(32) + cjito_mint(32) + vault(32) + total_deposited(8) + bump(1)
            const data = accountInfo.data.slice(8); // Skip discriminator
            const cjitoMint = new PublicKey(data.slice(64, 96));
            const vault = new PublicKey(data.slice(96, 128));

            return { vaultState, cjitoMint, vault };
        } catch {
            return null;
        }
    }

    /**
     * Get the associated token address for a user
     */
    getUserTokenAddress(mint: PublicKey, owner: PublicKey): PublicKey {
        return getAssociatedTokenAddressSync(
            mint,
            owner,
            false,
            TOKEN_2022_PROGRAM_ID
        );
    }

    /**
     * Build deposit instruction accounts
     */
    getDepositAccounts(
        user: PublicKey,
        jitoMint: PublicKey,
        cjitoMint: PublicKey,
        vault: PublicKey,
        vaultState: PublicKey
    ): {
        user: PublicKey;
        vaultState: PublicKey;
        jitoMint: PublicKey;
        cjitoMint: PublicKey;
        vault: PublicKey;
        userJitoAccount: PublicKey;
        userCjitoAccount: PublicKey;
        tokenProgram: PublicKey;
    } {
        return {
            user,
            vaultState,
            jitoMint,
            cjitoMint,
            vault,
            userJitoAccount: this.getUserTokenAddress(jitoMint, user),
            userCjitoAccount: this.getUserTokenAddress(cjitoMint, user),
            tokenProgram: TOKEN_2022_PROGRAM_ID,
        };
    }

    /**
     * Build withdraw instruction accounts
     */
    getWithdrawAccounts(
        user: PublicKey,
        jitoMint: PublicKey,
        cjitoMint: PublicKey,
        vault: PublicKey,
        vaultState: PublicKey
    ): {
        user: PublicKey;
        vaultState: PublicKey;
        jitoMint: PublicKey;
        cjitoMint: PublicKey;
        vault: PublicKey;
        userJitoAccount: PublicKey;
        userCjitoAccount: PublicKey;
        tokenProgram: PublicKey;
    } {
        return {
            user,
            vaultState,
            jitoMint,
            cjitoMint,
            vault,
            userJitoAccount: this.getUserTokenAddress(jitoMint, user),
            userCjitoAccount: this.getUserTokenAddress(cjitoMint, user),
            tokenProgram: TOKEN_2022_PROGRAM_ID,
        };
    }

    /**
     * Create user token account if needed
     */
    async createUserTokenAccountIfNeeded(
        payer: PublicKey,
        mint: PublicKey,
        owner: PublicKey
    ): Promise<TransactionInstruction | null> {
        const ata = this.getUserTokenAddress(mint, owner);
        const accountInfo = await this.connection.getAccountInfo(ata);

        if (accountInfo) {
            return null; // Account already exists
        }

        return createAssociatedTokenAccountInstruction(
            payer,
            ata,
            owner,
            mint,
            TOKEN_2022_PROGRAM_ID
        );
    }
}


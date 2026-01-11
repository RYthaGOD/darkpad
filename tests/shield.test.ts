/**
 * Anchor Test Suite for Shield Program
 * Tests the JitoSOL -> cJitoSOL wrapper functionality
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Shield } from "../target/types/shield";
import {
    Keypair,
    PublicKey,
    SystemProgram,
    LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
    createMint,
    getOrCreateAssociatedTokenAccount,
    createAssociatedTokenAccount,
    getAssociatedTokenAddress,
    mintTo,
    TOKEN_2022_PROGRAM_ID,
    getAccount,
} from "@solana/spl-token";
import { expect } from "chai";

describe("shield", () => {
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);

    const program = anchor.workspace.Shield as Program<Shield>;

    let jitoMint: PublicKey;
    let cjitoMint: PublicKey;
    let vault: PublicKey;
    let vaultState: PublicKey;
    let userJitoAccount: PublicKey;
    let userCjitoAccount: PublicKey;

    const authority = provider.wallet;

    before(async () => {
        // Create mock JitoSOL mint
        const mintKeypair = Keypair.generate();
        jitoMint = await createMint(
            provider.connection,
            (provider.wallet as anchor.Wallet).payer,
            authority.publicKey,
            authority.publicKey,
            9,
            mintKeypair,
            { commitment: "confirmed" },
            TOKEN_2022_PROGRAM_ID
        );

        console.log("Mock JitoSOL Mint:", jitoMint.toBase58());

        // Create user's JitoSOL token account and mint some tokens
        const userJitoAccountInfo = await getOrCreateAssociatedTokenAccount(
            provider.connection,
            (provider.wallet as anchor.Wallet).payer,
            jitoMint,
            authority.publicKey,
            false,
            "confirmed",
            { commitment: "confirmed" },
            TOKEN_2022_PROGRAM_ID
        );
        userJitoAccount = userJitoAccountInfo.address;

        // Mint 1000 JitoSOL to user
        await mintTo(
            provider.connection,
            (provider.wallet as anchor.Wallet).payer,
            jitoMint,
            userJitoAccount,
            authority.publicKey,
            1000 * LAMPORTS_PER_SOL,
            [],
            { commitment: "confirmed" },
            TOKEN_2022_PROGRAM_ID
        );

        console.log("User JitoSOL Account:", userJitoAccount.toBase58());
    });

    it("Initializes the Shield Vault", async () => {
        // Derive PDA for vault state
        [vaultState] = PublicKey.findProgramAddressSync(
            [Buffer.from("vault_state"), jitoMint.toBuffer()],
            program.programId
        );

        // Generate keypairs for cjitoMint and vault (these will be initialized by the program)
        const cjitoMintKeypair = Keypair.generate();
        const vaultKeypair = Keypair.generate();

        await program.methods
            .initialize()
            .accounts({
                authority: authority.publicKey,
                jitoMint: jitoMint,
                vaultState: vaultState,
                systemProgram: SystemProgram.programId,
            } as any)
            .rpc();

        await program.methods
            .initializeVaults()
            .accounts({
                authority: authority.publicKey,
                vaultState: vaultState,
                jitoMint: jitoMint,
                cjitoMint: cjitoMintKeypair.publicKey,
                vault: vaultKeypair.publicKey,
                tokenProgram: TOKEN_2022_PROGRAM_ID,
                systemProgram: SystemProgram.programId,
            } as any)
            .signers([cjitoMintKeypair, vaultKeypair])
            .rpc();

        // Fetch vault state
        const vaultStateAccount = await program.account.vaultState.fetch(vaultState);

        expect(vaultStateAccount.authority.toBase58()).to.equal(authority.publicKey.toBase58());
        expect(vaultStateAccount.jitoMint.toBase58()).to.equal(jitoMint.toBase58());
        expect(vaultStateAccount.totalDeposited.toNumber()).to.equal(0);

        cjitoMint = vaultStateAccount.cjitoMint;
        vault = vaultStateAccount.vault;

        console.log("Vault State:", vaultState.toBase58());
        console.log("cJitoSOL Mint:", cjitoMint.toBase58());
        console.log("Vault:", vault.toBase58());
    });

    it("Deposits JitoSOL and receives cJitoSOL", async () => {
        // Create user's cJitoSOL account explicitly
        // Create user's cJitoSOL account explicitly
        console.log("Creating cJitoSOL ATA for", authority.publicKey.toBase58(), "mint", cjitoMint.toBase58());
        try {
            userCjitoAccount = await createAssociatedTokenAccount(
                provider.connection,
                (provider.wallet as anchor.Wallet).payer,
                cjitoMint,
                authority.publicKey,
                { commitment: "confirmed" },
                TOKEN_2022_PROGRAM_ID
            );
            console.log("Created cJitoSOL ATA:", userCjitoAccount.toBase58());
        } catch (e: any) {
            console.log("Creation failed:", e.message);
            if (e.message.includes("already in use")) {
                userCjitoAccount = await getAssociatedTokenAddress(
                    cjitoMint,
                    authority.publicKey,
                    false,
                    TOKEN_2022_PROGRAM_ID
                );
                console.log("Using existing cJitoSOL ATA:", userCjitoAccount.toBase58());
            } else {
                throw e;
            }
        }

        const depositAmount = new anchor.BN(100 * LAMPORTS_PER_SOL);

        await program.methods
            .deposit(depositAmount)
            .accounts({
                user: authority.publicKey,
                vaultState: vaultState,
                jitoMint: jitoMint,
                cjitoMint: cjitoMint,
                vault: vault,
                userJitoAccount: userJitoAccount,
                userCjitoAccount: userCjitoAccount,
                tokenProgram: TOKEN_2022_PROGRAM_ID,
            } as any)
            .rpc();

        // Check balances
        // Check balances
        await new Promise(resolve => setTimeout(resolve, 1000));
        const userCjitoBalance = await getAccount(
            provider.connection,
            userCjitoAccount,
            "confirmed",
            TOKEN_2022_PROGRAM_ID
        );
        expect(Number(userCjitoBalance.amount)).to.equal(100 * LAMPORTS_PER_SOL);

        const vaultBalance = await getAccount(
            provider.connection,
            vault,
            "confirmed",
            TOKEN_2022_PROGRAM_ID
        );
        expect(Number(vaultBalance.amount)).to.equal(100 * LAMPORTS_PER_SOL);

        console.log("Deposited 100 JitoSOL, received 100 cJitoSOL");
    });

    it("Withdraws JitoSOL by burning cJitoSOL", async () => {
        const withdrawAmount = new anchor.BN(50 * LAMPORTS_PER_SOL);

        await program.methods
            .withdraw(withdrawAmount)
            .accounts({
                user: authority.publicKey,
                vaultState: vaultState,
                jitoMint: jitoMint,
                cjitoMint: cjitoMint,
                vault: vault,
                userJitoAccount: userJitoAccount,
                userCjitoAccount: userCjitoAccount,
                tokenProgram: TOKEN_2022_PROGRAM_ID,
            } as any)
            .rpc();

        // Check balances
        // Check balances
        await new Promise(resolve => setTimeout(resolve, 1000));
        const userCjitoBalance = await getAccount(
            provider.connection,
            userCjitoAccount,
            "confirmed",
            TOKEN_2022_PROGRAM_ID
        );
        expect(Number(userCjitoBalance.amount)).to.equal(50 * LAMPORTS_PER_SOL);

        console.log("Withdrew 50 JitoSOL, burned 50 cJitoSOL");
    });
});

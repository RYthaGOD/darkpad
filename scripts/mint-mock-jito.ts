/**
 * Mock JitoSOL Token Script
 * Creates a test token to simulate JitoSOL on localhost/devnet
 */

import {
    Connection,
    Keypair,
    LAMPORTS_PER_SOL,
    PublicKey,
} from "@solana/web3.js";
import {
    createMint,
    getOrCreateAssociatedTokenAccount,
    mintTo,
    TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

const DECIMALS = 9;
const INITIAL_SUPPLY = 1_000_000 * 10 ** DECIMALS; // 1 million tokens

async function main() {
    // Connect to cluster
    const connection = new Connection("http://localhost:8899", "confirmed");

    // Load or create payer keypair
    const keypairPath = path.join(
        process.env.HOME || process.env.USERPROFILE || ".",
        ".config",
        "solana",
        "id.json"
    );

    let payer: Keypair;
    if (fs.existsSync(keypairPath)) {
        const keypairData = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
        payer = Keypair.fromSecretKey(Uint8Array.from(keypairData));
    } else {
        payer = Keypair.generate();
        console.log("Generated new keypair. Requesting airdrop...");
        const sig = await connection.requestAirdrop(payer.publicKey, 2 * LAMPORTS_PER_SOL);
        await connection.confirmTransaction(sig);
    }

    console.log("Payer:", payer.publicKey.toBase58());

    // Create the mock JitoSOL mint using Token-2022
    console.log("Creating Mock JitoSOL mint...");
    const mintKeypair = Keypair.generate();

    const mint = await createMint(
        connection,
        payer,
        payer.publicKey, // Mint authority
        payer.publicKey, // Freeze authority
        DECIMALS,
        mintKeypair,
        { commitment: "confirmed" },
        TOKEN_2022_PROGRAM_ID
    );

    console.log("Mock JitoSOL Mint:", mint.toBase58());

    // Create token account for payer
    console.log("Creating token account...");
    const tokenAccount = await getOrCreateAssociatedTokenAccount(
        connection,
        payer,
        mint,
        payer.publicKey,
        false,
        "confirmed",
        { commitment: "confirmed" },
        TOKEN_2022_PROGRAM_ID
    );

    console.log("Token Account:", tokenAccount.address.toBase58());

    // Mint initial supply
    console.log("Minting initial supply...");
    await mintTo(
        connection,
        payer,
        mint,
        tokenAccount.address,
        payer,
        INITIAL_SUPPLY,
        [],
        { commitment: "confirmed" },
        TOKEN_2022_PROGRAM_ID
    );

    console.log(`Minted ${INITIAL_SUPPLY / 10 ** DECIMALS} Mock JitoSOL`);

    // Save mint info
    const mintInfo = {
        mint: mint.toBase58(),
        decimals: DECIMALS,
        tokenAccount: tokenAccount.address.toBase58(),
        authority: payer.publicKey.toBase58(),
    };

    fs.writeFileSync(
        path.join(__dirname, "..", "mock-jitosol.json"),
        JSON.stringify(mintInfo, null, 2)
    );

    console.log("\nMint info saved to mock-jitosol.json");
    console.log("Done!");
}

main().catch(console.error);

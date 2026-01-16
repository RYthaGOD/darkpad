/**
 * Example: Generate a ZK proof for Darkpad auction
 * 
 * This example demonstrates the full flow of:
 * 1. Setting up user identity (secret)
 * 2. Building a Merkle tree for whitelist
 * 3. Generating a ZK proof of eligibility
 * 4. Verifying the proof locally
 */

import {
    NoirSDK,
    initPoseidon,
    computeLeaf,
    computeNullifier,
    computeBidCommitment,
    generateSalt,
    MerkleTree,
    createEligibilityInputs,
    generateRandomField,
    fieldToBytes32
} from '../src/index';
import { keccak256 } from 'js-sha3';

async function main() {
    console.log('🔐 Darkpad Noir SDK Example\n');

    // Step 1: Initialize cryptographic primitives
    console.log('Step 1: Initializing Poseidon hasher...');
    await initPoseidon();
    console.log('✅ Poseidon ready\n');

    // Step 2: Generate user secret (in production, derive from wallet signature)
    console.log('Step 2: Generating user identity...');
    const userSecret = generateRandomField();
    console.log(`   Secret (first 8 hex): ${userSecret.toString(16).slice(0, 16)}...`);

    // Step 3: Create Merkle tree with user's leaf
    console.log('\nStep 3: Building Merkle tree...');
    const userLeaf = computeLeaf(userSecret);
    const merkleTree = new MerkleTree([userLeaf]);
    const merkleRoot = merkleTree.getRoot();
    console.log(`   Merkle root: ${merkleRoot.toString(16).slice(0, 16)}...`);
    console.log(`   Tree size: ${merkleTree.size} leaves`);

    // Step 4: Prepare bid parameters
    console.log('\nStep 4: Preparing bid...');
    const auctionId = 1n;
    const bidAmount = BigInt(1_000_000_000); // 1 SOL in lamports
    const salt = generateSalt();

    // Simulate recipient (wallet pubkey hash)
    const recipientBytes = new Uint8Array(32);
    recipientBytes[0] = 0x01; // Mock pubkey
    const recipientHash = '0x' + keccak256(recipientBytes);

    console.log(`   Auction ID: ${auctionId}`);
    console.log(`   Bid amount: ${bidAmount} lamports (${Number(bidAmount) / 1e9} SOL)`);

    // Step 5: Compute nullifier
    console.log('\nStep 5: Computing nullifier...');
    const nullifier = computeNullifier(userSecret, auctionId);
    const nullifierBytes = fieldToBytes32(nullifier);
    console.log(`   Nullifier: ${Buffer.from(nullifierBytes.slice(0, 8)).toString('hex')}...`);

    // Step 6: Compute bid commitment
    console.log('\nStep 6: Computing bid commitment...');
    const commitment = computeBidCommitment(bidAmount, salt);
    console.log(`   Commitment: ${Buffer.from(commitment.slice(0, 8)).toString('hex')}...`);

    // Step 7: Prepare circuit inputs
    console.log('\nStep 7: Preparing circuit inputs...');
    const inputs = await createEligibilityInputs({
        secret: userSecret,
        auctionId,
        recipientHash,
        bidAmount,
        salt,
        merkleTree,
        leafIndex: 0
    });
    console.log('   Inputs ready');

    // Step 8: Generate ZK proof
    console.log('\nStep 8: Generating ZK proof (this may take 5-15 seconds)...');
    const sdk = new NoirSDK();

    try {
        const startTime = Date.now();
        const { proof, publicInputs } = await sdk.generateProof('eligibility', inputs);
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

        console.log(`✅ Proof generated in ${elapsed}s`);
        console.log(`   Proof size: ${proof.length} bytes`);
        console.log(`   Public inputs: ${publicInputs.length}`);
        console.log(`   Nullifier from output: ${publicInputs[0]?.slice(0, 18)}...`);

        // Step 9: Verify proof locally
        console.log('\nStep 9: Verifying proof locally...');
        const isValid = await sdk.verifyProof('eligibility', { proof, publicInputs });
        console.log(`   Verification: ${isValid ? '✅ VALID' : '❌ INVALID'}`);

        // Step 10: Prepare for Solana submission
        console.log('\n📦 Ready for Solana submission:');
        console.log('   - Use crypto.subtle.digest("SHA-256", proof) for proof hash');
        console.log('   - Pass nullifierBytes as nullifier argument');
        console.log('   - Pass commitment as bid_commitment argument');

    } catch (error) {
        console.error('❌ Proof generation failed:', error);
    } finally {
        // Cleanup
        await sdk.destroy();
    }

    console.log('\n🎉 Example complete!');
}

main().catch(console.error);

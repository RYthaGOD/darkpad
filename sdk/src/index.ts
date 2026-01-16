/**
 * @darkpad/noir-sdk
 * Zero-Knowledge Proof SDK for Darkpad
 * 
 * Generate UltraHonk proofs using Noir circuits for private auctions on Solana
 */

export { NoirSDK, noirSDK, generateRandomField, fieldToBytes32, bytes32ToField } from './noir-utils';
export type { CircuitType } from './noir-utils';

// Re-export Poseidon utilities for Merkle tree operations
import { buildPoseidon } from 'circomlibjs';
import type { Poseidon } from 'circomlibjs';

let poseidonInstance: Poseidon | null = null;

/**
 * Initialize Poseidon hasher (must call before using poseidonHash or MerkleTree)
 */
export async function initPoseidon(): Promise<void> {
    if (!poseidonInstance) {
        poseidonInstance = await buildPoseidon();
    }
}

/**
 * Poseidon hash using circomlibjs (BN254 compatible)
 * Matches the Noir std::hash::poseidon implementation
 */
export function poseidonHash(inputs: bigint[]): bigint {
    if (!poseidonInstance) {
        throw new Error('Poseidon not initialized. Call initPoseidon() first.');
    }
    const hash = poseidonInstance(inputs);
    return poseidonInstance.F.toObject(hash) as bigint;
}

/**
 * Compute a user's leaf from their secret
 */
export function computeLeaf(secret: bigint): bigint {
    return poseidonHash([secret]);
}

/**
 * Compute a nullifier for an auction
 */
export function computeNullifier(secret: bigint, auctionId: bigint): bigint {
    return poseidonHash([secret, auctionId]);
}

/**
 * Compute bid commitment: keccak256(amount_le_bytes + salt)
 */
export function computeBidCommitment(amount: bigint, salt: Uint8Array): Uint8Array {
    if (salt.length !== 32) {
        throw new Error('Salt must be exactly 32 bytes');
    }

    const { keccak256 } = require('js-sha3');

    // Amount as 8-byte little-endian (matches circuit)
    const amountBytes = new Uint8Array(8);
    let remaining = amount;
    for (let i = 0; i < 8; i++) {
        amountBytes[i] = Number(remaining & 0xFFn);
        remaining >>= 8n;
    }

    // Concatenate: amount (8 bytes) + salt (32 bytes) = 40 bytes
    const data = new Uint8Array(40);
    data.set(amountBytes, 0);
    data.set(salt, 8);

    // Keccak256 hash
    const hash = keccak256(data);
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
        bytes[i] = parseInt(hash.substring(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}

/**
 * Generate a random 32-byte salt
 */
export function generateSalt(): Uint8Array {
    const salt = new Uint8Array(32);
    if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
        globalThis.crypto.getRandomValues(salt);
    } else {
        const crypto = require('crypto');
        crypto.randomFillSync(salt);
    }
    return salt;
}

/**
 * Poseidon-based Merkle Tree for whitelist proofs
 */
export class MerkleTree {
    private leaves: bigint[];
    private layers: bigint[][];

    constructor(leaves: bigint[]) {
        if (!poseidonInstance) {
            throw new Error('Poseidon not initialized. Call initPoseidon() first.');
        }

        // Pad to power of 2
        const size = Math.pow(2, Math.ceil(Math.log2(Math.max(leaves.length, 1))));
        this.leaves = [...leaves];
        while (this.leaves.length < size) {
            this.leaves.push(0n);
        }

        this.layers = [this.leaves];
        this.buildTree();
    }

    private buildTree(): void {
        let currentLayer = this.leaves;
        while (currentLayer.length > 1) {
            const nextLayer: bigint[] = [];
            for (let i = 0; i < currentLayer.length; i += 2) {
                const left = currentLayer[i];
                const right = currentLayer[i + 1];
                nextLayer.push(poseidonHash([left, right]));
            }
            this.layers.push(nextLayer);
            currentLayer = nextLayer;
        }
    }

    /**
     * Get the Merkle root
     */
    getRoot(): bigint {
        return this.layers[this.layers.length - 1][0];
    }

    /**
     * Get inclusion proof for a leaf at the given index
     */
    getProof(leafIndex: number): { pathElements: bigint[]; pathIndices: number[] } {
        const pathElements: bigint[] = [];
        const pathIndices: number[] = [];

        let index = leafIndex;
        for (let i = 0; i < this.layers.length - 1; i++) {
            const layer = this.layers[i];
            const isLeft = index % 2 === 0;
            const siblingIndex = isLeft ? index + 1 : index - 1;

            pathElements.push(layer[siblingIndex] || 0n);
            pathIndices.push(isLeft ? 0 : 1);

            index = Math.floor(index / 2);
        }

        return { pathElements, pathIndices };
    }

    /**
     * Get the number of leaves
     */
    get size(): number {
        return this.leaves.length;
    }
}

/**
 * Create proof inputs for the eligibility circuit
 */
export async function createEligibilityInputs(params: {
    secret: bigint;
    auctionId: bigint;
    recipientHash: string;
    bidAmount: bigint;
    salt: Uint8Array;
    merkleTree: MerkleTree;
    leafIndex: number;
}): Promise<Record<string, any>> {
    const proof = params.merkleTree.getProof(params.leafIndex);

    return {
        root: params.merkleTree.getRoot().toString(),
        auction_id: params.auctionId.toString(),
        recipient_hash: params.recipientHash,
        secret: params.secret.toString(),
        path_elements: proof.pathElements.map(e => e.toString()),
        path_indices: proof.pathIndices,
        bid_amount: params.bidAmount.toString(),
        salt: Array.from(params.salt)
    };
}

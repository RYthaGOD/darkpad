/**
 * Noir Proof Generation SDK
 * Client-side utilities for generating ZK proofs using Noir
 */

// This SDK will be used to:
// 1. Generate Merkle proofs for whitelist membership
// 2. Compute nullifiers
// 3. Generate Noir proofs using noir_wasm

import { keccak256 } from "js-sha3";

/**
 * Simple Poseidon hash simulation for JavaScript
 * In production, use actual Poseidon implementation from noir_wasm
 */
export function poseidonHash(inputs: bigint[]): bigint {
    // This is a placeholder - in production, use actual Poseidon from noir_wasm
    // For now, we use keccak as a stand-in for testing
    const data = inputs.map((i) => i.toString(16).padStart(64, "0")).join("");
    const hash = keccak256(Buffer.from(data, "hex"));
    return BigInt("0x" + hash);
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
 * Compute bid commitment: keccak256(amount + salt)
 */
export function computeBidCommitment(
    amount: bigint,
    salt: Uint8Array
): Uint8Array {
    const data = new Uint8Array(40);
    // Amount as 8-byte little-endian
    const amountBytes = new Uint8Array(8);
    const view = new DataView(amountBytes.buffer);
    view.setBigUint64(0, amount, true);
    data.set(amountBytes, 0);
    data.set(salt, 8);

    const hash = keccak256(data);
    return new Uint8Array(Buffer.from(hash, "hex"));
}

/**
 * Generate a random salt for bid commitment
 */
export function generateSalt(): Uint8Array {
    const salt = new Uint8Array(32);
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
        crypto.getRandomValues(salt);
    } else {
        // Node.js fallback using crypto module
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const nodeCrypto = require("crypto");
        const randomBytes = nodeCrypto.randomBytes(32);
        salt.set(randomBytes);
    }
    return salt;
}

/**
 * Simple Merkle Tree implementation
 */
export class MerkleTree {
    private leaves: bigint[];
    private layers: bigint[][];

    constructor(leaves: bigint[]) {
        // Pad to power of 2
        const size = Math.pow(2, Math.ceil(Math.log2(leaves.length)));
        this.leaves = [...leaves];
        while (this.leaves.length < size) {
            this.leaves.push(BigInt(0));
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

    getRoot(): bigint {
        return this.layers[this.layers.length - 1][0];
    }

    getProof(leafIndex: number): { pathElements: bigint[]; pathIndices: number[] } {
        const pathElements: bigint[] = [];
        const pathIndices: number[] = [];

        let index = leafIndex;
        for (let i = 0; i < this.layers.length - 1; i++) {
            const layer = this.layers[i];
            const isLeft = index % 2 === 0;
            const siblingIndex = isLeft ? index + 1 : index - 1;

            pathElements.push(layer[siblingIndex] || BigInt(0));
            pathIndices.push(isLeft ? 0 : 1);

            index = Math.floor(index / 2);
        }

        return { pathElements, pathIndices };
    }
}

/**
 * Format data for Noir circuit input
 */
export interface NoirCircuitInput {
    root: string;
    auction_id: string;
    secret: string;
    path_elements: string[];
    path_indices: number[];
}

export function formatForNoir(
    root: bigint,
    auctionId: bigint,
    secret: bigint,
    pathElements: bigint[],
    pathIndices: number[],
    treeDepth: number = 10
): NoirCircuitInput {
    // Pad arrays to tree depth
    const paddedElements = [...pathElements];
    const paddedIndices = [...pathIndices];
    while (paddedElements.length < treeDepth) {
        paddedElements.push(BigInt(0));
        paddedIndices.push(0);
    }

    return {
        root: root.toString(),
        auction_id: auctionId.toString(),
        secret: secret.toString(),
        path_elements: paddedElements.map((e) => e.toString()),
        path_indices: paddedIndices,
    };
}

/**
 * Convert Field to bytes for Solana
 */
export function fieldToBytes32(field: bigint): Uint8Array {
    const hex = field.toString(16).padStart(64, "0");
    return new Uint8Array(Buffer.from(hex, "hex"));
}

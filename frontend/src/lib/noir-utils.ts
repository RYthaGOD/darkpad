/**
 * Noir Proof Generation SDK (Frontend Version)
 * Client-side utilities for generating ZK proofs using Noir
 */

import { keccak256 } from "js-sha3";
import { buildPoseidon, Poseidon } from "circomlibjs";
import { BarretenbergBackend } from '@noir-lang/backend_barretenberg';
import { Noir } from '@noir-lang/noir_js';
import circuit from "../check_eligibility.json";

// Cached Noir instances with explicit typing to avoid implicit any errors
let backendInstance: BarretenbergBackend | null = null;
let noirInstance: Noir | null = null;

// Initialize Noir (Singleton pattern)
export async function initNoir() {
    if (!backendInstance) {
        // cast to any to avoid strict JSON typing issues with Noir's expected CompiledCircuit type
        backendInstance = new BarretenbergBackend(circuit as any);
        noirInstance = new Noir(circuit as any);
    }
}

/**
 * Generate a ZK Proof using Noir
 * @param inputs Map of input names to values:
 * { root, auction_id, recipient_hash, secret, path_elements, path_indices, bid_amount, salt }
 */
export async function generateProof(inputs: {
    root: string,
    auction_id: string,
    recipient_hash: string,
    secret: string,
    path_elements: string[],
    path_indices: number[],
    bid_amount: string,
    salt: number[] | Uint8Array
}): Promise<Uint8Array> {
    if (!noirInstance || !backendInstance) await initNoir();
    if (!noirInstance || !backendInstance) throw new Error("Failed to initialize Noir");

    // Step 1: Execute the circuit to get the witness
    const { witness } = await noirInstance.execute(inputs as any);

    // Step 2: Generate proof using the backend
    const proof = await backendInstance.generateProof(witness);
    return proof.proof;
}

// Cached Poseidon instance
let poseidonInstance: Poseidon | null = null;

// Hex string to Uint8Array helper
function hexToBytes(hex: string): Uint8Array {
    if (hex.length % 2 !== 0) throw new Error("Invalid hex string");
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes;
}

/**
 * Initialize and cache the Poseidon hasher
 * Must be called before using poseidonHash
 */
export async function initPoseidon(): Promise<void> {
    if (!poseidonInstance) {
        poseidonInstance = await buildPoseidon();
    }
}

/**
 * Poseidon hash using circomlibjs (BN254 compatible)
 * This matches the Noir std::hash::poseidon implementation
 */
export function poseidonHash(inputs: bigint[]): bigint {
    if (!poseidonInstance) {
        throw new Error("Poseidon not initialized. Call initPoseidon() first.");
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
    return hexToBytes(hash);
}

/**
 * Generate a random salt for bid commitment
 */
export function generateSalt(): Uint8Array {
    const salt = new Uint8Array(32);
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
        crypto.getRandomValues(salt);
    } else {
        throw new Error("Secure random number generation not supported in this environment");
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
 * Convert Field to bytes for Solana
 */
export function fieldToBytes32(field: bigint): Uint8Array {
    const hex = field.toString(16).padStart(64, "0");
    return hexToBytes(hex);
}

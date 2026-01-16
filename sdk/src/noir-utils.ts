/**
 * Noir Proof Generation SDK
 * Uses @aztec/bb.js for Noir 1.0.0-beta.18 compatibility
 */

import { Barretenberg, UltraHonkBackend } from '@aztec/bb.js';
import { Noir } from '@noir-lang/noir_js';

// Load circuit artifacts
import eligibilityArtifact from './check_eligibility.json';
import shadowPoolArtifact from './shadow_pool.json';
import spendArtifact from './spend.json';
import enclaveArtifact from './enclave.json';

export type CircuitType = 'eligibility' | 'shadow_pool' | 'spend' | 'enclave';

// Singleton API instance
let bbApi: Barretenberg | null = null;

async function getApi(): Promise<Barretenberg> {
    if (!bbApi) {
        console.log('Initializing Barretenberg API...');
        bbApi = await Barretenberg.new();
    }
    return bbApi;
}

export class NoirSDK {
    backends: Map<string, UltraHonkBackend> = new Map();
    noirInstances: Map<string, Noir> = new Map();

    /**
     * Get or initialize a Noir instance for a given circuit
     */
    async getInstance(type: CircuitType) {
        const artifacts: Record<CircuitType, any> = {
            eligibility: eligibilityArtifact,
            shadow_pool: shadowPoolArtifact,
            spend: spendArtifact,
            enclave: enclaveArtifact,
        };
        const artifact = artifacts[type];

        if (!this.noirInstances.has(type)) {
            console.log(`Initializing Noir for ${type}...`);
            const api = await getApi();
            // UltraHonkBackend takes (bytecode, api)
            const backend = new UltraHonkBackend(artifact.bytecode, api);
            const noir = new Noir(artifact);
            this.backends.set(type, backend);
            this.noirInstances.set(type, noir);
        }

        return {
            noir: this.noirInstances.get(type)!,
            backend: this.backends.get(type)!
        };
    }

    /**
     * Generate a ZK proof for a specific circuit
     */
    async generateProof(type: CircuitType, inputs: any) {
        const { noir, backend } = await this.getInstance(type);
        console.log(`Darkpool ZK Engine: Generating Proof for ${type}...`);

        // Execute circuit to get witness
        const { witness } = await noir.execute(inputs);

        // Generate UltraHonk proof
        const result = await backend.generateProof(witness);

        return {
            proof: result.proof,
            publicInputs: result.publicInputs
        };
    }

    /**
     * Verify a proof locally (for testing)
     */
    async verifyProof(type: CircuitType, proofData: { proof: Uint8Array; publicInputs: string[] }) {
        const { backend } = await this.getInstance(type);
        return backend.verifyProof(proofData);
    }

    /**
     * Get the verification key for a circuit
     */
    async getVerificationKey(type: CircuitType): Promise<Uint8Array> {
        const { backend } = await this.getInstance(type);
        return backend.getVerificationKey();
    }

    /**
     * Cleanup resources
     */
    async destroy() {
        for (const backend of this.backends.values()) {
            // Backend doesn't have destroy, but API does
        }
        this.backends.clear();
        this.noirInstances.clear();
        if (bbApi) {
            await bbApi.destroy();
            bbApi = null;
        }
    }
}

// Global singleton instance
export const noirSDK = new NoirSDK();

/**
 * Generate a cryptographically secure random field element (< BN254 order)
 * Safe for browser and Node.js environments
 */
export function generateRandomField(): bigint {
    // Use 31 bytes to ensure we're under the BN254 field order
    const array = new Uint8Array(31);

    if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
        // Browser or Node.js 19+
        globalThis.crypto.getRandomValues(array);
    } else {
        // Node.js < 19
        const crypto = require('crypto');
        const buf = crypto.randomBytes(31);
        return BigInt('0x' + buf.toString('hex'));
    }

    // Convert to BigInt
    let hex = '';
    for (const byte of array) {
        hex += byte.toString(16).padStart(2, '0');
    }
    return BigInt('0x' + hex);
}

/**
 * Convert a bigint to a 32-byte Uint8Array (big-endian)
 */
export function fieldToBytes32(field: bigint): Uint8Array {
    const hex = field.toString(16).padStart(64, '0');
    const bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
        bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}

/**
 * Convert a Uint8Array to a bigint
 */
export function bytes32ToField(bytes: Uint8Array): bigint {
    let hex = '';
    for (const byte of bytes) {
        hex += byte.toString(16).padStart(2, '0');
    }
    return BigInt('0x' + hex);
}

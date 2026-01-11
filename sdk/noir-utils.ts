// Noir Proof Generation SDK
import { BarretenbergBackend } from '@noir-lang/backend_barretenberg';
import { Noir } from '@noir-lang/noir_js';
import { CompiledCircuit } from '@noir-lang/types';

// Load circuit artifact
// In a real monorepo, we might import this from a shared package
// For now, we assume it's copied to frontend/src as part of build
import circuitArtifact from '../../frontend/src/check_eligibility.json';

export class NoirSDK {
    backend: BarretenbergBackend;
    noir: Noir;
    circuit: CompiledCircuit;

    constructor() {
        this.circuit = circuitArtifact as unknown as CompiledCircuit;
        this.backend = new BarretenbergBackend(this.circuit);
        this.noir = new Noir(this.circuit, this.backend);
    }

    async init() {
        // Backend initialization if needed (wasm loading)
        // Usually handled lazily or via explicit init
    }

    /**
     * Generate a ZK proof for the eligibility circuit
     * @param inputs Must match main.nr arguments: { root, auction_id, recipient_hash, secret, path_elements, path_indices }
     */
    async generateProof(inputs: any) {
        console.log("Generating witness and proof...");
        // Execution gives us the witness and return value
        // Note: SDK must ensure inputs are mapped correctly to circuit abi
        const result = await this.noir.generateFinalProof(inputs);

        // result.proof is Uint8Array
        // result.publicInputs is Map<name, string> or array of hex strings?
        // With recent Noir JS, publicInputs are returned in the result
        return result;
    }

    async verifyProof(proof: any) {
        return this.noir.verifyFinalProof(proof);
    }
}

// Global instance
export const noirSDK = new NoirSDK();

/**
 * Generate a randomized secret for the user (32 bytes)
 */
export function generateSecret(): bigint {
    const array = new Uint8Array(31); // 31 bytes to fit in field safely
    if (typeof window !== 'undefined' && window.crypto) {
        window.crypto.getRandomValues(array);
    } else {
        // Node polyfill
        require('crypto').randomFillSync(array);
    }
    // Convert to BigInt
    return BigInt('0x' + Buffer.from(array).toString('hex'));
}

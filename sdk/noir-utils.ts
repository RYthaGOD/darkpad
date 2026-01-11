// Noir Proof Generation SDK
import { BarretenbergBackend } from '@noir-lang/backend_barretenberg';
import { Noir } from '@noir-lang/noir_js';
import { CompiledCircuit } from '@noir-lang/types';

// Load circuit artifact
import circuitArtifact from '../frontend/src/check_eligibility.json';

export class NoirSDK {
    backend: BarretenbergBackend | null = null;
    noir: Noir | null = null;
    circuit: CompiledCircuit;

    constructor() {
        this.circuit = circuitArtifact as unknown as CompiledCircuit;
    }

    async init() {
        if (!this.backend) {
            this.backend = new BarretenbergBackend(this.circuit);
            this.noir = new Noir(this.circuit);
        }
    }

    /**
     * Generate a ZK proof for the private sealed bid circuit
     */
    async generateProof(inputs: any) {
        await this.init();
        console.log("Darkpool ZK Engine: Generating Sealed Bid Proof...");

        // Step 1: Execute
        const { witness } = await this.noir!.execute(inputs);

        // Step 2: Generate proof
        const proof = await this.backend!.generateProof(witness);
        return proof.proof;
    }

    async verifyProof(proof: any) {
        await this.init();
        // Backend verification is usually done via backend.verifyProof
        return this.backend!.verifyProof(proof);
    }
}

// Global instance
export const noirSDK = new NoirSDK();

/**
 * Generate a randomized secret (32 bytes)
 */
export function generateRandomField(): bigint {
    const array = new Uint8Array(31); // 31 bytes to fit in field safely
    if (typeof window !== 'undefined' && window.crypto) {
        window.crypto.getRandomValues(array);
    } else {
        // Node polyfill
        const crypto = require('crypto');
        crypto.randomFillSync(array);
    }
    return BigInt('0x' + Buffer.from(array).toString('hex'));
}

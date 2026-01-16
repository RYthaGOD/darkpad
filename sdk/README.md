# @darkpad/noir-sdk

Zero-Knowledge Proof SDK for building private applications on Solana.

## Features

- 🔐 **UltraHonk Proofs** - Generate production-grade ZK proofs using Noir circuits
- ⚡ **WASM-based** - Runs in browser and Node.js environments
- 🌲 **Merkle Trees** - Built-in Poseidon-based Merkle tree for whitelist proofs
- 🔑 **Privacy Primitives** - Nullifiers, commitments, and cryptographic utilities

## Installation

```bash
npm install @darkpad/noir-sdk
# or
yarn add @darkpad/noir-sdk
# or
pnpm add @darkpad/noir-sdk
```

## Quick Start

```typescript
import { NoirSDK, generateRandomField, MerkleTree } from '@darkpad/noir-sdk';

// Initialize SDK
const sdk = new NoirSDK();

// Generate a user secret
const secret = generateRandomField();

// Create a Merkle tree with the user's leaf
await initPoseidon();
const leaf = poseidonHash([secret]);
const tree = new MerkleTree([leaf]);

// Generate a ZK proof
const inputs = {
    root: tree.getRoot().toString(),
    auction_id: "1",
    recipient_hash: "0x...",
    secret: secret.toString(),
    path_elements: tree.getProof(0).pathElements.map(e => e.toString()),
    path_indices: tree.getProof(0).pathIndices,
    bid_amount: "1000000000", // 1 SOL in lamports
    salt: Array.from(crypto.getRandomValues(new Uint8Array(32)))
};

const { proof, publicInputs } = await sdk.generateProof('eligibility', inputs);
console.log(`Proof generated: ${proof.length} bytes`);

// Verify locally
const isValid = await sdk.verifyProof('eligibility', { proof, publicInputs });
console.log(`Valid: ${isValid}`);

// Cleanup
await sdk.destroy();
```

## API Reference

### NoirSDK

Main class for proof generation and verification.

```typescript
class NoirSDK {
    // Generate a ZK proof for a specific circuit
    async generateProof(
        type: CircuitType, 
        inputs: any
    ): Promise<{ proof: Uint8Array; publicInputs: string[] }>
    
    // Verify a proof locally
    async verifyProof(
        type: CircuitType, 
        proofData: { proof: Uint8Array; publicInputs: string[] }
    ): Promise<boolean>
    
    // Get the verification key for a circuit
    async getVerificationKey(type: CircuitType): Promise<Uint8Array>
    
    // Cleanup resources
    async destroy(): Promise<void>
}

type CircuitType = 'eligibility' | 'shadow_pool' | 'spend' | 'enclave';
```

### Cryptographic Utilities

```typescript
// Generate a cryptographically secure random field element
function generateRandomField(): bigint

// Convert a bigint to 32-byte Uint8Array
function fieldToBytes32(field: bigint): Uint8Array

// Convert Uint8Array to bigint
function bytes32ToField(bytes: Uint8Array): bigint

// Initialize Poseidon hasher (must call before hashing)
async function initPoseidon(): Promise<void>

// Poseidon hash (BN254 compatible)
function poseidonHash(inputs: bigint[]): bigint

// Compute bid commitment (keccak256)
function computeBidCommitment(amount: bigint, salt: Uint8Array): Uint8Array

// Compute nullifier from secret and auction ID
function computeNullifier(secret: bigint, auctionId: bigint): bigint
```

### MerkleTree

Poseidon-based Merkle tree for whitelist proofs.

```typescript
class MerkleTree {
    constructor(leaves: bigint[])
    
    // Get the Merkle root
    getRoot(): bigint
    
    // Get inclusion proof for a leaf
    getProof(leafIndex: number): {
        pathElements: bigint[];
        pathIndices: number[];
    }
}
```

## Circuit Types

| Circuit | Purpose |
|---------|---------|
| `eligibility` | Prove whitelist membership and commit to a sealed bid |
| `shadow_pool` | Prove ownership of shielded assets |
| `spend` | Spend from a privacy pool with nullifier |
| `enclave` | Recursive proof aggregation (Phase 2) |

## Browser Usage

For browser environments, ensure your bundler supports WASM:

```javascript
// vite.config.js
export default {
    optimizeDeps: {
        exclude: ['@aztec/bb.js']
    }
}

// next.config.js
module.exports = {
    webpack: (config) => {
        config.experiments = {
            asyncWebAssembly: true,
            topLevelAwait: true
        };
        return config;
    }
};
```

## Solana Integration

Submit proofs to Solana:

```typescript
import { NoirSDK, fieldToBytes32 } from '@darkpad/noir-sdk';
import { Connection, PublicKey } from '@solana/web3.js';

// Generate proof
const { proof, publicInputs } = await sdk.generateProof('eligibility', inputs);

// Extract nullifier from public inputs
const nullifier = fieldToBytes32(BigInt(publicInputs[0]));

// For Solana tx size limits, hash the proof
const proofHash = await crypto.subtle.digest('SHA-256', proof);

// Submit to your Solana program
await program.methods
    .placeBid(
        Buffer.from(new Uint8Array(proofHash)),
        Array.from(nullifier),
        // ...
    )
    .rpc();
```

## Requirements

- Node.js >= 18.0.0
- Noir compiler (nargo) 1.0.0-beta.18 for custom circuits

## License

MIT

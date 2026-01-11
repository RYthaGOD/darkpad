// Noir ZK Circuit: Check Eligibility (Aligned to Poseidon)
// Purpose: Prove membership in whitelist without revealing identity
// 
// This circuit verifies that a user is in the whitelist (Merkle tree)
// and outputs a unique nullifier to prevent double-bidding.

global TREE_DEPTH: u32 = 10;

// Use Poseidon for BN254 (Solana compatible)
use std::hash::poseidon;

fn main(
    root: pub Field,
    auction_id: pub Field,
    recipient_hash: pub Field, // [NEW] Bind proof to recipient
    secret: Field,
    path_elements: [Field; TREE_DEPTH],
    path_indices: [u1; TREE_DEPTH],
) -> pub Field {
    // Input validation
    assert(secret != 0, "Secret cannot be zero");
    assert(auction_id != 0, "Auction ID cannot be zero");

    // Step 1: Compute user's leaf (Poseidon)
    let leaf = poseidon::bn254::hash_1([secret]);

    // Step 2: Verify Merkle membership (Poseidon)
    let mut current = leaf;
    for i in 0..TREE_DEPTH {
        let path_element = path_elements[i];
        let index = path_indices[i];
        
        // Match the MerkleTree.ts implementation precisely
        current = if index == 0 {
            poseidon::bn254::hash_2([current, path_element])
        } else {
            poseidon::bn254::hash_2([path_element, current])
        };
    }

    // Step 3: Assert root match
    assert(current == root, "Merkle proof verification failed");

    // Step 4: Compute nullifier (Poseidon)
    // Unique per user per auction
    let nullifier = poseidon::bn254::hash_2([secret, auction_id]);

    nullifier
}

#[test]
fn test_poseidon_logic() {
    let secret: Field = 123456789;
    let auction_id: Field = 1;
    
    let leaf = poseidon::bn254::hash_1([secret]);
    
    let mut current = leaf;
    let path_elements: [Field; TREE_DEPTH] = [0; TREE_DEPTH];
    let path_indices: [u1; TREE_DEPTH] = [0; TREE_DEPTH];
    
    for _i in 0..TREE_DEPTH {
        current = poseidon::bn254::hash_2([current, 0]);
    }
    let root = current;
    
    let nullifier = main(root, auction_id, secret, path_elements, path_indices);
    
    let expected_nullifier = poseidon::bn254::hash_2([secret, auction_id]);
    assert(nullifier == expected_nullifier);
}

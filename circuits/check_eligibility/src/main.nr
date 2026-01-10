// Noir ZK Circuit: Check Eligibility
// Purpose: Prove membership in whitelist without revealing identity
// 
// This circuit verifies that a user is in the whitelist (Merkle tree)
// and outputs a unique nullifier to prevent double-bidding.
//
// Noir Documentation: https://noir-lang.org/docs/

// Tree depth - supports up to 2^10 = 1024 users
global TREE_DEPTH: u32 = 10;

// Main circuit function
// Public inputs:
//   - root: The Merkle root of the whitelist
//   - auction_id: Unique identifier for this auction  
// Private inputs:
//   - secret: User's secret key (only they know)
//   - path_elements: Merkle proof path hashes
//   - path_indices: Merkle proof path directions (0=left, 1=right)
// Returns:
//   - nullifier: Unique per-user-per-auction identifier
fn main(
    root: pub Field,
    auction_id: pub Field,
    secret: Field,
    path_elements: [Field; TREE_DEPTH],
    path_indices: [u1; TREE_DEPTH],
) -> pub Field {
    // Input validation - prevent zero values
    assert(secret != 0, "Secret cannot be zero");
    assert(auction_id != 0, "Auction ID cannot be zero");

    // Step 1: Compute the user's leaf from their secret
    // The leaf is hash(secret) - this is what's stored in the Merkle tree
    let leaf = std::hash::poseidon::bn254::hash_1([secret]);

    // Step 2: Verify Merkle membership
    // Walk up the tree using the proof path
    let mut current = leaf;
    for i in 0..TREE_DEPTH {
        let path_element = path_elements[i];
        let index = path_indices[i];
        
        // If index is 0, current is on the left
        // If index is 1, current is on the right
        current = if index == 0 {
            std::hash::poseidon::bn254::hash_2([current, path_element])
        } else {
            std::hash::poseidon::bn254::hash_2([path_element, current])
        };
    }

    // Step 3: Assert the computed root matches the public root
    assert(current == root, "Merkle proof verification failed");

    // Step 4: Compute the nullifier
    // nullifier = hash(secret, auction_id)
    // This is unique per user per auction, preventing double-bidding
    let nullifier = std::hash::poseidon::bn254::hash_2([secret, auction_id]);

    // Return nullifier as public output
    nullifier
}

// Test with a simple single-leaf tree
#[test]
fn test_single_leaf_tree() {
    let secret: Field = 12345;
    let auction_id: Field = 1;
    
    // Compute leaf
    let leaf = std::hash::poseidon::bn254::hash_1([secret]);
    
    // Build a trivial tree where we hash up with zeros
    // This simulates a single-user whitelist
    let mut current = leaf;
    let path_elements: [Field; TREE_DEPTH] = [0; TREE_DEPTH];
    let path_indices: [u1; TREE_DEPTH] = [0; TREE_DEPTH];
    
    for i in 0..TREE_DEPTH {
        current = std::hash::poseidon::bn254::hash_2([current, path_elements[i]]);
    }
    let root = current;
    
    // Run the circuit
    let nullifier = main(root, auction_id, secret, path_elements, path_indices);
    
    // Verify nullifier is deterministic
    let expected_nullifier = std::hash::poseidon::bn254::hash_2([secret, auction_id]);
    assert(nullifier == expected_nullifier, "Nullifier mismatch");
}


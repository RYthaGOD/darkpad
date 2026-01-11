// Noir ZK Circuit: Check Eligibility
// Purpose: Prove membership in whitelist without revealing identity

global TREE_DEPTH: u32 = 10;

use std::hash::pedersen_hash;

fn main(
    root: pub Field,
    auction_id: pub Field,
    recipient_hash: pub Field, // Bind proof to recipient (Public Input)
    secret: Field,
    path_elements: [Field; TREE_DEPTH],
    path_indices: [u1; TREE_DEPTH],
) -> pub Field {
    // Input validation
    assert(secret != 0, "Secret cannot be zero");
    assert(auction_id != 0, "Auction ID cannot be zero");
    
    // Silence unused warning
    assert(recipient_hash == recipient_hash);

    // Step 1: Compute user's leaf (Pedersen)
    let leaf = pedersen_hash([secret]);

    // Step 2: Verify Merkle membership (Pedersen)
    let mut current = leaf;
    for i in 0..TREE_DEPTH {
        let path_element = path_elements[i];
        let index = path_indices[i];
        
        current = if index == 0 {
            pedersen_hash([current, path_element])
        } else {
            pedersen_hash([path_element, current])
        };
    }

    // Step 3: Assert root match
    assert(current == root, "Merkle proof verification failed");

    // Step 4: Compute nullifier (Pedersen)
    // CRITICAL FIX: Do NOT include recipient_hash in nullifier.
    let nullifier = pedersen_hash([secret, auction_id]);

    nullifier
}

#[test]
fn test_pedersen_value_diagnostic() {
    // Diagnostic: Leak the Pedersen hash of [1] to compare with JS
    // We expect this to fail, revealing the actual hash value in the error
    let hash = pedersen_hash([1]);
    std::println(hash);
    let expected: Field = 0; 
    assert(hash == expected, "Diagnostic: Hash Value Mismatch (Intentional)");
}

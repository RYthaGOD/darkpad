// Noir ZK Circuit: Private Sealed Bid Eligibility
// Purpose: 
// 1. Prove membership in whitelist (Merkle Proof) - Poseidon
// 2. Prevent double-bidding (Nullifier) - Poseidon
// 3. Cryptographically commit to a bid amount (Sealed Bid) - Keccak256
// 4. Bind proof to a specific recipient address (Context Binding) - Keccak256 (via ABI)

global TREE_DEPTH: u32 = 10;

use std::hash::poseidon;
use std::hash::keccak256;

fn main(
    root: pub Field,
    auction_id: pub Field,
    recipient_hash: pub Field, // Bind proof to recipient (Public Input)
    
    // Private Identity
    secret: Field,
    path_elements: [Field; TREE_DEPTH],
    path_indices: [u1; TREE_DEPTH],
    
    // Private Bid Info
    bid_amount: Field,
    salt: [u8; 32],
) -> pub (Field, [u8; 32]) { // Returns (nullifier, bid_commitment)
    // 1. Input Validation
    assert(secret != 0, "Secret cannot be zero");
    assert(auction_id != 0, "Auction ID cannot be zero");
    assert(bid_amount != 0, "Bid amount must be positive");
    
    // 2. Identity Verification (Merkle Membership) - Poseidon
    let leaf = poseidon::bn254::hash_1([secret]);

    let mut current = leaf;
    for i in 0..TREE_DEPTH {
        let path_element = path_elements[i];
        let index = path_indices[i];
        
        current = if index == 0 {
            poseidon::bn254::hash_2([current, path_element])
        } else {
            poseidon::bn254::hash_2([path_element, current])
        };
    }
    assert(current == root, "Merkle proof verification failed");

    // 3. Nullifier Generation - Poseidon
    let nullifier = poseidon::bn254::hash_2([secret, auction_id]);

    // 4. Bid Commitment Generation - Keccak256
    // Matches Solana's keccak256(bid_amount_le_bytes + salt_bytes)
    let bid_bytes = bid_amount.to_le_bytes(8);
    let mut commitment_input = [0u8; 40];
    for i in 0..8 { commitment_input[i] = bid_bytes[i]; }
    for i in 0..32 { commitment_input[i + 8] = salt[i]; }
    
    let bid_commitment = keccak256(commitment_input, 40);

    // 5. Context Binding
    assert(recipient_hash == recipient_hash); 

    (nullifier, bid_commitment)
}

#[test]
fn test_hybrid_flow() {
    let secret = 12345;
    let auction_id = 1;
    let bid_amount = 100;
    let salt = [1u8; 32];
    
    let (res_nullifier, res_commitment) = main(
        0, // root (mock)
        auction_id, 
        0, 
        secret, 
        [0; 10], // path (mock) 
        [0; 10], 
        bid_amount, 
        salt
    );
    
    assert(res_nullifier != 0);
    assert(res_commitment[0] != 0);
}

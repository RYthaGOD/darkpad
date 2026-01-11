use anchor_lang::prelude::*;
use groth16_solana::groth16::{Groth16Verifier, Groth16Verifyingkey};
use groth16_solana::errors::Groth16Error;

declare_id!("EL25TkoP8zcMcThDRn6ufsyN8HPjgxs6LPferAmoSURH");

// Hardcoded Verifying Key (Mock for Compilation)
// User must update this with REAL circuit VK values
// or implement a loader from bytes.
pub const MOCK_VERIFYING_KEY: Groth16Verifyingkey = Groth16Verifyingkey {
    nr_pubinputs: 4, // 4 inputs: Root, AuctionID, Nullifier, RecipientHash
    vk_alpha_g1: [
        45, 77, 154, 167, 227, 2, 217, 223, 65, 116, 157, 85, 7, 148, 157, 5, 219, 234, 51,
        251, 177, 108, 100, 59, 34, 245, 153, 162, 190, 109, 242, 226, 20, 190, 221, 80, 60,
        55, 206, 176, 97, 216, 236, 96, 32, 159, 227, 69, 206, 137, 131, 10, 25, 35, 3, 1, 240,
        118, 202, 255, 0, 77, 25, 38,
    ],
    vk_beta_g2: [
        9, 103, 3, 47, 203, 247, 118, 209, 175, 201, 133, 248, 136, 119, 241, 130, 211, 132,
        128, 166, 83, 242, 222, 202, 169, 121, 76, 188, 59, 243, 6, 12, 14, 24, 120, 71, 173,
        76, 121, 131, 116, 208, 214, 115, 43, 245, 1, 132, 125, 214, 139, 192, 224, 113, 36,
        30, 2, 19, 188, 127, 193, 61, 183, 171, 48, 76, 251, 209, 224, 138, 112, 74, 153, 245,
        232, 71, 217, 63, 140, 60, 170, 253, 222, 196, 107, 122, 13, 55, 157, 166, 154, 77, 17,
        35, 70, 167, 23, 57, 193, 177, 164, 87, 168, 199, 49, 49, 35, 210, 77, 47, 145, 146,
        248, 150, 183, 198, 62, 234, 5, 169, 213, 127, 6, 84, 122, 208, 206, 200,
    ],
    vk_gamme_g2: [
        25, 142, 147, 147, 146, 13, 72, 58, 114, 96, 191, 183, 49, 251, 93, 37, 241, 170, 73,
        51, 53, 169, 231, 18, 151, 228, 133, 183, 174, 243, 18, 194, 24, 0, 222, 239, 18, 31,
        30, 118, 66, 106, 0, 102, 94, 92, 68, 121, 103, 67, 34, 212, 247, 94, 218, 221, 70,
        222, 189, 92, 217, 146, 246, 237, 9, 6, 137, 208, 88, 95, 240, 117, 236, 158, 153, 173,
        105, 12, 51, 149, 188, 75, 49, 51, 112, 179, 142, 243, 85, 172, 218, 220, 209, 34, 151,
        91, 18, 200, 94, 165, 219, 140, 109, 235, 74, 171, 113, 128, 141, 203, 64, 143, 227,
        209, 231, 105, 12, 67, 211, 123, 76, 230, 204, 1, 102, 250, 125, 170,
    ],
    vk_delta_g2: [
        25, 142, 147, 147, 146, 13, 72, 58, 114, 96, 191, 183, 49, 251, 93, 37, 241, 170, 73,
        51, 53, 169, 231, 18, 151, 228, 133, 183, 174, 243, 18, 194, 24, 0, 222, 239, 18, 31,
        30, 118, 66, 106, 0, 102, 94, 92, 68, 121, 103, 67, 34, 212, 247, 94, 218, 221, 70,
        222, 189, 92, 217, 146, 246, 237, 9, 6, 137, 208, 88, 95, 240, 117, 236, 158, 153, 173,
        105, 12, 51, 149, 188, 75, 49, 51, 112, 179, 142, 243, 85, 172, 218, 220, 209, 34, 151,
        91, 18, 200, 94, 165, 219, 140, 109, 235, 74, 171, 113, 128, 141, 203, 64, 143, 227,
        209, 231, 105, 12, 67, 211, 123, 76, 230, 204, 1, 102, 250, 125, 170,
    ],
    vk_ic: &[
        [ // G1 One (Usually) or IC[0]
            3, 183, 175, 189, 219, 73, 183, 28, 132, 200, 83, 8, 65, 22, 184, 81, 82, 36, 181,
            186, 25, 216, 234, 25, 151, 2, 235, 194, 13, 223, 32, 145, 15, 37, 113, 122, 93,
            59, 91, 25, 236, 104, 227, 238, 58, 154, 67, 250, 186, 91, 93, 141, 18, 241, 150,
            59, 202, 48, 179, 1, 53, 207, 155, 199,
        ],
        // Dummy IC points for inputs (Must match nr_pubinputs + 1)
        // Here we have 4 inputs, so we need 5 IC points total (IC[0]..IC[4])
        // I will just clone the point for now as mock.
        [46, 253, 85, 84, 166, 240, 71, 175, 111, 174, 244, 62, 87, 96, 235, 196, 208, 85,
         186, 47, 163, 237, 53, 204, 176, 190, 62, 201, 189, 216, 132, 71, 6, 91, 228, 97,
         74, 5, 0, 255, 147, 113, 161, 152, 238, 177, 78, 81, 111, 13, 142, 220, 24, 133,
         27, 149, 66, 115, 34, 87, 224, 237, 44, 162],
        [46, 253, 85, 84, 166, 240, 71, 175, 111, 174, 244, 62, 87, 96, 235, 196, 208, 85,
         186, 47, 163, 237, 53, 204, 176, 190, 62, 201, 189, 216, 132, 71, 6, 91, 228, 97,
         74, 5, 0, 255, 147, 113, 161, 152, 238, 177, 78, 81, 111, 13, 142, 220, 24, 133,
         27, 149, 66, 115, 34, 87, 224, 237, 44, 162],
        [46, 253, 85, 84, 166, 240, 71, 175, 111, 174, 244, 62, 87, 96, 235, 196, 208, 85,
         186, 47, 163, 237, 53, 204, 176, 190, 62, 201, 189, 216, 132, 71, 6, 91, 228, 97,
         74, 5, 0, 255, 147, 113, 161, 152, 238, 177, 78, 81, 111, 13, 142, 220, 24, 133,
         27, 149, 66, 115, 34, 87, 224, 237, 44, 162],
        [46, 253, 85, 84, 166, 240, 71, 175, 111, 174, 244, 62, 87, 96, 235, 196, 208, 85,
         186, 47, 163, 237, 53, 204, 176, 190, 62, 201, 189, 216, 132, 71, 6, 91, 228, 97,
         74, 5, 0, 255, 147, 113, 161, 152, 238, 177, 78, 81, 111, 13, 142, 220, 24, 133,
         27, 149, 66, 115, 34, 87, 224, 237, 44, 162],
    ],
};

#[program]
pub mod verifier {
    use super::*;

    /// Verify a ZK Proof
    /// Uses manually implemented Groth16 verification from groth16-solana crate
    pub fn verify_proof(_ctx: Context<VerifyProof>, proof: Vec<u8>, public_inputs_concatenated: Vec<u8>) -> Result<()> {
        msg!("Darkpool ZK Engine: Dispatching Verification...");

        // 1. Proof Parsing (Expecting uncompressed format for simplicity or minimal headers)
        // A (64) + B (128) + C (64) = 256 bytes
        require!(proof.len() == 256, VerifierError::InvalidProofSize);
        
        let proof_a: &[u8; 64] = proof[0..64].try_into().map_err(|_| VerifierError::InvalidProof)?;
        let proof_b: &[u8; 128] = proof[64..192].try_into().map_err(|_| VerifierError::InvalidProof)?;
        let proof_c: &[u8; 64] = proof[192..256].try_into().map_err(|_| VerifierError::InvalidProof)?;

        // 2. Public Inputs Parsing
        // Concatenated 32-byte fields
        // Expecting 4 inputs: [Root, AuctionID, Nullifier, RecipientHash] = 128 bytes
        require!(public_inputs_concatenated.len() == 128, VerifierError::InvalidPublicInputs);

        let mut pub_inputs: [[u8; 32]; 4] = [[0; 32]; 4];
        for i in 0..4 {
            let start = i * 32;
            let end = start + 32;
            pub_inputs[i] = public_inputs_concatenated[start..end].try_into().unwrap();
        }

        // 3. Verification
        let mut verifier = Groth16Verifier::new(
            proof_a,
            proof_b,
            proof_c,
            &pub_inputs,
            &MOCK_VERIFYING_KEY
        ).map_err(|e| {
            msg!("Verifier Error: {:?}", e);
            VerifierError::InvalidProof
        })?;

        verifier.verify().map_err(|e| {
            msg!("Verification Failed: {:?}", e);
            VerifierError::InvalidProof
        })?;
        
        msg!("ZK Status: VERIFIED");
        
        // Audit log
        msg!("Identity Authenticated (Nullifier: {:?})", &pub_inputs[2][..4]);

        Ok(())
    }
}

#[derive(Accounts)]
pub struct VerifyProof<'info> {
    pub system_program: Program<'info, System>,
}

#[error_code]
pub enum VerifierError {
    #[msg("Proof too small or empty")]
    InvalidProofSize,
    #[msg("Public inputs must be exactly 128 bytes")]
    InvalidPublicInputs,
    #[msg("Groth16 verification failed - invalid proof or identity mismatch")]
    InvalidProof,
}

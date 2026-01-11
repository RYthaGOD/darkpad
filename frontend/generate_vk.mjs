
import { BarretenbergBackend } from '@noir-lang/backend_barretenberg';
import { Noir } from '@noir-lang/noir_js';
import fs from 'fs';
import path from 'path';

async function main() {
    console.log("Loading compiled circuit...");
    const circuitPath = path.resolve('../circuits/check_eligibility/target/check_eligibility.json');
    const fileContent = fs.readFileSync(circuitPath, 'utf8');
    const circuit = JSON.parse(fileContent);

    console.log("Initializing Backend...");
    const backend = new BarretenbergBackend(circuit);
    // const noir = new Noir(circuit, backend); // Not needed just for VK

    console.log("Generating Verification Key...");
    // This performs the trusted setup (or uses cached CRS)
    const verificationKey = await backend.getVerificationKey();

    console.log("\n--- VERIFICATION KEY ---");
    console.log(Buffer.from(verificationKey).toString('hex'));
    console.log("------------------------\n");

    // For Rust, we need the points (Alpha, Beta...). 
    // The byte array above is usually the serialized key.
    // Barretenberg's format:
    // [alpha (32), beta (32), gamma (32), delta (32), gamma_abc (32 * N)]
    // We will parse this in Rust or just verify the length.

    console.log("Key Length:", verificationKey.length);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});

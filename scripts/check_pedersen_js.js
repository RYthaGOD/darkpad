const { buildPedersenHash } = require("circomlibjs");

async function run() {
    try {
        const pedersen = await buildPedersenHash();
        const input = Buffer.alloc(32);
        input[31] = 1; // 1 as 32-byte buffer

        const h = pedersen.hash(input);

        console.log("Raw output type:", typeof h);
        if (Array.isArray(h) || h.constructor.name === "Uint8Array") {
            // Try to print it as a point or hex
            if (pedersen.babyJub) {
                const F = pedersen.babyJub.F;
                try {
                    const x = F.toString(h[0]);
                    console.log("X:", x);
                    // 0x0354... is approx 2.4e76. 
                    // Compare hex.
                    console.log("X Hex:", BigInt(x).toString(16));
                } catch (e) { console.log(e); }
            }
        }
    } catch (e) {
        console.error(e);
    }
}
run();

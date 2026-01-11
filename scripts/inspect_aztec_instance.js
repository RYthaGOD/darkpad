const { Barretenberg } = require('@aztec/bb.js');

async function run() {
    try {
        const bb = await Barretenberg.new();

        if (bb.pedersenHash) {
            const input = Buffer.alloc(32);
            input[31] = 1;
            const h = await bb.pedersenHash(input, 0);

            console.log("Returned Type:", h.constructor.name);
            if (h.toString) console.log("toString:", h.toString());
            if (h.toBuffer) console.log("toBuffer Hex:", h.toBuffer().toString('hex'));
        } else {
            console.log("pedersenHash not found on instance");
        }
    } catch (e) {
        console.error(e);
    }
}
run();

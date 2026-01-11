try {
    const bb = require('@aztec/bb.js');
    console.log("Exports:", Object.keys(bb));

    // Check for Pedersen
    if (bb.Pedersen) console.log("Found Pedersen class");
    if (bb.pedersenHash) console.log("Found pedersenHash function");

    // Sometimes it's in a sub-module or on the WASM wrapper
    bb.getBackend().then(backend => {
        console.log("Backend keys:", Object.keys(backend));
        if (backend.pedersenHash) console.log("Found backend.pedersenHash");
    }).catch(e => console.log("No default backend init"));

} catch (e) {
    console.error(e);
}

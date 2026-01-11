const { BarretenbergBackend } = require('@noir-lang/backend_barretenberg');
console.log('Backend exports:', Object.keys(require('@noir-lang/backend_barretenberg')));
// Try to instantiate or find static methods
try {
    const bb = new BarretenbergBackend({ bytecode: "" }); // Mock
    console.log('Backend instance:', Object.keys(bb));
    // Check if we can access the underlying api
    // Usually it's via a WASM module
} catch (e) {
    console.log('Backend instantiation failed:', e.message);
}

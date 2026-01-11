/**
 * Secure Vault Utilities
 * Handles signature-derived encryption for local storage protection.
 */

const ENCRYPTION_ALGORITHM = "AES-GCM";
const VAULT_MESSAGE = "Sign to unlock your Darkpool Private Vault";

/**
 * Derive an encryption key from a wallet signature
 */
async function deriveKey(signature: Uint8Array): Promise<CryptoKey> {
    const hash = await crypto.subtle.digest("SHA-256", signature);
    return await crypto.subtle.importKey(
        "raw",
        hash,
        ENCRYPTION_ALGORITHM,
        false,
        ["encrypt", "decrypt"]
    );
}

/**
 * Encrypt a JSON payload
 */
export async function encryptVaultData(data: any, signature: Uint8Array): Promise<string> {
    const key = await deriveKey(signature);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(JSON.stringify(data));

    const ciphertext = await crypto.subtle.encrypt(
        { name: ENCRYPTION_ALGORITHM, iv },
        key,
        encoded
    );

    const result = {
        ciphertext: Buffer.from(ciphertext).toString("base64"),
        iv: Buffer.from(iv).toString("base64")
    };

    return JSON.stringify(result);
}

/**
 * Decrypt a JSON payload
 */
export async function decryptVaultData(vaultString: string, signature: Uint8Array): Promise<any> {
    const key = await deriveKey(signature);
    const { ciphertext, iv } = JSON.parse(vaultString);

    const decrypted = await crypto.subtle.decrypt(
        { name: ENCRYPTION_ALGORITHM, iv: Buffer.from(iv, "base64") },
        key,
        Buffer.from(ciphertext, "base64")
    );

    const decoded = new TextDecoder().decode(decrypted);
    return JSON.parse(decoded);
}

export { VAULT_MESSAGE };

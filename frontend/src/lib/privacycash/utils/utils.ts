import BN from 'bn.js';
import { Utxo } from '../models/utxo';
import * as borsh from 'borsh';
import { sha256 } from 'ethers'; // replaced @ethersproject/sha2
import { PublicKey } from '@solana/web3.js';
import { RELAYER_API_URL, PROGRAM_ID, FEE_RECIPIENT } from './constants';
import { logger } from './logger';
// getConfig import removed, basic config polyfill implemented

// Mock getConfig
async function getConfig(key: string) {
    if (key === 'deposit_fee_rate') return 50; // 0.5%
    if (key === 'withdraw_fee_rate') return 50; // 0.5%
    // fetch from API if needed, but hardcoding for now to reduce complexity
    // In production we should fetch from ${RELAYER_API_URL}/config
    return 0;
}

export async function calculateDepositFee(depositAmount: number) {
    return Math.floor(depositAmount * (await getConfig('deposit_fee_rate')) / 10000);
}

export async function calculateWithdrawalFee(withdrawalAmount: number) {
    return Math.floor(withdrawalAmount * (await getConfig('withdraw_fee_rate')) / 10000);
}

export function getExtDataHash(extData: {
    recipient: string | PublicKey;
    extAmount: string | number | BN;
    encryptedOutput1?: string | Uint8Array;
    encryptedOutput2?: string | Uint8Array;
    fee: string | number | BN;
    feeRecipient: string | PublicKey;
    mintAddress: string | PublicKey;
}): Uint8Array {
    const recipient = extData.recipient instanceof PublicKey
        ? extData.recipient
        : new PublicKey(extData.recipient);

    const feeRecipient = extData.feeRecipient instanceof PublicKey
        ? extData.feeRecipient
        : new PublicKey(extData.feeRecipient);

    const mintAddress = extData.mintAddress instanceof PublicKey
        ? extData.mintAddress
        : new PublicKey(extData.mintAddress);

    const extAmount = new BN(extData.extAmount.toString());
    const fee = new BN(extData.fee.toString());

    const encryptedOutput1 = extData.encryptedOutput1
        ? Buffer.from(extData.encryptedOutput1 as any)
        : Buffer.alloc(0);
    const encryptedOutput2 = extData.encryptedOutput2
        ? Buffer.from(extData.encryptedOutput2 as any)
        : Buffer.alloc(0);

    const schema = {
        struct: {
            recipient: { array: { type: 'u8', len: 32 } },
            extAmount: 'i64',
            encryptedOutput1: { array: { type: 'u8' } },
            encryptedOutput2: { array: { type: 'u8' } },
            fee: 'u64',
            feeRecipient: { array: { type: 'u8', len: 32 } },
            mintAddress: { array: { type: 'u8', len: 32 } },
        }
    };

    const value = {
        recipient: recipient.toBytes(),
        extAmount: extAmount,
        encryptedOutput1: encryptedOutput1,
        encryptedOutput2: encryptedOutput2,
        fee: fee,
        feeRecipient: feeRecipient.toBytes(),
        mintAddress: mintAddress.toBytes(),
    };

    const serializedData = borsh.serialize(schema, value);
    const hashHex = sha256(serializedData);
    return Buffer.from(hashHex.slice(2), 'hex');
}

export async function fetchMerkleProof(commitment: string, tokenName?: string): Promise<{ pathElements: string[], pathIndices: number[] }> {
    try {
        logger.debug(`Fetching Merkle proof for commitment: ${commitment}`);
        let url = `${RELAYER_API_URL}/merkle/proof/${commitment}`
        if (tokenName) {
            url += '?token=' + tokenName
        }
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch Merkle proof: ${url}`);
        }
        const data = await response.json() as { pathElements: string[], pathIndices: number[] };
        logger.debug(`✓ Fetched Merkle proof with ${data.pathElements.length} elements`);
        return data;
    } catch (error) {
        console.error(`Failed to fetch Merkle proof for commitment ${commitment}:`, error);
        throw error;
    }
}

export function findNullifierPDAs(proof: any) {
    const [nullifier0PDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("nullifier0"), Buffer.from(proof.inputNullifiers[0])],
        PROGRAM_ID
    );

    const [nullifier1PDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("nullifier1"), Buffer.from(proof.inputNullifiers[1])],
        PROGRAM_ID
    );

    return { nullifier0PDA, nullifier1PDA };
}

export async function queryRemoteTreeState(tokenName?: string): Promise<{ root: string, nextIndex: number }> {
    try {
        logger.debug('Fetching Merkle root and nextIndex from API...');
        let url = `${RELAYER_API_URL}/merkle/root`
        if (tokenName) {
            url += '?token=' + tokenName
        }
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch Merkle root and nextIndex: ${response.status} ${response.statusText}`);
        }
        const data = await response.json() as { root: string, nextIndex: number };
        return data;
    } catch (error) {
        console.error('Failed to fetch root and nextIndex from API:', error);
        throw error;
    }
}

export function getProgramAccounts() {
    const [treeAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from('merkle_tree')],
        PROGRAM_ID
    );

    const [treeTokenAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from('tree_token')],
        PROGRAM_ID
    );

    const [globalConfigAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from('global_config')],
        PROGRAM_ID
    );
    return { treeAccount, treeTokenAccount, globalConfigAccount }
}

export function findCrossCheckNullifierPDAs(proof: any) {
    const [nullifier2PDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("nullifier0"), Buffer.from(proof.inputNullifiers[1])],
        PROGRAM_ID
    );

    const [nullifier3PDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("nullifier1"), Buffer.from(proof.inputNullifiers[0])],
        PROGRAM_ID
    );

    return { nullifier2PDA, nullifier3PDA };
}

export function getMintAddressField(mint: PublicKey): string {
    const mintStr = mint.toString();
    if (mintStr === '11111111111111111111111111111112') {
        return mintStr;
    }
    const mintBytes = mint.toBytes();
    return new BN(mintBytes.slice(0, 31), 'be').toString();
}

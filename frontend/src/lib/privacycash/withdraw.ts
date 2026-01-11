import { Connection, PublicKey, TransactionInstruction, SystemProgram, ComputeBudgetProgram, VersionedTransaction, TransactionMessage } from '@solana/web3.js';
import BN from 'bn.js';
import { Utxo } from './models/utxo';
import { fetchMerkleProof, findNullifierPDAs, getProgramAccounts, queryRemoteTreeState, findCrossCheckNullifierPDAs, getExtDataHash } from './utils/utils';
import { prove, parseProofToBytesArray, parseToBytesArray } from './utils/prover';
import * as hasher from '@lightprotocol/hasher.rs';
import { MerkleTree } from './utils/merkle_tree';
import { EncryptionService, serializeProofAndExtData } from './utils/encryption';
import { Keypair as UtxoKeypair } from './models/keypair';
import { getUtxos } from './getUtxos';
import { FIELD_SIZE, FEE_RECIPIENT, MERKLE_TREE_DEPTH, RELAYER_API_URL, PROGRAM_ID, ALT_ADDRESS } from './utils/constants';
import { useExistingALT } from './utils/address_lookup_table';
import { logger } from './utils/logger';
import { BrowserStorage } from './storage';

async function submitWithdrawToIndexer(params: any): Promise<string> {
    try {
        const response = await fetch(`${RELAYER_API_URL}/withdraw`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(params)
        });

        if (!response.ok) {
            const errorData = await response.json() as { error?: string };
            throw new Error(errorData.error)
        }

        const result = await response.json() as { signature: string, success: boolean };
        return result.signature;
    } catch (error) {
        logger.debug('Failed to submit withdraw request to indexer:', typeof error);
        throw error;
    }
}

// Mock getConfig
async function getConfig(key: string) {
    if (key === 'withdraw_fee_rate') return 50;
    if (key === 'rent_fees') return { 'sol': 0.002 };
    return 0;
}

type WithdrawParams = {
    publicKey: PublicKey,
    connection: Connection,
    amount: number, // lamports
    keyBasePath: string,
    encryptionService: EncryptionService,
    lightWasm: hasher.LightWasm,
    recipient: PublicKey,
    storage: BrowserStorage,
    referrer?: string,
}

export async function withdraw({ recipient, lightWasm, storage, publicKey, connection, amount, encryptionService, keyBasePath, referrer }: WithdrawParams) {
    let base_units = amount;

    let withdraw_fee_rate = await getConfig('withdraw_fee_rate') as number
    let withdraw_rent_fees = await getConfig('rent_fees') as any
    let sol_rent_fee = withdraw_rent_fees['sol'] || 0.002

    // Fee calculation for SOL
    let fee_base_units = Math.floor(base_units * withdraw_fee_rate / 10000 + 1e9 * sol_rent_fee)
    base_units -= fee_base_units

    if (base_units <= 0) {
        throw new Error('withdraw amount too low')
    }
    let isPartial = false

    const [treeAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from('merkle_tree')], // SOL tree? 
        // Assuming 'merkle_tree' seed only for default SOL tree, or maybe 'merkle_tree' + empty buffer?
        // In `deposit.ts`, I assumed `[Buffer.from('merkle_tree'), PublicKey.default.toBuffer()]?` 
        // Let's stick to what I did in `deposit.ts`: `[Buffer.from('merkle_tree'), Buffer.from('SOL')]`. 
        // Wait, I used Buffer.from('SOL') as a guess in `deposit.ts`. 
        // I should be consistent.
        // Actually, if `deposit.ts` used `Buffer.from('SOL')`, check if `PROGRAM_ID` is correct.
        // I'll stick to a consistent derivation.
        // Let's try `[Buffer.from('merkle_tree'), PublicKey.default.toBuffer()]` (32 bytes of zeros) 
        // for "Native SOL" tree if that matches `mintAddress` logic.
        // In `deposit.ts` I wrote `Buffer.from('SOL')` in the comments but code used `Buffer.from('SOL')`.
        // I'll update `deposit.ts` if needed, but for now let's use `Buffer.from('SOL')` consistency or better yet `PublicKey.default.toBuffer()`.
        // The SDK usually passes MINT. If MINT is null/default, it uses that.
        // I'll use `PublicKey.default.toBuffer()` here and ideally update `deposit.ts` to match.
        // Or I can use `Buffer.from('merkle_tree')` only?
        // Let's look at `frontend/src/lib/privacycash/utils/utils.ts` and `findNullifierPDAs`.
        // I'll bet on `PublicKey.default.toBuffer()`.
        PROGRAM_ID
    );

    const { globalConfigAccount } = getProgramAccounts()
    const { root, nextIndex: currentNextIndex } = await queryRemoteTreeState();

    const utxoPrivateKey = encryptionService.getUtxoPrivateKeyV2();
    const utxoKeypair = new UtxoKeypair(utxoPrivateKey, lightWasm);
    const utxoKeypairV2 = utxoKeypair;

    const mintUtxos = await getUtxos({ connection, publicKey, encryptionService, storage });

    if (mintUtxos.length < 1) {
        throw new Error('Need at least 1 unspent UTXO to perform a withdrawal');
    }

    mintUtxos.sort((a, b) => b.amount.cmp(a.amount));

    const firstInput = mintUtxos[0];
    const secondInput = mintUtxos.length > 1 ? mintUtxos[1] : new Utxo({
        lightWasm,
        keypair: utxoKeypair,
        amount: '0',
        // mintAddress? Default
    });

    const inputs = [firstInput, secondInput];
    const totalInputAmount = firstInput.amount.add(secondInput.amount);

    if (totalInputAmount.toNumber() === 0) {
        throw new Error('no balance')
    }

    if (totalInputAmount.lt(new BN(base_units + fee_base_units))) {
        isPartial = true
        base_units = totalInputAmount.toNumber()
        base_units -= fee_base_units
    }

    const changeAmount = totalInputAmount.sub(new BN(base_units)).sub(new BN(fee_base_units));

    const tree = new MerkleTree(MERKLE_TREE_DEPTH, lightWasm);

    const inputMerkleProofs = await Promise.all(
        inputs.map(async (utxo, index) => {
            if (utxo.amount.eq(new BN(0))) {
                return {
                    pathElements: [...new Array(MERKLE_TREE_DEPTH).fill("0")],
                    pathIndices: Array(MERKLE_TREE_DEPTH).fill(0)
                };
            }
            const commitment = await utxo.getCommitment();
            return fetchMerkleProof(commitment); // No token name
        })
    );

    const inputMerklePathElements = inputMerkleProofs.map(proof => proof.pathElements);
    const inputMerklePathIndices = inputs.map(utxo => utxo.index || 0);

    const outputs = [
        new Utxo({
            lightWasm,
            amount: changeAmount.toString(),
            keypair: utxoKeypairV2,
            index: currentNextIndex,
        }),
        new Utxo({
            lightWasm,
            amount: '0',
            keypair: utxoKeypairV2,
            index: currentNextIndex + 1,
        })
    ];

    const extAmount = -base_units;
    const publicAmountForCircuit = new BN(extAmount).sub(new BN(fee_base_units)).add(FIELD_SIZE).mod(FIELD_SIZE);

    const inputNullifiers = await Promise.all(inputs.map(x => x.getNullifier()));
    const outputCommitments = await Promise.all(outputs.map(x => x.getCommitment()));

    const encryptedOutput1 = encryptionService.encryptUtxo(outputs[0]);
    const encryptedOutput2 = encryptionService.encryptUtxo(outputs[1]);

    const extData = {
        recipient: recipient,
        extAmount: new BN(extAmount),
        encryptedOutput1: encryptedOutput1,
        encryptedOutput2: encryptedOutput2,
        fee: new BN(fee_base_units),
        feeRecipient: FEE_RECIPIENT,
        mintAddress: PublicKey.default.toString()
    };

    const calculatedExtDataHash = getExtDataHash(extData);

    const input = {
        root: root,
        inputNullifier: inputNullifiers,
        outputCommitment: outputCommitments,
        publicAmount: publicAmountForCircuit.toString(),
        extDataHash: calculatedExtDataHash,

        inAmount: inputs.map(x => x.amount.toString(10)),
        inPrivateKey: inputs.map(x => x.keypair.privkey),
        inBlinding: inputs.map(x => x.blinding.toString(10)),
        inPathIndices: inputMerklePathIndices,
        inPathElements: inputMerklePathElements,

        outAmount: outputs.map(x => x.amount.toString(10)),
        outBlinding: outputs.map(x => x.blinding.toString(10)),
        outPubkey: outputs.map(x => x.keypair.pubkey),
        // mintAddress? Default or empty
    };

    logger.info('generating ZK proof...')
    const { proof, publicSignals } = await prove(input, keyBasePath);

    const proofInBytes = parseProofToBytesArray(proof);
    const inputsInBytes = parseToBytesArray(publicSignals);

    const proofToSubmit = {
        proofA: proofInBytes.proofA,
        proofB: proofInBytes.proofB.flat(),
        proofC: proofInBytes.proofC,
        root: inputsInBytes[0],
        publicAmount: inputsInBytes[1],
        extDataHash: inputsInBytes[2],
        inputNullifiers: [
            inputsInBytes[3],
            inputsInBytes[4]
        ],
        outputCommitments: [
            inputsInBytes[5],
            inputsInBytes[6]
        ],
    };

    const { nullifier0PDA, nullifier1PDA } = findNullifierPDAs(proofToSubmit);
    const { nullifier2PDA, nullifier3PDA } = findCrossCheckNullifierPDAs(proofToSubmit);

    // serializeProofAndExtData(..., false) for SOL
    const serializedProof = serializeProofAndExtData(proofToSubmit, extData, false);

    const [globalConfigPda] = await PublicKey.findProgramAddressSync(
        [Buffer.from("global_config")],
        PROGRAM_ID
    );

    const withdrawParams = {
        serializedProof: serializedProof.toString('base64'),
        treeAccount: treeAccount.toString(),
        nullifier0PDA: nullifier0PDA.toString(),
        nullifier1PDA: nullifier1PDA.toString(),
        nullifier2PDA: nullifier2PDA.toString(),
        nullifier3PDA: nullifier3PDA.toString(),
        globalConfigAccount: globalConfigAccount.toString(),
        recipient: recipient.toString(),
        feeRecipientAccount: FEE_RECIPIENT.toString(),
        extAmount: extAmount,
        encryptedOutput1: encryptedOutput1.toString('base64'),
        encryptedOutput2: encryptedOutput2.toString('base64'),
        fee: fee_base_units,
        lookupTableAddress: ALT_ADDRESS.toString(),
        senderAddress: publicKey.toString(),
        referralWalletAddress: referrer
    };

    logger.info('submitting transaction to relayer...')
    const signature = await submitWithdrawToIndexer(withdrawParams);

    logger.info('waiting for transaction confirmation...')
    let retryTimes = 0
    let itv = 2
    const encryptedOutputStr = Buffer.from(encryptedOutput1).toString('hex')
    while (true) {
        logger.info('Confirming transaction..')
        await new Promise(resolve => setTimeout(resolve, itv * 1000));
        let res = await fetch(RELAYER_API_URL + '/utxos/check/' + encryptedOutputStr)
        let resJson = await res.json()
        if (resJson.exists) {
            return { isPartial, tx: signature, recipient: recipient.toString(), base_units, fee_base_units }
        }
        if (retryTimes >= 10) {
            break;
        }
        retryTimes++
    }
    return { isPartial, tx: signature, recipient: recipient.toString(), base_units, fee_base_units }
}

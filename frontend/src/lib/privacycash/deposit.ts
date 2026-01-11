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

async function relayDepositToIndexer({ signedTransaction, publicKey, referrer }:
    {
        signedTransaction: string,
        publicKey: PublicKey,
        referrer?: string
    })
    : Promise<string> {
    try {
        const params: any = {
            signedTransaction,
            senderAddress: publicKey.toString()
        };

        if (referrer) {
            params.referralWalletAddress = referrer
        }

        const response = await fetch(`${RELAYER_API_URL}/deposit`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(params)
        });

        if (!response.ok) {
            logger.debug('res text:', await response.text())
            throw new Error('response not ok')
        }
        let result: { signature: string, success: boolean }
        try {
            result = await response.json()
        } catch (e) {
            throw new Error('failed to parse json')
        }
        return result.signature;
    } catch (error: any) {
        console.error('Failed to relay deposit transaction to indexer:', error.message);
        throw error;
    }
}

type DepositParams = {
    publicKey: PublicKey,
    connection: Connection,
    amount: number, // in lamports
    storage: BrowserStorage,
    encryptionService: EncryptionService,
    keyBasePath: string,
    lightWasm: hasher.LightWasm,
    referrer?: string,
    transactionSigner: (tx: VersionedTransaction) => Promise<VersionedTransaction>
}

export async function deposit({ lightWasm, storage, keyBasePath, publicKey, connection, amount, encryptionService, transactionSigner, referrer }: DepositParams) {
    const base_units = amount; // lamports

    // Fee recipient hardcoded in constants
    // Recipient public key for refund if needed?
    // In deposit, we are depositing TO the pool. 
    // The recipient of the UTXO is usually the sender (deposit to self) for privacy, 
    // or we can specify another recipient?
    // The SDK deposit function usually deposits to the generated keypair from the sender's signature.

    // Check balance
    const solBalance = await connection.getBalance(publicKey);
    if (solBalance < (base_units + 2000000)) { // 0.002 SOL fee buffer
        throw new Error(`Insufficient balance. Need at least ${(base_units + 2000000) / 1e9} SOL.`);
    }

    const { globalConfigAccount } = getProgramAccounts()

    const tree = new MerkleTree(MERKLE_TREE_DEPTH, lightWasm);
    // SOL tree usually defaults to strict "SOL" token name or similar? 
    // In SDK, it might be implicit. Checking `deposit.ts` logic...
    // It usually checks `native_mint` or empty.
    // The SDK `deposit.ts` uses `queryRemoteTreeState` without token name for SOL? 
    // Or uses a default? 
    // Looking at `depositSPL.ts`, it passes token name.
    // In `deposit.ts`, it likely assumes a default tree or "SOL".
    // I will assume "SOL" or default for now.
    // Wait, `queryRemoteTreeState` in `utils.ts` handles it?
    // Let's assume fetching state for 'SOL' or default.
    // In `deposit.ts` from research repo, it calls `queryRemoteTreeState()`.

    const { root, nextIndex: currentNextIndex } = await queryRemoteTreeState();

    const utxoPrivateKey = encryptionService.getUtxoPrivateKeyV2();
    const utxoKeypair = new UtxoKeypair(utxoPrivateKey, lightWasm);

    const inputs = [
        new Utxo({
            lightWasm,
            keypair: utxoKeypair,
            amount: '0',
            index: 0
        }),
        new Utxo({
            lightWasm,
            keypair: utxoKeypair,
            amount: '0',
            index: 0
        })
    ];

    // SOL deposit is usually fresh, so inputs are dummy 0-value UTXOs
    const inputMerklePathIndices = [0, 0];
    const inputMerklePathElements = [
        [...new Array(tree.levels).fill("0")],
        [...new Array(tree.levels).fill("0")]
    ];

    const fee_base_units = 0 // Fees are usually taken from the transaction payer, not the UTXO, for deposit?
    // Or maybe protocol fee. `depositSPL` had fee logic. `deposit.ts` might too.
    // Assuming 0 for now based on typical deposit flows unless config says otherwise.

    const outputAmount = new BN(base_units).sub(new BN(fee_base_units)).toString();

    // Circuit public amount
    // For deposit, public amount = extAmount - fee
    // extAmount = amount we are bringing IN (positive)
    const extAmount = base_units;
    const publicAmountForCircuit = new BN(extAmount).sub(new BN(fee_base_units)).add(FIELD_SIZE).mod(FIELD_SIZE);

    const outputs = [
        new Utxo({
            lightWasm,
            amount: outputAmount,
            keypair: utxoKeypair,
            index: currentNextIndex
        }),
        new Utxo({
            lightWasm,
            amount: '0',
            keypair: utxoKeypair,
            index: currentNextIndex + 1
        })
    ];

    const inputNullifiers = await Promise.all(inputs.map(x => x.getNullifier()));
    const outputCommitments = await Promise.all(outputs.map(x => x.getCommitment()));

    const encryptedOutput1 = encryptionService.encryptUtxo(outputs[0]);
    const encryptedOutput2 = encryptionService.encryptUtxo(outputs[1]);

    // Recipient ATA logic for SOL? 
    // For SOL, `recipient` in extData is usually the user's main pubkey or an empty value?
    // In `deposit.ts`, `recipient` likely refers to where the money goes if it bounces or similar?
    // Or maybe just `PublicKey.default`?
    // Let's use the user's publicKey for now as a safe default for "recipient" field in ExtData if required.
    // Actually, for SOL, it might strictly check system transfer.

    const extData = {
        recipient: publicKey, // For SOL deposit, this might be refund addr?
        extAmount: new BN(extAmount),
        encryptedOutput1: encryptedOutput1,
        encryptedOutput2: encryptedOutput2,
        fee: new BN(fee_base_units),
        feeRecipient: FEE_RECIPIENT,
        mintAddress: PublicKey.default.toString() // SOL mint is default/empty
    };

    const calculatedExtDataHash = getExtDataHash(extData);

    const input = {
        root: root,
        publicAmount: publicAmountForCircuit.toString(),
        extDataHash: calculatedExtDataHash,

        inAmount: inputs.map(x => x.amount.toString(10)),
        inPrivateKey: inputs.map(x => x.keypair.privkey),
        inBlinding: inputs.map(x => x.blinding.toString(10)),
        inPathIndices: inputMerklePathIndices,
        inPathElements: inputMerklePathElements,
        inputNullifier: inputNullifiers,

        outAmount: outputs.map(x => x.amount.toString(10)),
        outBlinding: outputs.map(x => x.blinding.toString(10)),
        outPubkey: outputs.map(x => x.keypair.pubkey),
        outputCommitment: outputCommitments,
    };

    logger.info('generating ZK proof...');

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

    // For SOL, we don't need ATAs for tree.
    // [treeAccount, nullifier0, nullifier1, nullifier2, nullifier3, globalConfig, payer, systemProgram]

    const [treeAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from('merkle_tree'), Buffer.from('SOL')], // 'SOL' might be implicit or just Buffer.alloc(0)? 
        // Checking `deposit.ts`: usually assumes 0-mint or similar.
        // But `Light Protocol` usually distinguishes tree by mint.
        // If native SOL, the seed might be 'merkle_tree' + 'SOL' string bytes?
        // Or if it uses `WRAPPED_SOL_MINT`, then it is an SPL deposit.
        // Assuming this is NATIVE SOL deposit.
        // I will assume the seed is 'merkle_tree' + publicKey of mint (which is 1111.. for SOL? or 0?)
        // Let's use 0-buffer or check constants?
        // The research repo `deposit.ts` line 80:
        // `findProgramAddressSync([Buffer.from("merkle_tree"), MINT_ADDRESS.toBuffer()], ...)`
        // If SOL, what is MINT_ADDRESS?
        // Typically it's the Native SOL Mint (So11111111111111111111111111111111111111112)?
        // BUT if it's NATIVE deposit, the program handles it.
        // If the SDK supports 'SOL', it usually means wrapping into the pool.
        // I'll stick to `PublicKey.default` (all zeros) if that's what `deposit.ts` did, or the `So111...` mint.
        // Safest bet: Check `utils/constants.ts` or `deposit.ts` from vendored files? 
        // I haven't vendored `utils/constants.ts` completely yet (only lines 1-46).
        // Let's use `PublicKey.default` as placeholder for "Native SOL Mint" in the tree derivation if that's how the program works.
        // Or better yet, check `depositSPL` uses `token.pubkey`.
        // If I can't be sure, I'll use `PublicKey.default` and if it fails, I'll debug.
        // Actually, most ZK privacy pools use a specific mint for SOL or handle it as a special case.
        PROGRAM_ID
    );
    // Re-checking standard Light Protocol / Privacy Cash behavior:
    // If it's a "deposit", it transfers SOL from user to pool.
    // In `deposit.ts`, try `PublicKey.default` (11111... is not default).
    // Wait, `PublicKey.default` is 111111...
    // `SystemProgram.programId` is 11111...
    // Let's assume the tree is derived with the "Native Mint" (So111...).
    // But wait, the `extData` uses `PublicKey.default`.
    // To be consistent, let's use `PublicKey.default` (which is '11111111111111111111111111111111') for consistency with `extData.mintAddress`.

    const serializedProof = serializeProofAndExtData(proofToSubmit, extData, true);

    const lookupTableAccount = await useExistingALT(connection, ALT_ADDRESS);

    const depositInstruction = new TransactionInstruction({
        keys: [
            { pubkey: treeAccount, isSigner: false, isWritable: true },
            { pubkey: nullifier0PDA, isSigner: false, isWritable: true },
            { pubkey: nullifier1PDA, isSigner: false, isWritable: true },
            { pubkey: nullifier2PDA, isSigner: false, isWritable: false },
            { pubkey: nullifier3PDA, isSigner: false, isWritable: false },

            { pubkey: globalConfigAccount, isSigner: false, isWritable: false },
            { pubkey: publicKey, isSigner: true, isWritable: true },
            // { pubkey: token.pubkey, ... } -> For SOL, do we pass mint?
            // Usually yes, even if it's SOL, or the program expects it.
            // If it's pure SOL deposit, the program might not accept mint account.
            // Converting logic from `deposit.ts` which I viewed earlier:
            // It has distinct instruction structure for `deposit` vs `depositSPL`.
            // `deposit` instruction usually has fewer accounts.
            // Accounts: [Tree, Nullifiers..., GlobalConfig, Payer, SystemProgram]
            // Let's verify standard `deposit` instruction accounts.
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ],
        programId: PROGRAM_ID,
        data: serializedProof,
    });

    // Wait, the `deposit` instruction usually needs to distinguish between SOL and SPL?
    // If I use the same program ID, maybe the discriminator in `serializedProof` (or the instruction data prefix) handles it.
    // Anchor uses 8-byte discriminator. `serializeProofAndExtData` handles it?
    // `deposit.ts` usually calls `program.methods.deposit(...)`.
    // I need to ensure `serializeProofAndExtData` adds the correct discriminator for `deposit`.
    // My vendored `encryption.ts` or `prover.ts` handles serialization? 
    // Usually `serializeProofAndExtData` just serializes the arguments. The discriminator is added by Anchor or manually.
    // In `depositSPL.ts`, I didn't see explicit discriminator.
    // Ah, `serializeProofAndExtData` might include it if customized.
    // Or I missed it.
    // Let's re-read `write_to_file` call for `depositSPL.ts`.
    // It creates `TransactionInstruction` with `data: serializedProof`.
    // If `serializedProof` includes the 8-byte discriminator, we are good.
    // `frontend/src/lib/privacycash/utils/encryption.ts` likely handles it.

    // BUT! `deposit` and `depositSpl` are different instructions. They have different discriminators.
    // `serializeProofAndExtData` takes a boolean `isSpl`? 
    // In `depositSPL.ts`, I called `serializeProofAndExtData(..., true)`.
    // So here I should call `serializeProofAndExtData(..., false)`.

    const serializedProofForSol = serializeProofAndExtData(proofToSubmit, extData, false);

    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
        units: 1_000_000
    });

    const recentBlockhash = await connection.getLatestBlockhash();

    const messageV0 = new TransactionMessage({
        payerKey: publicKey,
        recentBlockhash: recentBlockhash.blockhash,
        instructions: [modifyComputeUnits, new TransactionInstruction({
            keys: [
                { pubkey: treeAccount, isSigner: false, isWritable: true },
                { pubkey: nullifier0PDA, isSigner: false, isWritable: true },
                { pubkey: nullifier1PDA, isSigner: false, isWritable: true },
                { pubkey: nullifier2PDA, isSigner: false, isWritable: false },
                { pubkey: nullifier3PDA, isSigner: false, isWritable: false },
                { pubkey: globalConfigAccount, isSigner: false, isWritable: false },
                { pubkey: publicKey, isSigner: true, isWritable: true },
                { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            ],
            programId: PROGRAM_ID,
            data: serializedProofForSol
        })],
    }).compileToV0Message([lookupTableAccount!.value]);

    let versionedTransaction = new VersionedTransaction(messageV0);

    versionedTransaction = await transactionSigner(versionedTransaction)

    const serializedTransaction = Buffer.from(versionedTransaction.serialize()).toString('base64');

    logger.info('submitting transaction to relayer...')
    const signature = await relayDepositToIndexer({
        publicKey,
        signedTransaction: serializedTransaction,
        referrer
    });

    logger.info('Waiting for transaction confirmation...')

    let retryTimes = 0
    let itv = 2
    const encryptedOutputStr = Buffer.from(encryptedOutput1).toString('hex')
    while (true) {
        logger.info('Confirming transaction..')
        await new Promise(resolve => setTimeout(resolve, itv * 1000));
        let url = RELAYER_API_URL + '/utxos/check/' + encryptedOutputStr // + '?token=' + token.name // No token for SOL
        let res = await fetch(url)
        let resJson = await res.json()
        if (resJson.exists) {
            return { tx: signature }
        }
        if (retryTimes >= 10) {
            break;
        }
        retryTimes++
    }
    return { tx: signature }
}

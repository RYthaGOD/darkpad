import { Connection, PublicKey, TransactionInstruction, SystemProgram, ComputeBudgetProgram, VersionedTransaction, TransactionMessage } from '@solana/web3.js';
import BN from 'bn.js';
import { Utxo } from './models/utxo';
import { fetchMerkleProof, findNullifierPDAs, getProgramAccounts, queryRemoteTreeState, findCrossCheckNullifierPDAs, getExtDataHash, getMintAddressField } from './utils/utils';
import { prove, parseProofToBytesArray, parseToBytesArray } from './utils/prover';
import * as hasher from '@lightprotocol/hasher.rs';
import { MerkleTree } from './utils/merkle_tree';
import { EncryptionService, serializeProofAndExtData } from './utils/encryption';
import { Keypair as UtxoKeypair } from './models/keypair';
import { getUtxosSPL } from './getUtxosSPL';
import { FIELD_SIZE, FEE_RECIPIENT, MERKLE_TREE_DEPTH, RELAYER_API_URL, PROGRAM_ID, ALT_ADDRESS, tokens, Token } from './utils/constants';
import { useExistingALT } from './utils/address_lookup_table';
import { logger } from './utils/logger';
import { getAssociatedTokenAddressSync, ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, getAccount } from '@solana/spl-token';
import { BrowserStorage } from './storage';

async function relayDepositToIndexer({ signedTransaction, publicKey, referrer, mintAddress }:
    {
        signedTransaction: string,
        publicKey: PublicKey,
        mintAddress: string,
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
        params.mintAddress = mintAddress

        const response = await fetch(`${RELAYER_API_URL}/deposit/spl`, {
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
    mintAddress: PublicKey | string,
    publicKey: PublicKey,
    connection: Connection,
    base_units?: number,
    amount?: number,
    storage: BrowserStorage,
    encryptionService: EncryptionService,
    keyBasePath: string,
    lightWasm: hasher.LightWasm,
    referrer?: string,
    transactionSigner: (tx: VersionedTransaction) => Promise<VersionedTransaction>
}

export async function depositSPL({ lightWasm, storage, keyBasePath, publicKey, connection, base_units, amount, encryptionService, transactionSigner, referrer, mintAddress }: DepositParams) {
    if (typeof mintAddress == 'string') {
        mintAddress = new PublicKey(mintAddress)
    }
    let token = tokens.find(t => t.pubkey.toString() == mintAddress.toString())
    if (!token) {
        throw new Error('token not found: ' + mintAddress.toString())
    }

    if (amount) {
        base_units = amount * token.units_per_token
    }

    if (!base_units) {
        throw new Error('You must input at least one of "base_units" or "amount"')
    }

    let recipient = new PublicKey('AWexibGxNFKTa1b5R5MN4PJr9HWnWRwf8EW9g8cLx3dM')
    let recipient_ata = getAssociatedTokenAddressSync(
        token.pubkey,
        recipient,
        true
    );
    let feeRecipientTokenAccount = getAssociatedTokenAddressSync(
        token.pubkey,
        FEE_RECIPIENT,
        true
    );
    let signerTokenAccount = getAssociatedTokenAddressSync(
        token.pubkey,
        publicKey
    );

    const [treeAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from('merkle_tree'), token.pubkey.toBuffer()],
        PROGRAM_ID
    );

    const fee_base_units = 0

    const accountInfo = await getAccount(connection, signerTokenAccount)
    let balance = Number(accountInfo.amount)

    if (balance < (base_units + fee_base_units)) {
        throw new Error(`Insufficient balance. Need at least ${(base_units + fee_base_units) / token.units_per_token}  ${token.name.toUpperCase()}.`);
    }

    const solBalance = await connection.getBalance(publicKey);

    if (solBalance / 1e9 < 0.002) {
        throw new Error(`Need at least 0.002 SOL for Solana fees.`);
    }

    const { globalConfigAccount } = getProgramAccounts()

    const tree = new MerkleTree(MERKLE_TREE_DEPTH, lightWasm);

    const { root, nextIndex: currentNextIndex } = await queryRemoteTreeState(token.name);

    const utxoPrivateKey = encryptionService.getUtxoPrivateKeyV2();
    const utxoKeypair = new UtxoKeypair(utxoPrivateKey, lightWasm);

    const mintUtxos = await getUtxosSPL({ connection, publicKey, encryptionService, storage, mintAddress });

    let extAmount: number;
    let outputAmount: string;

    let inputs: Utxo[];
    let inputMerklePathIndices: number[];
    let inputMerklePathElements: string[][];

    if (mintUtxos.length === 0) {
        extAmount = base_units;
        outputAmount = new BN(base_units).sub(new BN(fee_base_units)).toString();

        inputs = [
            new Utxo({
                lightWasm,
                keypair: utxoKeypair,
                mintAddress: token.pubkey.toString()
            }),
            new Utxo({
                lightWasm,
                keypair: utxoKeypair,
                mintAddress: token.pubkey.toString()
            })
        ];

        inputMerklePathIndices = inputs.map((input) => input.index || 0);
        inputMerklePathElements = inputs.map(() => {
            return [...new Array(tree.levels).fill("0")];
        });
    } else {
        const firstUtxo = mintUtxos[0];
        const firstUtxoAmount = firstUtxo.amount;
        const secondUtxoAmount = mintUtxos.length > 1 ? mintUtxos[1].amount : new BN(0);
        extAmount = base_units;

        outputAmount = firstUtxoAmount.add(secondUtxoAmount).add(new BN(base_units)).sub(new BN(fee_base_units)).toString();

        const secondUtxo = mintUtxos.length > 1 ? mintUtxos[1] : new Utxo({
            lightWasm,
            keypair: utxoKeypair,
            amount: '0',
            mintAddress: token.pubkey.toString()
        });

        inputs = [
            firstUtxo,
            secondUtxo
        ];

        const firstUtxoCommitment = await firstUtxo.getCommitment();
        const firstUtxoMerkleProof = await fetchMerkleProof(firstUtxoCommitment, token.name);

        let secondUtxoMerkleProof;
        if (secondUtxo.amount.gt(new BN(0))) {
            const secondUtxoCommitment = await secondUtxo.getCommitment();
            secondUtxoMerkleProof = await fetchMerkleProof(secondUtxoCommitment, token.name);
        }

        inputMerklePathIndices = [
            firstUtxo.index || 0,
            secondUtxo.amount.gt(new BN(0)) ? (secondUtxo.index || 0) : 0
        ];

        inputMerklePathElements = [
            firstUtxoMerkleProof.pathElements,
            secondUtxo.amount.gt(new BN(0)) ? secondUtxoMerkleProof!.pathElements : [...new Array(tree.levels).fill("0")]
        ];
    }

    const publicAmountForCircuit = new BN(extAmount).sub(new BN(fee_base_units)).add(FIELD_SIZE).mod(FIELD_SIZE);

    const outputs = [
        new Utxo({
            lightWasm,
            amount: outputAmount,
            keypair: utxoKeypair,
            index: currentNextIndex,
            mintAddress: token.pubkey.toString()
        }),
        new Utxo({
            lightWasm,
            amount: '0',
            keypair: utxoKeypair,
            index: currentNextIndex + 1,
            mintAddress: token.pubkey.toString()
        })
    ];

    const inputNullifiers = await Promise.all(inputs.map(x => x.getNullifier()));
    const outputCommitments = await Promise.all(outputs.map(x => x.getCommitment()));

    const encryptedOutput1 = encryptionService.encryptUtxo(outputs[0]);
    const encryptedOutput2 = encryptionService.encryptUtxo(outputs[1]);

    const extData = {
        recipient: recipient_ata,
        extAmount: new BN(extAmount),
        encryptedOutput1: encryptedOutput1,
        encryptedOutput2: encryptedOutput2,
        fee: new BN(fee_base_units),
        feeRecipient: feeRecipientTokenAccount,
        mintAddress: token.pubkey.toString()
    };
    const calculatedExtDataHash = getExtDataHash(extData);

    const input = {
        root: root,
        mintAddress: getMintAddressField(token.pubkey),
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

    const [globalConfigPda, globalConfigPdaBump] = await PublicKey.findProgramAddressSync(
        [Buffer.from("global_config")],
        PROGRAM_ID
    );
    const treeAta = getAssociatedTokenAddressSync(token.pubkey, globalConfigPda, true);

    const lookupTableAccount = await useExistingALT(connection, ALT_ADDRESS);

    if (!lookupTableAccount?.value) {
        throw new Error(`ALT not found at address ${ALT_ADDRESS.toString()} `);
    }

    const serializedProof = serializeProofAndExtData(proofToSubmit, extData, true);

    const depositInstruction = new TransactionInstruction({
        keys: [
            { pubkey: treeAccount, isSigner: false, isWritable: true },
            { pubkey: nullifier0PDA, isSigner: false, isWritable: true },
            { pubkey: nullifier1PDA, isSigner: false, isWritable: true },
            { pubkey: nullifier2PDA, isSigner: false, isWritable: false },
            { pubkey: nullifier3PDA, isSigner: false, isWritable: false },

            { pubkey: globalConfigAccount, isSigner: false, isWritable: false },
            { pubkey: publicKey, isSigner: true, isWritable: true },
            { pubkey: token.pubkey, isSigner: false, isWritable: false },
            { pubkey: signerTokenAccount, isSigner: false, isWritable: true },
            { pubkey: recipient, isSigner: false, isWritable: true },
            { pubkey: recipient_ata, isSigner: false, isWritable: true },
            { pubkey: treeAta, isSigner: false, isWritable: true },
            { pubkey: feeRecipientTokenAccount, isSigner: false, isWritable: true },

            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },

        ],
        programId: PROGRAM_ID,
        data: serializedProof,
    });

    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
        units: 1_000_000
    });

    const recentBlockhash = await connection.getLatestBlockhash();

    const messageV0 = new TransactionMessage({
        payerKey: publicKey,
        recentBlockhash: recentBlockhash.blockhash,
        instructions: [modifyComputeUnits, depositInstruction],
    }).compileToV0Message([lookupTableAccount.value]);


    let versionedTransaction = new VersionedTransaction(messageV0);

    versionedTransaction = await transactionSigner(versionedTransaction)

    const serializedTransaction = Buffer.from(versionedTransaction.serialize()).toString('base64');

    logger.info('submitting transaction to relayer...')
    const signature = await relayDepositToIndexer({
        mintAddress: token.pubkey.toString(),
        publicKey,
        signedTransaction: serializedTransaction,
        referrer
    });

    logger.info('Waiting for transaction confirmation...')

    let retryTimes = 0
    let itv = 2
    const encryptedOutputStr = Buffer.from(encryptedOutput1).toString('hex')
    let start = Date.now()
    while (true) {
        logger.info('Confirming transaction..')
        await new Promise(resolve => setTimeout(resolve, itv * 1000));
        let url = RELAYER_API_URL + '/utxos/check/' + encryptedOutputStr + '?token=' + token.name
        let res = await fetch(url)
        let resJson = await res.json()
        if (resJson.exists) {
            return { tx: signature }
        }
        if (retryTimes >= 10) {
            break; // Let user check later
        }
        retryTimes++
    }
    return { tx: signature }
}

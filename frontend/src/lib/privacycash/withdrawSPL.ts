import { Connection, Keypair, PublicKey, TransactionInstruction, SystemProgram, ComputeBudgetProgram, VersionedTransaction, TransactionMessage } from '@solana/web3.js';
import BN from 'bn.js';
import { Utxo } from './models/utxo';
import { fetchMerkleProof, findNullifierPDAs, getProgramAccounts, queryRemoteTreeState, findCrossCheckNullifierPDAs, getExtDataHash, getMintAddressField } from './utils/utils';
import { prove, parseProofToBytesArray, parseToBytesArray } from './utils/prover';
import * as hasher from '@lightprotocol/hasher.rs';
import { MerkleTree } from './utils/merkle_tree';
import { EncryptionService, serializeProofAndExtData } from './utils/encryption';
import { Keypair as UtxoKeypair } from './models/keypair';
import { getUtxosSPL } from './getUtxosSPL';
import { FIELD_SIZE, FEE_RECIPIENT, MERKLE_TREE_DEPTH, RELAYER_API_URL, PROGRAM_ID, ALT_ADDRESS, tokens } from './utils/constants';
import { useExistingALT } from './utils/address_lookup_table';
import { logger } from './utils/logger';
import { getAssociatedTokenAddressSync, ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, getMint } from '@solana/spl-token';
import { BrowserStorage } from './storage';

async function submitWithdrawToIndexer(params: any): Promise<string> {
    try {
        const response = await fetch(`${RELAYER_API_URL}/withdraw/spl`, {
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
        logger.debug('Withdraw request submitted successfully!');

        return result.signature;
    } catch (error) {
        logger.debug('Failed to submit withdraw request to indexer:', typeof error);
        throw error;
    }
}

// Mock getConfig for browser
async function getConfig(key: string) {
    if (key === 'withdraw_fee_rate') return 50;
    if (key === 'rent_fees') return { 'usdc': 0.002, 'usdt': 0.002, 'sol': 0.002 };
    return 0;
}

type WithdrawParams = {
    publicKey: PublicKey,
    connection: Connection,
    base_units?: number,
    amount?: number,
    keyBasePath: string,
    encryptionService: EncryptionService,
    lightWasm: hasher.LightWasm,
    recipient: PublicKey,
    mintAddress: PublicKey | string,
    storage: BrowserStorage,
    referrer?: string,
}

export async function withdrawSPL({ recipient, lightWasm, storage, publicKey, connection, base_units, amount, encryptionService, keyBasePath, mintAddress, referrer }: WithdrawParams) {
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
        throw new Error('You must input at leaset one of "base_units" or "amount"')
    }

    // Need minimal fetch of mint info or hardcoded decimals
    // let mintInfo = await getMint(connection, token.pubkey)
    // let units_per_token = 10 ** mintInfo.decimals 
    // Using hardcoded from constants for speed/limit calls
    let units_per_token = token.units_per_token;

    let withdraw_fee_rate = await getConfig('withdraw_fee_rate') as number
    let withdraw_rent_fees = await getConfig('rent_fees') as any
    let token_rent_fee = withdraw_rent_fees[token.name]
    if (!token_rent_fee) {
        // Default to a safe fallback if needed, or error
        token_rent_fee = 0.002;
    }
    let fee_base_units = Math.floor(base_units * withdraw_fee_rate / 10000 + units_per_token * token_rent_fee)
    base_units -= fee_base_units

    if (base_units <= 0) {
        throw new Error('withdraw amount too low')
    }
    let isPartial = false

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

    const { globalConfigAccount, treeTokenAccount } = getProgramAccounts()

    const { root, nextIndex: currentNextIndex } = await queryRemoteTreeState(token.name);

    const utxoPrivateKey = encryptionService.getUtxoPrivateKeyV2();
    const utxoKeypair = new UtxoKeypair(utxoPrivateKey, lightWasm);
    // V2 is standard now
    const utxoKeypairV2 = utxoKeypair;

    const mintUtxos = await getUtxosSPL({ connection, publicKey, encryptionService, storage, mintAddress });

    if (mintUtxos.length < 1) {
        throw new Error('Need at least 1 unspent UTXO to perform a withdrawal');
    }

    mintUtxos.sort((a, b) => b.amount.cmp(a.amount));

    const firstInput = mintUtxos[0];
    const secondInput = mintUtxos.length > 1 ? mintUtxos[1] : new Utxo({
        lightWasm,
        keypair: utxoKeypair,
        amount: '0',
        mintAddress: token.pubkey.toString()
    });

    const inputs = [firstInput, secondInput];
    const totalInputAmount = firstInput.amount.add(secondInput.amount);

    if (totalInputAmount.toNumber() === 0) {
        throw new Error('no balance')
    }

    // Check if we have enough balance including fee
    // Note: base_units was already deducted fee. 
    // Wait, original logic: 
    // fee_base_units = ...
    // base_units -= fee_base_units 
    // IF total < base_units + fee_base_units -> partial

    // total must cover requested withdraw (post-deduction) + fee
    // i.e. total must cover original request amount.
    // if total < (base_units + fee_base_units)
    // then set base_units = total - fee_base_units

    if (totalInputAmount.lt(new BN(base_units + fee_base_units))) {
        isPartial = true
        base_units = totalInputAmount.toNumber()
        base_units -= fee_base_units
    }

    // Change should be 0 if we consume everything perfectly, or remainder
    // change = total - (withdraw + fee)
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
            return fetchMerkleProof(commitment, token.name);
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
            mintAddress: token.pubkey.toString()
        }),
        new Utxo({
            lightWasm,
            amount: '0',
            keypair: utxoKeypairV2,
            index: currentNextIndex + 1,
            mintAddress: token.pubkey.toString()
        })
    ];

    const extAmount = -base_units;
    const publicAmountForCircuit = new BN(extAmount).sub(new BN(fee_base_units)).add(FIELD_SIZE).mod(FIELD_SIZE);

    const sumIns = inputs.reduce((sum, input) => sum.add(input.amount), new BN(0));
    // const sumOuts = outputs.reduce((sum, output) => sum.add(output.amount), new BN(0));

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
        feeRecipient: FEE_RECIPIENT,
        mintAddress: token.pubkey.toString()
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
        mintAddress: getMintAddressField(new PublicKey(inputs[0].mintAddress))
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

    const serializedProof = serializeProofAndExtData(proofToSubmit, extData, true);

    const [globalConfigPda] = await PublicKey.findProgramAddressSync(
        [Buffer.from("global_config")],
        PROGRAM_ID
    );
    const treeAta = getAssociatedTokenAddressSync(token.pubkey, globalConfigPda, true);

    const withdrawParams = {
        serializedProof: serializedProof.toString('base64'),
        treeAccount: treeAccount.toString(),
        nullifier0PDA: nullifier0PDA.toString(),
        nullifier1PDA: nullifier1PDA.toString(),
        nullifier2PDA: nullifier2PDA.toString(),
        nullifier3PDA: nullifier3PDA.toString(),
        treeTokenAccount: treeTokenAccount.toString(),
        globalConfigAccount: globalConfigAccount.toString(),
        recipient: recipient.toString(),
        feeRecipientAccount: FEE_RECIPIENT.toString(),
        extAmount: extAmount,
        encryptedOutput1: encryptedOutput1.toString('base64'),
        encryptedOutput2: encryptedOutput2.toString('base64'),
        fee: fee_base_units,
        lookupTableAddress: ALT_ADDRESS.toString(),
        senderAddress: publicKey.toString(),
        treeAta: treeAta.toString(),
        recipientAta: recipient_ata.toString(),
        mintAddress: token.pubkey.toString(),
        feeRecipientTokenAccount: feeRecipientTokenAccount.toString(),
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
        let res = await fetch(RELAYER_API_URL + '/utxos/check/' + encryptedOutputStr + '?token=' + token.name)
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

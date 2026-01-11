import {
    Connection,
    PublicKey,
    SystemProgram,
    ComputeBudgetProgram
} from '@solana/web3.js';
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { logger } from './logger';

export async function useExistingALT(
    connection: Connection,
    altAddress: PublicKey
): Promise<{ value: any } | null> {
    try {
        logger.debug(`Using existing ALT: ${altAddress.toString()}`);
        const altAccount = await connection.getAddressLookupTable(altAddress);

        if (altAccount.value) {
            logger.debug(`✅ ALT found with ${altAccount.value.state.addresses.length} addresses`);
        } else {
            logger.error('❌ ALT not found');
        }

        return altAccount;
    } catch (error) {
        console.error('Error getting existing ALT:', error);
        return null;
    }
}

export function getProtocolAddressesWithMint(
    programId: PublicKey,
    authority: PublicKey,
    treeAta: PublicKey,
    feeRecipient: PublicKey,
    feeRecipientAta: PublicKey
): PublicKey[] {
    const [globalConfigAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from('global_config')],
        programId
    );

    const [treeAccount] = PublicKey.findProgramAddressSync(
        [Buffer.from('merkle_tree')],
        programId
    );

    return [
        programId,
        treeAccount,
        treeAta,
        globalConfigAccount,
        authority,
        feeRecipient,
        feeRecipientAta,
        SystemProgram.programId,
        ComputeBudgetProgram.programId,
        ASSOCIATED_TOKEN_PROGRAM_ID,
        TOKEN_PROGRAM_ID,
    ];
}

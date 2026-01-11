import { Connection, Keypair, PublicKey, VersionedTransaction } from '@solana/web3.js';
import { EncryptionService } from './utils/encryption';
import { WasmFactory } from '@lightprotocol/hasher.rs';
import { storage } from './storage';
import { depositSPL } from './depositSPL';
import { withdrawSPL } from './withdrawSPL';
import { deposit } from './deposit';
import { withdraw } from './withdraw';
import { getUtxosSPL, getBalanceFromUtxosSPL } from './getUtxosSPL';
import { getUtxos, getBalanceFromUtxos } from './getUtxos';

export class PrivacyCash {
    private connection: Connection;
    private publicKey: PublicKey;
    encryptionService: EncryptionService;
    private keypair?: Keypair;
    private signTransaction?: (tx: VersionedTransaction) => Promise<VersionedTransaction>;

    private keyBasePath: string = '/wasm/transaction2';

    constructor({ RPC_url, owner, signTransaction }: {
        RPC_url: string,
        owner: Keypair | PublicKey,
        signTransaction?: (tx: VersionedTransaction) => Promise<VersionedTransaction>,
        enableDebug?: boolean
    }) {
        this.connection = new Connection(RPC_url, 'confirmed');

        if (owner instanceof Keypair) {
            this.keypair = owner;
            this.publicKey = owner.publicKey;
            this.signTransaction = async (tx) => {
                tx.sign([this.keypair!]);
                return tx;
            }
        } else {
            this.publicKey = owner;
            this.signTransaction = signTransaction;
        }

        if (!this.signTransaction) {
            throw new Error('Transaction signer is required when using PublicKey as owner');
        }

        this.encryptionService = new EncryptionService();
    }

    public async init(signMessageFn: (message: Uint8Array) => Promise<Uint8Array>) {
        const message = Buffer.from('Privacy Money account sign in');
        const signature = await signMessageFn(message);
        this.encryptionService.deriveEncryptionKeyFromSignature(signature);
    }

    public async deposit({ amount }: { amount: number }) {
        const lightWasm = await WasmFactory.getInstance();
        return deposit({
            lightWasm,
            storage,
            keyBasePath: this.keyBasePath,
            publicKey: this.publicKey,
            connection: this.connection,
            amount,
            encryptionService: this.encryptionService,
            transactionSigner: this.signTransaction!
        });
    }

    public async withdraw({ amount, recipient }: { amount: number, recipient: PublicKey }) {
        const lightWasm = await WasmFactory.getInstance();
        return withdraw({
            lightWasm,
            storage,
            keyBasePath: this.keyBasePath,
            publicKey: this.publicKey,
            connection: this.connection,
            amount,
            encryptionService: this.encryptionService,
            recipient
        });
    }

    public async depositSPL({ amount, mint }: { amount: number, mint: PublicKey | string }) {
        const lightWasm = await WasmFactory.getInstance();
        return depositSPL({
            lightWasm,
            storage,
            keyBasePath: this.keyBasePath,
            publicKey: this.publicKey,
            connection: this.connection,
            amount,
            encryptionService: this.encryptionService,
            transactionSigner: this.signTransaction!,
            mintAddress: mint
        });
    }

    public async withdrawSPL({ amount, mint, recipient }: { amount: number, mint: PublicKey | string, recipient: PublicKey }) {
        const lightWasm = await WasmFactory.getInstance();
        return withdrawSPL({
            lightWasm,
            storage,
            keyBasePath: this.keyBasePath,
            publicKey: this.publicKey,
            connection: this.connection,
            amount,
            encryptionService: this.encryptionService,
            mintAddress: mint,
            recipient
        });
    }

    public async getPrivateBalance() {
        try {
            try {
                this.encryptionService.getUtxoPrivateKeyV2();
            } catch {
                return { lamports: 0 };
            }

            const utxos = await getUtxos({
                publicKey: this.publicKey,
                connection: this.connection,
                encryptionService: this.encryptionService,
                storage
            });
            return getBalanceFromUtxos(utxos);
        } catch (e) {
            console.error('Failed to fetch private balance:', e);
            return { lamports: 0 };
        }
    }

    public async getPrivateBalanceSPL(mint: PublicKey | string) {
        try {
            try {
                this.encryptionService.getUtxoPrivateKeyV2();
            } catch {
                return { amount: 0, base_units: 0 };
            }

            const utxos = await getUtxosSPL({
                publicKey: this.publicKey,
                connection: this.connection,
                encryptionService: this.encryptionService,
                storage,
                mintAddress: mint
            });
            return getBalanceFromUtxosSPL(utxos);
        } catch (e) {
            console.error('Failed to fetch private balance:', e);
            return { amount: 0, base_units: 0 };
        }
    }
}

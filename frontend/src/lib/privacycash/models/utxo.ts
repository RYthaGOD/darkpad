import BN from 'bn.js';
import { Keypair } from './keypair'; // Fix import
import * as hasher from '@lightprotocol/hasher.rs';
import { ethers } from 'ethers';
import { getMintAddressField } from '../utils/utils'; // Fix import
import { PublicKey } from '@solana/web3.js';

export class Utxo {
    amount: BN;
    blinding: BN;
    keypair: Keypair;
    index: number;
    mintAddress: string;
    version: 'v1' | 'v2';
    private lightWasm: hasher.LightWasm;

    constructor({
        lightWasm,
        amount = new BN(0),
        keypair,
        blinding = new BN(Math.floor(Math.random() * 1000000000)),
        index = 0,
        mintAddress = '11111111111111111111111111111112',
        version = 'v2'
    }: {
        lightWasm: hasher.LightWasm,
        amount?: BN | number | string,
        keypair?: Keypair,
        blinding?: BN | number | string,
        index?: number,
        mintAddress?: string,
        version?: 'v1' | 'v2'
    }) {
        this.amount = new BN(amount.toString());
        this.blinding = new BN(blinding.toString());
        this.lightWasm = lightWasm;
        // e.g. use ethers for random key if not provided
        this.keypair = keypair || new Keypair(ethers.Wallet.createRandom().privateKey, lightWasm);
        this.index = index;
        this.mintAddress = mintAddress;
        this.version = version;
    }

    async getCommitment(): Promise<string> {
        const mintAddressField = getMintAddressField(new PublicKey(this.mintAddress));
        return this.lightWasm.poseidonHashString([
            this.amount.toString(),
            this.keypair.pubkey.toString(),
            this.blinding.toString(),
            mintAddressField
        ]);
    }

    async getNullifier(): Promise<string> {
        const commitmentValue = await this.getCommitment();
        const signature = this.keypair.sign(commitmentValue, new BN(this.index).toString());
        return this.lightWasm.poseidonHashString([commitmentValue, new BN(this.index).toString(), signature]);
    }

    // Skip logging method to save space or simplify
} 

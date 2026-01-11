declare module 'bn.js' {
    import { Buffer } from 'buffer';

    class BN {
        constructor(number: number | string | number[] | Uint8Array | Buffer | BN, base?: number | 'hex', endian?: 'le' | 'be');
        clone(): BN;
        toString(base?: number | 'hex', length?: number): string;
        toNumber(): number;
        toJSON(): string;
        toArray(endian?: 'le' | 'be', length?: number): number[];
        toBuffer(endian?: 'le' | 'be', length?: number): Buffer;
        bitLength(): number;
        zeroBits(): number;
        byteLength(): number;
        isNeg(): boolean;
        isEven(): boolean;
        isOdd(): boolean;
        isZero(): boolean;
        cmp(b: BN): -1 | 0 | 1;
        lt(b: BN): boolean;
        lte(b: BN): boolean;
        gt(b: BN): boolean;
        gte(b: BN): boolean;
        eq(b: BN): boolean;
        toTwos(k: number): BN;
        fromTwos(k: number): BN;
        neg(): BN;
        abs(): BN;
        add(b: BN): BN;
        sub(b: BN): BN;
        mul(b: BN): BN;
        div(b: BN): BN;
        mod(b: BN): BN;
        divRound(b: BN): BN;
        pow(b: BN): BN;
        or(b: BN): BN;
        and(b: BN): BN;
        xor(b: BN): BN;
        setn(b: number): BN;
        shln(b: number): BN;
        shrn(b: number): BN;
        maskn(b: number): BN;
        bincn(b: number): BN;
        notn(w: number): BN;
        gcd(b: BN): BN;
        egcd(b: BN): { a: BN, b: BN, gcd: BN };
        invm(b: BN): BN;
    }

    export = BN;
}

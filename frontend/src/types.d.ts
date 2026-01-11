declare module 'circomlibjs' {
    export interface Poseidon {
        (inputs: bigint[]): any;
        F: {
            toObject(input: any): bigint;
        };
    }
    export function buildPoseidon(): Promise<Poseidon>;
}

declare module 'js-sha3';

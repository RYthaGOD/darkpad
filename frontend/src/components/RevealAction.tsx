"use client";

import { useState, useEffect } from "react";
import { useAnchorWallet, useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { getProvider, getLaunchpadProgram, deriveUserBidPDA } from "../lib/program";
import { fieldToBytes32, computeNullifier } from "../lib/noir-utils";
import { decryptVaultData, VAULT_MESSAGE } from "../lib/crypto";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, CheckCircle2, Eye, Sparkles, Clock, Lock, Key } from "lucide-react";

interface RevealActionProps {
    auctionAddress: string;
}

export default function RevealAction({ auctionAddress }: RevealActionProps) {
    const wallet = useAnchorWallet();
    const { signMessage } = useWallet();
    const { connection } = useConnection();
    const [loading, setLoading] = useState(false);
    const [isDecrypting, setIsDecrypting] = useState(false);
    const [myBid, setMyBid] = useState<any>(null);
    const [revealed, setRevealed] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!wallet) return;

        // 1. Check for legacy (unencrypted) bids first (for backwards compatibility during transition)
        const legacyBids = JSON.parse(localStorage.getItem("darkpad_bids") || "[]");
        const legacyFound = legacyBids.find((b: any) =>
            b.auction === auctionAddress && b.user === wallet.publicKey.toBase58()
        );

        if (legacyFound) {
            setMyBid(legacyFound);
            return;
        }

        // 2. Check for encrypted bids
        const encryptedBids = JSON.parse(localStorage.getItem("darkpad_bids_encrypted") || "[]");
        // We can't know which one matches without decrypting or storing a hint.
        // For now, assume the last one is the most likely if it's there.
        // In a real app, we'd store the auctionAddress/user plaintext hint with the encrypted payload.
        // Let's assume the user needs to "Unlock" to see the bids.
    }, [wallet, auctionAddress]);

    const handleUnlockVault = async () => {
        if (!signMessage || !wallet) return;

        try {
            setIsDecrypting(true);
            setError("");
            const msg = new TextEncoder().encode(VAULT_MESSAGE);
            const signature = await signMessage(msg);

            const encryptedBids = JSON.parse(localStorage.getItem("darkpad_bids_encrypted") || "[]");

            for (const payload of encryptedBids) {
                try {
                    const decrypted = await decryptVaultData(payload, signature);
                    if (decrypted.auction === auctionAddress && decrypted.user === wallet.publicKey.toBase58()) {
                        setMyBid(decrypted);
                        setIsDecrypting(false);
                        return;
                    }
                } catch (e) {
                    // Not the right key or malformed, skip
                }
            }

            setError("No matching bid found in your secure vault for this auction.");
        } catch (err: any) {
            console.error("Decryption failed:", err);
            setError("Failed to unlock vault: " + err.message);
        } finally {
            setIsDecrypting(false);
        }
    };

    const handleReveal = async () => {
        if (!wallet || !myBid) return;

        try {
            setLoading(true);
            const provider = getProvider(connection, wallet);
            const program = getLaunchpadProgram(provider);

            const amountBN = new BN(myBid.amount);
            const saltBuffer = Buffer.from(myBid.salt, "hex");

            const auctionKey = new PublicKey(auctionAddress);
            const secret = BigInt(myBid.secret);
            const auctionId = BigInt(1);
            const nullifier = computeNullifier(secret, auctionId);
            const nullifierBytes = fieldToBytes32(nullifier);
            const [userBidPDA] = deriveUserBidPDA(auctionKey, nullifierBytes);

            await program.methods
                .revealBid(amountBN, Array.from(saltBuffer))
                .accounts({
                    bidder: wallet.publicKey,
                    auction: auctionKey,
                    userBid: userBidPDA,
                } as any)
                .rpc();

            // Award Shadow Points
            const points = (parseInt(localStorage.getItem("shadow_points") || "0")) + 100;
            localStorage.setItem("shadow_points", points.toString());

            setRevealed(true);
        } catch (err: any) {
            console.error("Reveal failed:", err);
            if (err.message.includes("custom program error") || err.message.includes("AccountNotInitialized")) {
                setError("Error: This bid may have already been revealed.");
            } else {
                setError("Reveal failed: " + err.message);
            }
        } finally {
            setLoading(false);
        }
    };

    if (revealed) {
        return (
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-8 rounded-3xl bg-gradient-to-br from-emerald-500/10 to-green-500/5 border border-emerald-500/20 text-center"
            >
                <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 flex items-center justify-center mx-auto mb-6">
                    <CheckCircle2 size={32} className="text-emerald-400" />
                </div>
                <h3 className="text-xl font-bold text-emerald-400 mb-2">Bid Revealed!</h3>
                <p className="text-zinc-400 text-sm mb-4">
                    You earned <span className="text-emerald-400 font-bold">+100 Shadow Points</span>
                </p>
                <div className="flex items-center justify-center gap-2 text-xs text-zinc-500">
                    <Sparkles size={12} className="text-emerald-400" />
                    <span>Your bid is now eligible for settlement</span>
                </div>
            </motion.div>
        );
    }

    if (!myBid) {
        return (
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-8 rounded-3xl bg-[#0a0a0a] border border-white/5 text-center relative overflow-hidden"
            >
                <div className="absolute inset-0 opacity-[0.03] pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />
                <div className="w-16 h-16 rounded-2xl bg-violet-500/10 flex items-center justify-center mx-auto mb-6">
                    <Lock size={32} className="text-violet-400" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Bid Enclave Locked</h3>
                <p className="text-zinc-500 text-sm mb-8 px-4">
                    Your bid secrets are encrypted. Sign to unlock and proceed with the reveal.
                </p>

                {error && <p className="text-red-400 text-xs mb-6 font-mono font-bold uppercase tracking-tighter">{error}</p>}

                <button
                    onClick={handleUnlockVault}
                    disabled={isDecrypting}
                    className="w-full py-4 bg-white text-black font-black uppercase tracking-widest text-xs rounded-xl flex items-center justify-center gap-3 hover:bg-zinc-200 transition-colors disabled:opacity-50"
                >
                    {isDecrypting ? (
                        <>
                            <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                            Unlocking...
                        </>
                    ) : (
                        <>
                            <Key size={16} />
                            Unlock Private Vault
                        </>
                    )}
                </button>
            </motion.div>
        );
    }

    const bidAmountSol = (parseInt(myBid.amount) / LAMPORTS_PER_SOL).toFixed(4);

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-8 rounded-3xl bg-gradient-to-br from-amber-500/10 to-orange-500/5 border border-amber-500/20 relative overflow-hidden"
        >
            <div className="absolute inset-0 bg-gradient-to-r from-amber-500/5 to-orange-500/5 animate-pulse" style={{ animationDuration: '3s' }} />

            <div className="relative z-10">
                <div className="flex items-start gap-4 mb-6">
                    <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                        <AlertTriangle size={24} className="text-amber-400" />
                    </div>
                    <div>
                        <h4 className="text-lg font-bold text-amber-400 mb-1">Reveal Phase Active</h4>
                        <p className="text-zinc-400 text-sm">
                            Your identity-linked secrets have been decrypted.
                        </p>
                    </div>
                </div>

                <div className="p-5 rounded-2xl bg-black/40 border border-white/5 mb-6">
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-zinc-500 text-[10px] uppercase font-black tracking-widest">Decrypted Bid Value</span>
                        <div className="flex items-center gap-2">
                            <Sparkles size={12} className="text-amber-400" />
                            <span className="text-[10px] text-amber-400 font-bold uppercase tracking-widest">Ready to Reveal</span>
                        </div>
                    </div>
                    <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-mono font-bold text-white">{bidAmountSol}</span>
                        <span className="text-zinc-500 font-medium">SOL</span>
                    </div>
                </div>

                <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/10 mb-6 font-mono text-[11px] text-zinc-400 leading-relaxed">
                    <div className="flex gap-2 mb-1">
                        <span className="text-amber-500 font-bold">SHA256:</span>
                        <span className="truncate">{myBid.salt.slice(0, 32)}...</span>
                    </div>
                    <div className="flex gap-2">
                        <span className="text-amber-500 font-bold">STATUS:</span>
                        <span>UNLOCKED_WITH_ED25519</span>
                    </div>
                </div>

                <button
                    onClick={handleReveal}
                    disabled={loading}
                    className="w-full py-5 bg-gradient-to-r from-amber-500 to-orange-500 text-black font-black uppercase tracking-[0.2em] text-xs hover:from-amber-400 hover:to-orange-400 transition-all rounded-xl flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-amber-500/20"
                >
                    {loading ? (
                        <span className="flex items-center gap-2">
                            <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                            TRANSMITTING REAL VALUE...
                        </span>
                    ) : (
                        <>
                            <Eye size={18} />
                            Publish Bid Content
                        </>
                    )}
                </button>
            </div>
        </motion.div>
    );
}

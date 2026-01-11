"use client";

import { useState, useEffect } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { AnchorProvider } from "@coral-xyz/anchor";
import { getLaunchpadProgram } from "../lib/program";
import { motion, AnimatePresence } from "framer-motion";
import { Crown, TrendingUp, Sparkles, Trophy, ArrowRight } from "lucide-react";
import Link from "next/link";

interface AuctionData {
    publicKey: string;
    projectMint: string;
    totalRaised: number;
    totalBids: number;
    status: string;
}

export default function DarkLordLeaderboard() {
    const { connection } = useConnection();
    const [auctions, setAuctions] = useState<AuctionData[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchLeaderboard = async () => {
            if (!connection) return;

            try {
                const provider = new AnchorProvider(
                    connection,
                    (typeof window !== "undefined" && (window as any).solana) || { publicKey: null, signTransaction: () => { }, signAllTransactions: () => { } } as any,
                    { preflightCommitment: "confirmed" }
                );
                const program = getLaunchpadProgram(provider);
                const allAccounts = await (program.account.auction as any).all();

                const mapped = allAccounts.map((a: any) => ({
                    publicKey: a.publicKey.toBase58(),
                    projectMint: a.account.projectMint.toBase58(),
                    totalRaised: a.account.totalRaised.toNumber() / 1e9,
                    totalBids: a.account.totalBids.toNumber(),
                    status: Object.keys(a.account.status)[0]
                }))
                    .sort((a: any, b: any) => b.totalRaised - a.totalRaised)
                    .slice(0, 5);

                setAuctions(mapped);
            } catch (err) {
                console.error("Failed to fetch leaderboard", err);
            } finally {
                setLoading(false);
            }
        };

        fetchLeaderboard();
        const interval = setInterval(fetchLeaderboard, 15000);
        return () => clearInterval(interval);
    }, [connection]);

    if (loading || auctions.length === 0) return null;

    return (
        <section className="py-24 relative overflow-hidden">
            {/* Background Accents */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-violet-600/5 rounded-full blur-[120px] pointer-events-none" />

            <div className="max-w-4xl mx-auto px-6 relative z-10">
                <div className="text-center mb-16">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-[10px] font-black uppercase tracking-widest text-violet-400 mb-6"
                    >
                        <Trophy size={14} />
                        <span>The High Table</span>
                    </motion.div>
                    <h2 className="text-3xl md:text-4xl font-bold text-white tracking-tight mb-4">
                        Dark Lords <span className="text-zinc-500">of the Basin</span>
                    </h2>
                    <p className="text-zinc-500 text-sm max-w-sm mx-auto">
                        Top performing liquidity events by total volume and market pressure.
                    </p>
                </div>

                <div className="space-y-3">
                    <AnimatePresence mode="popLayout">
                        {auctions.map((auction, index) => (
                            <motion.div
                                key={auction.publicKey}
                                initial={{ opacity: 0, y: 10 }}
                                whileInView={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                transition={{ delay: index * 0.05 }}
                                viewport={{ once: true }}
                                className="group"
                            >
                                <Link href={`/auctions/${auction.publicKey}`}>
                                    <div className="relative p-5 rounded-2xl bg-gradient-to-br from-white/[0.03] to-transparent border border-white/5 hover:border-violet-500/30 hover:from-white/[0.05] transition-all flex items-center justify-between group-hover:translate-x-1">

                                        <div className="flex items-center gap-5">
                                            <div className="relative">
                                                <span className={clsx(
                                                    "text-3xl font-black italic select-none",
                                                    index === 0 ? "text-violet-500" :
                                                        index === 1 ? "text-violet-500/70" :
                                                            index === 2 ? "text-violet-500/40" : "text-zinc-800"
                                                )}>
                                                    {index + 1}
                                                </span>
                                                {index === 0 && (
                                                    <motion.div
                                                        animate={{ rotate: [0, 10, -10, 0] }}
                                                        transition={{ repeat: Infinity, duration: 4 }}
                                                        className="absolute -top-3 -left-3 text-violet-400"
                                                    >
                                                        <Crown size={16} />
                                                    </motion.div>
                                                )}
                                            </div>

                                            <div>
                                                <div className="flex items-center gap-3 mb-1">
                                                    <span className="font-bold text-white group-hover:text-violet-400 transition-colors">
                                                        Token-{auction.projectMint.slice(0, 4)}
                                                    </span>
                                                    <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/5 text-[9px] font-mono text-zinc-500">
                                                        {auction.publicKey.slice(0, 4)}...
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-4 text-[10px] text-zinc-500 uppercase font-black tracking-widest">
                                                    <div className="flex items-center gap-1.5">
                                                        <TrendingUp size={12} className="text-emerald-500/50" />
                                                        <span>{auction.totalBids} Bids</span>
                                                    </div>
                                                    <div className="w-1 h-1 rounded-full bg-zinc-800" />
                                                    <span className={auction.status === 'Active' ? 'text-emerald-400/80' : 'text-zinc-600'}>
                                                        {auction.status}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-8">
                                            <div className="text-right">
                                                <p className="text-[9px] text-zinc-600 uppercase font-black tracking-[0.2em] mb-1">Volume</p>
                                                <p className="text-lg font-mono font-bold text-white">
                                                    {auction.totalRaised.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                                                    <span className="text-[10px] text-zinc-500 ml-1">SOL</span>
                                                </p>
                                            </div>
                                            <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                <ArrowRight size={14} className="text-violet-400" />
                                            </div>
                                        </div>
                                    </div>
                                </Link>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>

                <div className="mt-12 text-center">
                    <Link href="/auctions" className="text-xs font-black uppercase tracking-[0.3em] text-zinc-600 hover:text-violet-400 transition-colors flex items-center justify-center gap-2 group">
                        <Sparkles size={12} />
                        View All Markets
                        <ArrowRight size={12} className="group-hover:translate-x-1 transition-transform" />
                    </Link>
                </div>
            </div>
        </section>
    );
}

function clsx(...classes: string[]) {
    return classes.filter(Boolean).join(' ');
}

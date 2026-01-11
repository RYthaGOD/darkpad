"use client";

import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import Link from "next/link";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";
import { getLaunchpadProgram } from "@/lib/program";
import { motion, AnimatePresence } from "framer-motion";
import {
    TrendingUp, Users, Coins, Clock,
    ArrowRight, Activity, Filter, RefreshCw,
    Search, LayoutGrid, List
} from "lucide-react";

interface Auction {
    address: string;
    projectMint: string;
    status: string;
    totalBids: number;
    tokenSupply: number;
    endTime: number;
}

export default function AuctionsPage() {
    const { connection } = useConnection();
    const { connected } = useWallet();
    const [auctions, setAuctions] = useState<Auction[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<"grid" | "list">("list");

    const fetchAuctions = async () => {
        try {
            const provider = new AnchorProvider(
                connection,
                window.solana || { publicKey: null, signTransaction: () => { }, signAllTransactions: () => { } } as any,
                { preflightCommitment: "confirmed" }
            );

            const program = getLaunchpadProgram(provider);
            const accounts = await program.account.auction.all();

            const liveAuctions: Auction[] = accounts.map(acc => ({
                address: acc.publicKey.toString(),
                projectMint: acc.account.projectMint.toString(),
                status: Object.keys(acc.account.status)[0],
                totalBids: acc.account.totalBids.toNumber(),
                tokenSupply: acc.account.tokenSupply.toNumber(),
                endTime: acc.account.endTime.toNumber() * 1000,
            }));

            setAuctions(liveAuctions);
        } catch (err) {
            console.error("Failed to fetch auctions:", err);
            setAuctions([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAuctions();
        const interval = setInterval(fetchAuctions, 30000);
        return () => clearInterval(interval);
    }, [connection, connected]);

    const getStatusStyle = (status: string) => {
        switch (status.toLowerCase()) {
            case "active":
                return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
            case "revealing":
                return "bg-amber-500/10 text-amber-400 border-amber-500/20";
            case "settled":
                return "bg-zinc-500/10 text-zinc-400 border-zinc-500/20";
            default:
                return "bg-white/5 text-white border-white/10";
        }
    };

    const formatTimeRemaining = (endTime: number) => {
        const now = Date.now();
        const diff = endTime - now;
        if (diff <= 0) return "Ended";

        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        return `${hours}h ${minutes}m`;
    };

    return (
        <main className="min-h-screen bg-[#030303] text-zinc-100 font-sans selection:bg-violet-500/30">
            {/* Animated Grid Background */}
            <div className="fixed inset-0 pointer-events-none z-0">
                <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:60px_60px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]" />
                <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-transparent via-[#030303]/50 to-[#030303]" />
            </div>

            {/* Header */}
            <header className="fixed top-0 w-full z-50 backdrop-blur-2xl border-b border-white/5 bg-[#030303]/70">
                <div className="max-w-7xl mx-auto px-6 h-16 flex justify-between items-center">
                    <Link href="/" className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center border border-white/10">
                            <span className="font-bold text-white text-sm">D</span>
                        </div>
                        <span className="font-semibold text-lg">Darkpool</span>
                    </Link>
                    <nav className="hidden md:flex items-center gap-8">
                        <Link href="/auctions" className="text-sm font-medium text-white">Auctions</Link>
                        <Link href="/shield" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">Shield</Link>
                        <Link href="/admin" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">Dashboard</Link>
                    </nav>
                    <WalletMultiButton className="!bg-white/5 hover:!bg-white/10 !border !border-white/10 !rounded-full !h-10 !px-5 !text-sm !font-medium" />
                </div>
            </header>

            {/* Content */}
            <div className="pt-24 pb-20 px-6 relative z-10">
                <div className="max-w-7xl mx-auto">
                    {/* Page Title & Stats */}
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-12">
                        <div>
                            <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
                                Market <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-purple-400 font-black">Overview</span>
                            </h1>
                            <p className="text-zinc-500 max-w-lg">
                                Access private token launches. Every bid is cryptographically sealed using zero-knowledge proofs.
                            </p>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="flex p-1 bg-white/5 rounded-xl border border-white/5">
                                <button
                                    onClick={() => setViewMode("list")}
                                    className={`p-2 rounded-lg transition-all ${viewMode === "list" ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-400"}`}
                                >
                                    <List size={18} />
                                </button>
                                <button
                                    onClick={() => setViewMode("grid")}
                                    className={`p-2 rounded-lg transition-all ${viewMode === "grid" ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-400"}`}
                                >
                                    <LayoutGrid size={18} />
                                </button>
                            </div>
                            <button
                                onClick={fetchAuctions}
                                className="p-3 rounded-xl bg-white/5 border border-white/5 text-zinc-400 hover:text-white transition-all"
                            >
                                <RefreshCw size={18} />
                            </button>
                        </div>
                    </div>

                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-32 space-y-4">
                            <div className="w-12 h-12 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
                            <p className="text-xs text-zinc-500 uppercase tracking-widest font-bold">Scanning Chains...</p>
                        </div>
                    ) : auctions.length === 0 ? (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="text-center py-32 rounded-3xl border border-white/5 bg-white/[0.02]"
                        >
                            <Search size={48} className="mx-auto mb-6 text-zinc-700" strokeWidth={1} />
                            <h3 className="text-xl font-bold mb-2">No Active Auctions</h3>
                            <p className="text-zinc-500 mb-8">Check back soon for new institutional token launches.</p>
                            <Link href="/admin" className="px-6 py-3 rounded-full bg-white text-black font-semibold text-sm hover:bg-zinc-200 transition-all">
                                Create Test Auction
                            </Link>
                        </motion.div>
                    ) : (
                        <div className={viewMode === "list" ? "space-y-4" : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"}>
                            {/* Header - List View Only */}
                            {viewMode === "list" && (
                                <div className="hidden lg:grid grid-cols-12 gap-4 px-8 py-3 text-[10px] uppercase font-bold tracking-[0.2em] text-zinc-500">
                                    <div className="col-span-4">Asset</div>
                                    <div className="col-span-2">Status</div>
                                    <div className="col-span-2">Time Left</div>
                                    <div className="col-span-2 text-right">Supply</div>
                                    <div className="col-span-2 text-right">Participants</div>
                                </div>
                            )}

                            {auctions.map((auction, i) => (
                                <motion.div
                                    key={auction.address}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.05 }}
                                >
                                    <Link
                                        href={`/auctions/${auction.address}`}
                                        className={`group block p-6 lg:px-8 rounded-2xl border border-white/5 bg-gradient-to-br from-white/[0.03] to-transparent hover:border-violet-500/30 transition-all duration-300 relative overflow-hidden ${viewMode === "list" ? "lg:grid lg:grid-cols-12 lg:items-center" : ""}`}
                                    >
                                        {/* Hover Glow */}
                                        <div className="absolute inset-0 bg-violet-500/[0.02] opacity-0 group-hover:opacity-100 transition-opacity" />

                                        {/* Asset Info */}
                                        <div className={viewMode === "list" ? "lg:col-span-4" : "mb-6"}>
                                            <div className="flex items-center gap-4 relative z-10">
                                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-500/10 flex items-center justify-center border border-white/5 group-hover:scale-110 transition-transform">
                                                    <span className="font-mono text-lg font-bold text-white/80">
                                                        {auction.projectMint.slice(0, 2)}
                                                    </span>
                                                </div>
                                                <div>
                                                    <h3 className="font-bold text-lg text-white group-hover:text-violet-400 transition-colors">
                                                        Token-{auction.projectMint.slice(0, 4)}
                                                    </h3>
                                                    <div className="flex items-center gap-2">
                                                        <Activity size={10} className="text-zinc-600" />
                                                        <span className="font-mono text-[10px] text-zinc-500">{auction.address.slice(0, 8)}...</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Status */}
                                        <div className={viewMode === "list" ? "lg:col-span-2 mt-4 lg:mt-0" : "flex justify-between items-center mb-6"}>
                                            <span className={`inline-flex px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${getStatusStyle(auction.status)} relative z-10`}>
                                                {auction.status}
                                            </span>
                                            {viewMode === "grid" && (
                                                <div className="flex items-center gap-2 text-[10px] text-zinc-500 font-mono">
                                                    <Clock size={12} />
                                                    {formatTimeRemaining(auction.endTime)}
                                                </div>
                                            )}
                                        </div>

                                        {/* Time - List View Only */}
                                        {viewMode === "list" && (
                                            <div className="lg:col-span-2 mt-4 lg:mt-0 font-mono text-xs text-zinc-400 flex items-center gap-2">
                                                <div className="w-1 h-3 bg-white/10 rounded-full lg:hidden" />
                                                {formatTimeRemaining(auction.endTime)}
                                            </div>
                                        )}

                                        {/* Stats */}
                                        <div className={viewMode === "list" ? "lg:col-span-2 text-right mt-4 lg:mt-0" : "grid grid-cols-2 gap-4 mb-6 pt-6 border-t border-white/5"}>
                                            <div className={viewMode === "list" ? "" : ""}>
                                                <span className="lg:hidden text-[9px] uppercase tracking-wider text-zinc-600 block mb-1">Supply</span>
                                                <p className="font-mono text-sm lg:text-base font-medium text-zinc-200">
                                                    {(auction.tokenSupply / LAMPORTS_PER_SOL).toLocaleString()}
                                                </p>
                                            </div>
                                        </div>

                                        <div className={viewMode === "list" ? "lg:col-span-2 text-right mt-4 lg:mt-0" : ""}>
                                            <div className={viewMode === "list" ? "" : ""}>
                                                <span className="lg:hidden text-[9px] uppercase tracking-wider text-zinc-600 block mb-1">Bids</span>
                                                <div className="flex items-center lg:justify-end gap-2 text-violet-400">
                                                    <p className="font-mono text-sm lg:text-base font-bold">
                                                        {auction.totalBids}
                                                    </p>
                                                    <Users size={14} className="opacity-50" />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Action Icon - Grid View Only */}
                                        {viewMode === "grid" && (
                                            <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-between">
                                                <span className="text-[10px] text-zinc-600 uppercase tracking-widest font-bold">Details</span>
                                                <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center group-hover:bg-violet-500/20 group-hover:text-violet-400 transition-all">
                                                    <ArrowRight size={16} />
                                                </div>
                                            </div>
                                        )}
                                    </Link>
                                </motion.div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </main>
    );
}

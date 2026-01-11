"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import Link from "next/link";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { AnchorProvider } from "@coral-xyz/anchor";
import { getLaunchpadProgram } from "@/lib/program";
import BidForm from "@/components/BidForm";
import RevealAction from "@/components/RevealAction";
import Shoutbox from "@/components/Shoutbox";
import PressureGauge from "@/components/PressureGauge";
import { motion } from "framer-motion";
import {
    ArrowLeft, Clock, Users, Coins, Shield, CheckCircle2,
    TrendingUp, Lock, Eye, Timer, Sparkles, Activity
} from "lucide-react";

interface AuctionDetail {
    address: string;
    projectMint: string;
    paymentMint: string;
    status: string;
    totalBids: number;
    totalRaised: number;
    tokenSupply: number;
    clearingPrice: number;
    endTime: number;
    bump: number;
}

export default function AuctionDetailPage() {
    const params = useParams();
    const { id } = params;
    const { connection } = useConnection();
    const { connected } = useWallet();
    const [auction, setAuction] = useState<AuctionDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [timeLeft, setTimeLeft] = useState("");

    useEffect(() => {
        if (!id) return;

        const fetchAuctionDetail = async () => {
            const provider = new AnchorProvider(
                connection,
                window.solana || { publicKey: null, signTransaction: () => { }, signAllTransactions: () => { } } as any,
                { preflightCommitment: "confirmed" }
            );

            const program = getLaunchpadProgram(provider);

            try {
                const pubkey = new PublicKey(id as string);
                const acc: any = await (program.account as any).auction.fetch(pubkey);

                setAuction({
                    address: id as string,
                    projectMint: acc.projectMint.toString(),
                    paymentMint: acc.paymentMint.toString(),
                    status: Object.keys(acc.status)[0],
                    totalBids: acc.totalBids.toNumber(),
                    totalRaised: 0,
                    tokenSupply: acc.tokenSupply.toNumber(),
                    clearingPrice: 0,
                    endTime: acc.endTime.toNumber() * 1000,
                    bump: acc.bump,
                });
            } catch (err) {
                console.error("Failed to fetch auction:", err);
                setAuction(null);
            } finally {
                setLoading(false);
            }
        };

        fetchAuctionDetail();
        const interval = setInterval(fetchAuctionDetail, 5000);
        return () => clearInterval(interval);
    }, [id, connection]);

    // Countdown Timer
    useEffect(() => {
        if (!auction) return;

        const updateTimer = () => {
            const now = Date.now();
            const diff = auction.endTime - now;

            if (diff <= 0) {
                setTimeLeft("Ended");
                return;
            }

            const hours = Math.floor(diff / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diff % (1000 * 60)) / 1000);

            setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
        };

        updateTimer();
        const timer = setInterval(updateTimer, 1000);
        return () => clearInterval(timer);
    }, [auction]);

    if (loading) {
        return (
            <main className="min-h-screen bg-[#030303] flex items-center justify-center">
                <div className="w-12 h-12 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
            </main>
        );
    }

    if (!auction) {
        return (
            <main className="min-h-screen bg-[#030303] flex items-center justify-center text-white">
                <div className="text-center">
                    <div className="text-6xl mb-4">🔍</div>
                    <h1 className="text-2xl font-bold mb-2">Auction Not Found</h1>
                    <p className="text-zinc-500 mb-6">The auction you're looking for doesn't exist.</p>
                    <Link href="/auctions" className="text-violet-400 hover:text-violet-300 transition-colors">
                        ← Back to Auctions
                    </Link>
                </div>
            </main>
        );
    }

    const statusColors: Record<string, string> = {
        active: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
        revealing: "bg-amber-500/10 text-amber-400 border-amber-500/20",
        settled: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    };

    return (
        <main className="min-h-screen bg-[#030303] text-zinc-100 font-sans">
            {/* Animated Background */}
            <div className="fixed inset-0 pointer-events-none z-0">
                <div className="absolute top-[-10%] right-[-5%] w-[40%] h-[40%] bg-gradient-to-br from-violet-500/5 to-purple-500/5 rounded-full blur-[100px]" />
                <div className="absolute bottom-[10%] left-[-5%] w-[30%] h-[30%] bg-gradient-to-tr from-blue-500/5 to-cyan-500/5 rounded-full blur-[80px]" />
            </div>

            {/* Header */}
            <header className="fixed top-0 w-full z-50 backdrop-blur-2xl border-b border-white/5 bg-[#030303]/70">
                <div className="max-w-7xl mx-auto px-6 h-16 flex justify-between items-center">
                    <div className="flex items-center gap-4">
                        <Link href="/auctions" className="p-2 rounded-lg hover:bg-white/5 transition-colors text-zinc-400 hover:text-white">
                            <ArrowLeft size={20} />
                        </Link>
                        <div className="h-6 w-px bg-white/10" />
                        <Link href="/" className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center border border-white/10">
                                <span className="font-bold text-white text-sm">D</span>
                            </div>
                            <span className="font-semibold text-lg hidden sm:block">Darkpool</span>
                        </Link>
                    </div>
                    <WalletMultiButton className="!bg-white/5 hover:!bg-white/10 !border !border-white/10 !rounded-full !h-10 !px-5 !text-sm !font-medium" />
                </div>
            </header>

            <div className="pt-24 pb-12 px-6 relative z-10">
                <div className="max-w-7xl mx-auto">
                    {/* Hero Section */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mb-12"
                    >
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                            <div className="flex items-center gap-6">
                                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-500/20 to-purple-500/10 flex items-center justify-center border border-white/10">
                                    <span className="font-mono text-3xl font-bold text-white/80">
                                        {auction.projectMint.slice(0, 2)}
                                    </span>
                                </div>
                                <div>
                                    <h1 className="text-3xl sm:text-4xl font-bold mb-2">
                                        Token-{auction.projectMint.slice(0, 6)}
                                    </h1>
                                    <div className="flex flex-wrap gap-3">
                                        <span className={`px-3 py-1.5 text-xs uppercase tracking-widest font-bold rounded-full border ${statusColors[auction.status] || statusColors.active}`}>
                                            {auction.status}
                                        </span>
                                        <span className="px-3 py-1.5 text-xs text-zinc-500 bg-white/5 rounded-full border border-white/10 font-mono">
                                            {auction.address.slice(0, 8)}...{auction.address.slice(-4)}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Countdown Timer */}
                            {auction.status === "active" && (
                                <div className="flex items-center gap-4 px-6 py-4 rounded-2xl bg-gradient-to-r from-violet-500/10 to-purple-500/10 border border-violet-500/20">
                                    <Timer size={24} className="text-violet-400" />
                                    <div>
                                        <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Ends In</div>
                                        <div className="text-2xl font-mono font-bold text-white">{timeLeft}</div>
                                    </div>
                                </div>
                            )}
                        </div>

                        <p className="text-zinc-400 max-w-2xl leading-relaxed">
                            Institutional-grade sealed bid auction powered by zero-knowledge proofs.
                            Bid amounts are cryptographically hidden until reveal. Fair price discovery guaranteed.
                        </p>
                    </motion.div>

                    <div className="grid lg:grid-cols-3 gap-8">
                        {/* Left Column: Stats */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 }}
                            className="lg:col-span-2 space-y-6"
                        >
                            {/* Stats Grid */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="p-5 rounded-2xl bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/5">
                                    <div className="flex items-center gap-2 text-zinc-500 mb-2">
                                        <Coins size={14} />
                                        <span className="text-xs uppercase tracking-wider">Supply</span>
                                    </div>
                                    <div className="text-2xl font-bold font-mono text-white">
                                        {(auction.tokenSupply / LAMPORTS_PER_SOL).toLocaleString()}
                                    </div>
                                </div>
                                <div className="p-5 rounded-2xl bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/5">
                                    <div className="flex items-center gap-2 text-zinc-500 mb-2">
                                        <Users size={14} />
                                        <span className="text-xs uppercase tracking-wider">Bids</span>
                                    </div>
                                    <div className="text-2xl font-bold font-mono text-white">{auction.totalBids}</div>
                                </div>
                                <div className="p-5 rounded-2xl bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/5">
                                    <div className="flex items-center gap-2 text-zinc-500 mb-2">
                                        <TrendingUp size={14} />
                                        <span className="text-xs uppercase tracking-wider">Min Bid</span>
                                    </div>
                                    <div className="text-2xl font-bold font-mono text-white">0.1 SOL</div>
                                </div>
                                <PressureGauge
                                    currentBids={auction.totalBids || 0}
                                    targetVolume={Math.max(auction.tokenSupply / 1000, 10)}
                                    label="Pressure"
                                />
                            </div>

                            {/* Security Features */}
                            <div className="p-6 rounded-2xl bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/5">
                                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                                    <Shield size={18} className="text-emerald-400" />
                                    Security Guarantees
                                </h3>
                                <div className="grid md:grid-cols-3 gap-4">
                                    <div className="flex items-start gap-3">
                                        <Lock size={16} className="text-violet-400 mt-0.5 flex-shrink-0" />
                                        <div>
                                            <div className="font-medium text-sm mb-1">Sealed Bids</div>
                                            <div className="text-xs text-zinc-500">Amounts hidden until reveal</div>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-3">
                                        <Eye size={16} className="text-violet-400 mt-0.5 flex-shrink-0" />
                                        <div>
                                            <div className="font-medium text-sm mb-1">ZK Identity</div>
                                            <div className="text-xs text-zinc-500">Prove eligibility privately</div>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-3">
                                        <CheckCircle2 size={16} className="text-violet-400 mt-0.5 flex-shrink-0" />
                                        <div>
                                            <div className="font-medium text-sm mb-1">On-Chain Verified</div>
                                            <div className="text-xs text-zinc-500">Groth16 proof validation</div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Whitelist Status */}
                            <div className="p-6 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-green-500/5 border border-emerald-500/20">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                                            <Sparkles size={24} className="text-emerald-400" />
                                        </div>
                                        <div>
                                            <div className="text-xs text-emerald-400 uppercase tracking-wider mb-1">Whitelist Status</div>
                                            <div className="text-lg font-bold text-white">Eligible to Bid</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse" />
                                        <span className="text-sm font-bold text-emerald-400">VERIFIED</span>
                                    </div>
                                </div>
                            </div>
                        </motion.div>

                        {/* Right Column: Actions */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.2 }}
                            className="space-y-6"
                        >
                            {!connected ? (
                                <div className="p-8 rounded-3xl bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/5 text-center">
                                    <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-6">
                                        <Lock size={32} className="text-zinc-600" />
                                    </div>
                                    <h3 className="text-xl font-bold mb-3">Connect to Participate</h3>
                                    <p className="text-zinc-500 text-sm mb-6">
                                        Connect your wallet to place bids in this auction.
                                    </p>
                                    <WalletMultiButton className="!bg-gradient-to-r !from-violet-600 !to-purple-600 !text-white !font-bold !rounded-xl !h-12 !px-8 !w-full !justify-center" />
                                </div>
                            ) : auction.status === "active" ? (
                                <BidForm
                                    auctionAddress={auction.address}
                                    projectMint={auction.projectMint}
                                    paymentMint={auction.paymentMint}
                                />
                            ) : auction.status === "revealing" ? (
                                <RevealAction auctionAddress={auction.address} />
                            ) : (
                                <div className="p-8 rounded-3xl bg-gradient-to-br from-blue-500/10 to-cyan-500/5 border border-blue-500/20 text-center">
                                    <div className="w-16 h-16 rounded-2xl bg-blue-500/20 flex items-center justify-center mx-auto mb-6">
                                        <CheckCircle2 size={32} className="text-blue-400" />
                                    </div>
                                    <h3 className="text-xl font-bold mb-2 text-white">Auction Settled</h3>
                                    <p className="text-zinc-500 text-sm">
                                        This auction has been finalized. Winners have received their allocations.
                                    </p>
                                </div>
                            )}

                            {/* Activity Indicator */}
                            <div className="p-4 rounded-xl bg-white/5 border border-white/5 flex items-center gap-3">
                                <Activity size={16} className="text-violet-400 animate-pulse" />
                                <span className="text-xs text-zinc-500">Live updates every 5 seconds</span>
                            </div>
                        </motion.div>
                    </div>
                </div>
            </div>

            <Shoutbox auctionAddress={Array.isArray(params.id) ? params.id[0] : (params.id || "")} />
        </main>
    );
}

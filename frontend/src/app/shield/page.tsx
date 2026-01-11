"use client";

import { useState, useEffect, useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import Link from "next/link";
import { LAMPORTS_PER_SOL, VersionedTransaction } from "@solana/web3.js";
import { PrivacyCash } from "@/lib/privacycash";
import { USDC_MINT } from "@/lib/privacycash/utils/constants";
import { motion, AnimatePresence } from "framer-motion";
import {
    Shield, Lock, Wallet, ArrowRightLeft, Loader2,
    ArrowUpRight, ArrowDownLeft, ShieldCheck, Zap,
    History, Info, RefreshCw, Key, Fingerprint
} from "lucide-react";
import clsx from "clsx";

type AssetType = "SOL" | "USDC";

export default function ShieldPage() {
    const { connection } = useConnection();
    const { publicKey, signMessage, signTransaction, connected } = useWallet();
    const [activeTab, setActiveTab] = useState<"deposit" | "withdraw">("deposit");
    const [asset, setAsset] = useState<AssetType>("SOL");
    const [amount, setAmount] = useState("");
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState("");

    // Privacy Cash State
    const [privacyCash, setPrivacyCash] = useState<PrivacyCash | null>(null);
    const [isInitialized, setIsInitialized] = useState(false);

    // Balances
    const [publicSolDelay, setPublicSolDelay] = useState(0);
    const [publicSolBalance, setPublicSolBalance] = useState(0);
    const [privateSolBalance, setPrivateSolBalance] = useState(0);
    const [privateUsdcBalance, setPrivateUsdcBalance] = useState(0);

    // Initialize SDK
    useEffect(() => {
        if (connected && publicKey && signTransaction) {
            try {
                const sdk = new PrivacyCash({
                    RPC_url: connection.rpcEndpoint,
                    owner: publicKey,
                    signTransaction: async (tx: VersionedTransaction) => {
                        const signed = await signTransaction(tx);
                        return signed;
                    }
                });
                setPrivacyCash(sdk);
            } catch (e) {
                console.error("Failed to init SDK:", e);
            }
        } else {
            setPrivacyCash(null);
            setIsInitialized(false);
            setPrivateSolBalance(0);
            setPrivateUsdcBalance(0);
        }
    }, [connected, publicKey, signTransaction, connection.rpcEndpoint]);

    // Fetch Public SOL Balance
    useEffect(() => {
        if (publicKey) {
            connection.getBalance(publicKey).then(bal => setPublicSolBalance(bal / LAMPORTS_PER_SOL));
        } else {
            setPublicSolBalance(0);
        }
    }, [publicKey, connection, publicSolDelay]);

    // Fetch Private Balances
    const fetchPrivateBalances = useCallback(async () => {
        if (!privacyCash || !isInitialized) return;

        try {
            const solBal = await privacyCash.getPrivateBalance();
            setPrivateSolBalance(solBal.lamports / LAMPORTS_PER_SOL);

            const usdcBal = await privacyCash.getPrivateBalanceSPL(USDC_MINT);
            setPrivateUsdcBalance(usdcBal.amount);
        } catch (e) {
            console.error("Error fetching private balances", e);
        }
    }, [privacyCash, isInitialized]);

    useEffect(() => {
        if (isInitialized) {
            fetchPrivateBalances();
            const interval = setInterval(fetchPrivateBalances, 10000);
            return () => clearInterval(interval);
        }
    }, [isInitialized, fetchPrivateBalances]);

    const handleInitialize = async () => {
        if (!privacyCash || !signMessage) return;
        setLoading(true);
        setStatus("Constructing ZK Identity...");
        try {
            await privacyCash.init(async (msg) => {
                return await signMessage(msg);
            });
            setIsInitialized(true);
            setStatus("");
        } catch (e: any) {
            console.error(e);
            setStatus("Authorization failed: " + e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleAction = async () => {
        if (!privacyCash || !amount || parseFloat(amount) <= 0) return;

        setLoading(true);
        setStatus("Generating ZK Proof...");

        try {
            const val = parseFloat(amount);
            let txSignature = "";

            if (activeTab === "deposit") {
                if (asset === "SOL") {
                    const lamports = Math.floor(val * LAMPORTS_PER_SOL);
                    const res = await privacyCash.deposit({ amount: lamports });
                    txSignature = res.tx;
                } else {
                    const res = await privacyCash.depositSPL({ amount: val, mint: USDC_MINT });
                    txSignature = res.tx;
                }
            } else {
                if (asset === "SOL") {
                    const lamports = Math.floor(val * LAMPORTS_PER_SOL);
                    const res = await privacyCash.withdraw({ amount: lamports, recipient: publicKey! });
                    txSignature = res.tx;
                } else {
                    const res = await privacyCash.withdrawSPL({ amount: val, mint: USDC_MINT, recipient: publicKey! });
                    txSignature = res.tx;
                }
            }

            setStatus("Transaction Verified!");
            setPublicSolDelay(d => d + 1);
            await fetchPrivateBalances();
            setAmount("");
        } catch (e: any) {
            console.error(e);
            setStatus("Shield error: " + e.message);
        } finally {
            setLoading(false);
            setTimeout(() => setStatus(""), 5000);
        }
    };

    return (
        <main className="min-h-screen bg-[#030303] text-zinc-100 selection:bg-violet-500/30 font-sans tracking-tight overflow-x-hidden">
            {/* Animated Grid Background */}
            <div className="fixed inset-0 pointer-events-none z-0">
                <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:60px_60px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]" />
                <div className="absolute top-[-10%] right-[-5%] w-[50%] h-[50%] bg-violet-600/5 rounded-full blur-[120px]" />
                <div className="absolute bottom-[10%] left-[-5%] w-[40%] h-[40%] bg-blue-600/5 rounded-full blur-[100px]" />
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
                        <Link href="/auctions" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">Auctions</Link>
                        <Link href="/shield" className="text-sm font-medium text-white">Shield</Link>
                        <Link href="/admin" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">Dashboard</Link>
                    </nav>
                    <WalletMultiButton className="!bg-white/5 hover:!bg-white/10 !border !border-white/10 !rounded-full !h-10 !px-5 !text-sm !font-medium" />
                </div>
            </header>

            <div className="pt-32 pb-20 px-6 relative z-10 flex flex-col items-center">
                <div className="max-w-lg w-full">

                    {/* Hero Section */}
                    <div className="text-center mb-12">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-violet-500/10 border border-violet-500/20 text-[10px] font-black uppercase tracking-widest text-violet-400 mb-6"
                        >
                            <ShieldCheck size={14} />
                            <span>ZK Asset Protection</span>
                        </motion.div>
                        <motion.h1
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="text-4xl md:text-5xl font-bold tracking-tight mb-4"
                        >
                            The <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-purple-400">Shield</span>
                        </motion.h1>
                        <motion.p
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="text-zinc-500"
                        >
                            Shield your assets from public eyes. Perform private bidding <br /> and anonymous settlement using Light Protocol.
                        </motion.p>
                    </div>

                    <AnimatePresence mode="wait">
                        {!connected ? (
                            <motion.div
                                key="connect"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                className="p-8 rounded-3xl bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/5 text-center shadow-2xl"
                            >
                                <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-6">
                                    <Wallet size={32} className="text-zinc-600" />
                                </div>
                                <h3 className="text-xl font-bold mb-3">Connect Wallet</h3>
                                <p className="text-zinc-500 text-sm mb-8">Access your private vault and shield assets across the Darkpool network.</p>
                                <WalletMultiButton className="!bg-white !text-black !font-bold !rounded-xl !h-12 !px-8 !w-full !justify-center shadow-lg shadow-white/10" />
                            </motion.div>
                        ) : !isInitialized ? (
                            <motion.div
                                key="init"
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="p-8 rounded-3xl bg-gradient-to-br from-violet-600/10 to-transparent border border-violet-500/20 relative overflow-hidden text-center shadow-2xl"
                            >
                                <div className="absolute inset-0 bg-violet-500/5 animate-pulse" />
                                <div className="w-16 h-16 rounded-2xl bg-violet-500/20 flex items-center justify-center mx-auto mb-6 relative z-10">
                                    <Fingerprint size={32} className="text-violet-400" />
                                </div>
                                <h3 className="text-xl font-bold mb-2 relative z-10 text-white">Derive Identity</h3>
                                <p className="text-zinc-400 text-sm mb-8 relative z-10">Sign a message to construct your pseudo-anonymous ZK identity.</p>
                                <button
                                    onClick={handleInitialize}
                                    disabled={loading}
                                    className="relative z-10 w-full py-4 bg-white text-black font-bold uppercase tracking-widest rounded-xl hover:bg-zinc-200 transition-all disabled:opacity-50 flex items-center justify-center gap-3 shadow-lg shadow-white/10"
                                >
                                    {loading ? (
                                        <>
                                            <Loader2 size={18} className="animate-spin" />
                                            Authorizing...
                                        </>
                                    ) : (
                                        <>
                                            <Key size={18} />
                                            Unlock Private Vault
                                        </>
                                    )}
                                </button>
                                {status && <p className="mt-4 text-xs text-red-400 font-mono relative z-10">{status}</p>}
                            </motion.div>
                        ) : (
                            <motion.div
                                key="main"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="space-y-6"
                            >
                                {/* Balance Summary */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="p-5 rounded-2xl bg-white/5 border border-white/5">
                                        <div className="flex items-center gap-2 text-zinc-500 mb-2">
                                            <Wallet size={12} />
                                            <span className="text-[10px] uppercase font-bold tracking-widest">Public</span>
                                        </div>
                                        <div className="flex items-baseline gap-2">
                                            <span className="text-2xl font-bold font-mono text-zinc-200">{publicSolBalance.toFixed(2)}</span>
                                            <span className="text-[10px] font-bold text-zinc-500 uppercase">SOL</span>
                                        </div>
                                    </div>
                                    <div className="p-5 rounded-2xl bg-gradient-to-br from-violet-500/10 to-purple-500/5 border border-violet-500/10 relative overflow-hidden group">
                                        <div className="absolute inset-0 bg-violet-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                                        <div className="flex items-center gap-2 text-violet-400 mb-2">
                                            <Lock size={12} />
                                            <span className="text-[10px] uppercase font-bold tracking-widest">Shielded</span>
                                        </div>
                                        <div className="flex items-baseline gap-2 relative z-10">
                                            <span className="text-2xl font-bold font-mono text-white">
                                                {asset === "SOL" ? privateSolBalance.toFixed(2) : privateUsdcBalance.toFixed(2)}
                                            </span>
                                            <span className="text-[10px] font-bold text-violet-400 uppercase">{asset}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Main Interaction Card */}
                                <div className="p-8 rounded-3xl bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/5 shadow-2xl">
                                    {/* Tabs */}
                                    <div className="flex p-1 bg-black/50 rounded-2xl border border-white/5 mb-8 relative">
                                        <button
                                            onClick={() => setActiveTab("deposit")}
                                            className={clsx(
                                                "flex-1 py-3 text-xs font-bold uppercase tracking-widest rounded-xl transition-all relative z-10",
                                                activeTab === "deposit" ? "text-black" : "text-zinc-500 hover:text-zinc-300"
                                            )}
                                        >
                                            Deposit
                                        </button>
                                        <button
                                            onClick={() => setActiveTab("withdraw")}
                                            className={clsx(
                                                "flex-1 py-3 text-xs font-bold uppercase tracking-widest rounded-xl transition-all relative z-10",
                                                activeTab === "withdraw" ? "text-black" : "text-zinc-500 hover:text-zinc-300"
                                            )}
                                        >
                                            Withdraw
                                        </button>
                                        <motion.div
                                            className="absolute top-1 bottom-1 bg-white rounded-xl shadow-lg"
                                            initial={false}
                                            animate={{
                                                left: activeTab === "deposit" ? "4px" : "50%",
                                                width: "calc(50% - 4px)",
                                            }}
                                            transition={{ type: "spring", stiffness: 400, damping: 30 }}
                                        />
                                    </div>

                                    {/* Input Section */}
                                    <div className="space-y-6">
                                        {/* Asset Selector */}
                                        <div className="flex gap-2">
                                            {["SOL", "USDC"].map((t) => (
                                                <button
                                                    key={t}
                                                    onClick={() => setAsset(t as AssetType)}
                                                    className={clsx(
                                                        "flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all",
                                                        asset === t
                                                            ? "bg-violet-500/20 border-violet-500/30 text-violet-400"
                                                            : "bg-white/5 border-white/5 text-zinc-500 hover:text-zinc-300"
                                                    )}
                                                >
                                                    {t}
                                                </button>
                                            ))}
                                        </div>

                                        {/* Amount Field */}
                                        <div className="relative">
                                            <input
                                                type="number"
                                                value={amount}
                                                onChange={(e) => setAmount(e.target.value)}
                                                placeholder="0.00"
                                                disabled={loading}
                                                className="w-full bg-black/50 border border-white/10 rounded-2xl py-6 px-6 text-4xl font-mono font-bold text-white placeholder:text-zinc-800 focus:outline-none focus:border-violet-500/50 transition-all text-center"
                                            />
                                            <button
                                                onClick={() => setAmount((activeTab === "deposit" ? publicSolBalance : privateSolBalance).toString())}
                                                className="absolute right-4 top-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-[10px] font-black uppercase tracking-widest text-zinc-500 transition-all"
                                            >
                                                Max
                                            </button>
                                        </div>

                                        {/* Info Message */}
                                        <div className="flex items-center gap-3 p-4 rounded-xl bg-blue-500/5 border border-blue-500/10 text-[11px] text-zinc-500 leading-relaxed">
                                            <Info size={14} className="text-blue-400 flex-shrink-0" />
                                            <span>Private transactions require generating a zero-knowledge proof which may take 5-10 seconds.</span>
                                        </div>

                                        {/* Submit Action */}
                                        <button
                                            onClick={handleAction}
                                            disabled={loading || !amount}
                                            className={clsx(
                                                "w-full py-5 rounded-2xl font-black uppercase tracking-[0.2em] text-sm transition-all shadow-lg flex items-center justify-center gap-3",
                                                loading
                                                    ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                                                    : "bg-gradient-to-r from-violet-600 to-purple-600 text-white hover:from-violet-500 hover:to-purple-500 shadow-violet-500/20"
                                            )}
                                        >
                                            {loading ? (
                                                <>
                                                    <Loader2 size={18} className="animate-spin" />
                                                    {status || "Protecting..."}
                                                </>
                                            ) : (
                                                <>
                                                    {activeTab === "deposit" ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
                                                    {activeTab === "deposit" ? "Shield Assets" : "Withdraw to Wallet"}
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>

                                {/* Network Status */}
                                <div className="flex items-center justify-center gap-6 py-4">
                                    <div className="flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Privacy Pool Active</span>
                                    </div>
                                    <div className="h-4 w-px bg-white/5" />
                                    <Link href="/history" className="flex items-center gap-2 group">
                                        <History size={12} className="text-zinc-600 group-hover:text-zinc-400 transition-colors" />
                                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest group-hover:text-zinc-400 transition-colors">Shield History</span>
                                    </Link>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </main>
    );
}

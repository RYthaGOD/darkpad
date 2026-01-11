"use client";

import { useState, useEffect } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import {
    PublicKey,
    SystemProgram,
    Keypair,
    Transaction,
} from "@solana/web3.js";
import {
    getAssociatedTokenAddress,
    createAssociatedTokenAccountInstruction,
    createInitializeMintInstruction,
    createMintToInstruction,
    TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { BN, AnchorProvider } from "@coral-xyz/anchor";
import {
    getProvider,
    getLaunchpadProgram,
    deriveAuctionPDA,
    derivePaymentVaultPDA,
    deriveProjectVaultPDA
} from "@/lib/program";
import { motion } from "framer-motion";
import Link from "next/link";
import {
    Plus, Database, Settings, CheckCircle2, AlertCircle,
    Rocket, LayoutDashboard, Gavel, Timer, TrendingUp,
    Play, Square, DollarSign, RefreshCw, ExternalLink,
    Shield, Activity, Zap
} from "lucide-react";

export default function AdminPage() {
    const { connection } = useConnection();
    const { publicKey, sendTransaction, signTransaction } = useWallet();

    // Form State
    const [projectMint, setProjectMint] = useState("");
    const [paymentMint, setPaymentMint] = useState("So11111111111111111111111111111111111111112");
    const [supply, setSupply] = useState("1000000");
    const [merkleRoot, setMerkleRoot] = useState("0000000000000000000000000000000000000000000000000000000000000000");
    const [endTime, setEndTime] = useState("24");

    // Feedback
    const [status, setStatus] = useState("");
    const [error, setError] = useState("");
    const [createdAuction, setCreatedAuction] = useState<string | null>(null);

    // Management State
    const [auctions, setAuctions] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState<"create" | "manage">("create");

    // Stats
    const [stats, setStats] = useState({
        total: 0,
        active: 0,
        revealing: 0,
        settled: 0
    });

    // Create Mock Token
    const createMockToken = async () => {
        if (!publicKey || !signTransaction) return;
        setStatus("Creating Mock Project Token...");
        setError("");

        try {
            const mintKeypair = Keypair.generate();
            const mint = mintKeypair.publicKey;
            const lamports = await connection.getMinimumBalanceForRentExemption(82);

            const userAta = await getAssociatedTokenAddress(
                mint,
                publicKey,
                false,
                TOKEN_2022_PROGRAM_ID
            );

            const transaction = new Transaction();

            transaction.add(
                SystemProgram.createAccount({
                    fromPubkey: publicKey,
                    newAccountPubkey: mint,
                    space: 82,
                    lamports,
                    programId: TOKEN_2022_PROGRAM_ID,
                })
            );

            transaction.add(
                createInitializeMintInstruction(
                    mint,
                    9,
                    publicKey,
                    publicKey,
                    TOKEN_2022_PROGRAM_ID
                )
            );

            transaction.add(
                createAssociatedTokenAccountInstruction(
                    publicKey,
                    userAta,
                    publicKey,
                    mint,
                    TOKEN_2022_PROGRAM_ID
                )
            );

            transaction.add(
                createMintToInstruction(
                    mint,
                    userAta,
                    publicKey,
                    1_000_000 * 1e9,
                    [],
                    TOKEN_2022_PROGRAM_ID
                )
            );

            const signature = await sendTransaction(transaction, connection, {
                signers: [mintKeypair]
            });

            await connection.confirmTransaction(signature, "confirmed");

            setProjectMint(mint.toBase58());
            setStatus(`Token Created: ${mint.toBase58().slice(0, 8)}...`);
        } catch (e: any) {
            console.error(e);
            setError("Failed: " + e.message);
        }
    };

    // Initialize Auction
    const handleInitialize = async () => {
        if (!publicKey) return;
        setStatus("Initializing Auction...");
        setError("");
        setCreatedAuction(null);

        try {
            const provider = getProvider(connection, { publicKey, signTransaction, signAllTransactions: async (t: any) => t } as any);
            const program = getLaunchpadProgram(provider);

            const projectMintPubkey = new PublicKey(projectMint);
            const paymentMintPubkey = new PublicKey(paymentMint);
            const [auctionPda] = deriveAuctionPDA(projectMintPubkey);

            const supplyBN = new BN(supply).mul(new BN(1e9));
            const endTimeUnix = new BN(Math.floor(Date.now() / 1000) + (Number(endTime) * 3600));
            const rootBytes = Buffer.from(merkleRoot, 'hex');

            if (rootBytes.length !== 32) throw new Error("Invalid Merkle Root");

            await program.methods
                .initializeAuction(Array.from(rootBytes), endTimeUnix, supplyBN)
                .accounts({
                    authority: publicKey,
                    paymentMint: paymentMintPubkey,
                    projectMint: projectMintPubkey,
                    auction: auctionPda,
                    tokenProgram: TOKEN_2022_PROGRAM_ID,
                    systemProgram: SystemProgram.programId,
                })
                .rpc();

            setStatus("Auction Initialized. Setting up Vaults...");

            const [paymentVaultPda] = derivePaymentVaultPDA(auctionPda);
            await program.methods
                .initializePaymentVault()
                .accounts({
                    authority: publicKey,
                    auction: auctionPda,
                    projectMint: projectMintPubkey,
                    paymentMint: paymentMintPubkey,
                    paymentVault: paymentVaultPda,
                    tokenProgram: TOKEN_2022_PROGRAM_ID,
                    systemProgram: SystemProgram.programId,
                })
                .rpc();

            setStatus("Payment Vault Ready. Creating Project Vault...");

            const [projectVaultPda] = deriveProjectVaultPDA(auctionPda);
            await program.methods
                .initializeProjectVault()
                .accounts({
                    authority: publicKey,
                    auction: auctionPda,
                    projectMint: projectMintPubkey,
                    projectVault: projectVaultPda,
                    tokenProgram: TOKEN_2022_PROGRAM_ID,
                    systemProgram: SystemProgram.programId,
                })
                .rpc();

            setCreatedAuction(auctionPda.toBase58());
            setStatus("Auction Created Successfully!");
            fetchAuctions();
        } catch (e: any) {
            console.error(e);
            setError("Failed: " + e.message);
        }
    };

    // Fetch Auctions
    const fetchAuctions = async () => {
        const provider = new AnchorProvider(connection, window.solana as any, {});
        const program = getLaunchpadProgram(provider);

        try {
            const allAccounts = await (program.account.auction as any).all();
            setAuctions(allAccounts);

            // Calculate stats
            let active = 0, revealing = 0, settled = 0;
            allAccounts.forEach((a: any) => {
                const s = Object.keys(a.account.status)[0];
                if (s === 'active') active++;
                else if (s === 'revealing') revealing++;
                else if (s === 'settled') settled++;
            });
            setStats({ total: allAccounts.length, active, revealing, settled });
        } catch (err) {
            console.error("Failed to fetch auctions", err);
        }
    };

    useEffect(() => {
        fetchAuctions();
        const i = setInterval(fetchAuctions, 10000);
        return () => clearInterval(i);
    }, [connection]);

    // End Auction
    const handleEndAuction = async (auction: PublicKey) => {
        if (!publicKey) return;
        setStatus("Ending Auction...");
        try {
            const provider = getProvider(connection, { publicKey, signTransaction, signAllTransactions: async (t: any) => t } as any);
            const program = getLaunchpadProgram(provider);

            await program.methods
                .endAuction()
                .accounts({ authority: publicKey, auction } as any)
                .rpc();

            setStatus("Auction Ended. Now in Reveal Phase.");
            fetchAuctions();
        } catch (e: any) {
            setError("End failed: " + e.message);
        }
    };

    // Settle Auction
    const handleSettleAuction = async (auctionData: any) => {
        if (!publicKey) return;
        setStatus("Settling Auction (Trustless)...");
        try {
            const provider = getProvider(connection, { publicKey, signTransaction, signAllTransactions: async (t: any) => t } as any);
            const program = getLaunchpadProgram(provider);

            const [paymentVault] = derivePaymentVaultPDA(auctionData.publicKey);

            // Titan Upgrade: No arguments needed. Logic is on-chain.
            await program.methods
                .settleAuction()
                .accounts({
                    authority: publicKey,
                    auction: auctionData.publicKey,
                    paymentMint: new PublicKey(paymentMint),
                    paymentVault: paymentVault,
                    protocolTreasury: publicKey,
                    tokenProgram: TOKEN_2022_PROGRAM_ID,
                } as any)
                .rpc();

            setStatus("Auction Settled! (Trustless Verification Complete)");
            fetchAuctions();
        } catch (e: any) {
            setError("Settle failed: " + e.message);
        }
    };

    return (
        <main className="min-h-screen bg-[#030303] text-zinc-100 font-sans">
            {/* Header */}
            <header className="fixed top-0 w-full z-50 backdrop-blur-2xl border-b border-white/5 bg-[#030303]/70">
                <div className="max-w-7xl mx-auto px-6 h-16 flex justify-between items-center">
                    <Link href="/" className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center border border-white/10">
                            <span className="font-bold text-white text-sm">D</span>
                        </div>
                        <span className="font-semibold text-lg">Darkpool</span>
                        <span className="text-xs text-zinc-500 px-2 py-0.5 bg-white/5 rounded-full border border-white/10">Admin</span>
                    </Link>
                    <WalletMultiButton className="!bg-white/5 hover:!bg-white/10 !border !border-white/10 !rounded-full !h-10 !px-5 !text-sm !font-medium" />
                </div>
            </header>

            <div className="pt-24 pb-12 px-6">
                <div className="max-w-7xl mx-auto">
                    {/* Stats Row */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-5 rounded-2xl bg-gradient-to-br from-violet-500/10 to-purple-500/5 border border-white/5">
                            <div className="flex items-center gap-2 text-zinc-500 mb-2">
                                <LayoutDashboard size={14} />
                                <span className="text-xs uppercase tracking-wider">Total Auctions</span>
                            </div>
                            <div className="text-3xl font-bold text-white">{stats.total}</div>
                        </motion.div>
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="p-5 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-green-500/5 border border-white/5">
                            <div className="flex items-center gap-2 text-zinc-500 mb-2">
                                <Activity size={14} />
                                <span className="text-xs uppercase tracking-wider">Active</span>
                            </div>
                            <div className="text-3xl font-bold text-emerald-400">{stats.active}</div>
                        </motion.div>
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="p-5 rounded-2xl bg-gradient-to-br from-amber-500/10 to-orange-500/5 border border-white/5">
                            <div className="flex items-center gap-2 text-zinc-500 mb-2">
                                <Timer size={14} />
                                <span className="text-xs uppercase tracking-wider">Revealing</span>
                            </div>
                            <div className="text-3xl font-bold text-amber-400">{stats.revealing}</div>
                        </motion.div>
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="p-5 rounded-2xl bg-gradient-to-br from-blue-500/10 to-cyan-500/5 border border-white/5">
                            <div className="flex items-center gap-2 text-zinc-500 mb-2">
                                <CheckCircle2 size={14} />
                                <span className="text-xs uppercase tracking-wider">Settled</span>
                            </div>
                            <div className="text-3xl font-bold text-blue-400">{stats.settled}</div>
                        </motion.div>
                    </div>

                    {/* Tab Navigation */}
                    <div className="flex gap-2 mb-8 p-1 bg-white/5 rounded-xl w-fit">
                        <button
                            onClick={() => setActiveTab("create")}
                            className={`px-6 py-3 rounded-lg font-medium text-sm transition-all flex items-center gap-2 ${activeTab === "create" ? "bg-white text-black" : "text-zinc-400 hover:text-white"}`}
                        >
                            <Rocket size={16} /> Create Auction
                        </button>
                        <button
                            onClick={() => setActiveTab("manage")}
                            className={`px-6 py-3 rounded-lg font-medium text-sm transition-all flex items-center gap-2 ${activeTab === "manage" ? "bg-white text-black" : "text-zinc-400 hover:text-white"}`}
                        >
                            <Gavel size={16} /> Manage ({auctions.length})
                        </button>
                    </div>

                    {/* Create Tab */}
                    {activeTab === "create" && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid lg:grid-cols-2 gap-8">
                            {/* Form */}
                            <div className="p-8 rounded-3xl bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/5">
                                <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
                                    <Database size={24} className="text-violet-400" />
                                    Auction Parameters
                                </h2>

                                <div className="space-y-5">
                                    <div>
                                        <label className="block text-xs uppercase tracking-widest text-zinc-500 mb-2">Project Token Mint</label>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={projectMint}
                                                onChange={(e) => setProjectMint(e.target.value)}
                                                className="flex-1 bg-black/50 border border-white/10 p-4 rounded-xl text-sm text-white font-mono focus:border-violet-500/50 focus:outline-none transition-colors"
                                                placeholder="Token mint address..."
                                            />
                                            <button
                                                onClick={createMockToken}
                                                className="px-4 border border-white/10 rounded-xl text-xs uppercase tracking-widest text-zinc-400 hover:bg-white/5 hover:text-white transition-all flex items-center gap-2"
                                            >
                                                <Zap size={14} /> Mock
                                            </button>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-xs uppercase tracking-widest text-zinc-500 mb-2">Payment Mint</label>
                                        <input
                                            type="text"
                                            value={paymentMint}
                                            onChange={(e) => setPaymentMint(e.target.value)}
                                            className="w-full bg-black/50 border border-white/10 p-4 rounded-xl text-sm text-white font-mono focus:border-violet-500/50 focus:outline-none transition-colors"
                                        />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs uppercase tracking-widest text-zinc-500 mb-2">Token Supply</label>
                                            <input
                                                type="number"
                                                value={supply}
                                                onChange={(e) => setSupply(e.target.value)}
                                                className="w-full bg-black/50 border border-white/10 p-4 rounded-xl text-sm text-white font-mono focus:border-violet-500/50 focus:outline-none transition-colors"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs uppercase tracking-widest text-zinc-500 mb-2">Duration (Hours)</label>
                                            <input
                                                type="number"
                                                value={endTime}
                                                onChange={(e) => setEndTime(e.target.value)}
                                                className="w-full bg-black/50 border border-white/10 p-4 rounded-xl text-sm text-white font-mono focus:border-violet-500/50 focus:outline-none transition-colors"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-xs uppercase tracking-widest text-zinc-500 mb-2">Merkle Root (Whitelist)</label>
                                        <input
                                            type="text"
                                            value={merkleRoot}
                                            onChange={(e) => setMerkleRoot(e.target.value)}
                                            className="w-full bg-black/50 border border-white/10 p-4 rounded-xl text-sm text-white font-mono focus:border-violet-500/50 focus:outline-none transition-colors"
                                            placeholder="64-char hex..."
                                        />
                                    </div>

                                    <button
                                        onClick={handleInitialize}
                                        disabled={!publicKey || !projectMint}
                                        className="w-full py-5 bg-gradient-to-r from-violet-600 to-purple-600 text-white font-bold uppercase tracking-widest hover:from-violet-500 hover:to-purple-500 transition-all rounded-xl flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-violet-500/20"
                                    >
                                        <Rocket size={20} /> Launch Auction
                                    </button>
                                </div>
                            </div>

                            {/* Status Panel */}
                            <div className="space-y-6">
                                <div className="p-8 rounded-3xl bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/5">
                                    <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                                        <Activity size={20} /> Status
                                    </h2>

                                    {status && (
                                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="p-4 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-xl text-sm mb-4 flex items-center gap-3">
                                            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
                                            {status}
                                        </motion.div>
                                    )}

                                    {error && (
                                        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-sm mb-4 flex items-center gap-3">
                                            <AlertCircle size={16} />
                                            {error}
                                        </motion.div>
                                    )}

                                    {createdAuction && (
                                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="p-6 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                                            <div className="flex items-center gap-2 font-bold text-emerald-400 mb-3">
                                                <CheckCircle2 size={18} /> Auction Created!
                                            </div>
                                            <div className="font-mono text-xs text-zinc-400 break-all mb-4">{createdAuction}</div>
                                            <Link
                                                href={`/auctions/${createdAuction}`}
                                                className="inline-flex items-center gap-2 text-sm text-emerald-400 hover:text-emerald-300 transition-colors"
                                            >
                                                View Auction <ExternalLink size={14} />
                                            </Link>
                                        </motion.div>
                                    )}

                                    {!status && !error && !createdAuction && (
                                        <div className="text-center py-12 text-zinc-600">
                                            <Settings size={32} className="mx-auto mb-3 opacity-30" />
                                            <p className="text-sm">Ready to launch</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* Manage Tab */}
                    {activeTab === "manage" && (
                        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-2xl font-bold">Active Auctions</h2>
                                <button onClick={fetchAuctions} className="p-2 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white transition-colors">
                                    <RefreshCw size={18} />
                                </button>
                            </div>

                            {auctions.length === 0 ? (
                                <div className="p-12 rounded-3xl bg-white/5 border border-white/5 text-center">
                                    <Gavel size={48} className="mx-auto mb-4 text-zinc-700" />
                                    <p className="text-zinc-500">No auctions found</p>
                                </div>
                            ) : (
                                auctions.map((a, i) => {
                                    const statusStr = Object.keys(a.account.status)[0];
                                    const isEnded = Date.now() / 1000 > a.account.endTime.toNumber();

                                    return (
                                        <motion.div
                                            key={a.publicKey.toBase58()}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: i * 0.05 }}
                                            className="p-6 rounded-2xl bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/5 hover:border-white/10 transition-all"
                                        >
                                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-3 mb-2">
                                                        <span className={`px-3 py-1 text-xs uppercase tracking-widest font-bold rounded-full ${statusStr === 'active' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                                                            statusStr === 'revealing' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                                                                'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20'
                                                            }`}>
                                                            {statusStr}
                                                        </span>
                                                        {isEnded && statusStr === 'active' && (
                                                            <span className="px-2 py-1 text-[10px] uppercase tracking-widest bg-red-500/10 text-red-400 border border-red-500/20 rounded-full font-bold">
                                                                Expired
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="font-mono text-sm text-zinc-400 mb-2">{a.publicKey.toBase58()}</div>
                                                    <div className="flex gap-6 text-sm">
                                                        <span className="text-zinc-500">Bids: <span className="text-white font-medium">{a.account.totalBids.toString()}</span></span>
                                                        <span className="text-zinc-500">Revealed: <span className="text-white font-medium">{a.account.totalRevealed.toString()}</span></span>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-3">
                                                    {statusStr === 'active' && (
                                                        <button
                                                            onClick={() => handleEndAuction(a.publicKey)}
                                                            className="px-5 py-3 bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500 hover:text-white transition-all rounded-xl uppercase text-xs font-bold flex items-center gap-2"
                                                        >
                                                            <Square size={14} /> End
                                                        </button>
                                                    )}

                                                    {statusStr === 'revealing' && (
                                                        <div className="flex items-center gap-3">
                                                            <button
                                                                onClick={() => handleSettleAuction(a)}
                                                                className="px-5 py-3 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500 hover:text-white transition-all rounded-xl uppercase text-xs font-bold flex items-center gap-2"
                                                            >
                                                                <Play size={14} /> Settle (Trustless)
                                                            </button>
                                                        </div>
                                                    )}

                                                    <Link
                                                        href={`/auctions/${a.publicKey.toBase58()}`}
                                                        className="p-3 rounded-xl border border-white/10 hover:bg-white/5 transition-colors text-zinc-400 hover:text-white"
                                                    >
                                                        <ExternalLink size={16} />
                                                    </Link>
                                                </div>
                                            </div>
                                        </motion.div>
                                    );
                                })
                            )}
                        </motion.div>
                    )}
                </div>
            </div>
        </main>
    );
}

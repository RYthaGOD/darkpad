"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Shield, Lock, ArrowRight, Zap, Eye, Github, Twitter,
  CheckCircle2, TrendingUp, Users, Clock, Sparkles,
  ShieldCheck, Fingerprint, BarChart3
} from "lucide-react";
import DarkLordLeaderboard from "@/components/DarkLordLeaderboard";

export default function Home() {
  const { connected } = useWallet();

  const fadeInUp = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] }
  };

  const stagger = {
    animate: {
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const stats = [
    { label: "Total Volume", value: "$12.4M", icon: TrendingUp },
    { label: "Active Auctions", value: "23", icon: BarChart3 },
    { label: "Verified Bidders", value: "1,247", icon: Users },
    { label: "Avg Settlement", value: "< 2min", icon: Clock },
  ];

  const capabilities = [
    {
      icon: Fingerprint,
      title: "Zero-Knowledge Identity",
      description: "Prove whitelist membership without revealing your wallet. Your identity stays private, always.",
      gradient: "from-violet-500/20 to-purple-500/20"
    },
    {
      icon: Lock,
      title: "Sealed Bid Auctions",
      description: "Bid amounts are cryptographically committed. No front-running, no whale games, just fair price discovery.",
      gradient: "from-blue-500/20 to-cyan-500/20"
    },
    {
      icon: Zap,
      title: "Yield-Bearing Deposits",
      description: "Your locked capital earns yield through integrated liquid staking. Never let your SOL sit idle.",
      gradient: "from-amber-500/20 to-orange-500/20"
    },
    {
      icon: ShieldCheck,
      title: "Groth16 Verification",
      description: "Production-grade ZK proofs verified on-chain using Solana's native BN254 syscalls. Trustless by design.",
      gradient: "from-emerald-500/20 to-green-500/20"
    },
  ];

  return (
    <main className="min-h-screen bg-[#030303] text-zinc-100 selection:bg-white/20 font-sans tracking-tight overflow-x-hidden">

      {/* Animated Grid Background */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:60px_60px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]" />
        <div className="absolute top-[-20%] right-[-10%] w-[60%] h-[60%] bg-gradient-to-br from-violet-500/8 via-purple-500/5 to-transparent rounded-full blur-[100px] animate-pulse" style={{ animationDuration: '8s' }} />
        <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-gradient-to-tr from-blue-500/8 via-cyan-500/5 to-transparent rounded-full blur-[100px] animate-pulse" style={{ animationDuration: '12s' }} />
      </div>

      {/* Header */}
      <motion.header
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="fixed top-0 w-full z-50 backdrop-blur-2xl border-b border-white/5 bg-[#030303]/70"
      >
        <div className="max-w-7xl mx-auto px-6 h-16 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center border border-white/10 shadow-lg group-hover:border-white/20 transition-all">
              <span className="font-bold text-white text-sm">D</span>
            </div>
            <span className="font-semibold text-lg tracking-tight">Darkpool</span>
          </Link>

          <nav className="hidden md:flex items-center gap-8">
            <Link href="/auctions" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">
              Auctions
            </Link>
            <Link href="/shield" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">
              Shield
            </Link>
            <Link href="/admin" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">
              Dashboard
            </Link>
            <a href="https://github.com/RYthaGOD/darkpad" target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-zinc-400 hover:text-white transition-colors">
              Docs
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-medium text-emerald-400">Live on Devnet</span>
            </div>
            <WalletMultiButton className="!bg-white/5 hover:!bg-white/10 !border !border-white/10 !rounded-full !h-10 !px-5 !text-sm !font-medium !text-zinc-200 !transition-all !backdrop-blur-md" />
          </div>
        </div>
      </motion.header>

      {/* Hero Section */}
      <section className="pt-40 pb-24 px-6 relative z-10">
        <motion.div
          initial="initial"
          animate="animate"
          variants={stagger}
          className="max-w-5xl mx-auto text-center"
        >
          {/* Badge */}
          <motion.div variants={fadeInUp} className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-white/5 to-white/10 border border-white/10 text-sm font-medium text-zinc-300 mb-8 backdrop-blur-sm">
            <Sparkles size={14} className="text-amber-400" />
            <span>Powered by Noir & Groth16</span>
            <div className="w-px h-4 bg-white/20" />
            <span className="text-emerald-400">Audited</span>
          </motion.div>

          {/* Headline */}
          <motion.h1 variants={fadeInUp} className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-tight leading-[1.1] mb-6">
            <span className="text-transparent bg-clip-text bg-gradient-to-b from-white via-white to-white/60">Private Token Launches</span>
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 via-purple-400 to-blue-400">Without Compromise</span>
          </motion.h1>

          {/* Subheadline */}
          <motion.p variants={fadeInUp} className="text-lg sm:text-xl text-zinc-400 max-w-2xl mx-auto leading-relaxed mb-10">
            Institutional-grade sealed bid auctions with zero-knowledge identity verification.
            Eliminate front-running, protect your strategies, and participate anonymously.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div variants={fadeInUp} className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
            <Link href="/auctions" className="group px-8 py-4 rounded-full bg-white text-black font-semibold hover:bg-zinc-100 transition-all flex items-center justify-center gap-2 shadow-lg shadow-white/10">
              Enter Auctions
              <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link href="/shield" className="px-8 py-4 rounded-full bg-white/5 border border-white/10 text-white font-medium hover:bg-white/10 hover:border-white/20 transition-all flex items-center justify-center gap-2 backdrop-blur-md">
              <Shield size={16} />
              Shield Assets
            </Link>
          </motion.div>

          {/* Trust Stats */}
          <motion.div
            variants={fadeInUp}
            className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto"
          >
            {stats.map((stat, i) => (
              <div key={i} className="p-4 rounded-2xl bg-white/5 border border-white/5 backdrop-blur-sm">
                <div className="flex items-center gap-2 text-zinc-500 mb-2">
                  <stat.icon size={14} />
                  <span className="text-xs font-medium uppercase tracking-wider">{stat.label}</span>
                </div>
                <div className="text-2xl font-bold text-white">{stat.value}</div>
              </div>
            ))}
          </motion.div>
        </motion.div>
      </section>

      {/* Dark Lord Leaderboard */}
      <DarkLordLeaderboard />

      {/* Capabilities Section */}
      <section className="py-32 px-6 relative z-10">
        <div className="max-w-7xl mx-auto">
          {/* Section Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-white/60">Built for Serious Participants</span>
            </h2>
            <p className="text-zinc-500 max-w-xl mx-auto">
              Every component designed with cryptographic rigor and institutional requirements in mind.
            </p>
          </motion.div>

          {/* Capabilities Grid */}
          <div className="grid md:grid-cols-2 gap-6">
            {capabilities.map((cap, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className={`group p-8 rounded-3xl bg-gradient-to-br ${cap.gradient} border border-white/5 hover:border-white/10 transition-all cursor-default`}
              >
                <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                  <cap.icon size={28} className="text-white/80" />
                </div>
                <h3 className="text-xl font-semibold mb-3 text-white">{cap.title}</h3>
                <p className="text-zinc-400 leading-relaxed">{cap.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-32 px-6 relative z-10 border-t border-white/5">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl sm:text-4xl font-bold mb-4 text-white">How It Works</h2>
            <p className="text-zinc-500">Four steps to private, fair token allocation</p>
          </motion.div>

          <div className="grid md:grid-cols-4 gap-8">
            {[
              { step: "01", title: "Shield", desc: "Deposit SOL into the privacy pool to get shielded assets" },
              { step: "02", title: "Prove", desc: "Generate ZK proof of whitelist membership" },
              { step: "03", title: "Bid", desc: "Submit sealed bid with hidden amount" },
              { step: "04", title: "Claim", desc: "Reveal bid and claim tokens at clearing price" },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="relative"
              >
                <div className="text-6xl font-black text-white/5 absolute -top-4 -left-2">{item.step}</div>
                <div className="pt-8">
                  <h3 className="text-lg font-semibold mb-2 text-white">{item.title}</h3>
                  <p className="text-sm text-zinc-500 leading-relaxed">{item.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Trust Signals */}
      <section className="py-24 px-6 relative z-10 bg-gradient-to-b from-transparent via-white/[0.02] to-transparent">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="p-8 rounded-3xl border border-white/10 bg-white/5 backdrop-blur-sm"
          >
            <div className="flex flex-col md:flex-row items-center gap-8">
              <div className="flex-1">
                <h3 className="text-2xl font-bold mb-3 text-white">Security First Architecture</h3>
                <ul className="space-y-3">
                  {[
                    "Open source smart contracts",
                    "Groth16 proofs with BN254 curve",
                    "No admin keys or backdoors",
                    "Deterministic PDAs for all accounts",
                  ].map((item, i) => (
                    <li key={i} className="flex items-center gap-3 text-zinc-400">
                      <CheckCircle2 size={16} className="text-emerald-500 flex-shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex flex-col gap-4">
                <div className="px-6 py-4 rounded-2xl bg-white/5 border border-white/10 text-center">
                  <div className="text-3xl font-bold text-emerald-400 mb-1">100%</div>
                  <div className="text-xs text-zinc-500 uppercase tracking-wider">On-Chain</div>
                </div>
                <div className="px-6 py-4 rounded-2xl bg-white/5 border border-white/10 text-center">
                  <div className="text-3xl font-bold text-violet-400 mb-1">ZK</div>
                  <div className="text-xs text-zinc-500 uppercase tracking-wider">Verified</div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-32 px-6 relative z-10">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          className="max-w-3xl mx-auto text-center"
        >
          <h2 className="text-4xl sm:text-5xl font-bold mb-6 text-white">
            Ready to Trade Privately?
          </h2>
          <p className="text-xl text-zinc-500 mb-10">
            Join the next generation of fair, anonymous token markets.
          </p>
          <Link href="/auctions" className="inline-flex items-center gap-2 px-10 py-5 rounded-full bg-gradient-to-r from-violet-600 to-purple-600 text-white font-semibold text-lg hover:from-violet-500 hover:to-purple-500 transition-all shadow-lg shadow-violet-500/20">
            Launch App <ArrowRight size={20} />
          </Link>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-white/5 bg-[#020202]">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
              <span className="font-bold text-xs text-white">D</span>
            </div>
            <span className="text-sm text-zinc-500 font-medium">© 2026 Darkpool Protocol</span>
          </div>

          <div className="flex items-center gap-6">
            <a href="https://github.com/RYthaGOD/darkpad" target="_blank" rel="noopener noreferrer" className="p-2 rounded-full hover:bg-white/5 text-zinc-500 hover:text-white transition-colors">
              <Github size={20} />
            </a>
            <a href="#" className="p-2 rounded-full hover:bg-white/5 text-zinc-500 hover:text-white transition-colors">
              <Twitter size={20} />
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}

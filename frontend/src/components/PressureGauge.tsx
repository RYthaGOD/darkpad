"use client";

import { motion } from "framer-motion";
import { Activity, Flame, TrendingUp } from "lucide-react";

interface PressureGaugeProps {
    currentBids: number;
    targetVolume: number;
    label?: string;
}

export default function PressureGauge({ currentBids, targetVolume, label = "Pressure" }: PressureGaugeProps) {
    const percentage = Math.min((currentBids / targetVolume) * 100, 100);

    const getLevel = (p: number) => {
        if (p < 30) return { color: "from-blue-500 to-cyan-500", text: "text-blue-400", label: "Calm" };
        if (p < 70) return { color: "from-amber-500 to-orange-500", text: "text-amber-400", label: "Active" };
        return { color: "from-red-500 to-rose-500", text: "text-red-400", label: "Frenzy" };
    };

    const level = getLevel(percentage);

    return (
        <div className="p-5 rounded-2xl bg-gradient-to-br from-white/5 to-white/[0.02] border border-white/5 relative overflow-hidden">
            {/* Background Glow */}
            <div className={`absolute -right-8 -top-8 w-32 h-32 bg-gradient-to-br ${level.color} opacity-10 blur-2xl`} />

            <div className="relative z-10">
                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-zinc-500">
                        <Activity size={14} className={level.text} />
                        <span className="text-xs uppercase tracking-wider">{label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <Flame size={14} className={`${level.text} ${percentage > 50 ? 'animate-pulse' : ''}`} />
                        <span className={`font-mono font-bold text-sm ${level.text}`}>
                            {percentage.toFixed(0)}%
                        </span>
                    </div>
                </div>

                {/* Gauge Bar */}
                <div className="h-3 bg-black/50 rounded-full overflow-hidden border border-white/5">
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${percentage}%` }}
                        transition={{ duration: 1.5, ease: "easeOut" }}
                        className={`h-full bg-gradient-to-r ${level.color} relative`}
                    >
                        {/* Shimmer */}
                        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
                    </motion.div>
                </div>

                {/* Labels */}
                <div className="flex justify-between mt-2 text-[10px] text-zinc-600 font-mono uppercase tracking-wider">
                    <span>Quiet</span>
                    <span className={level.text}>{level.label}</span>
                    <span>Frenzy</span>
                </div>

                {/* Bid Count */}
                <div className="mt-3 pt-3 border-t border-white/5 flex items-center gap-2 text-xs text-zinc-500">
                    <TrendingUp size={12} className={level.text} />
                    <span>{currentBids} bids this epoch</span>
                </div>
            </div>
        </div>
    );
}

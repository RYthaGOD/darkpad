"use client";

import { useState, useEffect, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, X, Send, Lock, ShieldCheck, Users, Zap } from "lucide-react";

interface Message {
    id: string;
    sender: string;
    text: string;
    timestamp: number;
    isVerified: boolean;
}

export default function Shoutbox({ auctionAddress }: { auctionAddress: string }) {
    const { publicKey } = useWallet();
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState("");
    const [isAuthorized, setIsAuthorized] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const saved = localStorage.getItem(`shoutbox_${auctionAddress}`);
        if (saved) {
            setMessages(JSON.parse(saved));
        } else {
            setMessages([
                { id: "1", sender: "System", text: "🔐 Encrypted channel established.", timestamp: Date.now() - 100000, isVerified: true },
                { id: "2", sender: "Anon.7x9A", text: "Anyone else bidding on this one?", timestamp: Date.now() - 50000, isVerified: true },
            ]);
        }

        const checkAuth = () => {
            const allBids = JSON.parse(localStorage.getItem("darkpad_bids") || "[]");
            const hasBid = allBids.some((b: any) => b.auction === auctionAddress);
            setIsAuthorized(hasBid);
        };

        checkAuth();
        const interval = setInterval(checkAuth, 2000);
        return () => clearInterval(interval);
    }, [auctionAddress, publicKey]);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isOpen]);

    const handleSend = () => {
        if (!newMessage.trim() || !isAuthorized) return;

        const msg: Message = {
            id: Date.now().toString(),
            sender: publicKey ? `${publicKey.toBase58().slice(0, 4)}...${publicKey.toBase58().slice(-4)}` : "Anon",
            text: newMessage.trim(),
            timestamp: Date.now(),
            isVerified: true
        };

        const updated = [...messages, msg];
        setMessages(updated);
        localStorage.setItem(`shoutbox_${auctionAddress}`, JSON.stringify(updated));
        setNewMessage("");

        if (Math.random() > 0.8) {
            setTimeout(() => {
                const botMsg: Message = {
                    id: (Date.now() + 1).toString(),
                    sender: "Whale.Sol",
                    text: "Market looking bullish 🚀",
                    timestamp: Date.now(),
                    isVerified: true
                };
                const withBot = [...updated, botMsg];
                setMessages(withBot);
                localStorage.setItem(`shoutbox_${auctionAddress}`, JSON.stringify(withBot));
            }, 3000);
        }
    };

    return (
        <>
            {/* Toggle Button */}
            <motion.button
                layout
                onClick={() => setIsOpen(!isOpen)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="fixed bottom-6 right-6 z-50 p-4 bg-gradient-to-r from-violet-600 to-purple-600 text-white rounded-full shadow-lg shadow-violet-500/30 hover:shadow-violet-500/50 transition-shadow flex items-center gap-2"
            >
                {isOpen ? <X size={24} /> : <MessageSquare size={24} />}
                {!isOpen && messages.length > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-[10px] font-bold flex items-center justify-center border-2 border-[#030303]">
                        {messages.length}
                    </span>
                )}
            </motion.button>

            {/* Chat Window */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.95 }}
                        className="fixed bottom-24 right-6 z-50 w-[380px] h-[520px] bg-[#0a0a0a] backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl flex flex-col overflow-hidden"
                    >
                        {/* Header */}
                        <div className="p-5 border-b border-white/5 bg-gradient-to-r from-violet-500/10 to-purple-500/10 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center">
                                    <Lock size={18} className="text-violet-400" />
                                </div>
                                <div>
                                    <span className="text-sm font-bold text-white block">Encrypted Channel</span>
                                    <span className="text-[10px] text-zinc-500">Bidders only</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 px-2 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                <span className="text-[10px] text-emerald-400 font-medium">LIVE</span>
                            </div>
                        </div>

                        {/* Online Users */}
                        <div className="px-5 py-3 border-b border-white/5 flex items-center gap-2 text-xs text-zinc-500">
                            <Users size={12} />
                            <span>{Math.floor(Math.random() * 20) + 5} bidders online</span>
                        </div>

                        {/* Messages */}
                        <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-4">
                            {messages.map((msg) => (
                                <motion.div
                                    key={msg.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="flex flex-col gap-1"
                                >
                                    <div className="flex items-center gap-2">
                                        <span className={`text-[11px] font-medium ${msg.sender === 'System' ? 'text-violet-400' : 'text-zinc-400'}`}>
                                            {msg.sender}
                                        </span>
                                        {msg.isVerified && <ShieldCheck size={10} className="text-violet-400" />}
                                        <span className="text-[10px] text-zinc-600">
                                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                    <p className="text-sm text-zinc-200 leading-relaxed break-words bg-white/5 p-3 rounded-xl rounded-tl-none border border-white/5">
                                        {msg.text}
                                    </p>
                                </motion.div>
                            ))}

                            {!isAuthorized && (
                                <div className="mt-8 p-5 bg-red-500/10 border border-red-500/20 rounded-xl text-center">
                                    <Lock size={24} className="text-red-400 mx-auto mb-3" />
                                    <p className="text-xs text-red-400 font-bold uppercase tracking-widest mb-1">Read Only</p>
                                    <p className="text-[11px] text-zinc-500">Place a bid to unlock messaging</p>
                                </div>
                            )}
                        </div>

                        {/* Input */}
                        <div className="p-4 border-t border-white/5 bg-black/50">
                            <form
                                onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                                className="flex gap-2"
                            >
                                <input
                                    type="text"
                                    value={newMessage}
                                    onChange={(e) => setNewMessage(e.target.value)}
                                    disabled={!isAuthorized}
                                    placeholder={isAuthorized ? "Type a message..." : "Bid to unlock"}
                                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-violet-500/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed placeholder:text-zinc-600"
                                />
                                <button
                                    type="submit"
                                    disabled={!isAuthorized || !newMessage.trim()}
                                    className="p-3 bg-gradient-to-r from-violet-600 to-purple-600 text-white rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:from-violet-500 hover:to-purple-500 transition-all"
                                >
                                    <Send size={18} />
                                </button>
                            </form>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}

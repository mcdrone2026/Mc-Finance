'use client';

import React, { useState } from 'react';
import McFinanceApp from '@/components/McFinanceApp';
import { motion } from 'motion/react';
import { Wallet, ArrowRight, Lock, User, ShieldCheck } from 'lucide-react';

export default function Home() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    // Simulação de delay para animação de loading
    setTimeout(() => {
      setIsLoggedIn(true);
      setIsLoading(false);
    }, 800);
  };

  if (isLoggedIn) {
    return (
      <main>
        <McFinanceApp />
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-[#121212] flex items-center justify-center p-6 text-white font-sans relative overflow-hidden">
      
      {/* Background Glow Effects */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#10B981]/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-900/10 rounded-full blur-[120px] pointer-events-none" />

      <motion.div 
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-md bg-[#171717]/80 backdrop-blur-xl p-8 sm:p-10 rounded-[2rem] border border-white/10 shadow-2xl relative z-10"
      >
        <div className="flex flex-col items-center mb-10">
          <motion.div 
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="w-20 h-20 bg-gradient-to-br from-[#10B981] to-[#047857] rounded-3xl flex items-center justify-center shadow-[0_0_30px_rgba(16,185,129,0.3)] mb-6"
          >
            <Wallet className="w-10 h-10 text-white" strokeWidth={1.5} />
          </motion.div>
          
          <h1 className="text-3xl font-bold text-center text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400 mb-2">
            Mc Finance
          </h1>
          <p className="text-gray-400 text-center text-sm flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#10B981]" />
            Acesso Seguro
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          {/* User Field */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em] ml-1">
              Usuário
            </label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-500 group-focus-within:text-[#10B981] transition-colors">
                <User className="w-5 h-5" />
              </div>
              <input 
                type="text" 
                className="w-full bg-[#262626] border border-white/5 rounded-2xl py-4 pl-12 pr-4 text-white focus:outline-none focus:border-[#10B981]/50 focus:ring-1 focus:ring-[#10B981]/50 transition-all cursor-not-allowed text-gray-400" 
                readOnly 
                value="Mccley"
              />
            </div>
          </div>

          {/* Password Field */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.2em] ml-1">
              Senha
            </label>
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-500 group-focus-within:text-[#10B981] transition-colors">
                <Lock className="w-5 h-5" />
              </div>
              <input 
                type="password" 
                className="w-full bg-[#262626] border border-white/5 rounded-2xl py-4 pl-12 pr-4 text-white focus:outline-none focus:border-[#10B981]/50 focus:ring-1 focus:ring-[#10B981]/50 transition-all placeholder:text-gray-600" 
                placeholder="••••••••" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
              />
            </div>
          </div>

          {/* Submit Button */}
          <motion.button 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            type="submit" 
            disabled={isLoading}
            className="w-full bg-gradient-to-r from-[#10B981] to-[#059669] text-white font-semibold py-4 rounded-2xl shadow-lg shadow-[#10B981]/25 hover:shadow-[#10B981]/40 transition-all flex items-center justify-center gap-2 mt-8 disabled:opacity-70"
          >
            {isLoading ? (
              <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <span>Entrar no Painel</span>
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </motion.button>
        </form>
      </motion.div>
    </div>
  );
}

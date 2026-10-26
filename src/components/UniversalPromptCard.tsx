import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Globe, Copy, Check, ShieldAlert } from 'lucide-react';

export interface UniversalPromptCardProps {
  prompt: string;
  negative: string;
}

export const UniversalPromptCard: React.FC<UniversalPromptCardProps> = ({ prompt, negative }) => {
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [copiedNegative, setCopiedNegative] = useState(false);

  const copyPrompt = () => {
    navigator.clipboard.writeText(prompt);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  const copyNegative = () => {
    navigator.clipboard.writeText(negative);
    setCopiedNegative(true);
    setTimeout(() => setCopiedNegative(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-indigo-200 bg-indigo-50/20 p-5 flex flex-col gap-4 shadow-sm"
    >
      <div className="flex items-center gap-2 border-b border-indigo-100 pb-3">
        <div className="p-1.5 rounded-lg bg-white shadow-sm text-indigo-600">
          <Globe className="w-4 h-4" />
        </div>
        <h3 className="text-xs font-bold text-slate-800">
          Prompt Mentah (Universal — bisa dipake di model lain)
        </h3>
      </div>

      {/* Main Universal Prompt Block */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            Prompt Utama
          </span>
          <button
            onClick={copyPrompt}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold transition-all shadow-sm"
            title="Salin prompt utama"
          >
            {copiedPrompt ? (
              <>
                <Check className="w-3 h-3" />
                Tersalin!
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                Salin prompt
              </>
            )}
          </button>
        </div>
        <pre className="text-xs text-slate-700 leading-relaxed font-mono bg-white/80 p-4 rounded-xl border border-indigo-100 max-h-60 overflow-y-auto whitespace-pre-wrap break-words">
          {prompt}
        </pre>
      </div>

      {/* Negative Universal Prompt Block */}
      {negative && (
        <div className="flex flex-col gap-2 pt-2 border-t border-indigo-100/60">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-red-500" />
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Prompt Negatif
              </span>
            </div>
            <button
              onClick={copyNegative}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-900 text-white text-[10px] font-bold transition-all shadow-sm"
              title="Salin prompt negatif"
            >
              {copiedNegative ? (
                <>
                  <Check className="w-3 h-3 text-green-400" />
                  Tersalin!
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  Salin negatif
                </>
              )}
            </button>
          </div>
          <pre className="text-xs text-slate-600 leading-relaxed font-mono bg-white/80 p-3.5 rounded-xl border border-red-100 max-h-40 overflow-y-auto whitespace-pre-wrap break-words">
            {negative}
          </pre>
        </div>
      )}
    </motion.div>
  );
};

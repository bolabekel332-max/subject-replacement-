import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Copy } from 'lucide-react';

export interface PromptCardProps {
  title: string;
  content: string;
  icon: React.ComponentType<{ className?: string }>;
  variant?: 'default' | 'expert' | 'negative';
}

export const PromptCard: React.FC<PromptCardProps> = ({ 
  title, 
  content, 
  icon: Icon,
  variant = 'default'
}) => {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const variantStyles = {
    default: 'border-slate-200 bg-white',
    expert: 'border-brand-200 bg-brand-50/30',
    negative: 'border-red-100 bg-red-50/30'
  };

  const iconStyles = {
    default: 'text-brand-500',
    expert: 'text-brand-600',
    negative: 'text-red-500'
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border p-5 flex flex-col gap-3 transition-all ${variantStyles[variant]}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-lg bg-white shadow-sm ${iconStyles[variant]}`}>
            <Icon className="w-4 h-4" />
          </div>
          <h3 className="label-micro text-slate-800">{title}</h3>
        </div>
        <button 
          onClick={copyToClipboard}
          className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-brand-600 transition-colors"
          title="Copy to clipboard"
        >
          {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>
      <pre className="text-xs text-slate-600 leading-relaxed font-mono bg-slate-50/50 p-4 rounded-xl border border-slate-100/50 whitespace-pre-wrap overflow-x-hidden">
        {content}
      </pre>
    </motion.div>
  );
};

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { LiquidButton } from '@/components/ui/button';
import { ArrowUp, Plus, Brain } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { useLanguage } from '@/contexts/LanguageContext';

interface LandingChatInputProps {
  onSendAttempt: (message: string) => void;
  onPlaceholderChange?: () => void;
}

const placeholdersByLang: Record<string, string[]> = {
  en: [
    "What's happening with oil prices?",
    "Analyze this market for me...",
    "What are the risks for my business?"
  ],
  ar: [
    "ماذا يحدث مع أسعار النفط؟",
    "حلل لي هذا السوق...",
    "ما المخاطر التي تواجه أعمالي؟"
  ],
  fr: [
    "Que se passe-t-il avec le prix du pétrole ?",
    "Analysez ce marché pour moi...",
    "Quels sont les risques pour mon entreprise ?"
  ],
};

export const LandingChatInput: React.FC<LandingChatInputProps> = ({ onSendAttempt, onPlaceholderChange }) => {
  const { language } = useLanguage();
  const [inputMessage, setInputMessage] = useState('');
  const [currentPlaceholder, setCurrentPlaceholder] = useState(0);
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const placeholders = useMemo(() => placeholdersByLang[language] || placeholdersByLang.en, [language]);

  // Rotate placeholders and notify parent (eye blinks)
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentPlaceholder((prev) => (prev + 1) % placeholders.length);
      onPlaceholderChange?.();
    }, 4000);
    return () => clearInterval(interval);
  }, [onPlaceholderChange]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  }, [inputMessage]);

  const handleSend = () => {
    const trimmed = inputMessage.trim();
    if (trimmed) {
      onSendAttempt(trimmed);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="w-full max-w-xl mx-auto mt-8 md:mt-12 px-4"
    >
      <div
        dir="ltr"
        className={cn(
          "relative rounded-2xl overflow-hidden",
          "bg-background/95 backdrop-blur-xl",
          "border border-border/50",
          "shadow-lg shadow-black/5",
          "transition-all duration-300",
          "hover:border-border hover:shadow-xl"
        )}
      >
        {/* Row 1: Input Area */}
        <div className="flex items-end gap-2 px-4 pt-3 pb-2">
          <div className="flex-1 relative">
            <Textarea
              ref={textareaRef}
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder={isFocused ? '' : placeholders[currentPlaceholder]}
              className={cn(
                "resize-none border-0 bg-transparent p-0 py-[10px] min-h-[44px] max-h-[120px]",
                "focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0",
                "text-base placeholder:text-muted-foreground/60 leading-normal"
              )}
              rows={1}
            />
          </div>

          <AnimatePresence>
            {inputMessage.trim() && (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <LiquidButton
                  size="icon"
                  onClick={handleSend}
                  aria-label="Send"
                >
                  <ArrowUp className="w-4 h-4" strokeWidth={2.5} />
                </LiquidButton>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Row 2: Toolbar */}
        <div className="flex items-center justify-between px-3 py-2 border-t border-border/30 bg-muted/20">
          <button
            className={cn(
              "w-8 h-8 rounded-lg flex items-center justify-center",
              "text-muted-foreground/60 hover:text-muted-foreground",
              "hover:bg-muted/50 transition-colors cursor-default"
            )}
          >
            <Plus className="w-5 h-5" />
          </button>
          <div className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg", "text-sm text-muted-foreground")}>
            <Brain className="w-4 h-4" />
            <span>AYN</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

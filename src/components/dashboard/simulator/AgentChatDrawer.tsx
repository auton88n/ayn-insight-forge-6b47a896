import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { enginApi, EnginAgent } from '@/lib/enginApi';
import { toast } from 'sonner';

type Target = { kind: 'agent'; agent: EnginAgent } | { kind: 'report' };

interface Props {
  simId: string;
  target: Target;
  onClose: () => void;
}

interface Msg { role: 'user' | 'assistant'; text: string }

export function AgentChatDrawer({ simId, target, onClose }: Props) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [msgs]);

  const title = target.kind === 'report' ? 'ReportAgent' : target.agent.name;
  const subtitle = target.kind === 'report'
    ? 'Ask anything about this prediction'
    : `${target.agent.category.replace('_', ' ')} · ${target.agent.country || ''}`;

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setMsgs(p => [...p, { role: 'user', text }]);
    setInput('');
    setSending(true);
    try {
      const res = target.kind === 'report'
        ? await enginApi.chatWithReport(simId, text)
        : await enginApi.chatWithAgent(simId, target.agent.id, text);
      setMsgs(p => [...p, { role: 'assistant', text: res.reply }]);
    } catch {
      toast.error('Engin chat unavailable');
      setMsgs(p => [...p, { role: 'assistant', text: '[engine unreachable]' }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[99] bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ x: 480 }} animate={{ x: 0 }} exit={{ x: 480 }}
        transition={{ type: 'spring', damping: 30, stiffness: 240 }}
        className="fixed top-0 right-0 bottom-0 w-full sm:w-[480px] z-[100] flex flex-col bg-background/95 backdrop-blur-2xl border-l border-border/40">
        <div className="p-5 border-b border-border/40 flex items-start justify-between">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground/60 mb-1">
              {target.kind === 'report' ? 'meta dialog' : 'agent dialog'}
            </p>
            <h2 className="text-xl font-display font-bold text-foreground">{title}</h2>
            <p className="text-xs text-muted-foreground/60 mt-0.5 capitalize">{subtitle}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl bg-card/40 hover:bg-card/70 border border-border/40 text-muted-foreground hover:text-foreground transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-3">
          {msgs.length === 0 && (
            <p className="text-xs font-mono text-muted-foreground/40 text-center py-12">
              {target.kind === 'report' ? 'ask "what changes if oil drops 30%?"' : 'open a private channel with this agent'}
            </p>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={cn('max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm',
              m.role === 'user'
                ? 'ml-auto bg-primary text-primary-foreground'
                : 'bg-card/60 border border-border/40 text-foreground')}>
              {m.text}
            </div>
          ))}
          {sending && <div className="text-xs font-mono text-muted-foreground/50 animate-pulse">thinking…</div>}
        </div>

        <div className="p-4 border-t border-border/40 flex gap-2">
          <input
            value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') send(); }}
            placeholder="Type a message…"
            className="flex-1 bg-background/60 border border-border/40 rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/40"
          />
          <button onClick={send} disabled={sending || !input.trim()}
            className="px-3 rounded-xl bg-primary text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary/90 transition-all">
            <Send className="w-4 h-4" />
          </button>
        </div>
      </motion.div>
    </>
  );
}

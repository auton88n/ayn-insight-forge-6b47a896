import React, { useState, useRef, useEffect } from 'react';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/config';
import { Button } from '@/components/ui/button';
import { Sparkles, Send, Loader2, X, ChevronRight, FileText, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface ContractAIProps {
  type: 'contract' | 'nda';
  onFill: (fields: Record<string, any>) => void;
  onClose: () => void;
}

export function ContractAI({ type, onFill, onClose }: ContractAIProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [filled, setFilled] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Start the conversation
  useEffect(() => {
    const opening = type === 'contract'
      ? "Hi! I'll help you build a complete service agreement. Let's start — **who is the client** (company name and email), and **what service or project** are you offering them?"
      : "Hi! I'll help you draft a professional NDA. First — **who is this NDA with** (company name and email), and **what is the purpose** of this agreement?";
    setMessages([{ role: 'assistant', content: opening }]);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [type]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput('');

    const newMessages: Message[] = [...messages, { role: 'user', content: userMsg }];
    setMessages(newMessages);
    setLoading(true);

    try {
      // Use admin-ai-assistant which already has LOVABLE_API_KEY injected by Lovable
      const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-ai-assistant`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          action: 'contract_builder',
          type,
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      const text = data.text || data.response || data.message || data.content || '';

      // Check if AI returned contract data
      const tag = type === 'contract' ? 'CONTRACT_DATA' : 'NDA_DATA';
      const match = text.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));

      if (match) {
        try {
          const parsed = JSON.parse(match[1].trim());
          // Show a success message
          const successMsg = `✅ **Contract generated!** I've filled in all the fields based on our conversation. Review them on the right, make any adjustments, then save and send.

Here's a summary of what I filled in:
${type === 'contract' ? `
- **Client:** ${parsed.company_name || '—'} (${parsed.company_email || '—'})
- **Project:** ${parsed.order_title || '—'}
- **Services:** ${Array.isArray(parsed.services) ? parsed.services.length + ' service(s)' : '—'}
- **Total:** ${parsed.currency || 'USD'} ${Array.isArray(parsed.services) ? parsed.services.reduce((s: number, sv: any) => s + (sv.price * (sv.quantity || 1)), 0).toFixed(2) : '—'}
- **Timeline:** ${parsed.delivery_timeline || '—'}
` : `
- **Party:** ${parsed.company_name || '—'} (${parsed.company_email || '—'})
- **Purpose:** ${parsed.nda_purpose?.substring(0, 80) || '—'}...
- **Duration:** ${parsed.duration || '—'}
`}
Feel free to ask me to adjust anything.`;

          setMessages(prev => [...prev, { role: 'assistant', content: successMsg }]);
          onFill(parsed);
          setFilled(true);
        } catch {
          setMessages(prev => [...prev, { role: 'assistant', content: text }]);
        }
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: text }]);
      }
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I hit an error. Please try again.' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  // Render markdown-like bold
  const renderContent = (text: string) => {
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) =>
      part.startsWith('**') && part.endsWith('**')
        ? <strong key={i} className="text-white">{part.slice(2, -2)}</strong>
        : <span key={i}>{part}</span>
    );
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-zinc-900/80 backdrop-blur">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-purple-500/20 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-purple-400" />
          </div>
          <div>
            <div className="text-white text-sm font-semibold">
              {type === 'contract' ? 'Contract Builder AI' : 'NDA Builder AI'}
            </div>
            <div className="text-[10px] text-zinc-500">
              {type === 'contract' ? 'Structures your service agreement' : 'Drafts your NDA'}
            </div>
          </div>
        </div>
        <button onClick={onClose} className="text-zinc-600 hover:text-zinc-400 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg, i) => (
          <div key={i} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
            {msg.role === 'assistant' && (
              <div className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center mr-2 flex-shrink-0 mt-0.5">
                <Sparkles className="w-3 h-3 text-purple-400" />
              </div>
            )}
            <div className={cn(
              'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
              msg.role === 'user'
                ? 'bg-white/10 text-white rounded-tr-sm'
                : 'bg-zinc-800 text-zinc-300 rounded-tl-sm'
            )}>
              {renderContent(msg.content)}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="w-6 h-6 rounded-full bg-purple-500/20 flex items-center justify-center mr-2 flex-shrink-0">
              <Sparkles className="w-3 h-3 text-purple-400" />
            </div>
            <div className="bg-zinc-800 rounded-2xl rounded-tl-sm px-4 py-3">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        {filled && (
          <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 flex items-center gap-3">
            <div className="w-8 h-8 bg-green-500/20 rounded-full flex items-center justify-center flex-shrink-0">
              {type === 'contract' ? <FileText className="w-4 h-4 text-green-400" /> : <Shield className="w-4 h-4 text-green-400" />}
            </div>
            <div>
              <div className="text-green-400 text-xs font-semibold">Fields filled ✓</div>
              <div className="text-zinc-500 text-[11px] mt-0.5">Review the form on the right and make any changes</div>
            </div>
            <button onClick={onClose} className="ml-auto flex items-center gap-1 text-xs text-green-400 hover:text-green-300">
              Go to form <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-white/10">
        <div className="flex gap-2 items-end bg-zinc-900 border border-white/10 rounded-xl p-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Type your message... (Enter to send)"
            rows={2}
            className="flex-1 bg-transparent text-white text-sm resize-none focus:outline-none placeholder:text-zinc-600 leading-relaxed min-h-[40px] max-h-32"
          />
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            className="w-8 h-8 bg-purple-600 hover:bg-purple-500 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg flex items-center justify-center flex-shrink-0 transition-colors"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin text-white" /> : <Send className="w-3.5 h-3.5 text-white" />}
          </button>
        </div>
        <div className="text-[10px] text-zinc-700 mt-1.5 text-center">Shift+Enter for new line</div>
      </div>
    </div>
  );
}

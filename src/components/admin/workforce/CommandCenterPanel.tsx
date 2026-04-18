import { useState, useRef, useEffect, useCallback } from 'react';
import { spineAuth } from '@/lib/spineAuth';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { adminApi as supabase } from '@/lib/adminApi';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Brain,
  ArrowUp,
  Loader2,
  Trash2,
  Shield,
  Plus,
  X,
  ChevronDown,
  ChevronUp,
  History,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SUPABASE_URL } from '@/config';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  agent?: string;
  agent_name?: string;
  agent_emoji?: string;
  tool_results?: ToolResult[];
  timestamp: Date;
  fromHistory?: boolean;
}

interface ToolResult {
  type: 'agent_result' | 'directive_saved' | 'discussion' | 'error' | 'memory_updated';
  agent?: string;
  agent_name?: string;
  agent_emoji?: string;
  command?: string;
  result?: any;
  success?: boolean;
  message?: string;
  directive?: any;
  responses?: { name: string; reply: string; emoji: string; employeeId: string }[];
  discussion_id?: string;
  error?: string;
}

interface Directive {
  id: string;
  directive: string;
  category: string;
  priority: number;
  is_active: boolean;
  created_at: string;
}

const AYN_META = { name: 'AYN', emoji: '🧠', gradient: 'from-violet-500 to-purple-600' };

function getAgentMeta(_id: string) {
  return AYN_META;
}

const CATEGORY_COLORS: Record<string, string> = {
  geo: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  strategy: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  outreach: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  budget: 'bg-violet-500/10 text-violet-600 border-violet-500/20',
  general: 'bg-muted text-muted-foreground border-border',
};


// ─── Helper: Build enriched content string for history ───
function buildEnrichedContent(msg: ChatMessage): string {
  let content = msg.content || '';
  if (msg.tool_results && msg.tool_results.length > 0) {
    for (const tr of msg.tool_results) {
      if (tr.type === 'agent_result' && tr.message) {
        content += ` [${tr.agent_name || tr.agent || 'Agent'}: ${tr.message}]`;
      } else if (tr.type === 'discussion' && tr.responses) {
        const summary = tr.responses.map(r => `${r.name}: ${r.reply}`).join('; ');
        content += ` [Team discussion: ${summary}]`;
      } else if (tr.type === 'directive_saved' && tr.directive) {
        content += ` [Directive saved: ${tr.directive.directive}]`;
      }
    }
  }
  return content;
}

// ─── Helper: Save message to DB ───
async function persistMessage(adminId: string, msg: ChatMessage) {
  try {
    /* spine */;
  } catch {
    // Silent fail — don't block UI
  }
}

export function CommandCenterPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [directives, setDirectives] = useState<Directive[]>([]);
  const [showDirectives, setShowDirectives] = useState(false);
  const [newDirective, setNewDirective] = useState('');
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);

  // ─── Load conversation history from DB ───
  const loadHistory = useCallback(async () => {
    const { data: { session } } = await spineAuth.getSession();
    if (!session) return;

    try {
      const { data } = await supabase
        .from('admin_ai_conversations')
        .select('*')
        .eq('admin_id', session.user.id)
        .order('created_at', { ascending: true })
        .limit(50);

      if (data && data.length > 0) {
        const loaded: ChatMessage[] = data.map((row: any) => ({
          id: row.id,
          role: row.role as 'user' | 'assistant',
          content: row.message || '',
          tool_results: (row.context as any)?.tool_results || undefined,
          agent: (row.actions_taken as any)?.agent || undefined,
          timestamp: new Date(row.created_at),
          fromHistory: true,
        }));
        setMessages(loaded);
      }
    } catch {
      // Silent
    }
    setHistoryLoaded(true);
  }, []);

  // ─── Load directives ───
  const loadDirectives = useCallback(async () => {
    const { data: { session } } = await spineAuth.getSession();
    if (!session) return;
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-command-center`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'list_directives' }),
      });
      const data = await res.json();
      setDirectives(data.directives || []);
    } catch { /* ignore */ }
  }, []);

  // ─── Real-time subscription for proactive agent alerts ───
  useEffect(() => {
    let channel: any = null;

    const setupRealtime = async () => {
      const { data: { session } } = await spineAuth.getSession();
      if (!session) return;

      channel = supabase
        .channel('command-center-proactive')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'admin_ai_conversations',
            filter: `admin_id=eq.${session.user.id}`,
          },
          (payload: any) => {
            const row = payload.new;
            // Only handle proactive messages (not ones we inserted ourselves)
            const context = row.context as any;
            if (context?.proactive && row.role === 'assistant') {
              const newMsg: ChatMessage = {
                id: row.id,
                role: 'assistant',
                content: row.message || '',
                agent: (row.actions_taken as any)?.agent || 'system',
                tool_results: context?.tool_results || undefined,
                timestamp: new Date(row.created_at),
              };
              setMessages(prev => {
                // Avoid duplicates
                if (prev.some(m => m.id === row.id)) return prev;
                return [...prev, newMsg];
              });
            }
          }
        )
        .subscribe();
    };

    setupRealtime();
    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    loadHistory();
    loadDirectives();
  }, [loadHistory, loadDirectives]);

  // ─── Auto-scroll to bottom ───
  const scrollToBottom = useCallback(() => {
    if (!scrollRef.current) return;
    const viewport = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
    const raf = requestAnimationFrame(scrollToBottom);
    const timeout = setTimeout(scrollToBottom, 150);
    return () => { cancelAnimationFrame(raf); clearTimeout(timeout); };
  }, [messages, isLoading, scrollToBottom]);

  // ─── Track scroll position for scroll-to-bottom button ───
  useEffect(() => {
    if (!scrollRef.current) return;
    const viewport = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
    if (!viewport) return;
    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = viewport;
      setShowScrollButton(scrollHeight - scrollTop - clientHeight > 100);
    };
    viewport.addEventListener('scroll', handleScroll);
    return () => viewport.removeEventListener('scroll', handleScroll);
  }, [historyLoaded]);

  // ─── Send message ───
  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput('');
    setIsLoading(true);

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      timestamp: new Date(),
    };
    // Add a temporary "looking into it" message
    const tempId = crypto.randomUUID();
    const tempMsg: ChatMessage = {
      id: tempId,
      role: 'assistant',
      content: "On it — looking into this now. I'll update you shortly.",
      agent: 'system',
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg, tempMsg]);

    try {
      const { data: { session } } = await spineAuth.getSession();
      if (!session) { toast.error('Not authenticated'); return; }

      // Persist user message
      persistMessage(session.user.id, userMsg);

      // Build enriched history for context (last 10 messages, truncated)
      const allMessages = [...messages, userMsg];
      const history = allMessages.slice(-30).map(m => ({
        role: m.role,
        content: buildEnrichedContent(m).substring(0, 2000),
      }));

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000); // 2min timeout

      const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-command-center`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mode: 'chat', message: text, history }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) throw new Error('Failed');
      const data = await res.json();

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.message || '',
        agent: data.agent || 'system',
        tool_results: data.tool_results || [],
        timestamp: new Date(),
      };
      // Replace the temporary message with the real response
      setMessages(prev => prev.map(m => m.id === tempId ? assistantMsg : m));

      // Persist assistant message
      persistMessage(session.user.id, assistantMsg);

      // Refresh directives if one was saved
      if (data.tool_results?.some((r: any) => r.type === 'directive_saved')) {
        loadDirectives();
      }
    } catch (error: any) {
      const isTimeout = error?.name === 'AbortError';
      const errorMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: isTimeout
          ? "That took too long — the agent is probably still working in the background. Check back in a minute."
          : "Something went wrong. Try again?",
        agent: 'system',
        timestamp: new Date(),
      };
      // Replace the temporary message with the error
      setMessages(prev => prev.map(m => m.id === tempId ? errorMsg : m));
      toast.error(isTimeout ? 'Request timed out' : 'Failed to send message');
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Add directive manually ───
  const handleAddDirective = async () => {
    if (!newDirective.trim()) return;
    try {
      const { data: { session } } = await spineAuth.getSession();
      if (!session) return;
      await fetch(`${SUPABASE_URL}/functions/v1/admin-command-center`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'chat', message: `Save this as a directive: ${newDirective.trim()}`, history: [] }),
      });
      toast.success('Directive saved');
      setNewDirective('');
      loadDirectives();
    } catch { toast.error('Failed'); }
  };

  const handleDeleteDirective = async (id: string) => {
    try {
      const { data: { session } } = await spineAuth.getSession();
      if (!session) return;
      await fetch(`${SUPABASE_URL}/functions/v1/admin-command-center`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'delete_directive', id }),
      });
      toast.success('Removed');
      loadDirectives();
    } catch { toast.error('Failed'); }
  };

  const handleClearChat = async () => {
    setMessages([]);
    // Optionally clear DB too
    const { data: { session } } = await spineAuth.getSession();
    if (session) {
      /* spine */;
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // Find where history ends and new messages begin
  let historyEndIndex = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].fromHistory) { historyEndIndex = i; break; }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
            <Brain className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">AYN Mind</h2>
            <p className="text-sm text-muted-foreground">Your smart personal assistant — commands, questions, actions</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDirectives(!showDirectives)}
            className="text-xs gap-1.5"
          >
            <Shield className="w-3.5 h-3.5" />
            Directives ({directives.filter(d => d.is_active).length})
            {showDirectives ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </Button>
          <Button variant="ghost" size="sm" onClick={handleClearChat} className="text-muted-foreground">
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Directives panel (collapsible) */}
      <AnimatePresence>
        {showDirectives && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <Card className="border border-border">
              <CardContent className="p-3 space-y-2">
                <div className="flex gap-2">
                  <Input
                    placeholder="Add a standing order..."
                    value={newDirective}
                    onChange={(e) => setNewDirective(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddDirective()}
                    className="flex-1 text-sm h-8"
                  />
                  <Button size="sm" onClick={handleAddDirective} disabled={!newDirective.trim()} className="h-8">
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                </div>
                {directives.filter(d => d.is_active).length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-2">No active directives. Say "from now on..." to add one naturally.</p>
                )}
                {directives.filter(d => d.is_active).map((d) => (
                  <div key={d.id} className="flex items-center gap-2 p-2 rounded-lg border border-border bg-card text-sm">
                    <Badge variant="outline" className={cn("text-[10px] shrink-0", CATEGORY_COLORS[d.category] || CATEGORY_COLORS.general)}>
                      {d.category}
                    </Badge>
                    <span className="flex-1 truncate">{d.directive}</span>
                    <button onClick={() => handleDeleteDirective(d.id)} className="text-muted-foreground hover:text-destructive">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat area */}
      <Card className="border border-border overflow-hidden">
        <CardContent className="p-0">
          <div className="relative">
          <ScrollArea className="h-[500px]" ref={scrollRef}>
            <div className="p-4 space-y-4">
              {messages.length === 0 && !isLoading && historyLoaded && (
                <div className="flex flex-col items-center justify-center h-[400px] text-muted-foreground">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500/20 to-purple-600/20 flex items-center justify-center mb-4">
                    <span className="text-3xl">🧠</span>
                  </div>
                  <p className="text-sm font-medium">Talk to AYN</p>
                  <p className="text-xs mt-1 max-w-xs text-center">
                    Give commands, ask questions, set directives. AYN understands what you need and acts immediately.
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-4 max-w-sm justify-center">
                    {[
                      'Sales, prospect 10 Canadian firms',
                      'What did security find?',
                      'Focus only on Canada',
                      "Get everyone's opinion on pricing",
                    ].map((suggestion) => (
                      <button
                        key={suggestion}
                        onClick={() => setInput(suggestion)}
                        className="text-[11px] px-2.5 py-1.5 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg, idx) => (
                <div key={msg.id}>
                  {/* History divider */}
                  {historyEndIndex >= 0 && idx === historyEndIndex + 1 && (
                    <div className="flex items-center gap-2 py-2 text-muted-foreground/50">
                      <div className="flex-1 h-px bg-border" />
                      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider">
                        <History className="w-3 h-3" />
                        New messages
                      </div>
                      <div className="flex-1 h-px bg-border" />
                    </div>
                  )}

                  {msg.role === 'user' ? (
                    <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end">
                      <div className="max-w-[80%] bg-foreground text-background rounded-2xl rounded-br-md px-4 py-2.5">
                        <p className="text-sm">{msg.content}</p>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
                      {/* AYN's message */}
                      {msg.content && (
                        <div className="flex gap-3">
                          <div className="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center text-sm bg-gradient-to-br from-violet-500 to-purple-600 text-white">
                            🧠
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-xs font-medium text-muted-foreground">AYN</span>
                            <div className="text-sm leading-relaxed prose prose-sm dark:prose-invert max-w-none">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Tool results */}
                      {msg.tool_results?.map((result, i) => (
                        <ToolResultCard key={i} result={result} />
                      ))}
                    </motion.div>
                  )}
                </div>
              ))}

              {isLoading && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
                  <div className="w-7 h-7 rounded-lg shrink-0 flex items-center justify-center text-sm bg-gradient-to-br from-violet-500 to-purple-600 text-white animate-pulse">
                    🧠
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 py-2">
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">AYN is thinking...</span>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          </ScrollArea>

          {/* Scroll to bottom button */}
          <AnimatePresence>
            {showScrollButton && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                onClick={scrollToBottom}
                className="absolute bottom-20 right-4 w-8 h-8 rounded-full bg-foreground text-background flex items-center justify-center shadow-lg hover:opacity-90 transition-opacity z-10"
              >
                <ChevronDown className="w-4 h-4" />
              </motion.button>
            )}
          </AnimatePresence>
          </div>

          {/* Input */}
          <div className="p-3 border-t border-border">
            <div className="relative bg-muted/30 border border-border rounded-xl overflow-hidden">
              <div className="flex items-end gap-2 p-2">
                <Textarea
                  placeholder="Tell AYN what to do..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyPress}
                  disabled={isLoading}
                  className="flex-1 resize-none min-h-[44px] max-h-[120px] text-sm bg-transparent border-0 focus-visible:ring-0 focus-visible:ring-offset-0 px-2 py-2"
                />
                <AnimatePresence>
                  {input.trim() && !isLoading && (
                    <motion.button
                      initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
                      onClick={handleSend}
                      className="shrink-0 w-9 h-9 rounded-lg bg-foreground text-background flex items-center justify-center hover:opacity-90"
                    >
                      <ArrowUp className="w-4 h-4" strokeWidth={2.5} />
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Tool Result Components ───

function ToolResultCard({ result }: { result: ToolResult }) {
  const [expanded, setExpanded] = useState(false);

  if (result.type === 'error') {
    return (
      <div className="ml-10 p-3 rounded-lg border border-destructive/30 bg-destructive/5 text-sm text-destructive">
        {result.message || result.error}
      </div>
    );
  }

  if (result.type === 'memory_updated') {
    return (
      <div className="ml-10 p-2.5 rounded-lg border border-violet-500/20 bg-violet-500/5">
        <div className="flex items-center gap-2 text-xs text-violet-600 dark:text-violet-400">
          <span>🧠</span>
          <span className="font-medium">Memory updated — I'll remember this.</span>
        </div>
      </div>
    );
  }

  if (result.type === 'directive_saved') {
    return (
      <div className="ml-10 p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5">
        <div className="flex items-center gap-2 text-sm">
          <Shield className="w-4 h-4 text-emerald-600" />
          <span className="font-medium text-emerald-700 dark:text-emerald-400">Directive saved</span>
        </div>
        {result.directive && (
          <p className="text-xs text-muted-foreground mt-1">{result.directive.directive}</p>
        )}
      </div>
    );
  }

  if (result.type === 'discussion' && result.responses) {
    return (
      <div className="ml-10 space-y-2">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Team Discussion</div>
        {result.responses.map((r, i) => {
          const meta = getAgentMeta(r.employeeId);
          return (
            <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className="flex gap-2.5">
              <div className={cn("w-6 h-6 rounded-md shrink-0 flex items-center justify-center text-xs bg-gradient-to-br text-white", meta.gradient)}>
                {meta.emoji}
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-xs font-medium text-muted-foreground">{meta.name}</span>
                <p className="text-sm">{r.reply}</p>
              </div>
            </motion.div>
          );
        })}
      </div>
    );
  }

  if (result.type === 'agent_result') {
    const meta = AYN_META;
    const agentMessage = result.message;
    const hasError = result.result?.error;
    const isSuccess = result.success !== false && !hasError;

    return (
      <div className={cn(
        "flex gap-3 ml-4 p-2.5 rounded-xl border transition-colors",
        hasError ? "border-destructive/30 bg-destructive/5" :
        isSuccess ? "border-emerald-500/20 bg-emerald-500/5" :
        "border-amber-500/20 bg-amber-500/5"
      )}>
        <div className={cn("w-7 h-7 rounded-lg shrink-0 flex items-center justify-center text-sm bg-gradient-to-br text-white", meta.gradient)}>
          {result.agent_emoji || meta.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">{result.agent_name || meta.name}</span>
            <span className="text-xs">
              {hasError ? '❌' : isSuccess ? '✅' : '⚠️'}
            </span>
          </div>
          {agentMessage ? (
            <div className="text-sm leading-relaxed prose prose-sm dark:prose-invert max-w-none mt-0.5">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{agentMessage}</ReactMarkdown>
            </div>
          ) : hasError ? (
            <p className="text-sm text-destructive mt-0.5">{result.result.error}</p>
          ) : (
            <p className="text-sm text-muted-foreground mt-0.5">Task completed.</p>
          )}
          {result.result && (
            <>
              <button onClick={() => setExpanded(!expanded)} className="text-[11px] text-muted-foreground/60 hover:text-muted-foreground mt-2 flex items-center gap-1 font-medium">
                {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {expanded ? 'Hide details' : '📋 View raw details'}
              </button>
              {expanded && (
                <pre className="text-[11px] bg-muted/30 rounded-lg p-2 mt-1.5 overflow-auto max-h-[200px] whitespace-pre-wrap text-muted-foreground border border-border">
                  {JSON.stringify(result.result, null, 2)}
                </pre>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  return null;
}

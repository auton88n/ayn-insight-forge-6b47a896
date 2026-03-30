import { useState, useRef, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { adminSupabase as supabase } from '@/admin-app/adminSupabase';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { 
  Bot, 
  Sparkles,
  Trash2,
  Zap,
  TrendingUp,
  Users,
  AlertCircle,
  ArrowUp,
  TestTube,
  ShieldCheck
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { AdminStatsPanel, QuickStats } from './AdminStatsPanel';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  actions?: Array<{ type: string; params: string }>;
  timestamp?: Date;
}

import { SUPABASE_URL } from '@/config';

// Typing indicator dots
const TypingIndicator = () => (
  <div className="flex items-center gap-1.5 px-4 py-3">
    {[0, 1, 2].map((i) => (
      <motion.div
        key={i}
        className="w-2 h-2 rounded-full bg-muted-foreground/60"
        animate={{
          y: [0, -6, 0],
          opacity: [0.4, 1, 0.4],
        }}
        transition={{
          duration: 0.8,
          repeat: Infinity,
          delay: i * 0.15,
          ease: "easeInOut",
        }}
      />
    ))}
  </div>
);

// Message component with markdown support
const ChatMessage = ({ 
  message, 
  onExecuteAction 
}: { 
  message: Message; 
  onExecuteAction: (action: { type: string; params: string }) => void;
}) => {
  const isUser = message.role === 'user';
  
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-3",
          isUser 
            ? "bg-foreground text-background" 
            : "bg-muted border border-border"
        )}
      >
        {isUser ? (
          <p className="text-sm leading-relaxed whitespace-pre-wrap">
            {message.content}
          </p>
        ) : (
          <div className="text-sm">
            <p className="text-sm leading-relaxed whitespace-pre-wrap">
              {message.content.replace(/\[ACTION:[^\]]*\]/g, '').trim()}
            </p>
          </div>
        )}
        
        {message.timestamp && (
          <p className={cn(
            "text-[10px] mt-1.5",
            isUser ? "text-background/60" : "text-muted-foreground"
          )}>
            {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
        
        {message.actions && message.actions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-border/50">
            {message.actions.map((action, j) => (
              <Badge 
                key={j}
                variant="secondary" 
                className="cursor-pointer hover:bg-primary/10 hover:text-primary transition-colors"
                onClick={() => onExecuteAction(action)}
              >
                <Sparkles className="w-3 h-3 mr-1.5" />
                <span className="text-xs">{action.type.replace(/_/g, ' ')}</span>
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export function AdminAIAssistant() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "Hey! I'm your admin operations assistant. I can see system health, test results, rate limits, and more. Ask me anything about platform operations or click a stat to dive deeper.",
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState<QuickStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch stats directly from DB — fast, no AI call needed
  const fetchStats = useCallback(async () => {
    try {
      const now24h = new Date(Date.now() - 86400000).toISOString();
      const [llmRes, failRes, ticketRes, rateLimitRes, testRes] = await Promise.allSettled([
        supabase.from('llm_usage_logs').select('was_fallback', { count: 'exact' }).gte('created_at', now24h),
        supabase.from('llm_failures').select('id', { count: 'exact' }).gte('created_at', now24h),
        supabase.from('support_tickets').select('id', { count: 'exact' }).eq('status', 'open'),
        supabase.from('api_rate_limits').select('blocked_until').not('blocked_until', 'is', null),
        supabase.from('test_results').select('status').gte('created_at', now24h),
      ]);

      const llmData = llmRes.status === 'fulfilled' ? llmRes.value.data || [] : [];
      const llmTotal = llmData.length;
      const fallbackCount = llmData.filter((r: any) => r.was_fallback).length;
      const fallbackRate = llmTotal > 0 ? (fallbackCount / llmTotal) * 100 : 0;

      const openTickets = ticketRes.status === 'fulfilled' ? (ticketRes.value.count || 0) : 0;

      const rateLimitData = rateLimitRes.status === 'fulfilled' ? rateLimitRes.value.data || [] : [];
      const blockedUsers = rateLimitData.filter((r: any) => r.blocked_until && new Date(r.blocked_until) > new Date()).length;

      const testData = testRes.status === 'fulfilled' ? testRes.value.data || [] : [];
      const testTotal = testData.length;
      const testPassed = testData.filter((r: any) => r.status === 'passed').length;
      const testPassRate = testTotal > 0 ? (testPassed / testTotal) * 100 : 100;

      // System health: deduct for issues
      let health = 100;
      if (testPassRate < 90) health -= (90 - testPassRate);
      if (fallbackRate > 5) health -= (fallbackRate - 5) * 2;
      if (blockedUsers > 0) health -= blockedUsers * 2;
      health = Math.max(0, Math.min(100, Math.round(health)));

      setStats({
        systemHealth: health,
        testPassRate: Math.round(testPassRate),
        blockedUsers,
        openTickets: Number(openTickets),
        llmFallbackRate: Math.round(fallbackRate * 10) / 10,
        calcUsage24h: 0,
      });
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    } finally {
      setIsLoadingStats(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    // Refresh stats every 30 seconds
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  // Auto-scroll to bottom
  useEffect(() => {
    const scrollToBottom = () => {
      if (scrollRef.current) {
        const viewport = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
        if (viewport) {
          viewport.scrollTop = viewport.scrollHeight;
        }
      }
    };
    scrollToBottom();
    const raf = requestAnimationFrame(scrollToBottom);
    const timeout = setTimeout(scrollToBottom, 150);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timeout);
    };
  }, [messages, isLoading]);

  const sendMessage = async (messageText?: string) => {
    const text = messageText || input.trim();
    if (!text || isLoading) return;

    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = '44px';
    }
    
    setMessages(prev => [...prev, { 
      role: 'user', 
      content: text,
      timestamp: new Date()
    }]);
    setIsLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Not authenticated');
        setIsLoading(false);
        return;
      }

      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/admin-ai-assistant`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ message: text })
        }
      );

      if (!response.ok) {
        throw new Error('Failed to get response');
      }

      const data = await response.json();
      
      // Update stats if returned
      if (data.quickStats) {
        setStats(data.quickStats);
      }
      
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.content,
        actions: data.actions,
        timestamp: new Date()
      }]);
    } catch (error) {
      console.error('Admin AI error:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: "Sorry, couldn't process that. Try again?",
        timestamp: new Date()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const executeAction = async (action: { type: string; params: string }) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Not authenticated');
        return;
      }

      switch (action.type) {
        case 'unblock_user':
          const { error: unblockError } = await supabase.rpc('admin_unblock_user', { 
            p_user_id: action.params 
          });
          if (unblockError) throw unblockError;
          toast.success('User unblocked successfully');
          break;
          
        case 'run_tests':
          await fetch(`${SUPABASE_URL}/functions/v1/ai-comprehensive-tester`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ suite: action.params })
          });
          toast.success(`Running ${action.params} tests...`);
          break;
          
        case 'refresh_stats':
          await fetchStats();
          toast.success('Stats refreshed');
          break;
          
        case 'view_section':
          window.dispatchEvent(new CustomEvent('admin-navigate', { 
            detail: action.params 
          }));
          break;
          
        default:
          toast.info(`Action: ${action.type}`);
      }
      
      // Refresh stats after action
      fetchStats();
    } catch (error) {
      console.error('Action failed:', error);
      toast.error(`Action failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const clearChat = () => {
    setMessages([{
      role: 'assistant',
      content: "Hey! I'm your admin operations assistant. I can see system health, test results, rate limits, and more. Ask me anything about platform operations or click a stat to dive deeper.",
      timestamp: new Date()
    }]);
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.max(44, Math.min(textareaRef.current.scrollHeight, 160)) + 'px';
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Dynamic quick suggestions based on stats
  const getQuickSuggestions = () => {
    const suggestions = [
      { icon: TrendingUp, text: "Show AI cost breakdown" },
      { icon: TestTube, text: "Show test results" },
    ];
    
    if (stats?.blockedUsers && stats.blockedUsers > 0) {
      suggestions.push({ 
        icon: Users, 
        text: `Unblock ${stats.blockedUsers} rate-limited users` 
      });
    }
    
    if (stats?.openTickets && stats.openTickets > 0) {
      suggestions.push({ 
        icon: AlertCircle, 
        text: `${stats.openTickets} open tickets - show details` 
      });
    }
    
    if (stats?.llmFallbackRate && stats.llmFallbackRate > 5) {
      suggestions.push({ 
        icon: Zap, 
        text: "Why is fallback rate high?" 
      });
    }

    suggestions.push({ icon: ShieldCheck, text: "Check security alerts" });
    
    return suggestions.slice(0, 6);
  };

  const quickSuggestions = getQuickSuggestions();

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center">
            <Bot className="w-5 h-5 text-foreground" />
          </div>
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              AYN Admin Assistant
              <Badge variant="secondary" className="text-[10px] font-normal">
                AYN
              </Badge>
            </h2>
            <p className="text-sm text-muted-foreground">
              System operations & insights
            </p>
          </div>
        </div>
        
        <Button 
          variant="ghost" 
          size="sm"
          onClick={clearChat}
          className="text-muted-foreground hover:text-foreground"
        >
          <Trash2 className="w-4 h-4 mr-2" />
          Clear
        </Button>
      </div>

      {/* Chat Card */}
      <Card className="border border-border bg-card overflow-hidden">
        {/* Stats Panel */}
        <AdminStatsPanel 
          stats={stats} 
          isLoading={isLoadingStats}
          onStatClick={sendMessage}
          onRefresh={fetchStats}
        />

        {/* Messages */}
        <CardContent className="p-0">
          <ScrollArea className="h-[350px]" ref={scrollRef}>
            <div className="p-4 space-y-4">
              {messages.map((msg, i) => (
                <ChatMessage 
                  key={i} 
                  message={msg} 
                  onExecuteAction={executeAction}
                />
              ))}
              
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-muted border border-border rounded-2xl">
                    <TypingIndicator />
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Quick Suggestions */}
          {messages.length <= 1 && !isLoading && (
            <div className="px-4 pb-4">
              <p className="text-xs text-muted-foreground mb-2">Quick actions:</p>
              <div className="flex flex-wrap gap-2">
                {quickSuggestions.map((suggestion, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(suggestion.text)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted border border-border hover:bg-muted/80 transition-colors text-sm"
                  >
                    <suggestion.icon className="w-3.5 h-3.5 text-muted-foreground" />
                    <span>{suggestion.text}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input Area */}
          <div className="p-3 border-t border-border">
            <div className="relative bg-muted/50 border border-border rounded-xl overflow-hidden">
              <div className="flex items-end gap-2 p-2">
                <Textarea
                  ref={textareaRef}
                  placeholder="Ask about system health, tests, rate limits..."
                  value={input}
                  onChange={handleTextareaChange}
                  onKeyDown={handleKeyPress}
                  disabled={isLoading}
                  className={cn(
                    "flex-1 resize-none min-h-[44px] max-h-[160px]",
                    "text-sm bg-transparent",
                    "border-0 focus-visible:ring-0 focus-visible:ring-offset-0",
                    "px-2 py-2"
                  )}
                />
                
                <AnimatePresence>
                  {input.trim() && !isLoading && (
                    <motion.button
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      onClick={() => sendMessage()}
                      className="shrink-0 w-9 h-9 rounded-lg bg-foreground text-background flex items-center justify-center hover:opacity-90 transition-opacity"
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

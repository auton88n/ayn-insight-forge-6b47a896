import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Bot, 
  Send, 
  X, 
  Sparkles, 
  HelpCircle, 
  Lightbulb,
  CheckCircle,
  MessageSquare,
  ChevronRight,
  Maximize2,
  Minimize2,
  Code2,
  BookOpen,
  AlertTriangle,
  Zap,
  FileText,
  Calculator,
  Clock,
  Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/config';
import { toast } from '@/hooks/use-toast';
import { CalculatorType } from '@/lib/engineeringKnowledge';
import { MessageFormatter } from '@/components/shared/MessageFormatter';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  structuredData?: {
    formula?: {
      name: string;
      expression: string;
      variables?: Record<string, { value: number | string; unit: string }>;
    };
    calculation?: {
      steps: string[];
      result: number | string;
      unit: string;
    };
    codeReference?: {
      standard: string;
      section: string;
      requirement: string;
    };
    alternatives?: Array<{
      description: string;
      costImpact?: number;
      pros: string[];
      cons: string[];
    }>;
    warning?: string;
    quickReplies?: string[];
  };
}

interface EngSession {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
}

interface EngineeringAIChatProps {
  calculatorType: CalculatorType;
  currentInputs: Record<string, unknown>;
  currentOutputs: Record<string, unknown> | null;
  isOpen: boolean;
  onClose: () => void;
}

const MAX_SESSIONS = 20;

function generateId(): string {
  return crypto.randomUUID?.() || Math.random().toString(36).slice(2, 10);
}

function getSessionsKey(calcType: string) {
  return `ayn-engineering-chat-sessions-${calcType}`;
}

function loadSessions(calcType: string): EngSession[] {
  try {
    const stored = localStorage.getItem(getSessionsKey(calcType));
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return parsed.map((s: any) => ({
      ...s,
      messages: s.messages.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) })),
    }));
  } catch { return []; }
}

function saveSessions(calcType: string, sessions: EngSession[]) {
  try {
    localStorage.setItem(getSessionsKey(calcType), JSON.stringify(sessions.slice(0, MAX_SESSIONS)));
  } catch { /* storage full */ }
}

const QUICK_ACTIONS: Record<CalculatorType, { label: string; icon: typeof HelpCircle; question: string }[]> = {
  beam: [
    { label: 'Explain the design calculations', icon: Calculator, question: 'Explain why this beam design was chosen. Show me the step-by-step calculations with actual numbers from my inputs.' },
    { label: 'Check code compliance', icon: BookOpen, question: 'Does this design comply with the selected building code requirements? Check min/max reinforcement, span/depth ratios, and deflection limits.' },
    { label: 'Optimize for cost', icon: Lightbulb, question: 'How can I optimize this beam design to reduce cost? Analyze concrete and steel quantities and suggest alternatives.' },
    { label: 'Check shear design', icon: AlertTriangle, question: 'Verify the shear design. Calculate Vc, Vs, and check if stirrup spacing is adequate per the applicable code provisions.' },
    { label: 'Deflection analysis', icon: Zap, question: 'Calculate the expected deflection for this beam. Is it within L/250 for total and L/500 after partitions?' },
  ],
  column: [
    { label: 'Explain slenderness effects', icon: Calculator, question: 'Analyze the slenderness effects for this column. Calculate klu/r and determine if moment magnification is needed per ACI 318-19.' },
    { label: 'Check P-M interaction', icon: CheckCircle, question: 'Is this column adequate for the applied loads? Explain the P-M interaction diagram and where this design falls.' },
    { label: 'Biaxial bending check', icon: BookOpen, question: 'Check this column for biaxial bending using the Bresler equation. Show the calculation steps.' },
    { label: 'Reduce size safely', icon: Lightbulb, question: 'Can I reduce the column size while maintaining adequate safety? What is the utilization ratio?' },
  ],
  foundation: [
    { label: 'Explain bearing pressure', icon: Calculator, question: 'Calculate and explain the bearing pressure distribution. Is the soil bearing capacity adequate? Show eccentricity effects.' },
    { label: 'Check punching shear', icon: AlertTriangle, question: 'Verify the punching shear design at d/2 from the column face. Calculate the critical perimeter, Vc, and required thickness.' },
    { label: 'Flexural reinforcement', icon: BookOpen, question: 'Explain the flexural reinforcement design in both directions. Show moment calculations at critical sections.' },
    { label: 'Foundation alternatives', icon: Lightbulb, question: 'Would a different foundation type (combined, mat, pile) be more economical for this loading condition?' },
  ],
  slab: [
    { label: 'One-way vs two-way', icon: Calculator, question: 'Is this a one-way or two-way slab? Explain based on aspect ratio and show how reinforcement should be distributed.' },
    { label: 'Check deflection limits', icon: AlertTriangle, question: 'Will deflection be within acceptable limits (L/250)? Calculate using ACI simplified method or effective moment of inertia.' },
    { label: 'Optimize thickness', icon: Lightbulb, question: 'Can I reduce the slab thickness? What is the minimum per ACI 318-19 Table 7.3.1.1 for deflection control?' },
    { label: 'Punching at columns', icon: BookOpen, question: 'If this is a flat slab, check punching shear at column supports. Calculate critical section and required shear reinforcement.' },
  ],
  retaining_wall: [
    { label: 'Explain stability checks', icon: Calculator, question: 'Explain all stability checks: overturning (FS≥2.0), sliding (FS≥1.5), and bearing (FS≥3.0). Show calculations with my inputs.' },
    { label: 'Earth pressure analysis', icon: BookOpen, question: 'Calculate active earth pressure using Rankine theory. How does the backfill angle and surcharge affect the design?' },
    { label: 'Stem reinforcement', icon: AlertTriangle, question: 'Design the stem reinforcement. Calculate the moment at the base and required As. Check min/max limits.' },
    { label: 'Drainage provisions', icon: Lightbulb, question: 'What drainage provisions should I include? How does water affect the lateral pressure and stability?' },
  ],
  grading: [
    { label: 'Explain earthwork balance', icon: Calculator, question: 'Analyze the cut/fill balance. How can I optimize the finished grade levels to minimize earthwork costs?' },
    { label: 'Drainage slopes', icon: AlertTriangle, question: 'Are the drainage slopes adequate (min 1-2%)? Identify any low points that might cause ponding.' },
    { label: 'Compaction requirements', icon: BookOpen, question: 'What are the compaction specifications for different fill zones? How does soil type affect these requirements?' },
    { label: 'Cost optimization', icon: Lightbulb, question: 'How can I minimize earthwork costs? Consider haul distances, borrow vs waste, and staging.' },
  ],
  
};

export const EngineeringAIChat = ({
  calculatorType,
  currentInputs,
  currentOutputs,
  isOpen,
  onClose
}: EngineeringAIChatProps) => {
  const [allSessions, setAllSessions] = useState<EngSession[]>(() => loadSessions(calculatorType));
  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => {
    const s = loadSessions(calculatorType);
    return s.length > 0 ? s[0].id : null;
  });
  const [messages, setMessages] = useState<Message[]>(() => {
    const s = loadSessions(calculatorType);
    return s.length > 0 ? s[0].messages : [];
  });
  const [historyOpen, setHistoryOpen] = useState(false);

  // Persist sessions
  useEffect(() => {
    if (activeSessionId && messages.length > 0) {
      setAllSessions(prev => {
        const idx = prev.findIndex(s => s.id === activeSessionId);
        const title = messages.find(m => m.role === 'user')?.content.slice(0, 40) || 'New Chat';
        const updated: EngSession = { id: activeSessionId, title, messages, updatedAt: Date.now() };
        let next: EngSession[];
        if (idx >= 0) {
          next = [...prev];
          next[idx] = updated;
        } else {
          next = [updated, ...prev];
        }
        next.sort((a, b) => b.updatedAt - a.updatedAt);
        saveSessions(calculatorType, next);
        return next;
      });
    }
  }, [messages, activeSessionId, calculatorType]);

  const switchSession = useCallback((id: string) => {
    const s = allSessions.find(s => s.id === id);
    if (s) {
      setActiveSessionId(s.id);
      setMessages(s.messages);
    }
  }, [allSessions]);

  const startNewChat = useCallback(() => {
    const id = generateId();
    setActiveSessionId(id);
    setMessages([]);
    setStreamingContent('');
  }, []);

  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(0);

  const quickActions = QUICK_ACTIONS[calculatorType] || QUICK_ACTIONS.beam;

  // Scroll detection handler
  const handleScroll = useCallback(() => {
    const viewport = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]');
    if (!viewport) return;
    
    const { scrollTop, scrollHeight, clientHeight } = viewport;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
    setShouldAutoScroll(isNearBottom);
  }, []);

  // Smart auto-scroll
  useEffect(() => {
    const newMessageAdded = messages.length > prevMessageCountRef.current;
    const isStreaming = streamingContent.length > 0;
    
    if ((newMessageAdded || isStreaming) && shouldAutoScroll) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevMessageCountRef.current = messages.length;
  }, [messages.length, streamingContent, shouldAutoScroll]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const sendMessage = useCallback(async (question: string) => {
    if (!question.trim() || isLoading) return;

    if (!activeSessionId) {
      const id = generateId();
      setActiveSessionId(id);
    }

    setIsLoading(true);
    setStreamingContent('');

    const userMessage: Message = {
      role: 'user',
      content: question,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');

    try {
      const conversationHistory = messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/engineering-ai-chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            calculatorType,
            currentInputs,
            currentOutputs,
            question,
            conversationHistory,
            stream: true
          }),
        }
      );

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error('Rate limit exceeded. Please wait a moment and try again.');
        }
        if (response.status === 402) {
          throw new Error('AI credits depleted. Please contact support.');
        }
        throw new Error('Failed to get AI response');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';
      let structuredData: Message['structuredData'] = undefined;

      if (reader) {
        let buffer = '';
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          
          buffer += decoder.decode(value, { stream: true });
          
          let newlineIndex: number;
          while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, newlineIndex).trim();
            buffer = buffer.slice(newlineIndex + 1);
            
            if (line.startsWith(':') || line === '') continue;
            if (!line.startsWith('data: ')) continue;
            
            const jsonStr = line.slice(6).trim();
            if (jsonStr === '[DONE]') continue;
            
            try {
              const parsed = JSON.parse(jsonStr);
              
              if (parsed.structuredData) {
                structuredData = parsed.structuredData;
              }
              
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                fullContent += content;
                setStreamingContent(fullContent);
              }
            } catch {
              buffer = line + '\n' + buffer;
              break;
            }
          }
        }
      }

      const assistantMessage: Message = {
        role: 'assistant',
        content: fullContent || 'I apologize, but I could not generate a response. Please try again.',
        timestamp: new Date(),
        structuredData
      };
      setMessages(prev => [...prev, assistantMessage]);
      setStreamingContent('');

    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('AI Chat error:', error);
      }
      const errorMessage = error instanceof Error ? error.message : 'Failed to get AI response';
      
      toast({
        title: "AI Error",
        description: errorMessage,
        variant: "destructive"
      });

      const errorAssistantMessage: Message = {
        role: 'assistant',
        content: `I apologize, but I encountered an error: ${errorMessage}. Please try again.`,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorAssistantMessage]);
      setStreamingContent('');
    } finally {
      setIsLoading(false);
    }
  }, [calculatorType, currentInputs, currentOutputs, messages, isLoading, activeSessionId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim() && !isLoading) {
      sendMessage(inputValue.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  if (!isOpen) return null;

  const panelWidth = isExpanded ? 'w-full md:w-[600px] lg:w-[800px]' : 'w-full md:w-[450px]';

  return (
    <motion.div
      initial={{ opacity: 0, x: 300 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 300 }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className={`fixed right-0 top-0 h-full ${panelWidth} bg-background border-l border-border shadow-2xl z-50 flex flex-col`}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-gradient-to-r from-primary/5 to-primary/10">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary to-primary/70 shadow-lg">
            <Bot className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h3 className="font-semibold">Engineering AI Assistant</h3>
            <p className="text-xs text-muted-foreground capitalize flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              {calculatorType.replace('_', ' ')} Expert 
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {/* History */}
          <Popover open={historyOpen} onOpenChange={setHistoryOpen}>
            <TooltipProvider>
              <Tooltip>
                <PopoverTrigger asChild>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <Clock className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                </PopoverTrigger>
                <TooltipContent side="bottom" className="text-xs">Chat history</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <PopoverContent
              side="bottom"
              align="end"
              className="w-72 p-0 max-h-[300px] overflow-hidden"
              sideOffset={8}
            >
              <div className="px-3 py-2 border-b border-border/50 text-xs font-medium text-muted-foreground">
                Chat History
              </div>
              <ScrollArea className="max-h-[260px]">
                {allSessions.length === 0 ? (
                  <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                    No previous chats
                  </div>
                ) : (
                  <div className="py-1">
                    {allSessions.map((session) => (
                      <button
                        key={session.id}
                        onClick={() => {
                          switchSession(session.id);
                          setHistoryOpen(false);
                        }}
                        className={cn(
                          "w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors flex items-start gap-2",
                          session.id === activeSessionId && "bg-primary/10 border-l-2 border-primary"
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{session.title}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {formatDistanceToNow(session.updatedAt, { addSuffix: true })}
                          </p>
                        </div>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {session.messages.length} msgs
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </PopoverContent>
          </Popover>

          {/* New Chat */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={startNewChat}>
                  <Plus className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">New chat</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-8 w-8 hidden md:flex"
            title={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Messages Area */}
      <ScrollArea 
        ref={scrollAreaRef}
        className="flex-1 p-4"
        style={{ contain: 'strict' }}
        onScrollCapture={handleScroll}
      >
        {messages.length === 0 && !streamingContent ? (
          <div className="space-y-6">
            {/* Welcome Message */}
            <div className="text-center space-y-4 py-6">
              <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/20">
                <Sparkles className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h4 className="text-lg font-semibold">Engineering AI Assistant</h4>
                <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">
                  I'm your expert structural engineering consultant. Ask me anything about your {calculatorType.replace('_', ' ')} design.
                </p>
              </div>
            </div>

            {/* Context Status */}
            <div className="bg-muted/30 rounded-xl p-4 border border-border/50">
              <p className="text-xs text-muted-foreground font-medium mb-3 flex items-center gap-2">
                <FileText className="h-3.5 w-3.5" />
                Design Context
              </p>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${currentOutputs ? 'bg-green-500 animate-pulse' : 'bg-amber-500'}`} />
                  <span className="text-xs">
                    {currentOutputs ? 'Calculation results loaded' : 'Waiting for calculation...'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  <span className="text-xs">
                    {Object.keys(currentInputs).length} input parameters available
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground font-medium px-1 flex items-center gap-2">
                <Zap className="h-3.5 w-3.5" />
                Quick Questions
              </p>
              <div className="grid gap-2">
                {quickActions.map((action, i) => (
                  <Button
                    key={i}
                    variant="outline"
                    size="sm"
                    onClick={() => sendMessage(action.question)}
                    className="w-full justify-start text-left h-auto py-3 px-4 hover:bg-primary/5 hover:border-primary/30 transition-all"
                    disabled={isLoading}
                  >
                    <div className="flex items-start gap-3 w-full">
                      <action.icon className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      <span className="text-sm leading-relaxed">{action.label}</span>
                    </div>
                  </Button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <AnimatePresence>
              {messages.map((message, index) => (
                <MessageBubble 
                  key={index} 
                  message={message} 
                  onQuickReply={sendMessage}
                />
              ))}
            </AnimatePresence>

            {/* Streaming Content */}
            {streamingContent && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-start gap-3"
              >
                <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <div className="bg-muted/50 rounded-2xl rounded-tl-md px-4 py-3 flex-1 max-w-[90%]">
                  <MessageFormatter content={streamingContent} className="prose prose-sm dark:prose-invert max-w-none" />
                  <div className="flex items-center gap-1 mt-2">
                    <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </motion.div>
            )}

            {/* Loading Indicator */}
            {isLoading && !streamingContent && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-start gap-3"
              >
                <div className="p-2 rounded-lg bg-primary/10">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <div className="bg-muted/50 rounded-2xl rounded-tl-md px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    <span className="text-xs text-muted-foreground">Analyzing your design...</span>
                  </div>
                </div>
              </motion.div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </ScrollArea>

      {/* Input Area */}
      <div className="p-4 border-t border-border bg-muted/20">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="relative">
            <Textarea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about your design, code compliance, optimizations..."
              className="min-h-[80px] pr-12 resize-none bg-background"
              disabled={isLoading}
            />
            <Button
              type="submit"
              size="icon"
              disabled={!inputValue.trim() || isLoading}
              className="absolute right-2 bottom-2 h-8 w-8"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground text-center">
            Press Enter to send • Shift+Enter for new line
          </p>
        </form>
      </div>
    </motion.div>
  );
};

// Message Bubble Component
const MessageBubble = ({ 
  message, 
  onQuickReply 
}: { 
  message: Message; 
  onQuickReply: (question: string) => void;
}) => {
  if (message.role === 'user') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-end"
      >
        <div className="max-w-[85%] bg-primary text-primary-foreground rounded-2xl rounded-br-md px-4 py-3">
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-3"
    >
      <div className="p-2 rounded-lg bg-primary/10 shrink-0">
        <Bot className="h-4 w-4 text-primary" />
      </div>
      <div className="space-y-3 flex-1 max-w-[90%]">
        {/* Main Content */}
        <div className="bg-muted/50 rounded-2xl rounded-tl-md px-4 py-3">
          <MessageFormatter content={message.content} className="prose prose-sm dark:prose-invert max-w-none" />
        </div>

        {/* Structured Data Cards */}
        {message.structuredData && (
          <div className="space-y-2">
            {message.structuredData.warning && (
              <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-700 dark:text-amber-300">{message.structuredData.warning}</p>
              </div>
            )}

            {message.structuredData.formula && (
              <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Code2 className="h-4 w-4 text-blue-500" />
                  <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
                    {message.structuredData.formula.name}
                  </span>
                </div>
                <code className="text-sm font-mono bg-blue-500/10 px-2 py-1 rounded">
                  {message.structuredData.formula.expression}
                </code>
                {message.structuredData.formula.variables && (
                  <div className="mt-2 grid grid-cols-2 gap-1 text-xs">
                    {Object.entries(message.structuredData.formula.variables).map(([key, val]) => (
                      <div key={key} className="text-muted-foreground">
                        {key} = {val.value} {val.unit}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {message.structuredData.calculation && (
              <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Calculator className="h-4 w-4 text-green-500" />
                  <span className="text-xs font-medium text-green-700 dark:text-green-300">Calculation</span>
                </div>
                <ol className="text-xs space-y-1 list-decimal list-inside">
                  {message.structuredData.calculation.steps.map((step, i) => (
                    <li key={i} className="text-muted-foreground">{step}</li>
                  ))}
                </ol>
                <div className="mt-2 font-semibold text-sm">
                  Result: {message.structuredData.calculation.result} {message.structuredData.calculation.unit}
                </div>
              </div>
            )}

            {message.structuredData.codeReference && (
              <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <BookOpen className="h-4 w-4 text-purple-500" />
                  <span className="text-xs font-medium text-purple-700 dark:text-purple-300">
                    {message.structuredData.codeReference.standard} - Section {message.structuredData.codeReference.section}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{message.structuredData.codeReference.requirement}</p>
              </div>
            )}

            {message.structuredData.quickReplies && message.structuredData.quickReplies.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-2">
                {message.structuredData.quickReplies.slice(0, 3).map((reply, i) => (
                  <Button
                    key={i}
                    variant="outline"
                    size="sm"
                    onClick={() => onQuickReply(reply)}
                    className="text-xs h-7 px-3"
                  >
                    {reply.length > 40 ? reply.substring(0, 40) + '...' : reply}
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default EngineeringAIChat;

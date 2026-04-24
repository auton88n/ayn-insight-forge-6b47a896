import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Brain, 
  Lightbulb, 
  Sparkles, 
  ChevronDown, 
  ChevronUp,
  Send,
  Wand2,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Zap,
  MessageSquare,
  TrendingUp,
  Activity,
  ArrowRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/config';
import { CalculatorType } from '@/lib/engineeringKnowledge';

interface Suggestion {
  field: string;
  label: string;
  currentValue: any;
  suggestedValue: any;
  reason: string;
  priority: 'high' | 'medium' | 'low';
}

interface Warning {
  type: 'error' | 'warning' | 'info';
  message: string;
  field?: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface AnalysisInsight {
  icon: 'check' | 'trend' | 'alert';
  text: string;
  type: 'positive' | 'neutral' | 'warning';
}

interface AICalculatorAssistantProps {
  calculatorType: CalculatorType;
  inputs: Record<string, any>;
  outputs: Record<string, any> | null;
  onApplySuggestion: (field: string, value: any) => void;
  onApplyAllSuggestions: (values: Record<string, any>) => void;
}

const QUICK_ACTIONS: Record<CalculatorType, { label: string; prompt: string; icon: 'sparkles' | 'zap' | 'trend' }[]> = {
  beam: [
    { label: 'Optimize depth', prompt: 'What is the optimal depth for this beam based on span/depth ratios?', icon: 'sparkles' },
    { label: 'Check deflection', prompt: 'Will this beam meet deflection limits under service loads?', icon: 'trend' },
    { label: 'Reduce steel', prompt: 'How can I reduce the steel requirement while maintaining safety?', icon: 'zap' },
  ],
  column: [
    { label: 'Check slenderness', prompt: 'Is this column slender? Should I consider second-order effects?', icon: 'trend' },
    { label: 'Optimize section', prompt: 'What is the minimum section size for this load?', icon: 'sparkles' },
    { label: 'Tie spacing', prompt: 'What tie spacing is required per ACI 318?', icon: 'zap' },
  ],
  foundation: [
    { label: 'Check bearing', prompt: 'Is the bearing pressure within allowable limits?', icon: 'trend' },
    { label: 'Optimize size', prompt: 'What is the minimum foundation size for this load?', icon: 'sparkles' },
    { label: 'Punching shear', prompt: 'Is punching shear a concern? What reinforcement is needed?', icon: 'zap' },
  ],
  slab: [
    { label: 'Minimum thickness', prompt: 'What is the minimum slab thickness to control deflection?', icon: 'sparkles' },
    { label: 'Rebar layout', prompt: 'What is the optimal reinforcement layout for this slab?', icon: 'zap' },
    { label: 'Crack control', prompt: 'How do I ensure crack widths are within limits?', icon: 'trend' },
  ],
  retaining_wall: [
    { label: 'Stability check', prompt: 'Is the wall stable against overturning and sliding?', icon: 'trend' },
    { label: 'Drainage', prompt: 'What drainage provisions are recommended?', icon: 'zap' },
    { label: 'Key design', prompt: 'Do I need a key? What size should it be?', icon: 'sparkles' },
  ],
  grading: [
    { label: 'Cut/fill balance', prompt: 'How can I balance cut and fill volumes?', icon: 'sparkles' },
    { label: 'Drainage design', prompt: 'What slope is needed for proper drainage?', icon: 'trend' },
    { label: 'Cost estimate', prompt: 'What is the estimated earthwork cost?', icon: 'zap' },
  ],
  // parking: (hidden for now)
};

export const AICalculatorAssistant: React.FC<AICalculatorAssistantProps> = ({
  calculatorType,
  inputs,
  outputs,
  onApplySuggestion,
  onApplyAllSuggestions,
}) => {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [warnings, setWarnings] = useState<Warning[]>([]);
  const [insights, setInsights] = useState<AnalysisInsight[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const [analysisStatus, setAnalysisStatus] = useState<'idle' | 'analyzing' | 'ready'>('idle');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastAnalyzedInputs = useRef<string>('');

  // Smart auto-scroll state
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const prevMessageCountRef = useRef(0);

  // Smart auto-scroll: only when NEW messages are added and user is near bottom
  useEffect(() => {
    const newMessageAdded = chatMessages.length > prevMessageCountRef.current;
    const isStreaming = streamingContent.length > 0;
    
    if ((newMessageAdded || isStreaming) && shouldAutoScroll) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevMessageCountRef.current = chatMessages.length;
  }, [chatMessages.length, streamingContent, shouldAutoScroll]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 100) + 'px';
    }
  }, [chatInput]);



  const analyzeInputs = useCallback(async () => {
    const newWarnings: Warning[] = [];
    const newSuggestions: Suggestion[] = [];
    const newInsights: AnalysisInsight[] = [];

    // Parking-specific analysis (hidden for now)

    // Beam-specific analysis
    if (calculatorType === 'beam' && inputs.span && inputs.width) {
      const span = parseFloat(inputs.span);
      const width = parseFloat(inputs.width);
      
      if (span > 0 && width > 0) {
        const recommendedDepth = (span * 1000) / 16;
        
        newInsights.push({
          icon: 'check',
          text: `Span: ${span}m — Recommended depth ≥ ${Math.round(recommendedDepth)}mm`,
          type: 'positive'
        });

        if (!inputs.depth || parseFloat(inputs.depth) < recommendedDepth * 0.8) {
          newSuggestions.push({
            field: 'depth',
            label: 'Beam Depth',
            currentValue: inputs.depth || 'Not set',
            suggestedValue: Math.ceil(recommendedDepth / 25) * 25,
            reason: `For span/depth ratio ≤ 16 (simply supported), depth should be ≥ ${Math.round(recommendedDepth)}mm`,
            priority: 'high',
          });
        }

        if (width < 200) {
          newWarnings.push({
            type: 'warning',
            message: 'Beam width < 200mm may cause construction difficulties',
            field: 'width',
          });
        }
      }
    }

    // Column-specific analysis
    if (calculatorType === 'column' && inputs.height && inputs.width) {
      const height = parseFloat(inputs.height) * 1000;
      const width = parseFloat(inputs.width);
      const slenderness = height / (width * 0.3);
      
      newInsights.push({
        icon: slenderness > 22 ? 'alert' : 'check',
        text: `Slenderness ratio: ${slenderness.toFixed(1)} ${slenderness > 22 ? '(needs P-Δ analysis)' : '(OK)'}`,
        type: slenderness > 22 ? 'warning' : 'positive'
      });

      if (slenderness > 22) {
        newWarnings.push({
          type: 'warning',
          message: `Slenderness ratio ≈ ${slenderness.toFixed(1)} > 22. Second-order effects should be considered.`,
        });
      }
    }

    // Foundation-specific analysis
    if (calculatorType === 'foundation' && inputs.columnLoad && inputs.bearingCapacity) {
      const load = parseFloat(inputs.columnLoad);
      const bearing = parseFloat(inputs.bearingCapacity);
      const minArea = (load * 1.5) / bearing;
      const minSize = Math.sqrt(minArea);
      
      newInsights.push({
        icon: 'check',
        text: `Required area: ${minArea.toFixed(2)} m² — Min size: ${minSize.toFixed(2)}m × ${minSize.toFixed(2)}m`,
        type: 'positive'
      });

      if (!inputs.length || parseFloat(inputs.length) < minSize) {
        newSuggestions.push({
          field: 'length',
          label: 'Foundation Length',
          currentValue: inputs.length || 'Not set',
          suggestedValue: Math.ceil(minSize * 10) / 10,
          reason: `Minimum size for bearing capacity: ${minSize.toFixed(2)}m × ${minSize.toFixed(2)}m`,
          priority: 'high',
        });
      }
    }

    setSuggestions(newSuggestions);
    setWarnings(newWarnings);
    setInsights(newInsights);
  }, [calculatorType, inputs]);

  // Analyze inputs when they change (debounced)
  useEffect(() => {
    const inputsString = JSON.stringify(inputs);
    if (inputsString === lastAnalyzedInputs.current) return;
    
    setAnalysisStatus('analyzing');
    const timer = setTimeout(() => {
      analyzeInputs();
      lastAnalyzedInputs.current = inputsString;
      setAnalysisStatus('ready');
    }, 1000);

    return () => clearTimeout(timer);
  }, [inputs, analyzeInputs]);

  const requestAIOptimization = async () => {
    setIsAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke('engineering-ai-chat', {
        body: {
          calculatorType,
          currentInputs: inputs,
          currentOutputs: outputs,
          messages: [
            {
              role: 'user',
              content: `Analyze my current inputs and provide specific optimized values. Return a JSON object with suggested field values and reasons. Current inputs: ${JSON.stringify(inputs)}`,
            },
          ],
        },
      });

      if (error) throw error;
      if (data?.suggestions) {
        setSuggestions(data.suggestions);
      }
    } catch (err) {
      console.error('AI optimization error:', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const sendChatMessage = async (message: string) => {
    if (!message.trim() || isSending) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: message,
      timestamp: new Date(),
    };
    setChatMessages(prev => [...prev, userMessage]);
    setChatInput('');
    setIsSending(true);
    setStreamingContent('');

    try {
      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/engineering-ai-chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            calculatorType,
            currentInputs: inputs,
            currentOutputs: outputs,
            messages: [
              ...chatMessages.map(m => ({ role: m.role, content: m.content })),
              { role: 'user', content: message },
            ],
            stream: true,
          }),
        }
      );

      if (!response.ok) throw new Error('Stream failed');

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';
      let buffer = '';

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);

          if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;

          try {
            const parsed = JSON.parse(line.slice(6));
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              fullContent += content;
              setStreamingContent(fullContent);
            }
          } catch {
            // Partial JSON, continue
          }
        }
      }

      setChatMessages(prev => [
        ...prev,
        { role: 'assistant', content: fullContent, timestamp: new Date() },
      ]);
      setStreamingContent('');
    } catch (err) {
      console.error('Chat error:', err);
      setChatMessages(prev => [
        ...prev,
        { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.', timestamp: new Date() },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const handleQuickAction = (prompt: string) => {
    sendChatMessage(prompt);
    if (!isChatOpen) setIsChatOpen(true);
  };

  const applyAllSuggestions = () => {
    const values: Record<string, any> = {};
    suggestions.forEach(s => {
      values[s.field] = s.suggestedValue;
    });
    onApplyAllSuggestions(values);
    setSuggestions([]);
  };

  const quickActions = QUICK_ACTIONS[calculatorType] || [];

  return (
    <div className="space-y-4">
      {/* AI Analysis Card - Always visible inline insights */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 via-background to-accent/5"
      >
        {/* Subtle animated background */}
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-24 h-24 bg-accent/10 rounded-full blur-2xl" />
        </div>

        <div className="relative p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <motion.div 
                className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center"
                animate={analysisStatus === 'analyzing' ? { scale: [1, 1.05, 1] } : {}}
                transition={{ repeat: Infinity, duration: 2 }}
              >
                <Brain className="w-5 h-5 text-primary" />
                {analysisStatus === 'analyzing' && (
                  <motion.div 
                    className="absolute inset-0 rounded-xl border-2 border-primary/40"
                    animate={{ scale: [1, 1.2, 1], opacity: [1, 0, 1] }}
                    transition={{ repeat: Infinity, duration: 1.5 }}
                  />
                )}
              </motion.div>
              <div>
                <h3 className="font-semibold text-sm">AI Engineering Analysis</h3>
                <p className="text-xs text-muted-foreground">
                  {analysisStatus === 'analyzing' ? 'Analyzing inputs...' : 'Real-time design insights'}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={requestAIOptimization}
              disabled={isAnalyzing}
              className="gap-2 bg-background/50 backdrop-blur-sm border-primary/30 hover:border-primary/50 hover:bg-primary/10"
            >
              {isAnalyzing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Wand2 className="w-3.5 h-3.5" />
              )}
              <span className="hidden sm:inline">AI Optimize</span>
            </Button>
          </div>

          {/* Real-time Insights */}
          <AnimatePresence mode="wait">
            {insights.length > 0 && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="mb-3"
              >
                <div className="flex flex-wrap gap-2">
                  {insights.map((insight, i) => (
                    <motion.div
                      key={i}
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: i * 0.1 }}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium ${
                        insight.type === 'positive' 
                          ? 'bg-green-500/10 text-green-600 dark:text-green-400' 
                          : insight.type === 'warning'
                          ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                          : 'bg-primary/10 text-primary'
                      }`}
                    >
                      {insight.icon === 'check' && <CheckCircle2 className="w-3.5 h-3.5" />}
                      {insight.icon === 'trend' && <TrendingUp className="w-3.5 h-3.5" />}
                      {insight.icon === 'alert' && <AlertTriangle className="w-3.5 h-3.5" />}
                      {insight.text}
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Warnings */}
          <AnimatePresence>
            {warnings.length > 0 && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="mb-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20"
              >
                {warnings.map((warning, i) => (
                  <motion.div 
                    key={i} 
                    initial={{ x: -10, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: i * 0.05 }}
                    className="flex items-start gap-2 text-sm"
                  >
                    <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                    <span className="text-destructive">{warning.message}</span>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Suggestions with Apply */}
          <AnimatePresence>
            {suggestions.length > 0 && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Lightbulb className="w-4 h-4 text-yellow-500" />
                    <span className="text-sm font-medium">Suggestions</span>
                    <Badge variant="secondary" className="text-xs bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">
                      {suggestions.length}
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={applyAllSuggestions}
                    className="text-xs gap-1.5 text-primary hover:bg-primary/10"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    Apply All
                  </Button>
                </div>
                
                {suggestions.map((suggestion, i) => (
                  <motion.div
                    key={i}
                    initial={{ x: -10, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: i * 0.1 }}
                    className="flex items-center justify-between p-3 bg-background/80 backdrop-blur-sm rounded-lg border border-border/50 hover:border-primary/30 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium">{suggestion.label}</span>
                        <Badge
                          variant="outline"
                          className={`text-xs ${
                            suggestion.priority === 'high' 
                              ? 'border-destructive/50 text-destructive' 
                              : suggestion.priority === 'medium'
                              ? 'border-amber-500/50 text-amber-600 dark:text-amber-400'
                              : 'border-muted'
                          }`}
                        >
                          {suggestion.priority}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {suggestion.reason}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5 text-xs">
                        <span className="text-muted-foreground font-mono">{suggestion.currentValue}</span>
                        <ArrowRight className="w-3 h-3 text-muted-foreground" />
                        <span className="text-primary font-mono font-medium">{suggestion.suggestedValue}</span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onApplySuggestion(suggestion.field, suggestion.suggestedValue)}
                      className="shrink-0 ml-3 h-8 w-8 p-0 hover:bg-primary/10 hover:text-primary"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                    </Button>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-2">
        {quickActions.map((action, i) => (
          <motion.button
            key={i}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => handleQuickAction(action.prompt)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium bg-gradient-to-r from-primary/10 to-accent/10 hover:from-primary/20 hover:to-accent/20 border border-primary/20 hover:border-primary/40 transition-all duration-200"
          >
            {action.icon === 'sparkles' && <Sparkles className="w-3 h-3 text-primary" />}
            {action.icon === 'zap' && <Zap className="w-3 h-3 text-accent" />}
            {action.icon === 'trend' && <TrendingUp className="w-3 h-3 text-green-500" />}
            {action.label}
          </motion.button>
        ))}
      </div>

      {/* Chat Section */}
      <div className="rounded-xl border border-border overflow-hidden bg-card">
        <Collapsible open={isChatOpen} onOpenChange={setIsChatOpen}>
          <CollapsibleTrigger asChild>
            <button className="w-full px-4 py-3 flex items-center justify-between text-sm hover:bg-accent/30 transition-colors group">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-primary" />
                <span className="font-medium">Chat with AI Engineer</span>
                {chatMessages.length > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {chatMessages.length}
                  </Badge>
                )}
              </div>
              <motion.div
                animate={{ rotate: isChatOpen ? 180 : 0 }}
                transition={{ duration: 0.2 }}
              >
                <ChevronDown className="w-4 h-4 text-muted-foreground group-hover:text-foreground" />
              </motion.div>
            </button>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <div className="border-t border-border">
              {/* Chat Messages */}
              <ScrollArea className="h-64 px-4 py-3">
                {chatMessages.length === 0 && !streamingContent && (
                  <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground py-8">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                      <Brain className="w-6 h-6 text-primary/60" />
                    </div>
                    <p className="text-sm font-medium mb-1">Ask anything about your design</p>
                    <p className="text-xs">Code compliance, optimization, best practices...</p>
                  </div>
                )}
                
                <div className="space-y-3">
                  {chatMessages.map((msg, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[85%] p-3 rounded-2xl text-sm ${
                          msg.role === 'user'
                            ? 'bg-primary text-primary-foreground rounded-br-md'
                            : 'bg-muted rounded-bl-md'
                        }`}
                      >
                        {msg.content}
                      </div>
                    </motion.div>
                  ))}
                  
                  {streamingContent && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex justify-start"
                    >
                      <div className="max-w-[85%] p-3 rounded-2xl rounded-bl-md text-sm bg-muted">
                        {streamingContent}
                        <motion.span 
                          className="inline-block w-1.5 h-4 ml-1 bg-primary rounded-sm"
                          animate={{ opacity: [1, 0, 1] }}
                          transition={{ repeat: Infinity, duration: 0.8 }}
                        />
                      </div>
                    </motion.div>
                  )}
                </div>
                <div ref={chatEndRef} />
              </ScrollArea>

              {/* Chat Input */}
              <div className="p-3 border-t border-border bg-muted/30">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    sendChatMessage(chatInput);
                  }}
                  className="flex gap-2 items-end"
                >
                  <div className="flex-1 relative">
                    <textarea
                      ref={inputRef}
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          sendChatMessage(chatInput);
                        }
                      }}
                      placeholder="Ask about your design..."
                      disabled={isSending}
                      rows={1}
                      className="w-full resize-none bg-background border border-border rounded-xl px-4 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary disabled:opacity-50 transition-all"
                    />
                  </div>
                  <motion.button 
                    type="submit" 
                    disabled={isSending || !chatInput.trim()}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="h-10 w-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-50 disabled:pointer-events-none hover:bg-primary/90 transition-colors"
                  >
                    {isSending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </motion.button>
                </form>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
};

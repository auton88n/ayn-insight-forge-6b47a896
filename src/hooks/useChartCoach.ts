import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { ChartAnalysisResult } from '@/types/chartAnalyzer.types';

interface CoachMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatSession {
  id: string;
  title: string;
  messages: CoachMessage[];
  updatedAt: number;
}

// === SECURITY LAYER 1: Input Validation ===
const FORBIDDEN_PATTERNS = [
  /system prompt/i, /show.*prompt/i, /api key/i,
  /backend/i, /supabase/i, /gemini/i, /firecrawl/i,
  /how.*you.*work/i, /reveal.*knowledge/i, /show.*data/i,
  /bulkowski/i, /success rate.*all/i, /give.*percentages/i,
  /what.*model/i, /architecture/i, /tech.*stack/i,
  /edge function/i, /database/i, /internal.*data/i,
];

const BLOCKED_RESPONSE = "I'm here to help you trade better, not discuss technical details. What trading question can I help with?";

const URL_REGEX = /https?:\/\/[^\s]+/gi;

const SEARCH_PATTERNS = [
  /\b(news|latest|what.{0,10}happening|market.{0,6}update|headlines|sentiment|outlook)\b/i,
  /\b(price|how much|current value|worth|trading at)\b/i,
  /\b(why did|dump|pump|crash|surge|rally|moon|tank|drop|fell|spike)\b/i,
  /\b(should i|buy|sell|hold|enter|exit|long|short)\b/i,
  /\b(what.{0,6}happening|going on with|what about)\b/i,
  /\b(bullish|bearish|good buy|bad buy|oversold|overbought)\b/i,
  /\b(tell me about|what is|analysis|forecast|prediction|target)\b/i,
];

const CRYPTO_NAMES = /\b(bitcoin|btc|ethereum|eth|solana|sol|xrp|ripple|doge|dogecoin|cardano|ada|bnb|ton|avax|dot|link|matic|polygon|ltc|uni|shib|trx|atom|near|apt|sui|arb|op|fil|pepe|bonk|render|inj|sei|tia|jup|pol)\b/i;

function validateInput(message: string): boolean {
  return !FORBIDDEN_PATTERNS.some(p => p.test(message));
}

function detectSearchIntent(message: string, ticker?: string): string | null {
  const hasSearchPattern = SEARCH_PATTERNS.some(p => p.test(message));
  const cryptoMatch = message.match(CRYPTO_NAMES);
  const hasQuestionMark = message.includes('?');

  // Trigger search if: pattern match, or crypto name + question mark
  if (!hasSearchPattern && !(cryptoMatch && hasQuestionMark)) return null;

  const subject = cryptoMatch?.[1]?.toUpperCase() || ticker || null;

  // Build contextual search query
  if (/why.{0,10}(dump|drop|crash|fell|tank)/i.test(message) && subject) {
    return `${subject} crypto why price drop today`;
  }
  if (/why.{0,10}(pump|surge|rally|moon|spike)/i.test(message) && subject) {
    return `${subject} crypto why price pump today`;
  }
  if (/should i (buy|sell|hold|long|short)/i.test(message) && subject) {
    return `${subject} crypto buy sell analysis today`;
  }
  if (/\b(price|how much|worth|trading at)\b/i.test(message) && subject) {
    return `${subject} crypto current price analysis today`;
  }
  if (subject) {
    return `${subject} crypto trading news analysis today`;
  }
  return 'crypto market news today';
}

// === SECURITY LAYER 2: Response Sanitization ===
const LEAK_PATTERNS = [
  /\d+%\s*success/i, /bulkowski/i, /base.*rate/i,
  /supabase/i, /edge function/i, /gemini/i,
  /firecrawl/i, /system prompt/i,
];

function sanitizeResponse(response: string): string {
  for (const pattern of LEAK_PATTERNS) {
    if (pattern.test(response)) {
      console.error('[SECURITY] Leak detected in AI response, sanitizing');
      return "Let me rephrase that in terms of your trade setup. What's your specific concern about this chart?";
    }
  }
  return response;
}

// === SECURITY LAYER 3: Emotional State Detection ===
function detectEmotionalState(message: string): string {
  if (/miss|late|everyone.*buying|left behind|fomo/i.test(message)) return 'FOMO';
  if (/scared|lose everything|crash|dump|afraid/i.test(message)) return 'FEAR';
  if (/all in|10x|moon|yolo|max.*leverage/i.test(message)) return 'GREED';
  if (/make.*back|recover|revenge|lost.*need/i.test(message)) return 'REVENGE';
  return 'CALM';
}

function buildFileContext(result: ChartAnalysisResult, emotionalState: string): string {
  const p = result.prediction;
  const t = result.technical;
  const patterns = t.patterns.map(pat =>
    typeof pat === 'string' ? pat : `${pat.name} (${pat.type}, ${pat.confidence} confidence)`
  ).join(', ');

  let context = `CURRENT CHART ANALYSIS:
Ticker: ${result.ticker}
Asset Type: ${result.assetType}
Timeframe: ${result.timeframe}
Signal: ${p.signal}
Confidence: ${p.confidence}%
Trend: ${t.trend}
Patterns: ${patterns || 'None detected'}
Support Levels: ${t.support?.join(', ') || 'N/A'}
Resistance Levels: ${t.resistance?.join(', ') || 'N/A'}
Entry Zone: ${p.entry_zone}
Stop Loss: ${p.stop_loss}
Take Profit: ${p.take_profit}
Risk/Reward: ${p.risk_reward}
Overall Sentiment: ${p.overallSentiment}/100
${p.entryTiming ? `Entry Status: ${p.entryTiming.status} - ${p.entryTiming.reason}` : ''}
${p.psychologyWarnings ? `Market Stage: ${p.psychologyWarnings.marketStage}` : ''}
${p.confidenceBreakdown ? `Confidence Breakdown: ${p.confidenceBreakdown.explanation}` : ''}
User Emotional State: ${emotionalState}`;

  // Append tradingSignal data if available
  const ts = (p as unknown as Record<string, unknown>).tradingSignal as Record<string, unknown> | undefined;
  if (ts) {
    const entry = ts.entry as Record<string, unknown> | undefined;
    const sl = ts.stopLoss as Record<string, unknown> | undefined;
    const tps = ts.takeProfits as Array<Record<string, unknown>> | undefined;
    const bot = ts.botConfig as Record<string, unknown> | undefined;
    const inv = ts.invalidation as Record<string, unknown> | undefined;

    context += `\n\nTRADING SIGNAL:
Action: ${ts.action || 'N/A'}
Entry: ${entry?.price || 'N/A'} (${entry?.orderType || 'N/A'})
Stop Loss: ${sl?.price || 'N/A'} (-${sl?.percentage || '?'}%)`;

    if (tps && tps.length > 0) {
      context += `\nTP1: ${tps[0]?.price || 'N/A'} (+${tps[0]?.percentage || '?'}%) - Close ${tps[0]?.closePercent || '?'}%`;
      if (tps[1]) {
        context += `\nTP2: ${tps[1]?.price || 'N/A'} (+${tps[1]?.percentage || '?'}%) - Close ${tps[1]?.closePercent || '?'}%`;
      }
    }

    context += `\nR:R: 1:${ts.riskReward || 'N/A'}`;

    if (bot) {
      context += `\nPosition Size: ${bot.positionSize || '?'}% | Leverage: ${bot.leverage || '?'}x | Trailing Stop: ${bot.trailingStop || 'N/A'}`;
    }

    if (inv) {
      context += `\nInvalidation: ${inv.condition || 'N/A'} at ${inv.price || 'N/A'}`;
    }

    if (ts.reasoning) {
      context += `\nReasoning: ${ts.reasoning}`;
    }
  }

  return context;
}

const MAX_MESSAGES = 50;
const MAX_SESSIONS = 20;
const SESSIONS_KEY = 'ayn-chart-coach-sessions';

function generateId(): string {
  return crypto.randomUUID?.() || Math.random().toString(36).slice(2, 10);
}

function loadSessions(): ChatSession[] {
  try {
    const stored = localStorage.getItem(SESSIONS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch { return []; }
}

function saveSessions(sessions: ChatSession[]) {
  try {
    const pruned = sessions.slice(0, MAX_SESSIONS);
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(pruned));
  } catch { /* storage full */ }
}

export function useChartCoach(result?: ChartAnalysisResult) {
  const [sessions, setSessions] = useState<ChatSession[]>(loadSessions);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => {
    const s = loadSessions();
    return s.length > 0 ? s[0].id : null;
  });
  const [messages, setMessages] = useState<CoachMessage[]>(() => {
    const s = loadSessions();
    if (s.length > 0) return s[0].messages;
    return [];
  });
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Persist sessions whenever messages or sessions change
  useEffect(() => {
    if (activeSessionId && messages.length > 0) {
      setSessions(prev => {
        const idx = prev.findIndex(s => s.id === activeSessionId);
        const title = messages.find(m => m.role === 'user')?.content.slice(0, 40) || 'New Chat';
        const updated: ChatSession = { id: activeSessionId, title, messages, updatedAt: Date.now() };
        let next: ChatSession[];
        if (idx >= 0) {
          next = [...prev];
          next[idx] = updated;
        } else {
          next = [updated, ...prev];
        }
        next.sort((a, b) => b.updatedAt - a.updatedAt);
        saveSessions(next);
        return next;
      });
    }
  }, [messages, activeSessionId]);

  const switchSession = useCallback((id: string) => {
    const s = sessions.find(s => s.id === id);
    if (s) {
      setActiveSessionId(s.id);
      setMessages(s.messages);
    }
  }, [sessions]);

  const newChat = useCallback(() => {
    // Just start fresh — current session is already persisted
    const id = generateId();
    setActiveSessionId(id);
    setMessages([]);
  }, []);

  const sendMessage = useCallback(async (userMessage: string) => {
    const trimmed = userMessage.trim();
    if (!trimmed || isLoading) return;

    // Ensure we have a session id
    if (!activeSessionId) {
      const id = generateId();
      setActiveSessionId(id);
    }

    // Security Layer 1: Block probing questions
    if (!validateInput(trimmed)) {
      setMessages(prev => [
        ...prev,
        { role: 'user', content: trimmed },
        { role: 'assistant', content: BLOCKED_RESPONSE },
      ]);
      return;
    }

    const emotionalState = detectEmotionalState(trimmed);
    const fileContext = result ? buildFileContext(result, emotionalState) : `No chart analyzed yet.\nUser Emotional State: ${emotionalState}`;

    const urls = trimmed.match(URL_REGEX);
    const searchQuery = detectSearchIntent(trimmed, result?.ticker);

    const newUserMsg: CoachMessage = { role: 'user', content: trimmed };
    setMessages(prev => {
      const updated = [...prev, newUserMsg];
      return updated.length > MAX_MESSAGES ? updated.slice(-MAX_MESSAGES) : updated;
    });

    setIsLoading(true);
    abortRef.current = new AbortController();

    try {
      const conversationMessages = [
        ...messages.slice(-10).map(m => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content: trimmed },
      ];

      const { data, error } = await supabase.functions.invoke('ayn-unified', {
        body: {
          messages: conversationMessages,
          intent: 'trading-coach',
          context: {
            fileContext,
            scrapeUrl: urls?.[0] || null,
            searchQuery: searchQuery || null,
            ticker: result?.ticker || null,
            assetType: result?.assetType || null,
            timeframe: result?.timeframe || null,
          },
          stream: false,
        },
      });

      if (error) throw error;

      const rawContent = data?.content || "I couldn't process that. Try asking about your chart setup.";
      const safeContent = sanitizeResponse(rawContent);

      setMessages(prev => [...prev, { role: 'assistant', content: safeContent }]);
    } catch (err) {
      console.error('[ChartCoach] Error:', err);
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: "Something went wrong. Try asking again." },
      ]);
    } finally {
      setIsLoading(false);
      abortRef.current = null;
    }
  }, [messages, result, isLoading, activeSessionId]);

  const clearChat = useCallback(() => {
    newChat();
  }, [newChat]);

  const deleteSession = useCallback((id: string) => {
    setSessions(prev => {
      const next = prev.filter(s => s.id !== id);
      saveSessions(next);
      return next;
    });
    if (activeSessionId === id) {
      newChat();
    }
  }, [activeSessionId, newChat]);

  return { messages, isLoading, sendMessage, clearChat, sessions, activeSessionId, switchSession, newChat, deleteSession };
}

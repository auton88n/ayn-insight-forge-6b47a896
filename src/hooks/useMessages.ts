import { useState, useCallback, useRef } from 'react';
import { Session } from '@supabase/supabase-js';
import { useToast } from '@/hooks/use-toast';
import { chatRateLimiter } from '@/lib/rateLimiter';
import { offlineQueue } from '@/lib/offlineQueue';
import { detectLanguage } from '@/lib/languageDetection';
import type { 
  Message, 
  FileAttachment, 
  UserProfile, 
  AIMode,
  UseMessagesReturn,
  WebhookPayload,
  EmotionHistoryEntry,
  MoodPattern,
  LABResponse
} from '@/types/dashboard.types';

import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/config'; // SUPABASE_URL needed for edge function URLs, SUPABASE_ANON_KEY for inline REST calls

// Maximum messages allowed per chat session
const MAX_MESSAGES_PER_CHAT = 100;

// Silent retry helper - try twice before giving up
const fetchWithRetry = async (
  url: string, 
  options: RequestInit, 
  retries = 2
): Promise<Response> => {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      // Return on success OR known handled error codes (don't retry these)
      if (response.ok || response.status === 429 || response.status === 402 || response.status === 403) return response;
    } catch (e) {
      const isAbortError = e instanceof Error && e.name === 'AbortError';
      if (isAbortError || options.signal?.aborted || i === retries - 1) throw e;
      await new Promise(r => setTimeout(r, 1000)); // Wait 1s before retry
    }
  }
  throw new Error('Request failed after retries');
};

import { supabaseApi } from '@/lib/supabaseApi';

// Parse SSE stream and call onChunk for each token
const parseSSEStream = async (
  response: Response,
  onChunk: (content: string) => void,
  onComplete: () => void
): Promise<string> => {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let fullContent = '';
  let buffer = '';
  let currentData = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);

        if (line.startsWith('data: ')) {
          currentData += line.slice(6);
        } else if (line === '' && currentData) {
          if (currentData === '[DONE]') {
            currentData = '';
            continue;
          }
          try {
            const parsed = JSON.parse(currentData);
            const content = parsed.choices?.[0]?.delta?.content || parsed.content || parsed.text;
            if (content) {
              fullContent += content;
              onChunk(content);
            }
          } catch {
            if (import.meta.env.DEV) {
              console.warn('[SSE] Failed to parse event:', currentData.slice(0, 100));
            }
          }
          currentData = '';
        }
      }
    }

    // Handle any remaining accumulated data after stream ends
    if (currentData) {
      try {
        const parsed = JSON.parse(currentData);
        const content = parsed.choices?.[0]?.delta?.content || parsed.content || parsed.text;
        if (content) {
          fullContent += content;
          onChunk(content);
        }
      } catch { /* final chunk incomplete */ }
    }
  } finally {
    reader.releaseLock();
  }

  onComplete();
  return fullContent;
};

export const useMessages = (
  sessionId: string,
  userId: string,
  userEmail: string,
  selectedMode: AIMode,
  userProfile: UserProfile | null,
  allowPersonalization: boolean,
  session: Session | null,
  isUnlimited: boolean = false,
  onUsageUpdated?: () => void
): UseMessagesReturn => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [isGeneratingDocument, setIsGeneratingDocument] = useState(false);
  const [isGeneratingFloorPlan, setIsGeneratingFloorPlan] = useState(false);
  const [documentType, setDocumentType] = useState<'pdf' | 'excel' | null>(null);
  const [lastSuggestedEmotion, setLastSuggestedEmotion] = useState<string | null>(null);
  const [moodPattern, setMoodPattern] = useState<MoodPattern | null>(null);
  const [emotionHistory, setEmotionHistory] = useState<EmotionHistoryEntry[]>([]);
  const [isLoadingFromHistory, setIsLoadingFromHistory] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [totalMessageCount, setTotalMessageCount] = useState(0);
  const { toast } = useToast();

  const PAGE_SIZE = 20;

  // Helper to map raw DB rows to Message objects
  const mapDbMessages = (data: Array<{
    id: string;
    content: string;
    created_at: string;
    sender: string;
    attachment_url: string | null;
    attachment_name: string | null;
    attachment_type: string | null;
  }>): Message[] => data.map(msg => ({
    id: msg.id,
    content: msg.content,
    sender: msg.sender as 'user' | 'ayn',
    timestamp: new Date(msg.created_at),
    status: 'sent' as const,
    attachment: msg.attachment_url ? {
      url: msg.attachment_url,
      name: msg.attachment_name || 'Attachment',
      type: msg.attachment_type || 'unknown'
    } : undefined
  }));

  // Load the most recent PAGE_SIZE messages for current session
  const loadMessages = useCallback(async () => {
    if (!session || !sessionId) {
      console.warn('[useMessages] No session or sessionId available');
      return;
    }
    
    setIsLoadingFromHistory(true);
    
    try {
      const data = await supabaseApi.get<any[]>(
        `messages?user_id=eq.${userId}&session_id=eq.${sessionId}&select=id,content,created_at,sender,attachment_url,attachment_name,attachment_type&order=created_at.desc&limit=${PAGE_SIZE}`,
        session.access_token
      );

      if (data && data.length > 0) {
        const chatMessages = mapDbMessages(data);
        const uniqueMessages = Array.from(
          new Map(chatMessages.map(m => [m.id, m])).values()
        ).sort((a, b) => {
          const timeDiff = a.timestamp.getTime() - b.timestamp.getTime();
          if (timeDiff !== 0) return timeDiff;
          // Same timestamp: user messages come before ayn
          if (a.sender === 'user' && b.sender === 'ayn') return -1;
          if (a.sender === 'ayn' && b.sender === 'user') return 1;
          return 0;
        });

        setMessages(uniqueMessages);
        setHasMoreMessages(data.length >= PAGE_SIZE);
      } else {
        setMessages([]);
        setHasMoreMessages(false);
      }

      // Fetch total count using HEAD with Prefer: count=exact (no data transfer)
      try {
        const countResult = await supabaseApi.fetch<never>(
          `messages?user_id=eq.${userId}&session_id=eq.${sessionId}&select=id`,
          session.access_token,
          {
            method: 'HEAD',
            headers: { 'Prefer': 'count=exact' }
          }
        );
        // The count comes from the content-range header; supabaseApi.fetch returns the parsed response
        // For HEAD requests, we need to extract count from the raw response
        // Fall back to data length if HEAD doesn't return count
        setTotalMessageCount(data?.length ?? 0);
      } catch {
        setTotalMessageCount(data?.length ?? 0);
      }
    } catch (error) {
      console.error('[useMessages] Error loading messages:', error);
    } finally {
      setTimeout(() => {
        setIsLoadingFromHistory(false);
      }, 100);
    }
  }, [userId, sessionId, session]);

  // Load older messages using cursor-based pagination
  const loadMoreMessages = useCallback(async () => {
    if (!session || !sessionId || isLoadingMore || !hasMoreMessages) return;
    
    setIsLoadingMore(true);
    
    try {
      // Find the oldest currently loaded message's timestamp as cursor
      const oldestTimestamp = messages.length > 0
        ? messages[0].timestamp.toISOString()
        : new Date().toISOString();

      const data = await supabaseApi.get<any[]>(
        `messages?user_id=eq.${userId}&session_id=eq.${sessionId}&created_at=lt.${oldestTimestamp}&select=id,content,created_at,sender,attachment_url,attachment_name,attachment_type&order=created_at.desc&limit=${PAGE_SIZE}`,
        session.access_token
      );

      if (data && data.length > 0) {
        const olderMessages = mapDbMessages(data);
        // Sort chronologically and prepend
        const sorted = olderMessages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        
        setMessages(prev => {
          const existingIds = new Set(prev.map(m => m.id));
          const newOlder = sorted.filter(m => !existingIds.has(m.id));
          return [...newOlder, ...prev];
        });
        
        setHasMoreMessages(data.length >= PAGE_SIZE);
      } else {
        setHasMoreMessages(false);
      }
    } catch (error) {
      console.error('[useMessages] Error loading more messages:', error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [session, sessionId, userId, messages, isLoadingMore, hasMoreMessages]);

  // Send message with optional file attachment - using direct fetch() to avoid deadlocks
  const sendMessage = useCallback(async (
    content: string,
    attachment: FileAttachment | null = null
  ) => {
    // Client-side rate limit check (UX safeguard, not a security boundary)
    if (!chatRateLimiter.canProceed()) {
      const waitTime = Math.ceil(chatRateLimiter.getTimeUntilNext() / 1000);
      toast({
        title: 'Slow down',
        description: `Please wait ${waitTime} seconds before sending another message.`,
        variant: 'destructive',
      });
      return;
    }

    // Show thinking state IMMEDIATELY - before any validation
    console.log('[useMessages] sendMessage called:', { content: content.substring(0, 50), hasAttachment: !!attachment });
    setIsTyping(true);

    if (!session) {
      console.warn('[useMessages] No session - aborting');
      setIsTyping(false);
      toast({
        title: "Session Ended",
        description: "Your session has ended. Please sign in again to continue.",
        variant: "destructive"
      });
      return;
    }

    // Check chat message limit
    if (messages.length >= MAX_MESSAGES_PER_CHAT) {
      console.warn('[useMessages] Message limit reached');
      setIsTyping(false);
      toast({
        title: "Chat Limit Reached",
        description: "This conversation has reached its limit. Start a new chat to continue.",
        variant: "destructive"
      });
      return;
    }

    // Check usage limits via legacy system (skip for unlimited users - server handles their limits)
    if (!isUnlimited) {
      try {
        const rpcResponse = await fetch(`${SUPABASE_URL}/rest/v1/rpc/increment_usage`, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            _user_id: userId,
            _action_type: 'message',
            _count: 1
          })
        });

        if (!rpcResponse.ok) {
          console.warn('[useMessages] Usage check failed');
          setIsTyping(false);
          toast({
            title: "Usage Check Failed",
            description: "We couldn't verify your usage. Please try again.",
            variant: "destructive"
          });
          return;
        }

        const canUse = await rpcResponse.json();

        // Refresh usage UI immediately so credits/limits update in real-time
        onUsageUpdated?.();

        if (!canUse) {
          console.warn('[useMessages] Usage limit reached');
          setIsTyping(false);
          toast({
            title: "Usage Limit Reached",
            description: "You've reached your message limit. Upgrade for more messages.",
            variant: "destructive"
          });
          return;
        }
      } catch (error) {
        console.error('[useMessages] Usage check error:', error);
        setIsTyping(false);
        toast({
          title: "Something Went Wrong",
          description: "An unexpected error occurred. Please try again.",
          variant: "destructive"
        });
        return;
      }
    }

    // Create user message with UUID for robust deduplication
    const userMessage: Message = {
      id: crypto.randomUUID(),
      content: content || (attachment ? `📎 ${attachment.name}` : ''),
      sender: 'user',
      timestamp: new Date(),
      status: 'sent',
      attachment: attachment || undefined
    };

    // Add to UI immediately with duplicate prevention
    setMessages(prev => {
      if (prev.some(m => m.id === userMessage.id)) return prev;
      return [...prev, userMessage];
    });
    setTotalMessageCount(prev => prev + 1);
    console.log('[useMessages] User message added to UI');

    try {
      // Build message content
      const messageContent = content.trim() || (attachment ? `📎 Attached file: ${attachment.name}` : '');
      
      // Detect intent based on mode and content
      const detectIntent = (): string => {
        if (selectedMode === 'LAB' || selectedMode === 'Vision Lab') return 'image';
        if (selectedMode === 'Research Pro') return 'search';
        if (selectedMode === 'PDF Analyst') return 'files';
        
        const lower = messageContent.toLowerCase();
        
        // Image generation detection FIRST (prevents "make me a" hijacking by document)
        if (/generate\s+(an?\s+)?image|create\s+(an?\s+)?image|make\s+(an?\s+)?image|make\s+me\s+(an?\s+)?(picture|photo|image)|generate\s+(an?\s+)?picture|create\s+(an?\s+)?picture|show\s+me\s+(an?\s+)?(image|picture|photo)|give\s+me\s+(an?\s+)?(image|picture|photo)|draw\s|picture\s+of|image\s+of|photo\s+of|illustration\s+of|visualize|render\s+(an?\s+)?/.test(lower)) return 'image';
        if (/(?:i\s+(?:want|need)\s+(?:an?\s+)?)?(?:image|picture|photo)\s+(?:about|of|for)/.test(lower)) return 'image';
        if (/صورة|ارسم|اعطني صورة|ابي\s*صورة|سوي\s*صورة|dessine|montre\s+moi|genere\s+une\s+image/.test(lower)) return 'image';
        
        // Document generation detection (English, Arabic, French) - with flexible articles
        if (/create\s+(an?\s+)?pdf|make\s+(an?\s+)?pdf|generate\s+(an?\s+)?pdf|give\s+me\s+(an?\s+)?pdf|export\s+as\s+pdf|pdf\s+(report|document|about|for|of)/.test(lower)) return 'document';
        if (/(?:i\s+(?:want|need)\s+(?:an?\s+)?)?pdf\s+(?:about|for|on)/.test(lower)) return 'document';
        if (/(?:can\s+you\s+)?(?:make|create|get)\s+(?:me\s+)?(?:an?\s+)?pdf/.test(lower)) return 'document';
        if (/create\s+(an?\s+)?(excel|exel|excell|exsel|ecxel|exl)|make\s+(an?\s+)?(excel|exel|excell|exsel|ecxel|exl)|give\s+me\s+(an?\s+)?(excel|exel|excell|exsel|ecxel|exl)|(excel|exel|excell|exsel|ecxel|exl)\s+(sheet|about|for|of)|spreadsheet|xlsx|table\s+(about|of)|data\s+(about|overview)|create\s+(an?\s+)?table|create\s+(an?\s+)?report|make\s+(an?\s+)?report|generate\s+(an?\s+)?report/.test(lower)) return 'document';
        if (/(?:i\s+(?:want|need)\s+(?:an?\s+)?)?(?:excel|spreadsheet)\s+(?:about|for|on)/.test(lower)) return 'document';
        if (/اعمل\s*pdf|انشئ\s*pdf|ملف\s*pdf|تقرير\s*pdf|اعمل\s*(اكسل|لي)|سوي\s*لي|جدول\s*عن|بيانات\s*عن|اكسل\s*عن/.test(lower)) return 'document';
        if (/ابي\s*(?:pdf|اكسل|ملف)|اعطني\s*(?:تقرير|ملف|جدول)|سوي\s*(?:pdf|اكسل|ملف)/.test(lower)) return 'document';
        if (/créer\s+(un\s+)?pdf|faire\s+(un\s+)?pdf|rapport\s+pdf|document\s+pdf|créer\s+(un\s+)?excel|excel\s+sur|excel\s+de|tableau\s+de|données\s+sur/.test(lower)) return 'document';
        if (/document\s+about|create\s+(an?\s+)?document/.test(lower)) return 'document';
        if (/(?:make|put|convert|turn)\s+(?:it|this|that)\s+(?:in(?:to)?|to|as)?\s*(?:an?\s+)?(?:pdf|excel|exel|excell|exsel|exl|xlsx)/.test(lower)) return 'document';
        if (/(?:make|put|convert|turn)\s+(?:it|this|that)\s+(?:in(?:to)?|to|as)?\s*(?:an?\s+)?(?:report|document|table|spreadsheet)/.test(lower)) return 'document';
        if (/^(?:in\s+)?(?:excel|exel|excell|exsel|exl|pdf|xlsx)\s*$/.test(lower.trim())) return 'document';
        
        // Floor plan detection (disabled - rebuilding)
        // if (/floor plan|house plan|home layout|design a house|design me a|مخطط|تصميم بيت|تصميم منزل|plan de maison/.test(lower)) return 'floor_plan';
        
        // Chart analysis detection (when image is attached + chart-related keywords)
        if (attachment && attachment.type.startsWith('image/') && /chart|trading|signal|technical\s+analysis|analyze|شارت|تحليل\s*فني|graphique|analyse\s+technique/.test(lower)) return 'chart_analysis';
        
        // Other intent detection
        if (/search|find|look up|latest|current|today|news|price|weather|what happened|who is|when did|where is/.test(lower)) return 'search';
        
        // Fallback: if image is attached and no other intent matched, default to chart analysis
        if (attachment && attachment.type.startsWith('image/')) return 'chart_analysis';
        
        return 'chat';
      };

      const detectedIntent = detectIntent();
      
      // Intents that require non-streaming (return JSON with URLs)
      const requiresNonStreaming = ['document', 'image', 'chart_analysis'].includes(detectedIntent);
      
      // Set document generation state for visual indicator
      if (detectedIntent === 'document') {
        setIsGeneratingDocument(true);
        // Detect document type from content
        const isExcel = /excel|spreadsheet|xlsx|جدول/.test(messageContent.toLowerCase());
        setDocumentType(isExcel ? 'excel' : 'pdf');
      }
      
      // Floor plan generation state (disabled - rebuilding)
      // if (detectedIntent === 'floor_plan') {
      //   setIsGeneratingFloorPlan(true);
      // }

      // Build conversation history in ayn-unified format
      // Strip old [Attached file: ...] references so AYN focuses on the current file
      const stripBase64 = (text: string) => text.replace(/!\[([^\]]*)\]\(data:image\/[^;]+;base64,[^)]+\)/g, '![$1](image-removed)');
      
      const conversationMessages = messages.slice(-5).map(msg => ({
        role: msg.sender === 'user' ? 'user' : 'assistant',
        content: stripBase64(msg.content.replace(/\n\n\[Attached file: [^\]]+\]$/, ''))
      }));

      // Add current user message (only current attachment reference)
      conversationMessages.push({
        role: 'user',
        content: messageContent + (attachment ? `\n\n[Attached file: ${attachment.name}]` : '')
      });

      // Build context for ayn-unified
      const context: Record<string, unknown> = {
        fileContext: attachment ? {
          name: attachment.name,
          type: attachment.type,
          url: attachment.url
        } : undefined,
        emotionHistory: emotionHistory.slice(-5),
        // User profile context so AYN can personalize
        userProfile: userProfile ? {
          name: userProfile.contact_person,
          company: userProfile.company_name,
          businessType: userProfile.business_type,
        } : undefined,
      };

      // Call ayn-unified with timeout and retry
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90000); // 90s timeout for streaming

      const webhookResponse = await fetchWithRetry(`${SUPABASE_URL}/functions/v1/ayn-unified`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: conversationMessages,
          intent: detectedIntent,
          context,
          stream: !requiresNonStreaming, // Enable streaming for chat/search/engineering
          sessionId // Server-side enforcement of 100 message per chat limit
        })
      });

      clearTimeout(timeoutId);

      // Handle 429 Rate Limit / Daily Limit / Chat Limit Response
      if (webhookResponse.status === 429) {
        setIsTyping(false);
        setIsGeneratingDocument(false);
        setIsGeneratingFloorPlan(false);
        setDocumentType(null);
        
        const errorData = await webhookResponse.json().catch(() => ({}));
        const isChatLimit = errorData?.chatLimitExceeded === true;
        const isDailyLimit = errorData?.reason === 'daily_limit_reached' || errorData?.limitExceeded === true;
        
        let errorContent: string;
        let toastTitle: string;
        let toastDescription: string;
        
        if (isChatLimit) {
          errorContent = "This chat has reached its 100 message limit. Please start a new chat to continue our conversation.";
          toastTitle = "Chat Limit Reached";
          toastDescription = "This chat has 100 messages. Start a new chat to continue.";
        } else if (isDailyLimit) {
          errorContent = "You've reached your daily message limit. Your limit will reset tomorrow. Check your usage in Settings.";
          toastTitle = "Daily Limit Reached";
          toastDescription = "You've used all your messages for today. Limit resets tomorrow.";
        } else {
          errorContent = "You're sending messages too quickly. Please wait a moment before trying again.";
          toastTitle = "Rate Limit Reached";
          toastDescription = "You're sending messages too quickly. Please wait before trying again.";
        }
        
        const errorMessage: Message = {
          id: crypto.randomUUID(),
          content: errorContent,
          sender: 'ayn',
          timestamp: new Date(),
          status: 'error'
        };
        // Remove the orphaned user message AND add AYN's error response
        setMessages(prev => [
          ...prev.filter(m => m.id !== userMessage.id),
          errorMessage
        ]);
        
        toast({
          title: toastTitle,
          description: toastDescription,
          variant: "destructive"
        });
        return;
      }

      // Handle 403 Premium Feature / Upgrade Required Response
      if (webhookResponse.status === 403) {
        setIsTyping(false);
        setIsGeneratingDocument(false);
        setIsGeneratingFloorPlan(false);
        setDocumentType(null);
        
        const upgradeData = await webhookResponse.json().catch(() => ({}));
        
        // Display the upgrade message as a normal AYN response (not an error)
        const upgradeMessage: Message = {
          id: (Date.now() + 1).toString(),
          content: upgradeData?.content || "This feature requires a paid subscription. Please upgrade to continue.",
          sender: 'ayn',
          timestamp: new Date(),
          status: 'sent'
        };
        // Remove the orphaned user message AND add AYN's upgrade prompt
        setMessages(prev => [
          ...prev.filter(m => m.id !== userMessage.id),
          upgradeMessage
        ]);
        return;
      }

      if (!webhookResponse.ok) {
        throw new Error(`Webhook call failed: ${webhookResponse.status}`);
      }

      // Check if response is streaming (SSE) or JSON
      const contentType = webhookResponse.headers.get('content-type') || '';
      const isStreaming = contentType.includes('text/event-stream') || contentType.includes('text/plain');

      let response = '';
      let webhookData: any = null;

      if (isStreaming && !requiresNonStreaming) {
        // Handle streaming response
        const aynMessageId = crypto.randomUUID();
        
        // Create placeholder message that will be updated
        const aynMessage: Message = {
          id: aynMessageId,
          content: '',
          sender: 'ayn',
          timestamp: new Date(),
          isTyping: true,
        };
        
        // Add placeholder to messages
        setMessages(prev => {
          if (prev.some(m => m.id === aynMessage.id)) return prev;
          return [...prev, aynMessage];
        });

        try {
          // Parse stream and update message content progressively
          response = await parseSSEStream(
            webhookResponse,
            (chunk) => {
              setMessages(prev => prev.map(msg => 
                msg.id === aynMessageId 
                  ? { ...msg, content: (msg.content + chunk).replace(/\[MEMORY:[^\]]*\]?/g, '') }
                  : msg
              ));
            },
            () => {
              // Mark message as complete
              setMessages(prev => prev.map(msg =>
                msg.id === aynMessageId
                  ? { ...msg, content: msg.content.replace(/\[MEMORY:[^\]]+\]/g, '').trim(), isTyping: false, status: 'sent' }
                  : msg
              ));
            }
          );

          setIsTyping(false);
          setIsGeneratingDocument(false);
          setIsGeneratingFloorPlan(false);
          setDocumentType(null);

          // Detect emotion from complete response + blend with user emotion
          const { analyzeResponseEmotion, analyzeUserEmotion } = await import('@/lib/emotionMapping');
          let detectedEmotion = analyzeResponseEmotion(response);
          const userEmotion = analyzeUserEmotion(content);
          // If user is angry/frustrated but AYN's response reads as calm, override to comfort/supportive
          if (['angry', 'frustrated'].includes(userEmotion) && ['calm', 'happy'].includes(detectedEmotion)) {
            detectedEmotion = 'comfort';
          } else if (userEmotion === 'sad' && detectedEmotion === 'calm') {
            detectedEmotion = 'supportive';
          }
          console.log('[useMessages] Streaming emotion:', detectedEmotion, '(user:', userEmotion, ')');
          setLastSuggestedEmotion(detectedEmotion);

        } catch (streamError) {
          console.error('[useMessages] Stream error:', streamError);
          // Update message with error or partial content
          setMessages(prev => prev.map(msg =>
            msg.id === aynMessageId
              ? { 
                  ...msg, 
                  content: msg.content || "Hmm, something went wrong. Could you try again? 💭", 
                  isTyping: false,
                  status: 'sent'
                }
              : msg
          ));
          setIsTyping(false);
          setIsGeneratingDocument(false);
          setIsGeneratingFloorPlan(false);
          setDocumentType(null);
          return;
        }

      } else {
        // Handle non-streaming JSON response (documents, images, or fallback)
        setIsTyping(false);
        setIsGeneratingDocument(false);
        setIsGeneratingFloorPlan(false);
        setDocumentType(null);

        webhookData = await webhookResponse.json();

        // Handle ayn-unified response format
        const responseContent = webhookData?.content || webhookData?.response || webhookData?.output || '';
        
        // If response is empty, use a warm fallback
        response = responseContent.trim() 
          ? responseContent 
          : "Let me think about that differently... Could you try asking again? Sometimes a fresh start helps me give you a better answer! 💭";

        // Extract emotion from backend response + blend with user emotion
        let finalEmotion = webhookData?.emotion || null;
        const backendUserEmotion = webhookData?.userEmotion || null;
        
        if (!finalEmotion) {
          const { analyzeResponseEmotion } = await import('@/lib/emotionMapping');
          finalEmotion = analyzeResponseEmotion(response);
        }
        
        // Blend: if user is negative but AYN response emotion is neutral, override
        if (backendUserEmotion && ['angry', 'frustrated'].includes(backendUserEmotion) && ['calm', 'happy'].includes(finalEmotion)) {
          finalEmotion = 'comfort';
        } else if (backendUserEmotion === 'sad' && finalEmotion === 'calm') {
          finalEmotion = 'supportive';
        }
        
        console.log('[useMessages] Final emotion:', finalEmotion, '(userEmotion:', backendUserEmotion, ')');
        setLastSuggestedEmotion(finalEmotion);

        // Extract LAB data if present (for image generation)
        const labData: LABResponse | undefined = webhookData?.imageUrl ? {
          json: { image_url: webhookData.imageUrl, revised_prompt: webhookData.revisedPrompt || '' },
          text: webhookData.revisedPrompt || '',
          emotion: 'creative',
          raw: JSON.stringify(webhookData),
          hasStructuredData: true
        } : undefined;

        // If image was returned, embed it in the content as markdown for display
        if (webhookData?.imageUrl) {
          const imageContent = `![Generated Image](${webhookData.imageUrl})`;
          response = imageContent + '\n\n' + response;
        }

        // Create AI response message with document attachment if present
        const documentAttachment = webhookData?.documentUrl ? {
          url: webhookData.documentUrl,
          name: webhookData.documentName || `Document.${webhookData.documentType === 'excel' ? 'xlsx' : 'pdf'}`,
          type: webhookData.documentType || 'pdf'
        } : undefined;

        // Extract chart analysis data if present
        const chartAnalysisData = webhookData?.chartAnalysis || undefined;

        const aynMessage: Message = {
          id: crypto.randomUUID(),
          content: response,
          sender: 'ayn',
          timestamp: new Date(),
          isTyping: false,
          status: 'sent',
          ...(labData ? { labData } : {}),
          ...(documentAttachment ? { attachment: documentAttachment } : {}),
          ...(chartAnalysisData ? { chartAnalysis: chartAnalysisData } : {})
        };

        // Add AYN message with duplicate prevention
        setMessages(prev => {
          if (prev.some(m => m.id === aynMessage.id)) return prev;
          return [...prev, aynMessage];
        });
      }

      // Send desktop notification if tab is hidden
      if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
        try {
          const notification = new Notification('AYN', {
            body: response.length > 100 ? response.substring(0, 100) + '...' : response,
            icon: '/favicon.png',
            tag: 'ayn-response',
          });
          notification.onclick = () => {
            window.focus();
            notification.close();
          };
        } catch {
          // Silent fail - notifications are non-critical
        }
      }

      // FIRST: Save chat session title BEFORE messages (prevents race condition)
      try {
        const existingSession = await fetch(
          `${SUPABASE_URL}/rest/v1/chat_sessions?session_id=eq.${sessionId}&user_id=eq.${userId}&select=id`,
          {
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${session.access_token}`,
            }
          }
        );
        const sessionData = await existingSession.json();
        
        // Create session record with title if it doesn't exist
        if (!sessionData || sessionData.length === 0) {
          const title = content.length > 30 ? content.substring(0, 30) + '...' : content;
          await fetch(`${SUPABASE_URL}/rest/v1/chat_sessions`, {
            method: 'POST',
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=minimal',
            },
            body: JSON.stringify({
              session_id: sessionId,
              user_id: userId,
              title: title
            })
          });
        }
      } catch {
        // Silent fail - title storage is non-critical
      }

      // THEN: Save both messages to database via direct REST API
      const saveResponse = await fetch(`${SUPABASE_URL}/rest/v1/messages`, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify([
          {
            user_id: userId,
            session_id: sessionId,
            content: content,
            sender: 'user',
            mode_used: selectedMode,
            created_at: userMessage.timestamp.toISOString(),
            attachment_url: attachment?.url || null,
            attachment_name: attachment?.name || null,
            attachment_type: attachment?.type || null
          },
          {
            user_id: userId,
            session_id: sessionId,
            content: response.replace(/!\[([^\]]*)\]\(data:image\/[^;]+;base64,[^)]+\)/g, '![$1](image-generated)'),
            sender: 'ayn',
            mode_used: selectedMode,
            created_at: new Date(userMessage.timestamp.getTime() + 1).toISOString(),
            // Save document URL as attachment for reliable download
            attachment_url: webhookData?.documentUrl || null,
            attachment_name: webhookData?.documentUrl 
              ? (webhookData?.documentTitle || (webhookData?.documentType === 'excel' ? 'Document.xlsx' : 'Document.pdf'))
              : null,
            attachment_type: webhookData?.documentUrl 
              ? (webhookData?.documentType === 'excel' 
                  ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
                  : 'application/pdf')
              : null
          }
        ])
      });

      // Check if save was successful
      if (!saveResponse.ok) {
        const errorText = await saveResponse.text();
        console.error('[useMessages] Failed to save messages:', saveResponse.status, errorText);
        toast({
          title: "Save Warning",
          description: "Message may not have been saved. Please refresh if issues persist.",
          variant: "destructive"
        });
      } else {
        // AYN response saved successfully - increment total count
        setTotalMessageCount(prev => prev + 1);
      }

      // Usage warnings are handled by SystemNotificationBanner from user_ai_limits data

    } catch (error) {
      setIsTyping(false);
      setIsGeneratingDocument(false);
      setIsGeneratingFloorPlan(false);
      setDocumentType(null);

      const isTimeout = error instanceof Error && error.name === 'AbortError';
      const isNetworkError = !navigator.onLine || (error instanceof TypeError);

      // Network error → queue for retry instead of showing fake AI response
      if (isNetworkError && !isTimeout) {
        offlineQueue.add(content, attachment);
        // Mark the user's message as queued
        setMessages(prev => prev.map(m => 
          m.content === content && m.sender === 'user' && m.status === 'sending'
            ? { ...m, status: 'queued' as const }
            : m
        ));
        toast({
          description: "Message queued — will send when you're back online ⏳",
        });
        return;
      }
      
      // Non-network errors: keep existing friendly response behavior
      const friendlyResponses = isTimeout ? [
        "I'm taking a bit longer to think this through. Want to try asking in a simpler way? I'd love to help! ✨",
        "That's a deep question! Let me catch up - could you try sending it again? 💫"
      ] : [
        "I got a little distracted there! Could you send that again? I'm all ears now 👂",
        "Let's try that again - I want to make sure I give you my best answer! 🌟",
        "Hmm, let me reset my thoughts. Could you ask me one more time? 💭"
      ];
      
      const randomMessage = friendlyResponses[Math.floor(Math.random() * friendlyResponses.length)];
      
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        content: randomMessage,
        sender: 'ayn',
        timestamp: new Date(),
        status: 'sent'
      };

      setMessages(prev => [...prev, errorMessage]);
    }
  }, [
    userId, 
    selectedMode, 
    sessionId, 
    messages, 
    userProfile, 
    toast,
    session,
    isUnlimited,
    emotionHistory,
    onUsageUpdated
  ]);

  // Wrapper to set messages from history with proper flag management
  const setMessagesFromHistory = useCallback((newMessages: Message[]) => {
    setIsLoadingFromHistory(true);
    setMessages(newMessages);
    setTotalMessageCount(newMessages.length);
    // Reset flag after effects have checked it
    setTimeout(() => {
      setIsLoadingFromHistory(false);
    }, 200);
  }, []);

  // Message limit tracking - use totalMessageCount for accurate limit checking
  const messageCount = totalMessageCount > 0 ? totalMessageCount : messages.length;
  const hasReachedLimit = messageCount >= MAX_MESSAGES_PER_CHAT;

  return {
    messages,
    isTyping,
    isGeneratingDocument,
    isGeneratingFloorPlan,
    documentType,
    lastSuggestedEmotion,
    moodPattern,
    messageCount,
    totalMessageCount,
    hasReachedLimit,
    maxMessages: MAX_MESSAGES_PER_CHAT,
    isLoadingFromHistory,
    loadMessages,
    loadMoreMessages,
    hasMoreMessages,
    isLoadingMore,
    sendMessage,
    setMessages,
    setMessagesFromHistory
  };
};

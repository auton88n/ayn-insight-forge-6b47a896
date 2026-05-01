import { useState, useCallback } from 'react';
import { Session } from '@supabase/supabase-js';
import { useToast } from '@/hooks/use-toast';
import { chatRateLimiter } from '@/lib/rateLimiter';
import { offlineQueue } from '@/lib/offlineQueue';
import type {
  Message,
  FileAttachment,
  UserProfile,
  AIMode,
  UseMessagesReturn,
  EmotionHistoryEntry,
  MoodPattern,
  LABResponse
} from '@/types/dashboard.types';

import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/config';
import { detectIntent } from '@/hooks/chat/useIntentDetection';
import { parseSSEStream, fetchWithRetry } from '@/hooks/chat/useSSEStream';
import { useMessagePersistence } from '@/hooks/chat/useMessagePersistence';

const MAX_MESSAGES_PER_CHAT = 100;

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
  const [isTyping, setIsTyping] = useState(false);
  const [isGeneratingDocument, setIsGeneratingDocument] = useState(false);
  const [isGeneratingFloorPlan, setIsGeneratingFloorPlan] = useState(false);
  const [documentType, setDocumentType] = useState<'pdf' | 'excel' | null>(null);
  const [lastSuggestedEmotion, setLastSuggestedEmotion] = useState<string | null>(null);
  const [moodPattern, setMoodPattern] = useState<MoodPattern | null>(null);
  const [emotionHistory, setEmotionHistory] = useState<EmotionHistoryEntry[]>([]);
  const { toast } = useToast();

  const persistence = useMessagePersistence(userId, sessionId, session);
  const {
    messages, setMessages, setMessagesFromHistory,
    loadMessages, loadMoreMessages, saveMessages,
    isLoadingFromHistory, hasMoreMessages, isLoadingMore,
    totalMessageCount, setTotalMessageCount,
  } = persistence;

  const resetGenerationState = useCallback(() => {
    setIsTyping(false);
    setIsGeneratingDocument(false);
    setIsGeneratingFloorPlan(false);
    setDocumentType(null);
  }, []);

  const sendMessage = useCallback(async (
    content: string,
    attachment: FileAttachment | null = null
  ) => {
    // Client-side rate limit
    if (!chatRateLimiter.canProceed()) {
      const waitTime = Math.ceil(chatRateLimiter.getTimeUntilNext() / 1000);
      toast({ title: 'Slow down', description: `Please wait ${waitTime} seconds.`, variant: 'destructive' });
      return;
    }

    setIsTyping(true);

    if (!session) {
      setIsTyping(false);
      toast({ title: 'Session Ended', description: 'Please sign in again.', variant: 'destructive' });
      return;
    }

    if (messages.length >= MAX_MESSAGES_PER_CHAT) {
      setIsTyping(false);
      toast({ title: 'Chat Limit Reached', description: 'Start a new chat to continue.', variant: 'destructive' });
      return;
    }

    // Use the access_token straight from the session prop. useAuth keeps it
    // refreshed via Supabase's onAuthStateChange listener — calling
    // getSession() here added 300-800ms per send on mobile networks.
    const latestToken = session.access_token;

    // NOTE: No pre-flight limit check here.
    // check_user_ai_limit RPC is called atomically inside the ayn-unified edge function.
    // Calling it here AND in the edge function causes double-counting.
    // The edge function returns 429 if limit is reached — handled below.

    // Add user message immediately
    const userMessage: Message = {
      id: crypto.randomUUID(),
      content: content || (attachment ? `📎 ${attachment.name}` : ''),
      sender: 'user',
      timestamp: new Date(),
      status: 'sent',
      attachment: attachment || undefined
    };

    setMessages(prev => {
      if (prev.some(m => m.id === userMessage.id)) return prev;
      return [...prev, userMessage];
    });
    setTotalMessageCount(prev => prev + 1);

    try {
      const messageContent = content.trim() || (attachment ? `📎 Attached file: ${attachment.name}` : '');
      const detectedIntent = detectIntent(selectedMode, messageContent, attachment);
      const requiresNonStreaming = ['document', 'image', 'chart_analysis'].includes(detectedIntent);

      if (detectedIntent === 'document') {
        setIsGeneratingDocument(true);
        setDocumentType(/excel|spreadsheet|xlsx|جدول/.test(messageContent.toLowerCase()) ? 'excel' : 'pdf');
      }

      // Build conversation context
      const stripBase64 = (text: string) => text.replace(/!\[([^\]]*)\]\(data:image\/[^;]+;base64,[^)]+\)/g, '![$1](image-removed)');
      const conversationMessages = messages.slice(-5).map(msg => ({
        role: msg.sender === 'user' ? 'user' : 'assistant',
        content: stripBase64(msg.content.replace(/\n\n\[Attached file: [^\]]+\]$/, ''))
      }));
      conversationMessages.push({
        role: 'user',
        content: messageContent + (attachment ? `\n\n[Attached file: ${attachment.name}]` : '')
      });

      const context: Record<string, unknown> = {
        fileContext: attachment ? { name: attachment.name, type: attachment.type, url: attachment.url } : undefined,
        emotionHistory: emotionHistory.slice(-5),
        userProfile: userProfile ? { name: userProfile.contact_person, company: userProfile.company_name, businessType: userProfile.business_type } : undefined,
      };

      // Call ayn-unified
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90000);

      const webhookResponse = await fetchWithRetry(`${SUPABASE_URL}/functions/v1/ayn-unified`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${latestToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messages: conversationMessages, intent: detectedIntent, context, stream: !requiresNonStreaming, sessionId })
      });

      clearTimeout(timeoutId);

      // Handle error responses
      if (webhookResponse.status === 429) {
        resetGenerationState();
        const errorData = await webhookResponse.json().catch(() => ({}));
        const isChatLimit = errorData?.chatLimitExceeded === true;
        const isDailyLimit = errorData?.reason === 'daily_limit_reached' || errorData?.limitExceeded === true;
        const errorContent = isChatLimit
          ? "This chat has reached its 100 message limit. Please start a new chat."
          : isDailyLimit
            ? "You've reached your daily message limit. It resets tomorrow."
            : "You're sending messages too quickly. Please wait.";
        setMessages(prev => [...prev.filter(m => m.id !== userMessage.id), { id: crypto.randomUUID(), content: errorContent, sender: 'ayn', timestamp: new Date(), status: 'error' }]);
        toast({ title: isChatLimit ? 'Chat Limit' : isDailyLimit ? 'Daily Limit' : 'Rate Limit', description: errorContent, variant: 'destructive' });
        onUsageUpdated?.();
        return;
      }

      if (webhookResponse.status === 403) {
        resetGenerationState();
        const upgradeData = await webhookResponse.json().catch(() => ({}));
        setMessages(prev => [...prev.filter(m => m.id !== userMessage.id), {
          id: (Date.now() + 1).toString(),
          content: upgradeData?.content || 'This feature requires a paid subscription.',
          sender: 'ayn', timestamp: new Date(), status: 'sent'
        }]);
        onUsageUpdated?.();
        return;
      }

      if (!webhookResponse.ok) throw new Error(`Webhook failed: ${webhookResponse.status}`);

      // Process response
      const contentType = webhookResponse.headers.get('content-type') || '';
      const isStreaming = contentType.includes('text/event-stream') || contentType.includes('text/plain');
      let response = '';
      let webhookData: any = null;

      if (isStreaming && !requiresNonStreaming) {
        const aynMessageId = crypto.randomUUID();
        setMessages(prev => [...prev, { id: aynMessageId, content: '', sender: 'ayn', timestamp: new Date(), isTyping: true }]);

        try {
          response = await parseSSEStream(
            webhookResponse,
            (chunk) => setMessages(prev => prev.map(msg =>
              msg.id === aynMessageId ? { ...msg, content: (msg.content + chunk).replace(/\[MEMORY:[^\]]*\]?/g, '') } : msg
            )),
            () => setMessages(prev => prev.map(msg =>
              msg.id === aynMessageId ? { ...msg, content: msg.content.replace(/\[MEMORY:[^\]]+\]/g, '').trim(), isTyping: false, status: 'sent' } : msg
            ))
          );
          resetGenerationState();
          onUsageUpdated?.();

          // Emotion detection
          const { analyzeResponseEmotion, analyzeUserEmotion } = await import('@/lib/emotionMapping');
          let detectedEmotion = analyzeResponseEmotion(response);
          const userEmotion = analyzeUserEmotion(content);
          if (['angry', 'frustrated'].includes(userEmotion) && ['calm', 'happy'].includes(detectedEmotion)) detectedEmotion = 'comfort';
          else if (userEmotion === 'sad' && detectedEmotion === 'calm') detectedEmotion = 'supportive';
          setLastSuggestedEmotion(detectedEmotion);
        } catch {
          setMessages(prev => prev.map(msg =>
            msg.id === aynMessageId ? { ...msg, content: msg.content || "Something went wrong. Try again? 💭", isTyping: false, status: 'sent' } : msg
          ));
          resetGenerationState();
          return;
        }
      } else {
        resetGenerationState();
        webhookData = await webhookResponse.json();
        const responseContent = webhookData?.content || webhookData?.response || webhookData?.output || '';
        response = responseContent.trim() || "Let me think about that differently... Try again? 💭";

        // Emotion
        let finalEmotion = webhookData?.emotion || null;
        if (!finalEmotion) {
          const { analyzeResponseEmotion } = await import('@/lib/emotionMapping');
          finalEmotion = analyzeResponseEmotion(response);
        }
        const backendUserEmotion = webhookData?.userEmotion || null;
        if (backendUserEmotion && ['angry', 'frustrated'].includes(backendUserEmotion) && ['calm', 'happy'].includes(finalEmotion)) finalEmotion = 'comfort';
        else if (backendUserEmotion === 'sad' && finalEmotion === 'calm') finalEmotion = 'supportive';
        setLastSuggestedEmotion(finalEmotion);
        onUsageUpdated?.();

        // Image/document handling
        if (webhookData?.imageUrl) response = `![Generated Image](${webhookData.imageUrl})\n\n` + response;

        const labData: LABResponse | undefined = webhookData?.imageUrl ? {
          json: { image_url: webhookData.imageUrl, revised_prompt: webhookData.revisedPrompt || '' },
          text: webhookData.revisedPrompt || '', emotion: 'creative', raw: JSON.stringify(webhookData), hasStructuredData: true
        } : undefined;

        const documentAttachment = webhookData?.documentUrl ? {
          url: webhookData.documentUrl,
          name: webhookData.documentName || `Document.${webhookData.documentType === 'excel' ? 'xlsx' : 'pdf'}`,
          type: webhookData.documentType || 'pdf'
        } : undefined;

        const aynMessage: Message = {
          id: crypto.randomUUID(), content: response, sender: 'ayn', timestamp: new Date(),
          isTyping: false, status: 'sent',
          ...(labData ? { labData } : {}),
          ...(documentAttachment ? { attachment: documentAttachment } : {}),
          ...(webhookData?.chartAnalysis ? { chartAnalysis: webhookData.chartAnalysis } : {})
        };
        setMessages(prev => [...prev, aynMessage]);
      }

      // Desktop notification
      if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
        try {
          const n = new Notification('AYN', { body: response.length > 100 ? response.substring(0, 100) + '...' : response, icon: '/favicon.png', tag: 'ayn-response' });
          n.onclick = () => { window.focus(); n.close(); };
        } catch { /* non-critical */ }
      }

      // Persist messages
      const saved = await saveMessages(
        { content, timestamp: userMessage.timestamp, attachment },
        response, selectedMode, webhookData
      );
      if (saved) setTotalMessageCount(prev => prev + 1);
      else toast({ title: 'Save Warning', description: 'Message may not have been saved.', variant: 'destructive' });

    } catch (error) {
      resetGenerationState();
      const isTimeout = error instanceof Error && error.name === 'AbortError';
      const isNetworkError = !navigator.onLine || (error instanceof TypeError);

      if (isNetworkError && !isTimeout) {
        offlineQueue.add(content, attachment);
        setMessages(prev => prev.map(m =>
          m.content === content && m.sender === 'user' && m.status === 'sending' ? { ...m, status: 'queued' as const } : m
        ));
        toast({ description: "Message queued — will send when you're back online ⏳" });
        return;
      }

      const friendlyResponses = isTimeout
        ? ["I'm taking longer to think. Try asking in a simpler way? ✨", "That's a deep question! Try sending it again? 💫"]
        : ["Could you send that again? I'm all ears now 👂", "Let's try again — I want to give my best answer! 🌟"];
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        content: friendlyResponses[Math.floor(Math.random() * friendlyResponses.length)],
        sender: 'ayn', timestamp: new Date(), status: 'sent'
      }]);
    }
  }, [userId, selectedMode, sessionId, messages, userProfile, toast, session, isUnlimited, emotionHistory, onUsageUpdated, saveMessages, resetGenerationState, setMessages, setTotalMessageCount]);

  const messageCount = totalMessageCount > 0 ? totalMessageCount : messages.length;

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
    hasReachedLimit: messageCount >= MAX_MESSAGES_PER_CHAT,
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

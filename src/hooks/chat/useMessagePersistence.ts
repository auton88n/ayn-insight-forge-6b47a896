import { useState, useCallback } from 'react';
import { Session } from '@supabase/supabase-js';
import type { Message, FileAttachment } from '@/types/dashboard.types';
import { supabaseApi } from '@/lib/supabaseApi';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/config';

const PAGE_SIZE = 20;

/** Map raw DB rows to Message objects */
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

export function useMessagePersistence(
  userId: string,
  sessionId: string,
  session: Session | null
) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingFromHistory, setIsLoadingFromHistory] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [totalMessageCount, setTotalMessageCount] = useState(0);

  /** Load the most recent PAGE_SIZE messages for current session */
  const loadMessages = useCallback(async () => {
    if (!session || !sessionId) return;

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

      // HEAD count — no row data transferred
      try {
        const countResponse = await fetch(
          `${SUPABASE_URL}/rest/v1/messages?user_id=eq.${userId}&session_id=eq.${sessionId}&select=id`,
          {
            method: 'HEAD',
            headers: {
              'apikey': SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${session.access_token}`,
              'Prefer': 'count=exact',
            }
          }
        );
        const contentRange = countResponse.headers.get('content-range');
        const total = contentRange ? parseInt(contentRange.split('/').pop() || '0', 10) : (data?.length ?? 0);
        setTotalMessageCount(total);
      } catch {
        setTotalMessageCount(data?.length ?? 0);
      }
    } catch (error) {
      console.error('[useMessagePersistence] Error loading messages:', error);
    } finally {
      setTimeout(() => setIsLoadingFromHistory(false), 100);
    }
  }, [userId, sessionId, session]);

  /** Load older messages using cursor-based pagination */
  const loadMoreMessages = useCallback(async () => {
    if (!session || !sessionId || isLoadingMore || !hasMoreMessages) return;

    setIsLoadingMore(true);

    try {
      const oldestTimestamp = messages.length > 0
        ? messages[0].timestamp.toISOString()
        : new Date().toISOString();

      const data = await supabaseApi.get<any[]>(
        `messages?user_id=eq.${userId}&session_id=eq.${sessionId}&created_at=lt.${oldestTimestamp}&select=id,content,created_at,sender,attachment_url,attachment_name,attachment_type&order=created_at.desc&limit=${PAGE_SIZE}`,
        session.access_token
      );

      if (data && data.length > 0) {
        const olderMessages = mapDbMessages(data);
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
      console.error('[useMessagePersistence] Error loading more:', error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [session, sessionId, userId, messages, isLoadingMore, hasMoreMessages]);

  /** Save user + AYN messages to DB */
  const saveMessages = useCallback(async (
    userMsg: { content: string; timestamp: Date; attachment?: FileAttachment | null },
    aynContent: string,
    selectedMode: string,
    webhookData?: any
  ) => {
    if (!session) return false;

    // Save chat session title if new
    try {
      const existingSession = await fetch(
        `${SUPABASE_URL}/rest/v1/chat_sessions?session_id=eq.${sessionId}&user_id=eq.${userId}&select=id`,
        { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${session.access_token}` } }
      );
      const sessionData = await existingSession.json();

      if (!sessionData || sessionData.length === 0) {
        const title = userMsg.content.length > 30 ? userMsg.content.substring(0, 30) + '...' : userMsg.content;
        await fetch(`${SUPABASE_URL}/rest/v1/chat_sessions`, {
          method: 'POST',
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({ session_id: sessionId, user_id: userId, title })
        });
      }
    } catch { /* non-critical */ }

    // Save both messages
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
          content: userMsg.content,
          sender: 'user',
          mode_used: selectedMode,
          created_at: userMsg.timestamp.toISOString(),
          attachment_url: userMsg.attachment?.url || null,
          attachment_name: userMsg.attachment?.name || null,
          attachment_type: userMsg.attachment?.type || null
        },
        {
          user_id: userId,
          session_id: sessionId,
          content: aynContent.replace(/!\[([^\]]*)\]\(data:image\/[^;]+;base64,[^)]+\)/g, '![$1](image-generated)'),
          sender: 'ayn',
          mode_used: selectedMode,
          created_at: new Date(userMsg.timestamp.getTime() + 1).toISOString(),
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

    return saveResponse.ok;
  }, [session, sessionId, userId]);

  /** Set messages from history (e.g. switching sessions) */
  const setMessagesFromHistory = useCallback((newMessages: Message[]) => {
    setIsLoadingFromHistory(true);
    setMessages(newMessages);
    setTotalMessageCount(newMessages.length);
    setTimeout(() => setIsLoadingFromHistory(false), 200);
  }, []);

  return {
    messages,
    setMessages,
    setMessagesFromHistory,
    loadMessages,
    loadMoreMessages,
    saveMessages,
    isLoadingFromHistory,
    hasMoreMessages,
    isLoadingMore,
    totalMessageCount,
    setTotalMessageCount,
  };
}

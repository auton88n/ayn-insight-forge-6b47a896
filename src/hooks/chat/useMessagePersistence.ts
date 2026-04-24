import { useState, useCallback, useRef, useEffect } from 'react';
import { Session } from '@supabase/supabase-js';
import type { Message, FileAttachment } from '@/types/dashboard.types';
import { supabaseApi } from '@/lib/supabaseApi';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/config';

const PAGE_SIZE = 20;

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

  // ── Stable refs so callbacks never need to list session/userId/sessionId
  // as deps (session object changes reference on every render, causing
  // loadMessages to be recreated → DashboardContainer effect fires again
  // → previous fetch aborted → AbortError × hundreds)
  const sessionRef = useRef(session);
  const userIdRef = useRef(userId);
  const sessionIdRef = useRef(sessionId);
  const messagesRef = useRef(messages);
  const hasMoreRef = useRef(hasMoreMessages);
  const isLoadingMoreRef = useRef(isLoadingMore);

  useEffect(() => { sessionRef.current = session; }, [session]);
  useEffect(() => { userIdRef.current = userId; }, [userId]);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { hasMoreRef.current = hasMoreMessages; }, [hasMoreMessages]);
  useEffect(() => { isLoadingMoreRef.current = isLoadingMore; }, [isLoadingMore]);

  // Stable — zero deps. Always reads latest values from refs.
  const loadMessages = useCallback(async () => {
    const s = sessionRef.current;
    const uid = userIdRef.current;
    const sid = sessionIdRef.current;
    if (!s || !sid) return;

    setIsLoadingFromHistory(true);
    try {
      const data = await supabaseApi.get<any[]>(
        `messages?user_id=eq.${uid}&session_id=eq.${sid}&select=id,content,created_at,sender,attachment_url,attachment_name,attachment_type&order=created_at.desc&limit=${PAGE_SIZE}`,
        s.access_token
      );

      if (data && data.length > 0) {
        const chatMessages = mapDbMessages(data);
        const unique = Array.from(new Map(chatMessages.map(m => [m.id, m])).values())
          .sort((a, b) => {
            const diff = a.timestamp.getTime() - b.timestamp.getTime();
            if (diff !== 0) return diff;
            if (a.sender === 'user' && b.sender === 'ayn') return -1;
            if (a.sender === 'ayn' && b.sender === 'user') return 1;
            return 0;
          });
        setMessages(unique);
        setHasMoreMessages(data.length >= PAGE_SIZE);
      } else {
        setMessages([]);
        setHasMoreMessages(false);
      }

      // Count query (HEAD — no row data)
      try {
        let token = s.access_token;
        try {
          const { supabase } = await import('@/integrations/supabase/client');
          const { data: { session: fresh } } = await supabase.auth.getSession();
          if (fresh?.access_token) token = fresh.access_token;
        } catch { /* ignore */ }

        const countRes = await fetch(
          `${SUPABASE_URL}/rest/v1/messages?user_id=eq.${uid}&session_id=eq.${sid}&select=id`,
          {
            method: 'HEAD',
            headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}`, 'Prefer': 'count=exact' }
          }
        );
        const range = countRes.headers.get('content-range');
        setTotalMessageCount(range ? parseInt(range.split('/').pop() || '0', 10) : (data?.length ?? 0));
      } catch {
        setTotalMessageCount(data?.length ?? 0);
      }
    } catch (error) {
      // Only log non-abort errors — AbortErrors are expected on fast session switches
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error('[useMessagePersistence] Error loading messages:', error);
      }
    } finally {
      setTimeout(() => setIsLoadingFromHistory(false), 100);
    }
  }, []); // ← stable: zero deps, reads from refs

  const loadMoreMessages = useCallback(async () => {
    const s = sessionRef.current;
    const uid = userIdRef.current;
    const sid = sessionIdRef.current;
    if (!s || !sid || isLoadingMoreRef.current || !hasMoreRef.current) return;

    setIsLoadingMore(true);
    try {
      const oldest = messagesRef.current.length > 0
        ? messagesRef.current[0].timestamp.toISOString()
        : new Date().toISOString();

      const data = await supabaseApi.get<any[]>(
        `messages?user_id=eq.${uid}&session_id=eq.${sid}&created_at=lt.${oldest}&select=id,content,created_at,sender,attachment_url,attachment_name,attachment_type&order=created_at.desc&limit=${PAGE_SIZE}`,
        s.access_token
      );

      if (data && data.length > 0) {
        const older = mapDbMessages(data).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        setMessages(prev => {
          const ids = new Set(prev.map(m => m.id));
          return [...older.filter(m => !ids.has(m.id)), ...prev];
        });
        setHasMoreMessages(data.length >= PAGE_SIZE);
      } else {
        setHasMoreMessages(false);
      }
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error('[useMessagePersistence] Error loading more:', error);
      }
    } finally {
      setIsLoadingMore(false);
    }
  }, []); // ← stable: zero deps

  const saveMessages = useCallback(async (
    userMsg: { content: string; timestamp: Date; attachment?: FileAttachment | null },
    aynContent: string,
    selectedMode: string,
    webhookData?: any
  ) => {
    const s = sessionRef.current;
    const uid = userIdRef.current;
    const sid = sessionIdRef.current;
    if (!s) return false;

    let token = s.access_token;
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      const { data: { session: fresh } } = await supabase.auth.getSession();
      if (fresh?.access_token) token = fresh.access_token;
    } catch { /* ignore */ }

    // Save session title if new
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/chat_sessions?session_id=eq.${sid}&user_id=eq.${uid}&select=id`,
        { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}` } }
      );
      const existing = await res.json();
      if (!existing || existing.length === 0) {
        const title = userMsg.content.length > 30 ? userMsg.content.substring(0, 30) + '...' : userMsg.content;
        await fetch(`${SUPABASE_URL}/rest/v1/chat_sessions`, {
          method: 'POST',
          headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
          body: JSON.stringify({ session_id: sid, user_id: uid, title })
        });
      }
    } catch { /* non-critical */ }

    const saveRes = await fetch(`${SUPABASE_URL}/rest/v1/messages`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify([
        {
          user_id: uid, session_id: sid, content: userMsg.content, sender: 'user',
          mode_used: selectedMode, created_at: userMsg.timestamp.toISOString(),
          attachment_url: userMsg.attachment?.url || null,
          attachment_name: userMsg.attachment?.name || null,
          attachment_type: userMsg.attachment?.type || null
        },
        {
          user_id: uid, session_id: sid,
          content: aynContent.replace(/!\[([^\]]*)\]\(data:image\/[^;]+;base64,[^)]+\)/g, '![$1](image-generated)'),
          sender: 'ayn', mode_used: selectedMode,
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

    return saveRes.ok;
  }, []); // ← stable: zero deps

  const setMessagesFromHistory = useCallback((newMessages: Message[]) => {
    setIsLoadingFromHistory(true);
    setMessages(newMessages);
    setTotalMessageCount(newMessages.length);
    setTimeout(() => setIsLoadingFromHistory(false), 200);
  }, []);

  return {
    messages, setMessages, setMessagesFromHistory,
    loadMessages, loadMoreMessages, saveMessages,
    isLoadingFromHistory, hasMoreMessages, isLoadingMore,
    totalMessageCount, setTotalMessageCount,
  };
}

import { useState, useCallback, useRef, useEffect } from 'react';
import type { SpineSession as Session } from '@/lib/spineAuth';
import type { Message, FileAttachment } from '@/types/dashboard.types';
import { spineApi } from '@/lib/spineApi';

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
    const sid = sessionIdRef.current;
    if (!sid) return;

    setIsLoadingFromHistory(true);
    try {
      const data = await spineApi.getMessages(sid);

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

      setTotalMessageCount(data?.length ?? 0);
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

      const data = await spineApi.getMessages(sid);

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

    const title = userMsg.content.length > 60 
      ? userMsg.content.substring(0, 60) + '...' 
      : userMsg.content;

    try {
      // Save user message
      await spineApi.saveMessage(sid, {
        role: 'user',
        content: userMsg.content,
        title,
      });
      // Save assistant message
      await spineApi.saveMessage(sid, {
        role: 'assistant',
        content: aynContent.replace(/!\[([^\]]*)\]\(data:image\/[^;]+;base64,[^)]+\)/g, '![$1](image-generated)'),
        title,
      });
    } catch (e) {
      console.error('[useMessagePersistence] Save failed:', e);
      return false;
    }

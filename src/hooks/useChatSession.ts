import { useState, useCallback, useEffect, useRef } from 'react';
import type { SpineSession as Session } from '@/lib/spineAuth';
import { spineApi } from '@/lib/spineApi';
import { useToast } from '@/hooks/use-toast';
import type { ChatHistory, Message, UseChatSessionReturn } from '@/types/dashboard.types';

export const useChatSession = (userId: string, session: Session | null): UseChatSessionReturn => {
  const [currentSessionId, setCurrentSessionId] = useState<string>('');
  const [recentChats, setRecentChats] = useState<ChatHistory[]>([]);
  const [selectedChats, setSelectedChats] = useState<Set<number>>(new Set());
  const [showChatSelection, setShowChatSelection] = useState(false);
  const [isLoadingChats, setIsLoadingChats] = useState(false);
  const lastInitializedUserId = useRef<string | null>(null);
  const { toast } = useToast();

  // Load recent chat history using direct REST API with stored titles
  const loadRecentChats = useCallback(async () => {
    if (!userId || !session) {
      console.warn('[useChatSession] No userId or session available');
      return;
    }
    
    try {
      // Fetch chat sessions from spine
      let sessionsData: any[] = [];
      try {
        sessionsData = await spineApi.listChats();
      } catch (e: any) {
        // 401 = not logged in yet, just show empty
        setRecentChats([]);
        return;
      }

      if (!sessionsData || sessionsData.length === 0) {
        setRecentChats([]);
        return;
      }

      // Convert to ChatHistory format directly from chat_sessions
      const chatHistories: ChatHistory[] = sessionsData.map(s => ({
        title: s.title || 'Chat Session',
        lastMessage: s.title || 'Chat Session',
        timestamp: new Date(s.updated_at),
        messages: [], // Messages loaded on-demand when user clicks
        sessionId: s.session_id
      }));

      setRecentChats(chatHistories);
    } catch {
      // Error loading chats
    }
  }, [userId, session]);

  // Start a new chat session (only called explicitly by user)
  const startNewChat = useCallback(() => {
    const newSessionId = crypto.randomUUID();
    setCurrentSessionId(newSessionId);
    
    toast({
      title: 'New Chat',
      description: 'You can now start a fresh conversation with AYN.',
    });
  }, [toast]);

  // Ensure we have a valid session ID (generate one if empty, but DON'T change existing)
  const ensureSessionId = useCallback(() => {
    if (!currentSessionId) {
      const newId = crypto.randomUUID();
      setCurrentSessionId(newId);
      return newId;
    }
    return currentSessionId;
  }, [currentSessionId]);

  // Load an existing chat
  const loadChat = useCallback((chatHistory: ChatHistory): Message[] => {
    setCurrentSessionId(chatHistory.sessionId as `${string}-${string}-${string}-${string}-${string}`);
    
    toast({
      title: 'Chat Loaded',
      description: `Loaded conversation: ${chatHistory.title}`,
    });

    return chatHistory.messages;
  }, [toast]);

  // Delete selected chats (messages and session records)
  const deleteSelectedChats = useCallback(async () => {
    if (selectedChats.size === 0) return;

    try {
      const chatIndicesToDelete = Array.from(selectedChats);
      const messageIdsToDelete: string[] = [];
      const sessionIdsToDelete: string[] = [];

      // Collect message IDs and session IDs from selected chats
      chatIndicesToDelete.forEach(index => {
        if (recentChats[index]) {
          messageIdsToDelete.push(...recentChats[index].messages.map(m => m.id));
          if (recentChats[index].sessionId) {
            sessionIdsToDelete.push(recentChats[index].sessionId);
          }
        }
      });

      if (session) {
        // Delete messages and chat_sessions records in parallel
        await Promise.all(
          sessionIdsToDelete.map(sessionId => spineApi.deleteSession(sessionId))
        );
      }

      // Clear local state first
      setSelectedChats(new Set());
      setShowChatSelection(false);

      // Refresh from database to ensure consistency
      await loadRecentChats();

      toast({
        title: 'Chats Deleted',
        description: `Successfully deleted ${selectedChats.size} conversation(s).`,
      });
    } catch (error) {
      console.error('Error deleting chats:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete selected chats.',
        variant: "destructive"
      });
    }
  }, [selectedChats, recentChats, toast, loadRecentChats, userId, session]);

  // Toggle chat selection
  const toggleChatSelection = useCallback((index: number) => {
    const newSelected = new Set(selectedChats);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedChats(newSelected);
  }, [selectedChats]);

  // Select all chats
  const selectAllChats = useCallback(() => {
    if (selectedChats.size === recentChats.length) {
      setSelectedChats(new Set());
    } else {
      setSelectedChats(new Set(recentChats.map((_, index) => index)));
    }
  }, [selectedChats, recentChats]);

  // Delete all chats for the user (messages and session records)
  const deleteAllChats = useCallback(async () => {
    if (!session) return;
    
    try {
      // Delete both messages and chat_sessions in parallel
      const allChats = await spineApi.listChats();
      await Promise.all(allChats.map((ch: any) => spineApi.deleteSession(ch.session_id)));

      // Clear local state
      setRecentChats([]);
      setSelectedChats(new Set());
      setShowChatSelection(false);

      toast({
        title: 'All Chats Deleted',
        description: 'Your entire chat history has been cleared.',
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to delete chat history.',
        variant: "destructive"
      });
    }
  }, [userId, toast, session]);

  // Load recent chats on mount and set initial session using REST API - PARALLELIZED
  useEffect(() => {
    const controller = new AbortController();
    
    const initializeSession = async () => {
      // Skip if no user or already initialized for this user
      if (!userId || lastInitializedUserId.current === userId) return;
      
      // Mark as initialized immediately to prevent duplicate calls
      lastInitializedUserId.current = userId;
      
      // No session = not logged in, stop loading
      if (!userId || userId === 'undefined' || userId === 'null') {
        setIsLoadingChats(false);
        return;
      }
      
      setIsLoadingChats(true);
      // Safety timeout — never spin forever
      const safetyTimer = setTimeout(() => setIsLoadingChats(false), 5000);
      
      try {
        // PARALLEL QUERIES - lightweight: session ID + chat_sessions metadata only
        const [latestSessionData, sessionsData] = await Promise.all([
          // Query 1: Get latest session_id
          spineApi.getLatestSession(),
          // Query 2: Get chat sessions
          spineApi.listChats()
        ]);
        
        if (controller.signal.aborted) return;
        
        // Set current session ID - ONLY if not already set
        if (!currentSessionId) {
          const latestId = (latestSessionData as any)?.session_id || null;
          if (latestId) {
            setCurrentSessionId(latestId);
          } else {
            setCurrentSessionId(crypto.randomUUID());
          }
        }
        
        // Build sidebar from chat_sessions metadata directly
        if (sessionsData && sessionsData.length > 0) {
          const chatHistories: ChatHistory[] = sessionsData.map(s => ({
            title: s.title || 'Chat Session',
            lastMessage: s.title || 'Chat Session',
            timestamp: new Date(s.updated_at),
            messages: [], // Messages loaded on-demand when user clicks
            sessionId: s.session_id
          }));

          setRecentChats(chatHistories);
        } else {
          setRecentChats([]);
        }
      } catch (error) {
        // Silently ignore AbortError (expected on unmount)
        if (error instanceof Error && error.name === 'AbortError') {
          // Reset initialization flag so it can retry on next mount
          lastInitializedUserId.current = null;
          return;
        }
        console.error('[useChatSession] Initialization error:', error);
        // Only set new session ID on error if we don't have one
        if (!currentSessionId) {
          setCurrentSessionId(crypto.randomUUID());
        }
        setRecentChats([]);
      } finally {
        clearTimeout(safetyTimer);
        if (!controller.signal.aborted) {
          setIsLoadingChats(false);
        }
      }
    };
    
    initializeSession();
    
    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, session]);

  return {
    currentSessionId,
    recentChats,
    isLoadingChats,
    selectedChats,
    showChatSelection,
    setSelectedChats,
    setShowChatSelection,
    loadRecentChats,
    startNewChat,
    ensureSessionId,
    loadChat,
    deleteSelectedChats,
    deleteAllChats,
    toggleChatSelection,
    selectAllChats
  };
};

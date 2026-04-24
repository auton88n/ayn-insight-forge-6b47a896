import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useChatSession } from '../useChatSession';
import { createMockSupabaseClient } from '@/test/mocks/supabase';
import { mockToast } from '@/test/mocks/contexts';
import type { Session } from '@supabase/supabase-js';

const mockSupabase = createMockSupabaseClient();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: mockSupabase,
}));

// Mock fetch for direct REST API calls
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  text: () => Promise.resolve('[]'),
});

// Mock session for tests
const mockSession: Session = {
  access_token: 'test-access-token',
  refresh_token: 'test-refresh-token',
  expires_in: 3600,
  expires_at: Date.now() / 1000 + 3600,
  token_type: 'bearer',
  user: {
    id: 'test-user-id',
    email: 'test@example.com',
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: new Date().toISOString(),
  },
};

// Fast waitFor with reduced timeout
const waitFor = async (callback: () => void, timeout = 200) => {
  const startTime = Date.now();
  while (Date.now() - startTime < timeout) {
    try {
      callback();
      return;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
  callback();
};

describe('useChatSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global.fetch as ReturnType<typeof vi.fn>).mockReset();
  });

  describe('loadRecentChats', () => {
    it('should load and group messages by session_id', async () => {
      const mockMessages = [
        {
          id: 'msg-1',
          content: 'Hello',
          sender: 'user',
          created_at: '2024-01-01T12:00:00Z',
          session_id: 'session-1',
        },
        {
          id: 'msg-2',
          content: 'Hi there',
          sender: 'ayn',
          created_at: '2024-01-01T12:01:00Z',
          session_id: 'session-1',
        },
        {
          id: 'msg-3',
          content: 'Another chat',
          sender: 'user',
          created_at: '2024-01-02T10:00:00Z',
          session_id: 'session-2',
        },
      ];

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(mockMessages)),
      });

      const { result } = renderHook(() => useChatSession('test-user-id', mockSession));

      await act(async () => {
        await result.current.loadRecentChats();
      });

      await waitFor(() => {
        expect(result.current.recentChats).toHaveLength(2);
      });
    });

    it('should create ChatHistory objects with correct title', async () => {
      const mockMessages = [
        {
          id: 'msg-1',
          content: 'What is the weather today?',
          sender: 'user',
          created_at: '2024-01-01T12:00:00Z',
          session_id: 'session-1',
        },
        {
          id: 'msg-2',
          content: 'The weather is sunny',
          sender: 'ayn',
          created_at: '2024-01-01T12:01:00Z',
          session_id: 'session-1',
        },
      ];

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(mockMessages)),
      });

      const { result } = renderHook(() => useChatSession('test-user-id', mockSession));

      await act(async () => {
        await result.current.loadRecentChats();
      });

      await waitFor(() => {
        const chat = result.current.recentChats[0];
        expect(chat.title).toBe('What is the weather today?');
      });
    });

    it('should sort sessions by most recent first', async () => {
      const mockMessages = [
        {
          id: 'msg-1',
          content: 'Older message',
          sender: 'user',
          created_at: '2024-01-01T10:00:00Z',
          session_id: 'session-1',
        },
        {
          id: 'msg-2',
          content: 'Newer message',
          sender: 'user',
          created_at: '2024-01-02T10:00:00Z',
          session_id: 'session-2',
        },
      ];

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(mockMessages)),
      });

      const { result } = renderHook(() => useChatSession('test-user-id', mockSession));

      await act(async () => {
        await result.current.loadRecentChats();
      });

      await waitFor(() => {
        expect(result.current.recentChats[0].title).toBe('Newer message');
        expect(result.current.recentChats[1].title).toBe('Older message');
      });
    });

    it('should limit to 10 most recent sessions', async () => {
      const mockMessages = Array.from({ length: 15 }, (_, i) => ({
        id: `msg-${i}`,
        content: `Message ${i}`,
        sender: 'user',
        created_at: new Date(2024, 0, i + 1).toISOString(),
        session_id: `session-${i}`,
      }));

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(mockMessages)),
      });

      const { result } = renderHook(() => useChatSession('test-user-id', mockSession));

      await act(async () => {
        await result.current.loadRecentChats();
      });

      await waitFor(() => {
        expect(result.current.recentChats.length).toBeLessThanOrEqual(10);
      });
    });

    it('should handle empty chat history', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('[]'),
      });

      const { result } = renderHook(() => useChatSession('test-user-id', mockSession));

      await act(async () => {
        await result.current.loadRecentChats();
      });

      await waitFor(() => {
        expect(result.current.recentChats).toEqual([]);
      });
    });
  });

  describe('startNewChat', () => {
    it('should generate new UUID for session', () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('[]'),
      });
      
      const { result } = renderHook(() => useChatSession('test-user-id', mockSession));
      
      const initialSessionId = result.current.currentSessionId;

      act(() => {
        result.current.startNewChat();
      });

      expect(result.current.currentSessionId).not.toBe(initialSessionId);
      expect(result.current.currentSessionId).toMatch(/^[a-f0-9-]+$/);
    });

    it('should show toast notification', () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('[]'),
      });
      
      const { result } = renderHook(() => useChatSession('test-user-id', mockSession));

      act(() => {
        result.current.startNewChat();
      });

      expect(mockToast).toHaveBeenCalled();
    });
  });

  describe('loadChat', () => {
    it('should set current session ID from chat history', () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('[]'),
      });
      
      const { result } = renderHook(() => useChatSession('test-user-id', mockSession));
      
      const chatHistory = {
        title: 'Test Chat',
        lastMessage: 'Last message',
        timestamp: new Date(),
        messages: [],
        sessionId: 'loaded-session-id',
      };

      act(() => {
        result.current.loadChat(chatHistory);
      });

      expect(result.current.currentSessionId).toBe('loaded-session-id');
    });

    it('should return messages from chat history', () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('[]'),
      });
      
      const { result } = renderHook(() => useChatSession('test-user-id', mockSession));
      
      const messages = [
        {
          id: 'msg-1',
          content: 'Hello',
          sender: 'user' as const,
          timestamp: new Date(),
        },
      ];

      const chatHistory = {
        title: 'Test Chat',
        lastMessage: 'Last message',
        timestamp: new Date(),
        messages,
        sessionId: 'session-1',
      };

      let loadedMessages;
      act(() => {
        loadedMessages = result.current.loadChat(chatHistory);
      });

      expect(loadedMessages).toEqual(messages);
    });
  });

  describe('deleteSelectedChats', () => {
    it('should delete messages from database', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(JSON.stringify([
          {
            id: 'msg-1',
            content: 'Test',
            sender: 'user',
            created_at: new Date().toISOString(),
            session_id: 'session-1',
          },
        ])),
      });

      mockSupabase._mocks.delete.mockResolvedValueOnce({
        data: null,
        error: null,
      });

      const { result } = renderHook(() => useChatSession('test-user-id', mockSession));

      await act(async () => {
        await result.current.loadRecentChats();
      });

      act(() => {
        result.current.toggleChatSelection(0);
      });

      await act(async () => {
        await result.current.deleteSelectedChats();
      });

      expect(mockSupabase._mocks.delete).toHaveBeenCalled();
    });

    it('should update local state after deletion', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify([
          {
            id: 'msg-1',
            content: 'Test 1',
            sender: 'user',
            created_at: '2024-01-01T10:00:00Z',
            session_id: 'session-1',
          },
          {
            id: 'msg-2',
            content: 'Test 2',
            sender: 'user',
            created_at: '2024-01-02T10:00:00Z',
            session_id: 'session-2',
          },
        ])),
      });

      mockSupabase._mocks.delete.mockResolvedValueOnce({
        data: null,
        error: null,
      });

      // Mock for the refresh after delete
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify([
          {
            id: 'msg-2',
            content: 'Test 2',
            sender: 'user',
            created_at: '2024-01-02T10:00:00Z',
            session_id: 'session-2',
          },
        ])),
      });

      const { result } = renderHook(() => useChatSession('test-user-id', mockSession));

      await act(async () => {
        await result.current.loadRecentChats();
      });

      const initialCount = result.current.recentChats.length;

      act(() => {
        result.current.toggleChatSelection(0);
      });

      await act(async () => {
        await result.current.deleteSelectedChats();
      });

      await waitFor(() => {
        expect(result.current.recentChats.length).toBe(initialCount - 1);
      });
    });

    it('should clear selection after deletion', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(JSON.stringify([
          {
            id: 'msg-1',
            content: 'Test',
            sender: 'user',
            created_at: new Date().toISOString(),
            session_id: 'session-1',
          },
        ])),
      });

      mockSupabase._mocks.delete.mockResolvedValueOnce({
        data: null,
        error: null,
      });

      const { result } = renderHook(() => useChatSession('test-user-id', mockSession));

      await act(async () => {
        await result.current.loadRecentChats();
      });

      act(() => {
        result.current.toggleChatSelection(0);
      });

      await act(async () => {
        await result.current.deleteSelectedChats();
      });

      expect(result.current.selectedChats.size).toBe(0);
    });

    it('should handle deletion errors gracefully', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(JSON.stringify([
          {
            id: 'msg-1',
            content: 'Test',
            sender: 'user',
            created_at: new Date().toISOString(),
            session_id: 'session-1',
          },
        ])),
      });

      mockSupabase._mocks.delete.mockResolvedValueOnce({
        data: null,
        error: { message: 'Delete failed' },
      });

      const { result } = renderHook(() => useChatSession('test-user-id', mockSession));

      await act(async () => {
        await result.current.loadRecentChats();
      });

      act(() => {
        result.current.toggleChatSelection(0);
      });

      await act(async () => {
        await result.current.deleteSelectedChats();
      });

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            variant: 'destructive',
          })
        );
      });

      consoleError.mockRestore();
    });
  });

  describe('chat selection', () => {
    it('should toggle individual chat selection', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(JSON.stringify([
          {
            id: 'msg-1',
            content: 'Test',
            sender: 'user',
            created_at: new Date().toISOString(),
            session_id: 'session-1',
          },
        ])),
      });

      const { result } = renderHook(() => useChatSession('test-user-id', mockSession));

      await act(async () => {
        await result.current.loadRecentChats();
      });

      act(() => {
        result.current.toggleChatSelection(0);
      });

      expect(result.current.selectedChats.has(0)).toBe(true);

      act(() => {
        result.current.toggleChatSelection(0);
      });

      expect(result.current.selectedChats.has(0)).toBe(false);
    });

    it('should select/deselect all chats', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(JSON.stringify([
          {
            id: 'msg-1',
            content: 'Test 1',
            sender: 'user',
            created_at: '2024-01-01T10:00:00Z',
            session_id: 'session-1',
          },
          {
            id: 'msg-2',
            content: 'Test 2',
            sender: 'user',
            created_at: '2024-01-02T10:00:00Z',
            session_id: 'session-2',
          },
        ])),
      });

      const { result } = renderHook(() => useChatSession('test-user-id', mockSession));

      await act(async () => {
        await result.current.loadRecentChats();
      });

      act(() => {
        result.current.selectAllChats();
      });

      expect(result.current.selectedChats.size).toBe(2);

      act(() => {
        result.current.selectAllChats();
      });

      expect(result.current.selectedChats.size).toBe(0);
    });
  });
});

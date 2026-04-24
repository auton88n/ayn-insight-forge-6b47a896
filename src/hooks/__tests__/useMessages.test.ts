import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMessages } from '../useMessages';
import { createMockSupabaseClient } from '@/test/mocks/supabase';
import { mockToast } from '@/test/mocks/contexts';
import type { UserProfile } from '@/types/dashboard.types';
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

const mockUserProfile: UserProfile = {
  user_id: 'test-user-id',
  contact_person: 'John Doe',
  company_name: 'Test Corp',
};

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

describe('useMessages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global.fetch as ReturnType<typeof vi.fn>).mockReset();
  });

  describe('loadMessages', () => {
    it('should load messages from database for current session', async () => {
      const mockDbMessages = [
        {
          id: 'msg-1',
          content: 'Hello',
          sender: 'user',
          created_at: new Date().toISOString(),
          attachment_url: null,
          attachment_name: null,
          attachment_type: null,
        },
        {
          id: 'msg-2',
          content: 'Hi there',
          sender: 'ayn',
          created_at: new Date().toISOString(),
          attachment_url: null,
          attachment_name: null,
          attachment_type: null,
        },
      ];

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(mockDbMessages)),
      });

      const { result } = renderHook(() =>
        useMessages('test-session-id', 'test-user-id', 'test@example.com', 'General', mockUserProfile, true, mockSession, false)
      );

      await act(async () => {
        await result.current.loadMessages();
      });

      await waitFor(() => {
        expect(result.current.messages).toHaveLength(2);
        expect(result.current.messages[0].content).toBe('Hello');
      });
    });

    it('should transform database records to Message objects', async () => {
      const mockDbMessages = [
        {
          id: 'msg-1',
          content: 'Test message',
          sender: 'user',
          created_at: '2024-01-01T12:00:00Z',
          attachment_url: null,
          attachment_name: null,
          attachment_type: null,
        },
      ];

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(mockDbMessages)),
      });

      const { result } = renderHook(() =>
        useMessages('test-session-id', 'test-user-id', 'test@example.com', 'General', mockUserProfile, true, mockSession, false)
      );

      await act(async () => {
        await result.current.loadMessages();
      });

      await waitFor(() => {
        const message = result.current.messages[0];
        expect(message.id).toBe('msg-1');
        expect(message.content).toBe('Test message');
        expect(message.sender).toBe('user');
        expect(message.timestamp).toBeInstanceOf(Date);
      });
    });

    it('should handle attachments in messages correctly', async () => {
      const mockDbMessages = [
        {
          id: 'msg-1',
          content: 'Check this file',
          sender: 'user',
          created_at: new Date().toISOString(),
          attachment_url: 'https://example.com/file.pdf',
          attachment_name: 'document.pdf',
          attachment_type: 'application/pdf',
        },
      ];

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(mockDbMessages)),
      });

      const { result } = renderHook(() =>
        useMessages('test-session-id', 'test-user-id', 'test@example.com', 'General', mockUserProfile, true, mockSession, false)
      );

      await act(async () => {
        await result.current.loadMessages();
      });

      await waitFor(() => {
        const message = result.current.messages[0];
        expect(message.attachment).toEqual({
          url: 'https://example.com/file.pdf',
          name: 'document.pdf',
          type: 'application/pdf',
        });
      });
    });

    it('should return empty array when no messages exist', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('[]'),
      });

      const { result } = renderHook(() =>
        useMessages('test-session-id', 'test-user-id', 'test@example.com', 'General', mockUserProfile, true, mockSession, false)
      );

      await act(async () => {
        await result.current.loadMessages();
      });

      await waitFor(() => {
        expect(result.current.messages).toEqual([]);
      });
    });

    it('should handle database errors gracefully', async () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Database error'),
      });

      const { result } = renderHook(() =>
        useMessages('test-session-id', 'test-user-id', 'test@example.com', 'General', mockUserProfile, true, mockSession, false)
      );

      await act(async () => {
        await result.current.loadMessages();
      });

      await waitFor(() => {
        expect(consoleError).toHaveBeenCalled();
      });

      consoleError.mockRestore();
    });
  });

  describe('sendMessage', () => {
    it('should check usage limits before sending', async () => {
      mockSupabase._mocks.rpc.mockResolvedValueOnce({
        data: false,
        error: null,
      });

      const { result } = renderHook(() =>
        useMessages('test-session-id', 'test-user-id', 'test@example.com', 'General', mockUserProfile, true, mockSession, false)
      );

      await act(async () => {
        await result.current.sendMessage('Test message');
      });

      expect(mockSupabase._mocks.rpc).toHaveBeenCalledWith('increment_usage', {
        _user_id: 'test-user-id',
        _action_type: 'message',
        _count: 1
      });
    });

    it('should show toast and return when usage limit exceeded', async () => {
      mockSupabase._mocks.rpc.mockResolvedValueOnce({
        data: false,
        error: null,
      });

      const { result } = renderHook(() =>
        useMessages('test-session-id', 'test-user-id', 'test@example.com', 'General', mockUserProfile, true, mockSession, false)
      );

      await act(async () => {
        await result.current.sendMessage('Test message');
      });

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: 'destructive',
        })
      );
    });

    it('should add user message to state immediately', async () => {
      mockSupabase._mocks.rpc.mockResolvedValueOnce({ data: true, error: null });
      mockSupabase._mocks.invoke.mockResolvedValueOnce({
        data: { output: 'AI response' },
        error: null,
      });
      mockSupabase._mocks.insert.mockResolvedValue({ data: null, error: null });

      const { result } = renderHook(() =>
        useMessages('test-session-id', 'test-user-id', 'test@example.com', 'General', mockUserProfile, true, mockSession, false)
      );

      act(() => {
        result.current.sendMessage('Hello AI');
      });

      await waitFor(() => {
        const userMessage = result.current.messages.find(m => m.sender === 'user');
        expect(userMessage?.content).toBe('Hello AI');
      });
    });

    it('should set isTyping to true during API call', async () => {
      mockSupabase._mocks.rpc.mockResolvedValueOnce({ data: true, error: null });
      mockSupabase._mocks.invoke.mockImplementationOnce(
        () => new Promise(resolve => setTimeout(() => resolve({ data: { output: 'Response' }, error: null }), 100))
      );
      mockSupabase._mocks.insert.mockResolvedValue({ data: null, error: null });

      const { result } = renderHook(() =>
        useMessages('test-session-id', 'test-user-id', 'test@example.com', 'General', mockUserProfile, true, mockSession, false)
      );

      act(() => {
        result.current.sendMessage('Test');
      });

      await waitFor(() => {
        expect(result.current.isTyping).toBe(true);
      });
    });

    it('should call ayn-unified edge function with correct payload', async () => {
      mockSupabase._mocks.rpc.mockResolvedValueOnce({ data: true, error: null });
      mockSupabase._mocks.invoke.mockResolvedValueOnce({
        data: { content: 'AI response' },
        error: null,
      });
      mockSupabase._mocks.insert.mockResolvedValue({ data: null, error: null });

      const { result } = renderHook(() =>
        useMessages('test-session-id', 'test-user-id', 'test@example.com', 'General', mockUserProfile, true, mockSession, false)
      );

      await act(async () => {
        await result.current.sendMessage('Hello AI');
      });

      // ayn-unified uses messages array format
      expect(mockSupabase._mocks.invoke).toHaveBeenCalledWith(
        'ayn-unified',
        expect.objectContaining({
          body: expect.objectContaining({
            messages: expect.arrayContaining([
              expect.objectContaining({ role: 'user', content: 'Hello AI' })
            ]),
            intent: 'chat',
            stream: false
          }),
        })
      );
    });

    it('should handle webhook response and add AI message', async () => {
      mockSupabase._mocks.rpc.mockResolvedValueOnce({ data: true, error: null });
      mockSupabase._mocks.invoke.mockResolvedValueOnce({
        data: { output: 'This is the AI response' },
        error: null,
      });
      mockSupabase._mocks.insert.mockResolvedValue({ data: null, error: null });

      const { result } = renderHook(() =>
        useMessages('test-session-id', 'test-user-id', 'test@example.com', 'General', mockUserProfile, true, mockSession, false)
      );

      await act(async () => {
        await result.current.sendMessage('Hello');
      });

      await waitFor(() => {
        const aynMessage = result.current.messages.find(m => m.sender === 'ayn');
        expect(aynMessage?.content).toBe('This is the AI response');
      });
    });

    it('should save both messages to database', async () => {
      mockSupabase._mocks.rpc.mockResolvedValueOnce({ data: true, error: null });
      mockSupabase._mocks.invoke.mockResolvedValueOnce({
        data: { output: 'AI response' },
        error: null,
      });
      mockSupabase._mocks.insert.mockResolvedValue({ data: null, error: null });

      const { result } = renderHook(() =>
        useMessages('test-session-id', 'test-user-id', 'test@example.com', 'General', mockUserProfile, true, mockSession, false)
      );

      await act(async () => {
        await result.current.sendMessage('Test message');
      });

      await waitFor(() => {
        expect(mockSupabase._mocks.insert).toHaveBeenCalled();
      });
    });

    it('should handle webhook errors gracefully', async () => {
      mockSupabase._mocks.rpc.mockResolvedValueOnce({ data: true, error: null });
      mockSupabase._mocks.invoke.mockResolvedValueOnce({
        data: null,
        error: { message: 'Webhook failed' },
      });

      const { result } = renderHook(() =>
        useMessages('test-session-id', 'test-user-id', 'test@example.com', 'General', mockUserProfile, true, mockSession, false)
      );

      await act(async () => {
        await result.current.sendMessage('Test');
      });

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({
            variant: 'destructive',
          })
        );
      });
    });
  });

  describe('attachment handling', () => {
    it('should include attachment data in webhook payload', async () => {
      const attachment = {
        url: 'https://example.com/file.pdf',
        name: 'document.pdf',
        type: 'application/pdf',
        size: 1024,
      };

      mockSupabase._mocks.rpc.mockResolvedValueOnce({ data: true, error: null });
      mockSupabase._mocks.invoke.mockResolvedValueOnce({
        data: { output: 'File received' },
        error: null,
      });
      mockSupabase._mocks.insert.mockResolvedValue({ data: null, error: null });

      const { result } = renderHook(() =>
        useMessages('test-session-id', 'test-user-id', 'test@example.com', 'General', mockUserProfile, true, mockSession, false)
      );

      await act(async () => {
        await result.current.sendMessage('Check this file', attachment);
      });

      // ayn-unified includes file context in context object
      expect(mockSupabase._mocks.invoke).toHaveBeenCalledWith(
        'ayn-unified',
        expect.objectContaining({
          body: expect.objectContaining({
            context: expect.objectContaining({
              fileContext: expect.objectContaining({
                name: 'document.pdf',
                type: 'application/pdf'
              })
            }),
          }),
        })
      );
    });

    it('should display attachment placeholder when no content', async () => {
      mockSupabase._mocks.rpc.mockResolvedValueOnce({ data: true, error: null });
      mockSupabase._mocks.invoke.mockResolvedValueOnce({
        data: { output: '[object Object]' },
        error: null,
      });
      mockSupabase._mocks.insert.mockResolvedValue({ data: null, error: null });

      const { result } = renderHook(() =>
        useMessages('test-session-id', 'test-user-id', 'test@example.com', 'General', mockUserProfile, true, mockSession, false)
      );

      await act(async () => {
        await result.current.sendMessage('Test');
      });

      await waitFor(() => {
        const aynMessage = result.current.messages.find(m => m.sender === 'ayn');
        expect(aynMessage?.content).toContain('processing');
      });
    });
  });
});

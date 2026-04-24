import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { SUPABASE_URL } from '@/config';

interface AYNMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface AYNResponse {
  content: string;
  model?: string;
  wasFallback?: boolean;
  intent?: string;
}

interface UseAYNOptions {
  onStreamChunk?: (chunk: string) => void;
  onComplete?: (response: AYNResponse) => void;
  onError?: (error: Error) => void;
}

export function useAYN(options: UseAYNOptions = {}) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [response, setResponse] = useState<AYNResponse | null>(null);

  const tryParseUpgradePayload = (maybeJson: unknown): AYNResponse | null => {
    // When Supabase returns a non-2xx from functions.invoke, it may surface
    // as an error with a message like:
    // "Edge function returned 403: Error, { ...json... }"
    // We want to gracefully treat upgrade-required as a normal response.
    const raw = typeof maybeJson === 'string' ? maybeJson : '';

    // First attempt: extract JSON after the last comma
    const idx = raw.lastIndexOf(',');
    const tail = idx >= 0 ? raw.slice(idx + 1).trim() : '';

    for (const candidate of [tail, raw]) {
      if (!candidate) continue;
      const trimmed = candidate.trim();
      if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) continue;

      try {
        const parsed = JSON.parse(trimmed);
        if (parsed?.requiresUpgrade && typeof parsed?.content === 'string') {
          return {
            content: parsed.content,
            intent: parsed.intent,
            wasFallback: false,
          };
        }
      } catch {
        // ignore
      }
    }

    return null;
  };

  const sendMessage = useCallback(async (
    message: string,
    context?: {
      intent?: string;
      language?: string;
      conversationHistory?: AYNMessage[];
      fileContext?: string;
    }
  ): Promise<AYNResponse | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const messages: AYNMessage[] = context?.conversationHistory || [];
      messages.push({ role: 'user', content: message });

      const { data, error: invokeError } = await supabase.functions.invoke('ayn-unified', {
        body: {
          messages,
          intent: context?.intent,
          language: context?.language,
          context: {
            fileContext: context?.fileContext,
          },
          stream: false,
        },
      });

      if (invokeError) {
        // Handle upgrade-required (403) as a normal response instead of throwing
        const upgrade = tryParseUpgradePayload(invokeError.message);
        if (upgrade) {
          setResponse(upgrade);
          options.onComplete?.(upgrade);
          return upgrade;
        }
        throw new Error(invokeError.message || 'Failed to get response from AYN');
      }

      const aynResponse: AYNResponse = {
        content: data?.content || data?.message || '',
        model: data?.model,
        wasFallback: data?.wasFallback,
        intent: data?.intent,
      };

      setResponse(aynResponse);
      options.onComplete?.(aynResponse);
      return aynResponse;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      options.onError?.(error);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [options]);

  const streamMessage = useCallback(async (
    message: string,
    context?: {
      intent?: string;
      language?: string;
      conversationHistory?: AYNMessage[];
      fileContext?: string;
    }
  ): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      const messages: AYNMessage[] = context?.conversationHistory || [];
      messages.push({ role: 'user', content: message });

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      if (!token) {
        throw new Error('Not authenticated');
      }

      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/ayn-unified`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            messages,
            intent: context?.intent,
            language: context?.language,
            context: {
              fileContext: context?.fileContext,
            },
            stream: true,
          }),
        }
      );

      if (!response.ok) {
        // Upgrade-required should be shown, not treated as a crash
        if (response.status === 403) {
          const upgradeData = await response.json().catch(() => ({}));
          const upgradeResponse: AYNResponse = {
            content: upgradeData?.content || 'This feature requires a paid subscription. Please upgrade to continue.',
            intent: upgradeData?.intent,
            wasFallback: false,
          };
          setResponse(upgradeResponse);
          options.onComplete?.(upgradeResponse);
          return;
        }
        throw new Error(`Stream error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) {
                fullContent += content;
                options.onStreamChunk?.(content);
              }
            } catch {
              // Ignore parse errors for partial chunks
            }
          }
        }
      }

      const aynResponse: AYNResponse = {
        content: fullContent,
      };

      setResponse(aynResponse);
      options.onComplete?.(aynResponse);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown error');
      setError(error);
      options.onError?.(error);
    } finally {
      setIsLoading(false);
    }
  }, [options]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const clearResponse = useCallback(() => {
    setResponse(null);
  }, []);

  return {
    sendMessage,
    streamMessage,
    isLoading,
    error,
    response,
    clearError,
    clearResponse,
  };
}

export default useAYN;

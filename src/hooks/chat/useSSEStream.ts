/**
 * SSE stream parser — extracted from useMessages for reuse and testability.
 */
export const parseSSEStream = async (
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

/**
 * Retry-aware fetch — tries twice before giving up.
 */
export const fetchWithRetry = async (
  url: string,
  options: RequestInit,
  retries = 2
): Promise<Response> => {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, options);
      if (response.ok || response.status === 429 || response.status === 402 || response.status === 403) return response;
    } catch (e) {
      const isAbortError = e instanceof Error && e.name === 'AbortError';
      if (isAbortError || options.signal?.aborted || i === retries - 1) throw e;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  throw new Error('Request failed after retries');
};

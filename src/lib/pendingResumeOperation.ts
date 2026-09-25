/** Received content remains in memory only. An optional account-scoped key
 * persists just the request UUID, letting the server replay a paid result
 * after reload. Only use persistence with a backend that saves results. */
export function createPendingResumeOperation<T>(storageKey?: string) {
  let requestId: string | null = null;
  let result: T | undefined;
  let inFlight: Promise<T> | null = null;

  return {
    run(generate: (id: string) => Promise<T>, save: (value: T, id: string) => Promise<void>): Promise<T> {
      if (inFlight) return inFlight;
      if (!requestId && storageKey) {
        const stored = localStorage.getItem(storageKey);
        if (stored && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(stored)) requestId = stored;
      }
      requestId ??= crypto.randomUUID();
      // Persist before calling a paid endpoint. Do not send content or tokens.
      if (storageKey) localStorage.setItem(storageKey, requestId);
      const id = requestId;
      inFlight = (async () => {
        result ??= await generate(id);
        await save(result, id);
        if (storageKey && localStorage.getItem(storageKey) === id) localStorage.removeItem(storageKey);
        const saved = result;
        result = undefined;
        requestId = null;
        return saved;
      })().finally(() => { inFlight = null; });
      return inFlight;
    },
  };
}

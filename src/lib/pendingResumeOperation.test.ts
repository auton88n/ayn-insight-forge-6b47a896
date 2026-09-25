import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createPendingResumeOperation } from './pendingResumeOperation';

afterEach(() => vi.restoreAllMocks());
beforeEach(() => { vi.mocked(crypto.randomUUID).mockImplementation(randomUUID); });

describe('pending resume save recovery', () => {
  it('persists only a request identifier and recovers it across remounts', async () => {
    const storage = new Map<string, string>();
    vi.spyOn(localStorage, 'getItem').mockImplementation(key => storage.get(key) ?? null);
    vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => { storage.set(key, value); });
    vi.spyOn(localStorage, 'removeItem').mockImplementation(key => { storage.delete(key); });
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('10000000-0000-0000-0000-000000000001');
    const key = `test-paid:${crypto.randomUUID()}`;
    const first = createPendingResumeOperation<string>(key);
    const generate = vi.fn(async (_id: string) => 'private resume contents');
    await expect(first.run(generate, async () => { throw new Error('offline'); })).rejects.toThrow();
    expect(localStorage.getItem(key)).toBe(generate.mock.calls[0][0]);
    expect(localStorage.getItem(key)).not.toContain('private');
    const remounted = createPendingResumeOperation<string>(key);
    await remounted.run(generate, async () => undefined);
    expect(generate.mock.calls[1][0]).toBe(generate.mock.calls[0][0]);
    expect(localStorage.getItem(key)).toBeNull();
  });
  it('reuses the received document and request id after a failed save', async () => {
    const operation = createPendingResumeOperation<{ text: string }>();
    const generate = vi.fn(async () => ({ text: 'Completed document' }));
    const save = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
    await expect(operation.run(generate, save)).rejects.toThrow('offline');
    await expect(operation.run(generate, save)).resolves.toEqual({ text: 'Completed document' });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]).toEqual(save.mock.calls[1]);
  });

  it('retains the generation key when a response is lost', async () => {
    const operation = createPendingResumeOperation<string>();
    const generate = vi.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValue('resume');
    const save = vi.fn(async () => undefined);
    await expect(operation.run(generate, save)).rejects.toThrow('timeout');
    await operation.run(generate, save);
    expect(generate.mock.calls[0][0]).toBe(generate.mock.calls[1][0]);
  });

  it('deduplicates simultaneous clicks but starts a new operation after success', async () => {
    const operation = createPendingResumeOperation<string>();
    const generate = vi.fn(async (_id: string) => 'resume');
    const save = vi.fn(async () => undefined);
    const first = operation.run(generate, save);
    expect(operation.run(generate, save)).toBe(first);
    await first;
    await operation.run(generate, save);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[0][0]).not.toBe(generate.mock.calls[1][0]);
  });

  it('does not share a received document with a different account operation', async () => {
    const first = createPendingResumeOperation<string>();
    await expect(first.run(async () => 'private A', async () => { throw new Error('offline'); })).rejects.toThrow();
    const second = createPendingResumeOperation<string>();
    const save = vi.fn(async (_value: string, _id: string) => undefined);
    await second.run(async () => 'private B', save);
    expect(save.mock.calls[0][0]).toBe('private B');
  });
});

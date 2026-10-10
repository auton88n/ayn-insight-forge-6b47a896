import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/errorReporting', () => ({ reportClientError: vi.fn(async () => {}) }));
import { canRecoverStaleChunk, isStaleChunkError } from '../components/shared/ErrorBoundary';

describe('stale deployment recovery', () => {
  it('recognizes import failures but not ordinary application failures', () => {
    expect(isStaleChunkError('Failed to fetch dynamically imported module: /assets/JobsTab-old.js')).toBe(true);
    expect(isStaleChunkError('Importing a module script failed')).toBe(true);
    expect(isStaleChunkError('Cannot read properties of undefined')).toBe(false);
  });
  it('allows later releases to recover without a reload loop', () => {
    const now = 1_800_000_000_000;
    expect(canRecoverStaleChunk(null, now)).toBe(true);
    expect(canRecoverStaleChunk('1', now)).toBe(true); // obsolete permanent session flag
    expect(canRecoverStaleChunk(String(now - 10_000), now)).toBe(false);
    expect(canRecoverStaleChunk(String(now - 61_000), now)).toBe(true);
  });
});

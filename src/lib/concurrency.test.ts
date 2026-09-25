// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { mapConcurrent } from '../../supabase/functions/_shared/concurrency';

describe('bounded work', () => {
  it('preserves order while respecting the limit', async () => {
    let active = 0;
    let peak = 0;
    const result = await mapConcurrent([5, 4, 3, 2, 1], 2, async value => {
      peak = Math.max(peak, ++active);
      await new Promise(resolve => setTimeout(resolve, value));
      active--;
      return value * 2;
    });
    expect(result).toEqual([10, 8, 6, 4, 2]);
    expect(peak).toBe(2);
    expect(active).toBe(0);
  });
  it('stops scheduling after failure and waits for started work', async () => {
    const started: number[] = [];
    let settled = false;
    await expect(mapConcurrent([0, 1, 2, 3], 2, async value => {
      started.push(value);
      if (!value) throw new Error('failed');
      await new Promise(resolve => setTimeout(resolve, 5));
      settled = true;
    })).rejects.toThrow('failed');
    expect(started).toEqual([0, 1]);
    expect(settled).toBe(true);
  });
  it('handles empty input and rejects invalid limits', async () => {
    expect(await mapConcurrent([], 2, async value => value)).toEqual([]);
    await expect(mapConcurrent([], 0, async value => value)).rejects.toThrow('positive integer');
  });
});

/** Ordered results, bounded work. All started workers settle before rejection. */
export async function mapConcurrent<T, R>(items: readonly T[], limit: number, run: (item: T, index: number) => Promise<R>): Promise<R[]> {
  if (!Number.isInteger(limit) || limit < 1) throw new Error('Concurrency must be a positive integer');
  const results = new Array<R>(items.length);
  let next = 0;
  let failed = false;
  let failure: unknown;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (!failed) {
      const index = next++;
      if (index >= items.length) return;
      try { results[index] = await run(items[index], index); }
      catch (error) { if (!failed) failure = error; failed = true; }
    }
  }));
  if (failed) throw failure;
  return results;
}

/**
 * A tiny, shared source of truth for query keys that more than one
 * component reads or invalidates. Two independent components writing the
 * same literal array (['saved-jobs', userId] in one file, a typo'd
 * variant in another) is exactly the kind of drift that would silently
 * break cache invalidation -- one file's mutation would never notify the
 * other's query, and nobody would see an error, just stale data. A single
 * exported function makes that impossible instead of relying on two
 * people remembering to type the same thing.
 */
export const savedJobsQueryKey = (userId: string) => ["saved-jobs", userId] as const;

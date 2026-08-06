/**
 * talentPoolSync.ts — v3.2.1
 *
 * The real bug behind the v3.2.0 redesign: resumes and profile fields are
 * written client side straight to Supabase, bypassing the edge function, so
 * the talent pool index never rebuilt and employer search quietly went stale.
 *
 * Every client-side write that changes indexed content calls
 * reindexTalentPool(). Rules baked in here so no call site can get them wrong:
 *   - fire and forget, it never delays or blocks the user's save
 *   - errors are swallowed
 *   - skipped entirely when the user is not opted into the pool
 *   - concurrent calls coalesce into one request
 *   - on success it dispatches AYN_POOL_REINDEXED for any mounted listener
 *     that wants to refresh (no current listener since TalentPoolCard was
 *     removed in v3.70.0; kept as the extension point, harmless if unused)
 */
import { resumeHubApi } from "@/lib/resumeHub";

export const AYN_POOL_REINDEXED = "ayn:talent-pool-reindexed";

/** Cached opt-in status so repeated saves do not re-query every time. */
let optedInCache: { value: boolean; at: number } | null = null;
const OPT_IN_TTL_MS = 5 * 60 * 1000;
let inFlight: Promise<void> | null = null;

/** Called by the pool card whenever it learns the current opt-in state. */
export function setPoolOptInCache(value: boolean) {
  optedInCache = { value, at: Date.now() };
}

async function isOptedIn(): Promise<boolean> {
  if (optedInCache && Date.now() - optedInCache.at < OPT_IN_TTL_MS) return optedInCache.value;
  const status = await resumeHubApi.talentPoolGet();
  setPoolOptInCache(!!status.opted_in);
  return !!status.opted_in;
}

/**
 * Rebuild the caller's talent pool index after a client-side write.
 * Never throws, never awaited by the save path.
 */
export function reindexTalentPool(reason: string): void {
  if (inFlight) return;
  inFlight = (async () => {
    try {
      if (!(await isOptedIn())) return;
      await resumeHubApi.talentPoolReindexSelf();
      window.dispatchEvent(new CustomEvent(AYN_POOL_REINDEXED, { detail: { reason } }));
    } catch {
      /* silent by design: indexing must never surface as a save failure */
    } finally {
      inFlight = null;
    }
  })();
}

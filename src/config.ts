/**
 * Centralized configuration
 *
 * SUPABASE_ANON_KEY is a publishable key — safe in frontend code (not the
 * service role key). RLS policies protect the data, not this key's
 * secrecy. It's still required from a real env var rather than a literal
 * fallback baked into source: Hostinger's own Build Settings already sets
 * VITE_SUPABASE_ANON_KEY for every real deploy (see .env.example), so a
 * hardcoded copy here only ever risked silently drifting stale if the key
 * is ever rotated in Supabase without someone remembering to update this
 * file too. A local dev checkout with no .env just needs one added.
 */
export const SUPABASE_URL =
  (import.meta.env?.VITE_SUPABASE_URL as string | undefined) ||
  'https://ayn.careers';

const rawAnonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY as string | undefined;
if (!rawAnonKey) {
  throw new Error(
    'VITE_SUPABASE_ANON_KEY is not set. Add it to your .env (see .env.example) — ' +
    'get it from Supabase Dashboard → Project Settings → API.'
  );
}
export const SUPABASE_ANON_KEY = rawAnonKey;

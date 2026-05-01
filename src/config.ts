/**
 * Centralized configuration
 * Keys come from Vite env vars (set in Hostinger build settings).
 * Never hardcode secrets in source code.
 *
 * Required env vars (set in Hostinger → Advanced → Environment Variables):
 *   VITE_SUPABASE_URL        = https://dfkoxuokfkttjhfjcecx.supabase.co
 *   VITE_SUPABASE_ANON_KEY   = your-anon-key (from Supabase → Settings → API)
 */
export const SUPABASE_URL =
  (import.meta.env?.VITE_SUPABASE_URL as string | undefined) ||
  'https://dfkoxuokfkttjhfjcecx.supabase.co';

export const SUPABASE_ANON_KEY =
  (import.meta.env?.VITE_SUPABASE_ANON_KEY as string | undefined) || '';

if (!SUPABASE_ANON_KEY && import.meta.env?.MODE !== 'test') {
  console.warn('[AYN] VITE_SUPABASE_ANON_KEY is not set. Set it in your Hostinger build environment variables.');
}

/**
 * Simulation runs via the ayn-agent-society Supabase edge function.
 * No separate Python engine needed — everything runs in Supabase.
 */
export const ENGIN_URL = `${SUPABASE_URL}/functions/v1/ayn-agent-society`;

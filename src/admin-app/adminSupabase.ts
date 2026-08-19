// Completely separate Supabase client for admin —
// uses its own storage key so it NEVER shares session with the main ayn.careers app.
// Key is hardcoded as fallback so the admin panel NEVER silently breaks
// due to missing env vars at build time.
import { createClient } from '@supabase/supabase-js';

// v3.159.0 — exported so useAdminQuery.ts's adminRpc() (a raw fetch() that
// bypasses the supabase-js client entirely, see its own comment for why)
// reads the same self-hosted-or-Cloud value instead of carrying its own
// second, hardcoded-to-Cloud copy. A self-hosted build's CSP only allows
// its own Supabase origin, so a stale hardcoded Cloud URL there doesn't
// just point at the wrong backend — the browser blocks the request outright.
export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  'https://ayn.careers';

// Fallback order: env var → hardcoded anon key (anon key is public/safe)
export const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg2ODg5MDQyLCJleHAiOjIxMDIyNDkwNDJ9.AmUVtzKLnrXO_ubBNxSDCBDnI7jJyNkGfK9p7nrzkGI';

// storageKey 'ayn-admin-auth' is completely separate from the main app's storage
export const adminSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storageKey: 'ayn-admin-auth', // Separate from main app's 'sb-*' key
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
  global: {
    // Suppress "Multiple GoTrueClient instances" warning — expected since
    // admin panel shares the browser context with the main app but uses
    // a completely separate storageKey so sessions never interfere.
    headers: { 'x-client-info': 'ayn-admin/1.0' },
  },
});

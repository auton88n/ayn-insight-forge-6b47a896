// Completely separate Supabase client for admin —
// uses its own storage key so it NEVER shares session with the main aynn.io app.
// Key is hardcoded as fallback so the admin panel NEVER silently breaks
// due to missing env vars at build time.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  'https://dfkoxuokfkttjhfjcecx.supabase.co';

// Fallback order: env var → hardcoded anon key (anon key is public/safe)
const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRma294dW9rZmt0dGpoZmpjZWN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYzNTg4NzMsImV4cCI6MjA3MTkzNDg3M30.Th_-ds6dHsxIhRpkzJLREwBIVdgkcdm2SmMNDmjNbxw';

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

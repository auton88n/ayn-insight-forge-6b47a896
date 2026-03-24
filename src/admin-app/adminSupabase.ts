// Completely separate Supabase client for admin — 
// uses its own storage key so it NEVER shares session with the main aynn.io app
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://dfkoxuokfkttjhfjcecx.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';

// Key difference: storageKey 'ayn-admin-auth' is completely separate from the main app's storage
export const adminSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storageKey: 'ayn-admin-auth',   // never conflicts with main app session
    autoRefreshToken: true,
    persistSession: true,
    storage: localStorage,
  }
});

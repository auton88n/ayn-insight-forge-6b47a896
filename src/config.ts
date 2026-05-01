/**
 * Centralized configuration
 *
 * SUPABASE_ANON_KEY is a publishable key — safe in frontend code (not the service role key).
 * RLS policies protect the data. Override with VITE_SUPABASE_ANON_KEY if you rotate the key.
 */
export const SUPABASE_URL =
  (import.meta.env?.VITE_SUPABASE_URL as string | undefined) ||
  'https://dfkoxuokfkttjhfjcecx.supabase.co';

export const SUPABASE_ANON_KEY =
  (import.meta.env?.VITE_SUPABASE_ANON_KEY as string | undefined) ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRma294dW9rZmt0dGpoZmpjZWN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYzNTg4NzMsImV4cCI6MjA3MTkzNDg3M30.Th_-ds6dHsxIhRpkzJLREwBIVdgkcdm2SmMNDmjNbxw';

/** Simulation runs via the ayn-agent-society Supabase edge function. */
export const ENGIN_URL = `${SUPABASE_URL}/functions/v1/ayn-agent-society`;

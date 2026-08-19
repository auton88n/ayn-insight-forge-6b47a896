/**
 * Centralized configuration
 *
 * SUPABASE_ANON_KEY is a publishable key — safe in frontend code (not the service role key).
 * RLS policies protect the data. Override with VITE_SUPABASE_ANON_KEY if you rotate the key.
 */
export const SUPABASE_URL =
  (import.meta.env?.VITE_SUPABASE_URL as string | undefined) ||
  'https://ayn.careers';

export const SUPABASE_ANON_KEY =
  (import.meta.env?.VITE_SUPABASE_ANON_KEY as string | undefined) ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg2ODg5MDQyLCJleHAiOjIxMDIyNDkwNDJ9.AmUVtzKLnrXO_ubBNxSDCBDnI7jJyNkGfK9p7nrzkGI';

/**
 * Centralized configuration
 * Single source of truth for backend URLs and Supabase keys.
 */
export const SUPABASE_URL = 'https://dfkoxuokfkttjhfjcecx.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRma294dW9rZmt0dGpoZmpjZWN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYzNTg4NzMsImV4cCI6MjA3MTkzNDg3M30.Th_-ds6dHsxIhRpkzJLREwBIVdgkcdm2SmMNDmjNbxw';

/**
 * AYN backend config. Supabase only.
 * Override at build time with VITE_AYN_BACKEND_URL.
 */
export const AYN_BACKEND_URL =
  (import.meta.env?.VITE_AYN_BACKEND_URL as string | undefined) || 'https://spine.aynn.io';

/**
 * AYN ENGIN — Python swarm-simulation engine (MiroFish-style).
 * Override at build time with VITE_ENGIN_URL.
 */
export const ENGIN_URL =
  (import.meta.env?.VITE_ENGIN_URL as string | undefined) || 'https://engine.aynn.io';

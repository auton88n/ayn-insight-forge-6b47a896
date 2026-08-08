/**
 * Shared CORS headers for all edge functions.
 * Uses originGuard to restrict Access-Control-Allow-Origin to ayn.careers only.
 * 
 * Usage in any edge function:
 *   import { corsHeaders, handleCors } from '../_shared/cors.ts';
 *   
 *   Deno.serve(async (req) => {
 *     if (req.method === 'OPTIONS') return handleCors(req);
 *     // ... your logic ...
 *     return new Response(JSON.stringify(result), {
 *       headers: { ...corsHeaders(req), 'Content-Type': 'application/json' }
 *     });
 *   });
 */
import { getAllowedOrigin } from './originGuard.ts';

/**
 * Returns CORS headers with origin locked to the whitelist.
 * Replaces the old { 'Access-Control-Allow-Origin': '*' } pattern.
 */
export function corsHeaders(req: Request): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': getAllowedOrigin(req),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-application-name, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Max-Age': '86400',
  };
}

/**
 * Handle OPTIONS preflight requests.
 */
export function handleCors(req: Request): Response {
  return new Response('ok', { headers: corsHeaders(req) });
}

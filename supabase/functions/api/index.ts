import { corsHeaders as getCorsHeadersFn } from '../_shared/cors.ts';

 import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
 import { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";
 
 // corsHeaders: static fallback using primary origin (from _shared/cors.ts)
const corsHeaders = getCorsHeadersFn({ headers: new Headers() } as Request);
 
 // Allowed endpoints that can be proxied (whitelist for security)
 const ALLOWED_ENDPOINTS = [
   'track-visit',
   'measure-ux',
   'health',
 ];
 
 serve(async (req) => {
   // Handle CORS preflight
   if (req.method === 'OPTIONS') {
     return new Response(null, { headers: corsHeaders });
   }
 
   try {
     const url = new URL(req.url);
     // Extract endpoint from path: /api/track-visit -> track-visit
     const pathParts = url.pathname.split('/').filter(Boolean);
     const endpoint = pathParts[pathParts.length - 1];
 
     // Validate endpoint is in whitelist
     if (!endpoint || !ALLOWED_ENDPOINTS.includes(endpoint)) {
       return new Response(JSON.stringify({ 
         error: 'Invalid endpoint' 
       }), {
         status: 400,
         headers: { ...corsHeaders, 'Content-Type': 'application/json' },
       });
     }
 
     // Get request body
     let body = null;
     if (req.method !== 'GET' && req.method !== 'HEAD') {
       try {
         body = await req.text();
       } catch {
         body = null;
       }
     }
 
     // Forward request to actual edge function
     const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
     const targetUrl = `${supabaseUrl}/functions/v1/${endpoint}`;
 
     // Forward all headers except host
     const headers = new Headers();
     req.headers.forEach((value, key) => {
       if (key.toLowerCase() !== 'host') {
         headers.set(key, value);
       }
     });
 
     const response = await fetch(targetUrl, {
       method: req.method,
       headers,
       body: body || undefined,
     });
 
     // Return proxied response
     const responseBody = await response.text();
     return new Response(responseBody, {
       status: response.status,
       headers: {
         ...corsHeaders,
         'Content-Type': response.headers.get('Content-Type') || 'application/json',
       },
     });
 
   } catch (error) {
     console.error('API proxy error:', error);
     return new Response(JSON.stringify({ 
       error: 'Internal server error' 
     }), {
       status: 500,
       headers: { ...corsHeaders, 'Content-Type': 'application/json' },
     });
   }
 });
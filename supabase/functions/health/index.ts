import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders as getCorsHeadersFn } from '../_shared/cors.ts';


// corsHeaders: static fallback using primary origin (from _shared/cors.ts)
const corsHeaders = getCorsHeadersFn({ headers: new Headers() } as Request);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  return new Response(
    JSON.stringify({ 
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    }),
    { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200 
    }
  );
});

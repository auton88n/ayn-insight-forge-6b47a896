import { createClient } from 'npm:@supabase/supabase-js@2.45.0';
import { corsHeaders, handleCors } from '../_shared/cors.ts';
import { validateOrigin } from '../_shared/originGuard.ts';

const encoder = new TextEncoder();

function json(req: Request, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}

function validVisitorId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9-]{20,80}$/i.test(value);
}

function validPath(value: unknown): value is string {
  return typeof value === 'string'
    && value.startsWith('/')
    && value.length <= 300
    && !/[?#]/.test(value);
}

function validReferrer(value: unknown): value is string | null {
  return value === null || value === undefined
    || (typeof value === 'string' && /^https?:\/\/[^/?#]{1,200}$/i.test(value));
}

async function hmacHex(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
  return Array.from(signature, byte => byte.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCors(req);
  if (!validateOrigin(req)) return json(req, { error: 'origin_not_allowed' }, 403);
  if (req.method !== 'POST') return json(req, { error: 'method_not_allowed' }, 405);

  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  if (!anonKey || !serviceKey || !supabaseUrl) return json(req, { error: 'tracking_unavailable' }, 503);
  if (req.headers.get('apikey') !== anonKey) return json(req, { error: 'unauthorized' }, 401);

  try {
    const body = await req.json();
    const { visitorId, pagePath, referrer = null } = body as Record<string, unknown>;
    if (!validVisitorId(visitorId) || !validPath(pagePath) || !validReferrer(referrer)) {
      return json(req, { error: 'invalid_event' }, 400);
    }

    // The service-role key is the HMAC secret. We retain only this keyed hash
    // for short-lived abuse control, never a raw IP address or browser fingerprint.
    const forwarded = req.headers.get('x-real-ip')
      || req.headers.get('cf-connecting-ip')
      || req.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim()
      || `visitor:${visitorId}`;
    const sourceHash = await hmacHex(forwarded, serviceKey);
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await admin.rpc('record_visitor_pageview', {
      p_visitor_id: visitorId,
      p_page_path: pagePath,
      p_referrer: referrer,
      p_source_hash: sourceHash,
    });
    if (error) {
      console.error('visitor-track insert failed', error.message);
      return json(req, { error: 'tracking_unavailable' }, 503);
    }
    return json(req, { recorded: data === true }, 202);
  } catch {
    return json(req, { error: 'invalid_event' }, 400);
  }
});

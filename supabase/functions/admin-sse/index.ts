// admin-sse — Server-Sent Events stream for admin realtime updates.
// Replaces adminSupabase.channel().on('postgres_changes') subscriptions.
//
// Client subscribes via EventSource:
//   GET /functions/v1/admin-sse?tables=support_tickets,contact_messages&token=<JWT>
//
// Server polls each requested table every POLL_INTERVAL_MS, computes a row-hash
// digest, and emits a `change` event whenever the digest changes. The client
// then re-fetches via adminApi.get() (same pattern as Supabase realtime).
//
// Auth: requires a valid admin JWT. Validated against user_roles table.
//
// SSE event format:
//   event: change
//   data: {"table":"support_tickets","at":1700000000000}
//
//   event: ping
//   data: {}

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

// Tables that are allowed to be subscribed to.
const ALLOWED_TABLES = new Set([
  'support_tickets',
  'support_messages',
  'contact_messages',
  'service_applications',
  'application_replies',
  'ayn_activity_log',
  'ayn_dev_messages',
  'ayn_dev_conversations',
  'ayn_mind',
  'admin_notification_log',
  'twitter_posts',
  'agent_telegram_bots',
  'workforce_tasks',
]);

const POLL_INTERVAL_MS = 3000;
const PING_INTERVAL_MS = 25000;
const MAX_DURATION_MS = 4 * 60 * 1000; // 4 min — well under the edge fn limit

async function verifyAdminJwt(token: string): Promise<string | null> {
  if (!token) return null;
  try {
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return null;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: roleRow } = await admin
      .from('user_roles').select('role').eq('user_id', user.id).maybeSingle();
    if (!roleRow || !['admin', 'duty'].includes(roleRow.role)) return null;
    return user.id;
  } catch {
    return null;
  }
}

async function tableDigest(admin: ReturnType<typeof createClient>, table: string): Promise<string> {
  // Cheap "is anything new?" check: max(updated_at|created_at) + count
  // Falls back gracefully if columns don't exist.
  try {
    const { count } = await admin.from(table).select('*', { count: 'exact', head: true });
    let stamp: string | null = null;
    for (const col of ['updated_at', 'created_at']) {
      const r = await admin.from(table).select(col).order(col, { ascending: false }).limit(1);
      if (!r.error && r.data && r.data.length > 0) { stamp = (r.data[0] as any)[col]; break; }
    }
    return `${count ?? 0}:${stamp ?? ''}`;
  } catch {
    return '';
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const url = new URL(req.url);
  const token = url.searchParams.get('token') ?? '';
  const requested = (url.searchParams.get('tables') ?? '').split(',').map(s => s.trim()).filter(Boolean);
  const tables = requested.filter(t => ALLOWED_TABLES.has(t));

  if (tables.length === 0) {
    return new Response(JSON.stringify({ error: 'no valid tables requested' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const userId = await verifyAdminJwt(token);
  if (!userId) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const startedAt = Date.now();
      const digests = new Map<string, string>();
      let closed = false;

      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch { closed = true; }
      };

      // Seed initial digests so we don't immediately emit a change for every table
      for (const t of tables) digests.set(t, await tableDigest(admin, t));
      send('ready', { tables });

      let lastPing = Date.now();
      while (!closed && Date.now() - startedAt < MAX_DURATION_MS) {
        await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
        if (closed) break;
        for (const t of tables) {
          const d = await tableDigest(admin, t);
          if (d !== digests.get(t)) {
            digests.set(t, d);
            send('change', { table: t, at: Date.now() });
          }
        }
        if (Date.now() - lastPing > PING_INTERVAL_MS) {
          send('ping', {});
          lastPing = Date.now();
        }
      }
      send('reconnect', {});
      try { controller.close(); } catch { /* ignore */ }
    },
    cancel() { /* client disconnected */ },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
});

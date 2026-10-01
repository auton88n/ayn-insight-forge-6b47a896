// v3.360.0 — admin-posthog-recordings. A read-only proxy so the founder can
// see PostHog session replay activity from inside AYN's own admin panel,
// instead of needing a second login on posthog.com for something this
// small. Same admin-JWT check every other admin edge function already
// uses (admin-broadcast, admin-inbox-reply). Never writes anything back
// to PostHog, and holds no ability to play a recording's actual content —
// it only ever returns the same aggregate metadata PostHog's own
// dashboard list view shows (duration, click count, when, which page),
// never the masked replay stream itself. Watching an actual recording
// still means opening the linked posthog.com URL, which is the correct
// place for that: PostHog's own player, not a second one built here.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, handleCors } from '../_shared/cors.ts';

const POSTHOG_HOST = Deno.env.get('POSTHOG_API_HOST') || 'https://us.posthog.com';
const POSTHOG_PROJECT_ID = Deno.env.get('POSTHOG_PROJECT_ID') || '598173';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCors(req);
  const headers = { ...corsHeaders(req), 'Content-Type': 'application/json' };

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
    }

    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const asUser = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: claimData, error: claimErr } = await asUser.auth.getClaims(authHeader.replace('Bearer ', ''));
    if (claimErr || !claimData?.claims?.sub) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
    }
    const callerId = claimData.claims.sub as string;

    const admin = createClient(url, service);
    const { data: isAdmin, error: roleErr } = await admin.rpc('has_role', { _user_id: callerId, _role: 'admin' });
    if (roleErr || !isAdmin) {
      return new Response(JSON.stringify({ error: 'Admin access required' }), { status: 403, headers });
    }

    const personalKey = Deno.env.get('POSTHOG_PERSONAL_API_KEY');
    if (!personalKey) {
      // Not an error — PostHog is genuinely optional and may not be
      // connected yet. The frontend shows a real "not connected" state
      // for this, not an error toast.
      return new Response(JSON.stringify({ connected: false, recordings: [] }), { headers });
    }

    const phRes = await fetch(
      `${POSTHOG_HOST}/api/projects/${POSTHOG_PROJECT_ID}/session_recordings/?limit=50`,
      { headers: { Authorization: `Bearer ${personalKey}` } },
    );

    if (!phRes.ok) {
      const text = await phRes.text().catch(() => '');
      console.error('admin-posthog-recordings: PostHog API error', phRes.status, text.slice(0, 300));
      return new Response(
        JSON.stringify({ error: `PostHog API returned ${phRes.status}. Check the personal API key and its scopes.` }),
        { status: 502, headers },
      );
    }

    const body = await phRes.json();
    const results: any[] = Array.isArray(body?.results) ? body.results : [];

    const recordings = results.map((r) => ({
      id: r.id,
      startTime: r.start_time ?? null,
      durationSeconds: typeof r.recording_duration === 'number' ? r.recording_duration : null,
      activeSeconds: typeof r.active_seconds === 'number' ? r.active_seconds : null,
      clickCount: typeof r.click_count === 'number' ? r.click_count : null,
      consoleErrorCount: typeof r.console_error_count === 'number' ? r.console_error_count : null,
      startUrl: r.start_url ?? null,
      viewed: !!r.viewed,
      // person_profiles is 'identified_only' and this app never calls
      // identify(), so almost every real session here is anonymous by
      // design — that's expected, not a bug in this proxy.
      personEmail: r.person?.properties?.email ?? null,
      replayUrl: `${POSTHOG_HOST}/project/${POSTHOG_PROJECT_ID}/replay/${r.id}`,
    }));

    return new Response(JSON.stringify({ connected: true, recordings }), { headers });
  } catch (e) {
    console.error('admin-posthog-recordings failed', e);
    return new Response(JSON.stringify({ error: (e as Error).message || 'Failed to load recordings' }), { status: 500, headers });
  }
});

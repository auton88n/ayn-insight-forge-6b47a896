// Extension session bootstrap.
// POST { token } -> returns user_id, profile, primary resume summary, autofill data.
// Used by the Chrome extension after the user pastes their token.

import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ayn-ext-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function sha256Hex(s: string) {
  const b = new TextEncoder().encode(s);
  const h = await crypto.subtle.digest("SHA-256", b);
  return Array.from(new Uint8Array(h)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const token: string | undefined = body.token || req.headers.get("x-ayn-ext-token") || undefined;
    if (!token) return json({ error: "token required" }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const hash = await sha256Hex(token);
    const { data: tok, error } = await admin
      .from("extension_tokens")
      .select("user_id, revoked_at, device_label")
      .eq("token_hash", hash)
      .maybeSingle();
    if (error || !tok) return json({ error: "Invalid token" }, 401);
    if (tok.revoked_at) return json({ error: "Token revoked" }, 401);

    await admin.from("extension_tokens").update({ last_used_at: new Date().toISOString() }).eq("token_hash", hash);

    const userId = tok.user_id as string;
    const [{ data: profile }, { data: resume }] = await Promise.all([
      admin.from("user_profile_data").select("*").eq("user_id", userId).maybeSingle(),
      admin.from("resumes").select("id, title, content").eq("user_id", userId).eq("is_primary", true).maybeSingle(),
    ]);

    return json({
      user_id: userId,
      device_label: tok.device_label,
      profile: profile ?? null,
      resume: resume ?? null,
    });
  } catch (e) {
    console.error("ext-auth error", e);
    return json({ error: e instanceof Error ? e.message : "Server error" }, 500);
  }
});

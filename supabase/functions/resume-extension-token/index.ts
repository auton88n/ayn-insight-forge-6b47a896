// Mint, list, and revoke extension tokens. Dashboard-only (requires Supabase JWT).
// POST { action: "mint", label } -> { token, prefix, id } (raw shown once)
// POST { action: "list" } -> { tokens: [...] }
// POST { action: "revoke", id } -> { ok: true }

import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

async function sha256Hex(s: string) {
  const b = new TextEncoder().encode(s);
  const h = await crypto.subtle.digest("SHA-256", b);
  return Array.from(new Uint8Array(h)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return "ayn_" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const jwt = auth.replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "Unauthorized" }, 401);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: u } = await sb.auth.getUser();
    if (!u?.user) return json({ error: "Unauthorized" }, 401);
    const userId = u.user.id;

    const { action, label, id } = await req.json();

    if (action === "mint") {
      const token = randomToken();
      const hash = await sha256Hex(token);
      const prefix = token.slice(0, 12) + "…";
      const { data, error } = await sb
        .from("extension_tokens")
        .insert({ user_id: userId, token_hash: hash, token_prefix: prefix, device_label: label || "Browser" })
        .select("id")
        .single();
      if (error) throw error;
      return json({ token, prefix, id: data.id });
    }

    if (action === "list") {
      const { data, error } = await sb
        .from("extension_tokens")
        .select("id, token_prefix, device_label, last_used_at, revoked_at, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return json({ tokens: data });
    }

    if (action === "revoke") {
      if (!id) return json({ error: "id required" }, 400);
      const { error } = await sb.from("extension_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("token error", e);
    return json({ error: e instanceof Error ? e.message : "Server error" }, 500);
  }
});

/**
 * ext-memory — Part 2 backing store for the extension's learning layer.
 *
 * Verifies the extension device token (x-ayn-ext-token) the same way
 * resume-hub does, then reads/writes rows in public.ext_answer_memory using
 * the service role (RLS is scoped to user_id, which we derive from the token).
 *
 * Actions: lookup | remember | forget
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-ayn-ext-token",
};

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) return json({ error: "misconfigured" }, 500);

    const token = req.headers.get("x-ayn-ext-token");
    if (!token) return json({ error: "x-ayn-ext-token required" }, 401);
    const admin = createClient(supabaseUrl, serviceKey);
    const tokenHash = await sha256Hex(token);
    const { data: tok } = await admin
      .from("extension_tokens")
      .select("user_id, revoked_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (!tok || tok.revoked_at) return json({ error: "invalid_token" }, 401);
    const userId = tok.user_id as string;

    const body = await req.json();
    const action = String(body?.action || "");

    if (action === "lookup") {
      const sig = String(body?.signature || "");
      if (!sig) return json({ error: "signature required" }, 400);
      const { data } = await admin
        .from("ext_answer_memory")
        .select(
          "question_signature,canonical_label,semantic_type,question_kind,answer_value,answer_option_label,answer_option_labels,ats_hint,times_used,verified_ok_count,verified_fail_count"
        )
        .eq("user_id", userId)
        .eq("question_signature", sig)
        .maybeSingle();
      return json({ row: data ?? null });
    }

    if (action === "remember") {
      const row = body?.row || {};
      const sig = String(row.question_signature || "");
      if (!sig) return json({ error: "signature required" }, 400);
      const { data: existing } = await admin
        .from("ext_answer_memory")
        .select("id, times_used, verified_ok_count, verified_fail_count")
        .eq("user_id", userId)
        .eq("question_signature", sig)
        .maybeSingle();
      const okBump = Number(row.verified_ok_count || 0);
      const failBump = Number(row.verified_fail_count || 0);
      if (existing) {
        const valuePatch = okBump > 0 ? {
          answer_value: row.answer_value ?? undefined,
          answer_option_label: row.answer_option_label ?? undefined,
          answer_option_labels: row.answer_option_labels ?? undefined,
        } : {};
        await admin
          .from("ext_answer_memory")
          .update({
            canonical_label: row.canonical_label ?? undefined,
            semantic_type: row.semantic_type ?? undefined,
            question_kind: row.question_kind ?? undefined,
            ...valuePatch,
            ats_hint: row.ats_hint ?? undefined,
            times_used: (existing.times_used || 0) + 1,
            verified_ok_count: (existing.verified_ok_count || 0) + okBump,
            verified_fail_count: (existing.verified_fail_count || 0) + failBump,
            last_used_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
      } else {
        await admin.from("ext_answer_memory").insert({
          user_id: userId,
          question_signature: sig,
          canonical_label: String(row.canonical_label || "").slice(0, 500),
          semantic_type: String(row.semantic_type || "unknown"),
          question_kind: String(row.question_kind || "text"),
          answer_value: row.answer_value ?? null,
          answer_option_label: row.answer_option_label ?? null,
          answer_option_labels: row.answer_option_labels ?? null,
          ats_hint: row.ats_hint ?? null,
          times_used: 1,
          verified_ok_count: okBump,
          verified_fail_count: failBump,
        });
      }
      return json({ ok: true });
    }

    if (action === "list") {
      const { data } = await admin
        .from("ext_answer_memory")
        .select(
          "id,canonical_label,semantic_type,question_kind,answer_value,answer_option_label,ats_hint,times_used,verified_ok_count,verified_fail_count,last_used_at"
        )
        .eq("user_id", userId)
        .order("last_used_at", { ascending: false })
        .limit(500);
      return json({ rows: data ?? [] });
    }

    if (action === "forget") {
      const id = body?.id;
      if (id) {
        await admin.from("ext_answer_memory").delete().eq("user_id", userId).eq("id", id);
      } else if (body?.all === true) {
        await admin.from("ext_answer_memory").delete().eq("user_id", userId);
      } else {
        return json({ error: "id or all required" }, 400);
      }
      return json({ ok: true });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message ?? String(e) }, 500);
  }
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

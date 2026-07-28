// _shared/ext-auth.ts — v2.11.0
// Single implementation of "extension token OR web session" auth for the
// three AI edge functions (ayn-ai-proxy, ext-fill-form-retry,
// ext-vision-discover) plus anywhere resume-hub wants the same lookup.
//
// Replaces the shared x-proxy-secret that shipped inside the public
// extension bundle. Every accepted call resolves to a real user_id so we
// can attribute AI cost.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export type ExtAuthResult =
  | { ok: true; userId: string; via: "ext_token" | "session"; deviceLabel: string | null }
  | { ok: false; status: number; error: string };

export async function sha256Hex(s: string): Promise<string> {
  const b = new TextEncoder().encode(s);
  const h = await crypto.subtle.digest("SHA-256", b);
  return Array.from(new Uint8Array(h)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

export async function authenticateExtOrSession(req: Request): Promise<ExtAuthResult> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const token = req.headers.get("x-ayn-ext-token");
  if (token) {
    const admin = createClient(supabaseUrl, serviceKey);
    const tokenHash = await sha256Hex(token);
    const { data: tok } = await admin
      .from("extension_tokens")
      .select("user_id, revoked_at, device_label")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (!tok) return { ok: false, status: 401, error: "Invalid extension token" };
    if (tok.revoked_at) return { ok: false, status: 401, error: "Extension token revoked" };
    admin.from("extension_tokens")
      .update({ last_used_at: new Date().toISOString() })
      .eq("token_hash", tokenHash)
      .then(() => {});
    return {
      ok: true,
      userId: tok.user_id as string,
      via: "ext_token",
      deviceLabel: (tok.device_label as string) ?? null,
    };
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const bearer = authHeader.replace(/^Bearer\s+/i, "");
  if (bearer) {
    const supa = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
    });
    const { data: u } = await supa.auth.getUser();
    if (u?.user) {
      return { ok: true, userId: u.user.id, via: "session", deviceLabel: "web-session" };
    }
  }

  return { ok: false, status: 401, error: "Unauthorized: extension token or session required" };
}

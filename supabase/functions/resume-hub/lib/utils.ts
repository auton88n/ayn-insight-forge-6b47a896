// v3.131.0 — pulled out of the single 5,400-line index.ts as the first
// stage of a deliberately conservative reorganization: pure code movement,
// zero logic changes, verified behavior-identical before/after via
// tsc + a full live smoke pass. Every function below is self-contained
// (explicit parameters only, no dependency on a live request's closure
// state), which is what makes it safe to move at all — the ~58 action
// blocks in index.ts's own dispatcher are NOT touched by this pass, since
// those depend on per-request closure state and moving them safely is a
// separate, larger, more careful undertaking of its own.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.0";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, x-application-name, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ──────────────────────────────────────────────────────────────
// humanize(): strip em/en dashes and " - " connectors from every
// user-facing string AYN generates. Ranges become "X to Y", any
// other dash becomes a comma. Phone numbers and hyphenated words
// (Saudi-Korean, ATS-friendly) keep their hyphens because they
// have no surrounding spaces.
// ──────────────────────────────────────────────────────────────
export function humanize(s: unknown): unknown {
  if (typeof s !== "string" || !s) return s;
  return s
    // money ranges with $ on the left: $90K-$120K, $110K – $140K  -> "to"
    .replace(/(\$[ \t]?\d[\d,.]*[ \t]?[KkMm]?)[ \t]*[\u2014\u2013-][ \t]*(\$?[ \t]?\d[\d,.]*[ \t]?[KkMm]?)/g, "$1 to $2")
    // magnitude ranges where BOTH sides carry a K/M suffix: 90K-120K, 1.2M–1.5M -> "to"
    .replace(/(\d[\d,.]*[KkMm])[ \t]*[\u2014\u2013-][ \t]*(\d[\d,.]*[KkMm])/g, "$1 to $2")
    // any em or en dash anywhere -> comma (safe: never appears in dates, phones, ids, urls)
    .replace(/[ \t]*[\u2014\u2013][ \t]*/g, ", ")
    // " - " spaced ASCII hyphen used as a connector -> comma
    // (bare hyphens with no surrounding spaces are LEFT ALONE on purpose:
    //  protects 2023-2025, 416-660-9926, Saudi-Korean, ISO dates, UUIDs, URLs)
    .replace(/[ \t]+-[ \t]+/g, ", ")
    .replace(/ ,/g, ",")
    .replace(/,[ \t]*,/g, ", ")
    .trim();
}
export function humanizeAny<T>(v: T): T {
  if (v == null) return v;
  if (typeof v === "string") return humanize(v) as unknown as T;
  if (Array.isArray(v)) return v.map((x) => humanizeAny(x)) as unknown as T;
  if (typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = k === "optionValue" || k === "optionLabel" || k === "optionLabels" ? val : humanizeAny(val);
    }
    return out as unknown as T;
  }
  return v;
}

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(humanizeAny(data)), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

export async function sha256Hex(s: string) {
  const b = new TextEncoder().encode(s);
  const h = await crypto.subtle.digest("SHA-256", b);
  return Array.from(new Uint8Array(h)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

// v2.7.0 — resolve the resume content the extension should use.
// If a specific tailored version was requested (resume_version_id) and it
// belongs to this user, use that; otherwise fall back to the primary resume.
export async function resolveResumeContent(
  admin: SupabaseClient<any, any, any>,
  userId: string,
  resumeVersionId?: string,
): Promise<{ id: string | null; content: Record<string, unknown> | null; source: "version" | "primary" | "none" }> {
  if (resumeVersionId && typeof resumeVersionId === "string" && resumeVersionId.length > 0) {
    const { data: v } = await admin
      .from("resume_versions")
      .select("id, resume_id, content, user_id")
      .eq("id", resumeVersionId)
      .eq("user_id", userId)
      .maybeSingle();
    if (v?.content) return { id: v.resume_id as string, content: v.content as Record<string, unknown>, source: "version" };
  }
  const { data: primary } = await admin
    .from("resumes")
    .select("id, content")
    .eq("user_id", userId)
    .eq("is_primary", true)
    .maybeSingle();
  if (primary?.content) return { id: primary.id as string, content: primary.content as Record<string, unknown>, source: "primary" };
  return { id: null, content: null, source: "none" };
}

export const EXT_ACTIONS = new Set([
  "ext_bootstrap", "ext_cover_letter_text",
  "ext_job_score", "ext_suggest_roles", "ext_find_contacts",
  "ext_download_resume_text", "smart_tailor", "ext_ask",
  // v1.5.0: canonical profile read for extension
  "ext_profile_canonical_get",
  // v2.8.0: JD resolver — fetch previously-ingested JD by host+path
  "ext_job_lookup",
]);

export const LINK_PUBLIC_ACTIONS = new Set(["link_start", "link_poll"]);

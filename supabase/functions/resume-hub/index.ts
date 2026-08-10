// Resume Hub — unified AI edge function.
// Actions: extension lane (ext_bootstrap, ext_profile,
// ext_job_score, ext_cover_letter_text, smart_tailor, ext_ask), hub lane
// (profile, resumes, jobs, proposals, assessments) and employer lane.
// Auth: requires the caller's Supabase JWT (Authorization: Bearer ...).
// All DB writes use the caller's JWT so RLS enforces per-user isolation.

import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.0";
// v2.13.0 — unified identity source of truth. See docs/map/resume-hub.md
// "Identity" section. Every action that reads applicant PII goes through
// loadIdentity() so a new source (canonical.identity, auth.users) is
// picked up everywhere at once, not re-derived per action.
import { loadIdentity, identityContactBlock, type Identity } from "../_shared/identity.ts";
// v3.44.0 — proposal/assessment notification emails. Best effort only:
// see notifyCandidate/notifyOrg below, neither ever throws into a caller.
import { wrapEmail, ctaButton, heading, para, escapeHtml, sendBrandedEmail } from "../_shared/emailTemplate.ts";
// v3.1.0 — structured sections (no truncation), deterministic gap analysis,
// figure preservation, result cache, company context, AI telemetry.
import {
  sha256 as sha256b, buildSections, computeGap, renderGapBlock, droppedFigures,
  cacheGet, cacheSet, logAiCall, fetchCompanyContext,
  type GapAnalysis, type SectionBundle,
} from "../_shared/tailoring.ts";

const corsHeaders = {
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
function humanize(s: unknown): unknown {
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
function humanizeAny<T>(v: T): T {
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

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(humanizeAny(data)), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// ─────────────────────────────────────────────────────────────
// v3.24.0 MAINTENANCE SWITCHES
// The admin panel writes system_config.feature_flags. Every action that
// spends money or touches the marketplace asks here first, so turning a
// switch off actually stops the work, not just the button.
// ─────────────────────────────────────────────────────────────
type FeatureKey = "platform" | "candidate_search" | "proposals" | "assessments" | "tailoring" | "signups";

let flagCache: { at: number; flags: Record<string, boolean>; messages: Record<string, string> } | null = null;

async function readFlags(admin: SupabaseClient<any, any, any>) {
  if (flagCache && Date.now() - flagCache.at < 30_000) return flagCache;
  try {
    // get_feature_flags is the same reader the frontend uses, so the server and
    // the screen can never disagree about what is switched off.
    const { data, error } = await admin.rpc("get_feature_flags");
    if (error) throw error;
    const d = (data || {}) as { flags?: Record<string, boolean>; messages?: Record<string, string> };
    flagCache = { at: Date.now(), flags: d.flags || {}, messages: d.messages || {} };
  } catch {
    // A read failure must never take the product down.
    flagCache = { at: Date.now(), flags: {}, messages: {} };
  }
  return flagCache;
}

const MAINTENANCE_FALLBACK: Record<FeatureKey, string> = {
  platform: "AYN is under maintenance right now. We are back shortly.",
  candidate_search: "Candidate search is paused for maintenance.",
  proposals: "Sending proposals is paused for maintenance.",
  assessments: "Assessments are paused for maintenance.",
  tailoring: "Tailored resumes and cover letters are paused for maintenance. No credits are being spent.",
  signups: "New accounts are paused for maintenance.",
};

/** Which switch owns which action. Anything absent is only gated by platform. */
const ACTION_FLAG: Record<string, FeatureKey> = {
  employer_spec_extract: "candidate_search",
  employer_skill_catalog: "candidate_search",
  employer_match: "candidate_search",
  employer_draft_proposal: "proposals",
  employer_reveal_request: "proposals",
  employer_assessment_generate: "assessments",
  employer_assessment_send: "assessments",
  assessment_start: "assessments",
  assessment_answer: "assessments",
  assessment_submit: "assessments",
  tailor: "tailoring",
  cover_letter: "tailoring",
};

/**
 * Returns a 503 Response when the feature (or the whole platform) is off,
 * otherwise null. Callers do: const off = await featureGate(admin, 'x'); if (off) return off;
 */
async function featureGate(
  admin: SupabaseClient<any, any, any>,
  key: FeatureKey,
): Promise<Response | null> {
  const f = await readFlags(admin);
  for (const k of ["platform", key] as FeatureKey[]) {
    if (f.flags[k] === false) {
      return json({
        code: "feature_disabled",
        error: "maintenance",
        feature: k,
        message: (f.messages[k] || "").trim() || MAINTENANCE_FALLBACK[k],
      }, 503);
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// v3.31.0 MINIMUM EXTENSION VERSION
// The extension is sideloaded, so an old build keeps running whatever code
// it shipped with. Every extension lane request carries x-ayn-ext-version.
// Anything below the configured minimum is refused with the same answer
// shape as the v3.25.0 maintenance gate, so the sidepanel can show the
// message plainly instead of failing silently. The minimum lives in
// system_config.extension_min_version, so raising it needs no redeploy.
// ─────────────────────────────────────────────────────────────
const EXT_MIN_VERSION_FALLBACK = "3.3.0";

let minVerCache: { at: number; version: string } | null = null;

async function readMinExtVersion(admin: SupabaseClient<any, any, any>): Promise<string> {
  if (minVerCache && Date.now() - minVerCache.at < 30_000) return minVerCache.version;
  let version = EXT_MIN_VERSION_FALLBACK;
  try {
    const { data } = await admin
      .from("system_config")
      .select("value")
      .eq("key", "extension_min_version")
      .maybeSingle();
    const v = (data?.value as { version?: string } | string | null) ?? null;
    const raw = typeof v === "string" ? v : (v?.version || "");
    if (/^\d+(\.\d+)*$/.test(String(raw))) version = String(raw);
  } catch {
    // A read failure must never lock every extension out.
    version = EXT_MIN_VERSION_FALLBACK;
  }
  minVerCache = { at: Date.now(), version };
  return version;
}

/** Compares dotted numeric versions. Returns true when a is older than b. */
function versionOlder(a: string, b: string): boolean {
  const pa = String(a || "0").split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b || "0").split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x !== y) return x < y;
  }
  return false;
}

/**
 * Returns a 426 Response when the calling extension build is too old,
 * otherwise null. A build that sends no version header at all predates the
 * header, so it is treated as 0.0.0 and refused.
 */
async function extVersionGate(
  admin: SupabaseClient<any, any, any>,
  req: Request,
): Promise<Response | null> {
  const min = await readMinExtVersion(admin);
  const reported = (req.headers.get("x-ayn-ext-version") || "").trim();
  const client = /^\d+(\.\d+)*$/.test(reported) ? reported : "0.0.0";
  if (!versionOlder(client, min)) return null;
  return json({
    code: "extension_outdated",
    error: "extension_outdated",
    feature: "extension",
    min_version: min,
    your_version: client === "0.0.0" ? null : client,
    message: `This AYN extension build is out of date and no longer works. Download the current version from ayn.careers and reinstall it. Minimum supported version is ${min}.`,
  }, 426);
}



// ─────────────────────────────────────────────────────────────
// v3.28.0 ACCOUNT MODERATION
// Same answer shape as the v3.25.0 maintenance gate, different codes.
// Order is deliberate: the global switch is checked first (above), then the
// account suspension, then the one capability the account is restricted from.
// ─────────────────────────────────────────────────────────────
type AccountCapability = "discovery" | "proposals" | "assessments" | "ai";

/** Which capability an action needs. Anything absent needs none. */
const ACTION_CAPABILITY: Record<string, AccountCapability> = {
  employer_draft_proposal: "proposals",
  employer_reveal_request: "proposals",
  employer_assessment_generate: "assessments",
  employer_assessment_send: "assessments",
  tailor: "ai",
  cover_letter: "ai",
  score: "ai",
  ext_ask: "ai",
  ext_job_score: "ai",
  ext_cover_letter_text: "ai",
  ext_suggest_roles: "ai",
  smart_tailor: "ai",
};

const RESTRICTION_MESSAGE: Record<AccountCapability, string> = {
  discovery: "Your profile has been removed from the talent pool by an administrator.",
  proposals: "Sending proposals is switched off for this account by an administrator.",
  assessments: "Assessments are switched off for this account by an administrator.",
  ai: "AI features are switched off for this account by an administrator.",
};

/** True when this person cannot appear in the talent pool. */
async function discoveryRestriction(
  admin: SupabaseClient<any, any, any>,
  userId: string,
): Promise<{ restricted: boolean; reason: string }> {
  const { data } = await admin.from("account_restrictions")
    .select("reason").eq("user_id", userId).eq("capability", "discovery").maybeSingle();
  return { restricted: !!data, reason: (data as { reason?: string } | null)?.reason || "" };
}

/** Every user id in the given list that is restricted from discovery. */
async function discoveryRestrictedIds(
  admin: SupabaseClient<any, any, any>,
  ids: string[],
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const { data } = await admin.from("account_restrictions")
    .select("user_id").eq("capability", "discovery").in("user_id", ids);
  return new Set((data || []).map((r: { user_id: string }) => r.user_id));
}

async function accountGate(
  admin: SupabaseClient<any, any, any>,
  userId: string,
  action: string,
): Promise<Response | null> {
  const [{ data: susp }, { data: restrictions }] = await Promise.all([
    admin.from("account_suspensions")
      .select("reason, until, suspended_at").eq("user_id", userId).eq("active", true).maybeSingle(),
    admin.from("account_restrictions").select("capability, reason").eq("user_id", userId),
  ]);

  if (susp) {
    const until = (susp as { until?: string }).until;
    return json({
      code: "account_suspended",
      error: "account_suspended",
      reason: (susp as { reason?: string }).reason || "",
      until: until || null,
      message: until
        ? `This account is suspended until ${new Date(until).toLocaleDateString("en-CA")}. Contact support if you think this is wrong.`
        : "This account is suspended. Contact support if you think this is wrong.",
    }, 403);
  }

  const needed = ACTION_CAPABILITY[action];
  if (!needed) return null;
  const hit = (restrictions || []).find((r: { capability: string }) => r.capability === needed);
  if (!hit) return null;
  return json({
    code: "account_restricted",
    error: "account_restricted",
    capability: needed,
    reason: (hit as { reason?: string }).reason || "",
    message: RESTRICTION_MESSAGE[needed],
  }, 403);
}


// ─────────────────────────────────────────────────────────────
// v3.24.0 AI USAGE LOGGING
// Every gateway call writes one row to llm_usage_logs so the admin AI cost
// pane reads real numbers. Best effort: logging never fails a request.
// ─────────────────────────────────────────────────────────────
type AiCtx = { admin: SupabaseClient<any, any, any> | null; userId: string | null; feature: string };
let aiCtx: AiCtx = { admin: null, userId: null, feature: "unknown" };
function setAiCtx(admin: SupabaseClient<any, any, any> | null, userId: string | null, feature: string) {
  aiCtx = { admin, userId, feature };
}

// Rough USD per 1M tokens, in, out. Only used to give the admin a signal.
const PRICES: Record<string, [number, number]> = {
  "google/gemini-2.5-pro": [1.25, 10],
  "google/gemini-2.5-flash": [0.30, 2.50],
  "google/gemini-2.5-flash-lite": [0.10, 0.40],
  "openai/text-embedding-3-small": [0.02, 0],
};

function logAiUsage(opts: {
  model: string; inputTokens: number; outputTokens: number; ms: number;
  wasFallback: boolean; fallbackReason?: string;
}) {
  const { admin, userId, feature } = aiCtx;
  if (!admin || !userId) return;
  const [pin, pout] = PRICES[opts.model] || [0.30, 2.50];
  const cost = (opts.inputTokens / 1_000_000) * pin + (opts.outputTokens / 1_000_000) * pout;
  admin.from("llm_usage_logs").insert({
    user_id: userId,
    intent_type: feature,
    model_name: opts.model,
    input_tokens: opts.inputTokens,
    output_tokens: opts.outputTokens,
    cost_sar: Number(cost.toFixed(6)),
    response_time_ms: opts.ms,
    was_fallback: opts.wasFallback,
    fallback_reason: opts.fallbackReason ?? null,
  }).then(({ error }: { error: unknown }) => {
    if (error) console.error("llm_usage_logs insert failed", error);
  }, (e: unknown) => console.error("llm_usage_logs insert threw", e));
}

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-2.5-flash";
const QUALITY_MODEL = "google/gemini-2.5-pro";



async function callAI(opts: {
  model?: string;
  system: string;
  user: string | Array<unknown>;
  toolName?: string;
  toolSchema?: Record<string, unknown>;
  /** Lower = more consistent/repeatable output. Omit to use the model's own default. */
  temperature?: number;
}): Promise<{ text: string; structured?: unknown }> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

  const primary = opts.model ?? DEFAULT_MODEL;
  // Fallback chain: try a cheaper/different model when the primary 402/5xx's.
  const FALLBACKS: Record<string, string[]> = {
    [QUALITY_MODEL]: [DEFAULT_MODEL, "google/gemini-2.5-flash-lite"],
    [DEFAULT_MODEL]: ["google/gemini-2.5-flash-lite"],
  };
  const chain = [primary, ...(FALLBACKS[primary] || [])];

  let lastErr = "";
  for (let mi = 0; mi < chain.length; mi++) {
    const model = chain[mi];
    const body: Record<string, unknown> = {
      model,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      ...(opts.temperature != null ? { temperature: opts.temperature } : {}),
    };
    if (opts.toolName && opts.toolSchema) {
      body.tools = [{
        type: "function",
        function: { name: opts.toolName, description: opts.toolName, parameters: opts.toolSchema },
      }];
      body.tool_choice = { type: "function", function: { name: opts.toolName } };
    }

    // Up to 3 attempts per model with exponential backoff on 429 / transient 5xx.
    for (let attempt = 0; attempt < 3; attempt++) {
      let r: Response;
      const startedAt = Date.now();
      try {
        r = await fetch(GATEWAY_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } catch (e) {
        lastErr = `network: ${(e as Error).message}`;
        await new Promise(res => setTimeout(res, 400 * (attempt + 1)));
        continue;
      }

      if (r.ok) {
        const data = await r.json();
        const usage = data?.usage || {};
        logAiUsage({
          model,
          inputTokens: Number(usage.prompt_tokens ?? usage.input_tokens ?? 0),
          outputTokens: Number(usage.completion_tokens ?? usage.output_tokens ?? 0),
          ms: Date.now() - startedAt,
          wasFallback: mi > 0,
          fallbackReason: mi > 0 ? lastErr || "primary model unavailable" : undefined,
        });
        const choice = data?.choices?.[0];
        const finishReason = choice?.finish_reason || choice?.finishReason || data?.stop_reason;
        if (finishReason === "length" || finishReason === "max_tokens") {
          throw new Error("AI response truncated. Retry with fewer fields or more output tokens.");
        }
        const msg = data?.choices?.[0]?.message;
        const tc = msg?.tool_calls?.[0]?.function?.arguments;
        if (tc) {
          try { return { text: "", structured: JSON.parse(tc) }; }
          catch { return { text: tc, structured: undefined }; }
        }
        return { text: msg?.content ?? "" };
      }


      // 402 = credits — don't retry same model, jump to next in chain.
      if (r.status === 402) {
        lastErr = "AI credits exhausted.";
        break;
      }
      // 429 / 5xx = transient — backoff then retry same model.
      if (r.status === 429 || (r.status >= 500 && r.status < 600)) {
        lastErr = `AI ${r.status}`;
        // 1s, 2s, 4s
        await new Promise(res => setTimeout(res, 1000 * Math.pow(2, attempt)));
        continue;
      }
      // 4xx other = terminal, stop everything.
      const t = await r.text();
      throw new Error(`AI error ${r.status}: ${t.slice(0, 200)}`);
    }
  }
  throw new Error(lastErr || "AI request failed");
}

const RESUME_SCHEMA = {
  type: "object",
  properties: {
    basics: {
      type: "object",
      properties: {
        name: { type: "string" },
        title: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        location: { type: "string" },
        summary: { type: "string" },
        links: { type: "array", items: { type: "object", properties: { label: { type: "string" }, url: { type: "string" } }, required: ["label", "url"] } },
      },
      required: ["name", "summary"],
    },
    work: {
      type: "array",
      items: {
        type: "object",
        properties: {
          company: { type: "string" },
          title: { type: "string" },
          location: { type: "string" },
          start: { type: "string" },
          end: { type: "string" },
          bullets: { type: "array", items: { type: "string" } },
        },
        required: ["company", "title", "bullets"],
      },
    },
    education: {
      type: "array",
      items: {
        type: "object",
        properties: { school: { type: "string" }, degree: { type: "string" }, field: { type: "string" }, start: { type: "string" }, end: { type: "string" } },
        required: ["school"],
      },
    },
    skills: { type: "array", items: { type: "string" } },
    projects: {
      type: "array",
      items: { type: "object", properties: { name: { type: "string" }, description: { type: "string" }, url: { type: "string" } }, required: ["name"] },
    },
    certifications: { type: "array", items: { type: "string" } },
  },
  required: ["basics", "work", "skills"],
};

// A fixed point rubric, not a vibe. Without this, two runs on the exact same
// resume produced meaningfully different scores (reported directly: 75 then
// 65 on a re-run with no real change in quality) because the model was
// asked to "score 0-100" with no arithmetic to anchor it to. Every deduction
// below is a concrete, checkable fact about the resume, so the score is
// something the model computes the same way each time rather than feels
// out fresh. Shared by resume_diagnose and rewrite so a diagnosis and an
// optimize's own reported score are never answering two different
// questions.
const ATS_RUBRIC = `Score out of 100, starting at 100 and subtracting only for what is actually true of this resume:
- No summary or profile section: -10
- Summary's first sentence does not name the candidate's own current or most recent job title: -5
- No dedicated skills section: -10
- Dates not written consistently as "Month YYYY" throughout: -5
- Each work bullet that neither contains a number/percentage/scale NOR leads with a specific action verb: -5 each, capped at -40 total for this category
- Summary reads generic enough to apply to any candidate (buzzwords, no specifics from this actual background): -10
- Fewer than 2 roles listed, or bullets so thin they show no real scope: -10
- A gap of 6 months or more between the end of one role and the start of the next, with nothing in the resume accounting for it: -10, once per gap, capped at -20 total for this category
Floor the result at 0. Do not deduct for anything not listed here. State the score as the literal result of this subtraction, not an impression.`;

// Scoring lives in exactly one place, called by both resume_diagnose and
// rewrite. Before this, rewrite generated new resume content AND graded its
// own writing in the same completion — two stochastic jobs at once, so a
// re-run could bounce the score around even at low temperature (measured:
// 90 then 70 on identical input). A dedicated low-temperature call that only
// ever reads a fixed, already-written resume and applies the rubric is the
// same shape of call resume_diagnose already makes, which measured far more
// consistent in isolation. This also guarantees a diagnosis and an
// optimize's reported score always mean the exact same thing, since they
// are now, literally, the same function call.
async function scoreResumeContent(resume: unknown): Promise<{ ats_score: number; verdict: string; issues: string[] }> {
  const r = await callAI({
    temperature: 0.1,
    system: `You assess resume writing quality, not visual layout. ${ATS_RUBRIC}
verdict is derived directly from ats_score: "Strong" 85+, "Good" 70+, "Fair" 50+, else "Poor". issues: one line per point actually deducted above, but write each as a plain sentence a person would say out loud, not the rubric's own wording — name the actual weak bullet or missing thing, e.g. "The bullet 'Responsible for various marketing tasks' has no number and no strong verb" rather than quoting the rubric category.`,
    user: JSON.stringify({ resume }).slice(0, 30000),
    toolName: "emit_diagnosis",
    toolSchema: {
      type: "object",
      properties: {
        ats_score: { type: "integer" },
        verdict: { type: "string", enum: ["Poor", "Fair", "Good", "Strong"] },
        issues: { type: "array", items: { type: "string" } },
      },
      required: ["ats_score", "verdict", "issues"],
    },
  });
  const s = r.structured as { ats_score?: number; verdict?: string; issues?: string[] } | undefined;
  return { ats_score: s?.ats_score ?? 0, verdict: s?.verdict ?? "Poor", issues: s?.issues ?? [] };
}

async function sha256Hex(s: string) {
  const b = new TextEncoder().encode(s);
  const h = await crypto.subtle.digest("SHA-256", b);
  return Array.from(new Uint8Array(h)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

// v2.7.0 — resolve the resume content the extension should use.
// If a specific tailored version was requested (resume_version_id) and it
// belongs to this user, use that; otherwise fall back to the primary resume.
async function resolveResumeContent(
  admin: ReturnType<typeof createClient>,
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

const EXT_ACTIONS = new Set([
  "ext_bootstrap", "ext_cover_letter_text",
  "ext_job_score", "ext_suggest_roles", "ext_find_contacts",
  "ext_download_resume_text", "smart_tailor", "ext_ask",
  // v1.5.0: canonical profile read for extension
  "ext_profile_canonical_get",
  // v2.8.0: JD resolver — fetch previously-ingested JD by host+path
  "ext_job_lookup",
]);


// ──────────────────────────────────────────────────────────────
// Phase 2 helpers: URL normalization, full-JD parse, fallback score
// ──────────────────────────────────────────────────────────────

function normalizeUrlForHash(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = "";
    // Keep only stable job-identifying query params; drop tracking/session noise.
    const KEEP = new Set([
      "jk", "vjk", "currentJobId", "jobId", "job_id", "id",
      "gh_jid", "lever-source", "postingId", "requisitionId",
    ]);
    const sp = new URLSearchParams();
    for (const [k, v] of u.searchParams) {
      if (KEEP.has(k)) sp.append(k, v);
    }
    const qs = sp.toString();
    const path = u.pathname.replace(/\/+$/, "").replace(/\/(application|apply)$/i, "");
    return `${u.protocol}//${u.hostname.toLowerCase()}${path}${qs ? "?" + qs : ""}`;
  } catch {
    return (raw || "").trim().toLowerCase();
  }
}

async function resolveJobJd(admin: any, url: string | undefined, jdText: string | undefined): Promise<string> {
  const jd = (jdText || "").trim();
  try {
    if (!url) return jd;
    const hash = await sha256Hex(normalizeUrlForHash(url));
    const { data: c } = await admin.from("job_cache").select("full_jd, expires_at").eq("url_hash", hash).maybeSingle();
    const fresh = c && new Date(c.expires_at).getTime() > Date.now();
    const cached = (fresh && c?.full_jd) ? String(c.full_jd) : "";
    if (cached && cached.length > jd.length) return cached;
    if (!cached && jd.length >= 400) {
      const row = { url_hash: hash, url, title: "", company: "", full_jd: jd.slice(0, 30000), parsed: {}, expires_at: new Date(Date.now() + 24*60*60*1000).toISOString() };
      admin.from("job_cache").upsert(row, { onConflict: "url_hash" }).then(() => {}, () => {});
    }
    return jd;
  } catch { return jd; }
}

const JOB_META_SCHEMA = {
  type: "object",
  properties: {
    skills: { type: "array", items: { type: "string" } },
    seniority: { type: "string" },        // intern|entry|mid|senior|staff|principal|manager|director|vp|cxo
    salary: {
      type: "object",
      properties: {
        min: { type: "number" }, max: { type: "number" },
        currency: { type: "string" },     // USD|CAD|EUR|GBP|...
        period: { type: "string" },       // year|hour|month
        source: { type: "string" },       // "posting" if printed in JD, "estimate" otherwise
        display: { type: "string" },      // e.g. "$90K-$120K CAD"
      },
    },
    location: { type: "string" },
    work_mode: { type: "string" },        // remote|hybrid|onsite|unknown
    must_haves: { type: "array", items: { type: "string" } },
    nice_to_haves: { type: "array", items: { type: "string" } },
    years_required: { type: "number" },
  },
  required: ["skills", "seniority", "work_mode"],
};

type JobParsed = {
  skills: string[];
  seniority: string;
  salary: { min?: number; max?: number; currency?: string; period?: string; source?: string; display?: string };
  location: string;
  work_mode: string;
  must_haves: string[];
  nice_to_haves: string[];
  years_required?: number;
};

const EMPTY_PARSED: JobParsed = {
  skills: [], seniority: "", salary: {}, location: "",
  work_mode: "unknown", must_haves: [], nice_to_haves: [],
};

async function parseJobMeta(fullJd: string, urlHint: string, titleHint: string, companyHint: string): Promise<JobParsed> {
  if (!fullJd || fullJd.trim().length < 40) return EMPTY_PARSED;
  // Currency detection hint from URL — never default to USD.
  const host = (() => { try { return new URL(urlHint).hostname.toLowerCase(); } catch { return ""; } })();
  const ccHint = /\.ca\b|workopolis|jobbank\.gc\.ca/.test(host) ? "CAD"
    : /\.co\.uk|reed\.co\.uk/.test(host) ? "GBP"
    : /\.com\.au/.test(host) ? "AUD"
    : /\.de|\.fr|\.es|\.it|\.nl/.test(host) ? "EUR"
    : "";
  try {
    const r = await callAI({
      system: `Extract structured metadata from a job posting. Be faithful to the text.

CURRENCY RULES:
- If the JD prints a salary, use the printed currency exactly (CAD, USD, EUR, GBP, etc.). Look for $ near "CAD"/"USD", "C$", "US$", "£", "€", or the words "Canadian dollars" / "USD".
- If no currency symbol but the posting hostname suggests a country (e.g. ".ca" = Canada), prefer that country's currency.
- Hostname hint for this posting: ${host || "unknown"} → ${ccHint || "no hint"}.
- Set salary.source = "posting" only when the number came from the JD text; otherwise "estimate".

SENIORITY: one of intern|entry|mid|senior|staff|principal|manager|director|vp|cxo. Read titles + years language.
WORK_MODE: remote|hybrid|onsite|unknown.
SKILLS: 8-20 hard skills/tools/methodologies actually named in the JD. No fluff ("teamwork", "communication").
MUST_HAVES: 3-6 short phrases the JD lists under "Requirements"/"Must have"/"You have".
NICE_TO_HAVES: 2-5 short phrases under "Nice to have"/"Bonus"/"Preferred".
YEARS_REQUIRED: integer if the JD says "X+ years"; omit otherwise.`,
      user: `URL: ${urlHint}\nTITLE: ${titleHint}\nCOMPANY: ${companyHint}\n\nJOB DESCRIPTION:\n${fullJd.slice(0, 18000)}`,
      toolName: "emit_job_meta",
      toolSchema: JOB_META_SCHEMA,
    });
    const p = (r.structured as Partial<JobParsed>) || {};
    return {
      skills: Array.isArray(p.skills) ? p.skills.slice(0, 30).map(String) : [],
      seniority: String(p.seniority || ""),
      salary: (p.salary && typeof p.salary === "object") ? p.salary : {},
      location: String(p.location || ""),
      work_mode: String(p.work_mode || "unknown"),
      must_haves: Array.isArray(p.must_haves) ? p.must_haves.slice(0, 8).map(String) : [],
      nice_to_haves: Array.isArray(p.nice_to_haves) ? p.nice_to_haves.slice(0, 8).map(String) : [],
      years_required: typeof p.years_required === "number" ? p.years_required : undefined,
    };
  } catch (e) {
    console.warn("parseJobMeta failed", (e as Error).message);
    return EMPTY_PARSED;
  }
}

// Last-resort scorer when every LLM call fails. Uses the user's canonical
// skills + JD keywords to produce a calibrated number rather than an error.
function keywordFallbackScore(canonical: CanonicalProfile | null, fullJd: string, parsed: JobParsed) {
  const userSkills = new Set<string>();
  if (canonical) {
    for (const s of canonical.skills) { const n = String(s?.name || "").toLowerCase().trim(); if (n) userSkills.add(n); }
    for (const t of (canonical.derived.top_skills || [])) userSkills.add(String(t).toLowerCase().trim());
  }
  const jdLower = (fullJd || "").toLowerCase();
  const jdSkills = (parsed.skills || []).map(s => s.toLowerCase().trim()).filter(Boolean);
  const haves = jdSkills.length ? jdSkills : Array.from(jdLower.matchAll(/\b([a-z][a-z0-9+.#-]{1,24})\b/g)).map(m => m[1]).slice(0, 60);

  const matched: string[] = [];
  const missing: string[] = [];
  for (const sk of (jdSkills.length ? jdSkills : haves)) {
    if (userSkills.has(sk)) matched.push(sk);
    else if (jdSkills.length) missing.push(sk);
  }
  // matchedSkills must use the original casing from canonical/jd, not lowercase.
  const matchedDisplay = matched.map(m => {
    const canon = canonical?.skills.find(s => s.name.toLowerCase().trim() === m)?.name;
    const jdOrig = (parsed.skills || []).find(s => s.toLowerCase().trim() === m);
    return canon || jdOrig || m;
  });
  const coverage = jdSkills.length ? matched.length / jdSkills.length : 0;
  const score = Math.max(1, Math.min(10, Math.round(2 + coverage * 8)));
  const label = score >= 9 ? "Strong" : score >= 7 ? "Good" : score >= 4 ? "Fair" : "Poor";
  return {
    score, matchLabel: label,
    matchedSkills: matchedDisplay.slice(0, 8),
    missingSkills: missing.slice(0, 8),
    missingKeywords: missing.slice(0, 8),
    seniorityFit: "unknown",
    salaryEstimate: parsed.salary?.display || "",
    reasons: [`Approximate keyword score (${matched.length}/${jdSkills.length || "?"} skills matched)`],
    verdict: "Approximate score from keyword overlap (AI unavailable).",
    mustHaves: [], niceToHaves: [],
    source: "approximate_keyword_overlap",
  };
}

// ---------------- Canonical structured profile (Phase 1) ----------------
// Single source of truth for skills, experiences, work auth, and derived
// fields like total YoE / seniority. Read by scoring, tailoring,
// cover letter. Extracted once from primary resume + user_profile_data;
// users can edit it in the Profile tab and edits win over re-extraction.
type CanonicalProfile = {
  // v3.5.0 — skills carry level and recency because a bare name is unmatchable.
  skills: Array<{ name: string; years?: number | null; last_used?: string | null; level?: string | null; evidence?: string }>;
  experiences: Array<{ company: string; title: string; location?: string; start?: string; end?: string; current?: boolean; bullets?: string[]; tech?: string[]; industry?: string; team_size?: number | null; bullets_from_resume?: boolean }>;
  education: Array<{ school: string; degree?: string; field?: string; start?: string; end?: string; gpa?: string }>;
  certifications: Array<{ name: string; issuer?: string; year?: string }>;
  work_auth: {
    citizenship?: string;
    countries?: string[];
    work_authorized_us?: boolean;
    work_authorized_ca?: boolean;
    needs_sponsorship_now?: boolean;
    needs_sponsorship_future?: boolean;
    visa_type?: string;
    notes?: string;
    work_permit_expires?: string;
  };
  preferences: {
    open_to_remote?: boolean;
    open_to_relocation?: boolean;
    open_to_travel?: boolean;
    salary_min_usd?: number;
    salary_currency?: string;
    start_date_availability?: string;
    desired_titles?: string[];
    desired_locations?: string[];
    employment_types?: string[];
    availability?: string;
    company_stages?: string[];
  };
  derived: {
    total_yoe?: number;
    seniority?: string;
    primary_function?: string;
    top_skills?: string[];
    education_level?: string;
    current_title?: string;
    current_company?: string;
    known_for?: string[];
  };
};


const EMPTY_CANONICAL: CanonicalProfile = {
  skills: [], experiences: [], education: [], certifications: [],
  work_auth: {}, preferences: {}, derived: {},
};

async function loadCanonical(admin: SupabaseClient<any, any, any>, userId: string): Promise<CanonicalProfile | null> {
  const { data } = await admin.from("user_profile_canonical")
    .select("skills, experiences, education, certifications, work_auth, preferences, derived")
    .eq("user_id", userId).maybeSingle();
  if (!data) return null;
  return {
    skills: (data.skills as CanonicalProfile["skills"]) || [],
    experiences: (data.experiences as CanonicalProfile["experiences"]) || [],
    education: (data.education as CanonicalProfile["education"]) || [],
    certifications: (data.certifications as CanonicalProfile["certifications"]) || [],
    work_auth: (data.work_auth as CanonicalProfile["work_auth"]) || {},
    preferences: (data.preferences as CanonicalProfile["preferences"]) || {},
    derived: (data.derived as CanonicalProfile["derived"]) || {},
  };
}

// Compact textual digest of the canonical profile for inclusion in LLM
// prompts. Keeps token count low and prevents the model from drifting.
function canonicalDigest(c: CanonicalProfile | null): string {
  if (!c) return "";
  const skills = c.skills.slice(0, 30).map(s => s.years ? `${s.name} (${s.years}y)` : s.name).join(", ");
  const exp = c.experiences.slice(0, 5).map(e => `${e.title} @ ${e.company} [${e.start || "?"}-${e.end || (e.current ? "Now" : "?")}]`).join("; ");
  const edu = c.education.slice(0, 3).map(e => `${e.degree || ""} ${e.field || ""} @ ${e.school}`.trim()).join("; ");
  const wa = c.work_auth;
  const waLine = `citizenship=${wa.citizenship || "?"}, us_auth=${wa.work_authorized_us ?? "?"}, ca_auth=${wa.work_authorized_ca ?? "?"}, needs_sponsorship_now=${wa.needs_sponsorship_now ?? "?"}, needs_sponsorship_future=${wa.needs_sponsorship_future ?? "?"}, visa=${wa.visa_type || "n/a"}`;
  const pr = c.preferences;
  // v3.71.0 fix: this used to read pr.start_date_availability, a field
  // nothing ever wrote (the frontend only ever writes preferences.availability),
  // so "start=" was permanently "?" here regardless of what the seeker picked.
  const prLine = `remote=${pr.open_to_remote ?? "?"}, relocate=${pr.open_to_relocation ?? "?"}, salary_min=${pr.salary_min_usd ?? "?"} ${pr.salary_currency || ""}, start=${pr.availability || "?"}`;
  const d = c.derived;
  return [
    `TOTAL_YOE=${d.total_yoe ?? "?"} | SENIORITY=${d.seniority || "?"} | FUNCTION=${d.primary_function || "?"} | EDU_LEVEL=${d.education_level || "?"}`,
    `CURRENT=${d.current_title || "?"} @ ${d.current_company || "?"}`,
    `TOP_SKILLS: ${(d.top_skills || []).slice(0, 12).join(", ")}`,
    `ALL_SKILLS: ${skills}`,
    `EXPERIENCE: ${exp}`,
    `EDUCATION: ${edu}`,
    `WORK_AUTH: ${waLine}`,
    `PREFERENCES: ${prLine}`,
  ].join("\n");
}

// LLM extraction schema for the canonical profile. Strict: model fills only
// what it can see in the resume + supplemental profile fields; missing data
// stays empty rather than being hallucinated.
const CANONICAL_SCHEMA = {
  type: "object",
  properties: {
    skills: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          years: { type: "number" },
          last_used: { type: "string" },
          level: { type: "string" },
          evidence: { type: "string" },
        },
        required: ["name"],
      },
    },
    experiences: {
      type: "array",
      items: {
        type: "object",
        properties: {
          company: { type: "string" },
          title: { type: "string" },
          location: { type: "string" },
          start: { type: "string" },
          end: { type: "string" },
          current: { type: "boolean" },
          bullets: { type: "array", items: { type: "string" } },
          tech: { type: "array", items: { type: "string" } },
        },
        required: ["company", "title"],
      },
    },
    education: {
      type: "array",
      items: {
        type: "object",
        properties: {
          school: { type: "string" }, degree: { type: "string" }, field: { type: "string" },
          start: { type: "string" }, end: { type: "string" }, gpa: { type: "string" },
        },
        required: ["school"],
      },
    },
    certifications: {
      type: "array",
      items: {
        type: "object",
        properties: { name: { type: "string" }, issuer: { type: "string" }, year: { type: "string" } },
        required: ["name"],
      },
    },
    work_auth: {
      type: "object",
      properties: {
        citizenship: { type: "string" },
        work_authorized_us: { type: "boolean" },
        work_authorized_ca: { type: "boolean" },
        needs_sponsorship_now: { type: "boolean" },
        needs_sponsorship_future: { type: "boolean" },
        visa_type: { type: "string" },
        notes: { type: "string" },
      },
    },
    preferences: {
      type: "object",
      properties: {
        open_to_remote: { type: "boolean" },
        open_to_relocation: { type: "boolean" },
        open_to_travel: { type: "boolean" },
        salary_min_usd: { type: "number" },
        salary_currency: { type: "string" },
        start_date_availability: { type: "string" },
        desired_titles: { type: "array", items: { type: "string" } },
        desired_locations: { type: "array", items: { type: "string" } },
      },
    },
    derived: {
      type: "object",
      properties: {
        total_yoe: { type: "number" },
        seniority: { type: "string" },
        primary_function: { type: "string" },
        top_skills: { type: "array", items: { type: "string" } },
        education_level: { type: "string" },
        current_title: { type: "string" },
        current_company: { type: "string" },
      },
    },
  },
  required: ["skills", "experiences", "education", "certifications", "work_auth", "preferences", "derived"],
};

async function extractCanonical(opts: {
  resumeContent?: unknown;
  resumeText?: string;
  profileExtras?: unknown;
}): Promise<CanonicalProfile> {
  const r = await callAI({
    model: QUALITY_MODEL,
    system: `You convert a resume + supplemental profile fields into a strict canonical profile JSON.

RULES:
- Faithful: never invent skills, years, titles, or work-auth values not in the input.
- Years: only set "years" on a skill if the resume gives explicit evidence (e.g. "5 years of Python", or you can compute it from dated jobs that explicitly used it).
- derived.total_yoe: sum of distinct, non-overlapping professional years (count "Present" as ${new Date().getFullYear()}). Internships count as 0.5x. Cap at 50.
- derived.seniority: one of "intern","entry","mid","senior","staff","principal","manager","director","vp","cxo". Pick from titles.
- derived.education_level: one of "High School","Associate's","Bachelor's","Master's","PhD". Pick the highest completed.
- derived.top_skills: 8-12 skills you would put on a resume for this person, ordered by relevance.
- work_auth: leave booleans missing if unstated. Do NOT guess citizenship from name.
- preferences: leave fields missing if unstated. Do NOT default to true/false.
- All dates: keep the format as written ("2021", "Jan 2021", "2021-03"). Do not normalize.`,
    user: JSON.stringify({
      resumeContent: opts.resumeContent ?? null,
      resumeText: (opts.resumeText || "").slice(0, 30000),
      profileExtras: opts.profileExtras ?? null,
    }).slice(0, 45000),
    toolName: "emit_canonical_profile",
    toolSchema: CANONICAL_SCHEMA,
  });
  const out = r.structured as CanonicalProfile | undefined;
  if (!out) throw new Error("Canonical extraction returned no structured output");
  return {
    skills: out.skills || [],
    experiences: out.experiences || [],
    education: out.education || [],
    certifications: out.certifications || [],
    work_auth: out.work_auth || {},
    preferences: out.preferences || {},
    derived: out.derived || {},
  };
}

// Public link-flow actions (no auth required for start/poll)
const LINK_PUBLIC_ACTIONS = new Set(["link_start", "link_poll"]);

// ─────────────────────────────────────────────────────────────
// v2.9.0-A / v2.9.1 — Talent Pool indexing.
// Anonymous profile_text (no email/phone/name), 768-dim embedding,
// candidate_skills rebuilt with provenance ('extracted' vs 'inferred').
//
// v2.9.1: real embeddings via the AI gateway (768-dim), with a
// deterministicEmbed fallback and model tagging so employer_match
// never cosine-compares vectors across different models.
// ─────────────────────────────────────────────────────────────
const EMBED_DIMS = 768;
const REAL_EMBED_MODEL = "openai/text-embedding-3-small";
const FALLBACK_EMBED_MODEL = "deterministic-v1";
const EMBED_ENDPOINT = "https://ai.gateway.lovable.dev/v1/embeddings";

function tokenizeForEmbed(text: string): string[] {
  return (text || "").toLowerCase().match(/[a-z0-9+.#-]{2,}/g) || [];
}

async function hashToken(tok: string): Promise<number> {
  const bytes = new TextEncoder().encode(tok);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-1", bytes));
  return ((digest[0] << 24) | (digest[1] << 16) | (digest[2] << 8) | digest[3]) >>> 0;
}

async function deterministicEmbed(text: string): Promise<number[]> {
  const v = new Array<number>(EMBED_DIMS).fill(0);
  for (const tok of tokenizeForEmbed(text)) {
    const h = await hashToken(tok);
    const dim = h % EMBED_DIMS;
    const sign = ((h >>> 16) & 1) === 0 ? 1 : -1;
    v[dim] += sign;
  }
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < v.length; i++) v[i] = v[i] / norm;
  return v;
}

/**
 * Call the AI gateway embeddings endpoint with a 768-dim OpenAI model
 * (text-embedding-3-small supports the `dimensions` param so we don't
 * need to change the vector(768) column). On any failure — missing key,
 * network, non-2xx, malformed body — fall back to deterministicEmbed
 * and tag the row with 'deterministic-v1' so employer_match knows not
 * to mix these vectors with real ones.
 */
async function embedText(text: string): Promise<{ vector: number[]; model: string }> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  const input = (text || "").slice(0, 8000);
  if (!apiKey || !input) {
    console.log(`[embedText] fallback path (${apiKey ? "empty input" : "no LOVABLE_API_KEY"})`);
    return { vector: await deterministicEmbed(input), model: FALLBACK_EMBED_MODEL };
  }
  try {
    const r = await fetch(EMBED_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: REAL_EMBED_MODEL,
        input,
        dimensions: EMBED_DIMS,
      }),
    });
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      console.log(`[embedText] fallback path (gateway ${r.status}: ${body.slice(0, 200)})`);
      return { vector: await deterministicEmbed(input), model: FALLBACK_EMBED_MODEL };
    }
    const data = await r.json() as { data?: Array<{ embedding?: number[] }> };
    const vec = data?.data?.[0]?.embedding;
    if (!Array.isArray(vec) || vec.length !== EMBED_DIMS) {
      console.log(`[embedText] fallback path (bad response shape, len=${vec?.length ?? "n/a"})`);
      return { vector: await deterministicEmbed(input), model: FALLBACK_EMBED_MODEL };
    }
    console.log(`[embedText] real path (${REAL_EMBED_MODEL}, ${vec.length}d)`);
    return { vector: vec, model: REAL_EMBED_MODEL };
  } catch (e) {
    console.log(`[embedText] fallback path (exception: ${(e as Error).message})`);
    return { vector: await deterministicEmbed(input), model: FALLBACK_EMBED_MODEL };
  }
}


/**
 * v3.5.0 — the profile text an employer search embeds against. It now carries
 * the signals the Profile form started collecting: skill level and recency,
 * industry and team size per role, achievements, availability, employment
 * type, company stage, and what the candidate is known for. Skills with a
 * level and recent usage are repeated once so the embedding weights them
 * above bare strings. Still no name, email, phone, address, or links.
 */
function buildProfileText(c: CanonicalProfile, resumeContent: Record<string, unknown> | null): string {
  const skillPhrase = (s: CanonicalProfile["skills"][number]) => {
    const bits = [s.name];
    if (s.level) bits.push(s.level);
    if (s.years) bits.push(`${s.years} years`);
    if (s.last_used === "this_year") bits.push("used this year");
    else if (s.last_used === "within_2_years") bits.push("used within 2 years");
    else if (s.last_used === "over_2_years") bits.push("last used over 2 years ago");
    return bits.join(" ");
  };
  const strong = (s: CanonicalProfile["skills"][number]) =>
    (s.level === "advanced" || s.level === "expert") && s.last_used !== "over_2_years";
  const skills = c.skills.filter(s => s.name).map(skillPhrase).join(", ");
  const emphasised = c.skills.filter(s => s.name && strong(s)).map(s => s.name).join(", ");

  const exp = c.experiences.map(e => {
    const bullets = (e.bullets || []).filter(Boolean).slice(0, 5).join(" | ");
    // v3.12.0 — never emit a label with an empty value. The old template
    // produced strings like "at " and "Education: BSc  at", which the
    // employer surface then rendered verbatim.
    const dates = [e.start, e.end || (e.current ? "Now" : "")].filter(Boolean).join(" to ");
    const head = [
      [e.title, e.company].filter(Boolean).join(" at "),
      dates,
    ].filter(Boolean).join(", ");
    const ctx = [
      e.industry ? `Industry: ${e.industry}` : "",
      e.team_size ? `Managed a team of ${e.team_size}` : "",
    ].filter(Boolean).join(". ");
    return [head, ctx, bullets].filter(Boolean).join(". ");
  }).filter(Boolean).join("\n");

  const edu = c.education
    .map(e => [[e.degree, e.field].filter(Boolean).join(" "), e.school].filter(Boolean).join(" at "))
    .filter(Boolean).join("; ");
  const certs = c.certifications.map(c => c.name).filter(Boolean).join(", ");
  const derived = [
    c.derived.seniority ? `Seniority: ${c.derived.seniority}` : "",
    c.derived.primary_function ? `Function: ${c.derived.primary_function}` : "",
    c.derived.total_yoe != null ? `Years of experience: ${c.derived.total_yoe}` : "",
    c.derived.current_title ? `Current title: ${c.derived.current_title}` : "",
  ].filter(Boolean).join(". ");

  const knownFor = (c.derived.known_for || []).filter(Boolean).join(". ");
  const p = c.preferences;
  const seeking = [
    p.availability ? `Available: ${p.availability}` : "",
    (p.employment_types || []).length ? `Employment type: ${(p.employment_types || []).join(", ")}` : "",
    (p.company_stages || []).length ? `Company stage: ${(p.company_stages || []).join(", ")}` : "",
    (p.desired_titles || []).length ? `Target roles: ${(p.desired_titles || []).join(", ")}` : "",
    p.open_to_remote ? "Open to remote" : "",
    p.open_to_relocation ? "Open to relocation" : "",
  ].filter(Boolean).join(". ");
  const resumeSummary = ((resumeContent as { basics?: { summary?: string } })?.basics?.summary || "").toString();

  // Deliberately excludes name, email, phone, address, links to keep matching anonymous.
  return [
    derived,
    knownFor ? `Known for: ${knownFor}` : "",
    skills ? `Skills: ${skills}` : "",
    emphasised ? `Strongest current skills: ${emphasised}` : "",
    exp ? `Experience:\n${exp}` : "",
    edu ? `Education: ${edu}` : "",

    certs ? `Certifications: ${certs}` : "",
    seeking ? `Seeking: ${seeking}` : "",
    resumeSummary ? `Summary: ${resumeSummary}` : "",
  ].filter(Boolean).join("\n\n");
}

/**
 * v3.12.0 — the employer candidate card used to render `profile_text`, a
 * newline blob meant for an embedding model, straight into the UI. It read
 * like a debug dump and it leaked empty labels. This returns the same facts
 * as a structured, anonymous object the client can lay out properly.
 * Still no name, email, phone, address, or links.
 */
type CandidateProfileBlock = {
  seniority: string;
  years_experience: number | null;
  current_title: string;
  primary_function: string;
  known_for: string[];
  skills_by_level: Array<{ level: string; skills: Array<{ name: string; years: number | null }> }>;
  experience: Array<{ title: string; company: string; dates: string; industry: string }>;
  education: Array<{ line: string }>;
  certifications: string[];
  seeking: string[];
};

function buildCandidateProfile(c: CanonicalProfile): CandidateProfileBlock {
  const LEVELS = ["expert", "advanced", "proficient", "familiar"];
  const byLevel = new Map<string, Array<{ name: string; years: number | null }>>();
  for (const s of c.skills) {
    if (!s.name) continue;
    const lvl = LEVELS.includes(String(s.level || "").toLowerCase())
      ? String(s.level).toLowerCase() : "other";
    if (!byLevel.has(lvl)) byLevel.set(lvl, []);
    byLevel.get(lvl)!.push({ name: s.name, years: s.years ?? null });
  }
  const order = [...LEVELS, "other"];
  const skills_by_level = order
    .filter(l => byLevel.has(l))
    .map(l => ({ level: l, skills: byLevel.get(l)!.slice(0, 24) }));

  const p = c.preferences || {};
  return {
    seniority: c.derived.seniority || "",
    years_experience: c.derived.total_yoe ?? null,
    current_title: c.derived.current_title || "",
    primary_function: c.derived.primary_function || "",
    known_for: (c.derived.known_for || []).filter(Boolean).slice(0, 4),
    skills_by_level,
    experience: c.experiences.slice(0, 6).map(e => ({
      title: e.title || "",
      company: e.company || "",
      dates: [e.start, e.end || (e.current ? "Now" : "")].filter(Boolean).join(" to "),
      industry: e.industry || "",
    })).filter(e => e.title || e.company),
    education: c.education
      .map(e => ({ line: [[e.degree, e.field].filter(Boolean).join(" "), e.school].filter(Boolean).join(" at ") }))
      .filter(e => !!e.line).slice(0, 4),
    certifications: c.certifications.map(x => x.name).filter(Boolean).slice(0, 6),
    seeking: [
      p.availability ? `Available ${p.availability}` : "",
      (p.employment_types || []).length ? (p.employment_types || []).join(", ") : "",
      (p.desired_titles || []).length ? `Targeting ${(p.desired_titles || []).slice(0, 3).join(", ")}` : "",
      p.open_to_remote ? "Open to remote" : "",
      p.open_to_relocation ? "Open to relocation" : "",
    ].filter(Boolean),
  };
}




async function indexCandidate(admin: SupabaseClient<any, any, any>, userId: string): Promise<{ model: string; skills_count: number } | null> {
  const [canonical, { data: primary }] = await Promise.all([
    loadCanonical(admin, userId),
    admin.from("resumes").select("content").eq("user_id", userId).eq("is_primary", true).maybeSingle(),
  ]);
  if (!canonical) return null;
  const resumeContent = (primary?.content as Record<string, unknown> | null) || null;
  const profile_text = buildProfileText(canonical, resumeContent);
  const { vector: embedding, model: embedding_model } = await embedText(profile_text);

  const headline = canonical.derived.current_title || canonical.experiences[0]?.title || "";
  const summary = (resumeContent as { basics?: { summary?: string } })?.basics?.summary?.toString().slice(0, 2000) || "";
  const location = (resumeContent as { basics?: { location?: string } })?.basics?.location?.toString() || "";

  const { error: upErr } = await admin.from("candidate_index").upsert({
    user_id: userId,
    headline,
    summary,
    seniority: canonical.derived.seniority || null,
    location,
    years_experience: canonical.derived.total_yoe ?? null,
    embedding: embedding as unknown as number[],
    embedding_model,
    embedded_at: new Date().toISOString(),
    profile_text,
    indexed_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (upErr) throw upErr;


  // Rebuild candidate_skills. Extracted = literally present in canonical
  // skills or the primary resume skills. Inferred = in derived.top_skills
  // but NOT in either extracted set. Must-have matching in Phase B is
  // restricted to extracted edges.
  // v3.5.0 — edges now carry level, years and recency so employer matching can
  // rank a recent expert above a name on a list. Provenance rules unchanged.
  type Edge = { skill: string; source: string; level: string | null; years: number | null; last_used: string | null };
  const norm = (s: string) => s.toLowerCase().trim();
  const resumeSkills = Array.isArray((resumeContent as { skills?: unknown })?.skills)
    ? ((resumeContent as { skills: unknown[] }).skills.filter(x => typeof x === "string") as string[])
    : [];

  const extracted = new Map<string, Edge>();
  for (const s of canonical.skills) {
    const n = norm(s.name || "");
    if (n && !extracted.has(n)) {
      extracted.set(n, {
        skill: s.name, source: "canonical_profile",
        level: s.level ?? null, years: s.years ?? null, last_used: s.last_used ?? null,
      });
    }
  }
  for (const s of resumeSkills) {
    const n = norm(s);
    if (n && !extracted.has(n)) extracted.set(n, { skill: s, source: "resume", level: null, years: null, last_used: null });
  }

  const inferred = new Map<string, Edge>();
  for (const s of (canonical.derived.top_skills || [])) {
    const name = String(s);
    const n = norm(name);
    if (n && !extracted.has(n) && !inferred.has(n)) {
      inferred.set(n, { skill: name, source: "canonical_profile", level: null, years: null, last_used: null });
    }
  }

  await admin.from("candidate_skills").delete().eq("user_id", userId);
  const rows = [
    ...Array.from(extracted.entries()).map(([skill_norm, v]) => ({
      user_id: userId, skill: v.skill, skill_norm, provenance: "extracted", source: v.source,
      level: v.level, years: v.years, last_used: v.last_used,
    })),
    ...Array.from(inferred.entries()).map(([skill_norm, v]) => ({
      user_id: userId, skill: v.skill, skill_norm, provenance: "inferred", source: v.source,
      level: null, years: null, last_used: null,
    })),
  ];

  if (rows.length) {
    const { error: sErr } = await admin.from("candidate_skills").insert(rows);
    if (sErr) throw sErr;
  }
  return { model: embedding_model, skills_count: rows.length };
}


function reindexIfOptedIn(admin: SupabaseClient<any, any, any>, userId: string): void {
  // Non-blocking. Employer pool freshness is best-effort; caller shouldn't wait.
  admin.from("talent_pool_consent").select("opted_in").eq("user_id", userId).maybeSingle()
    .then(({ data }) => {
      if (data?.opted_in) return indexCandidate(admin, userId);
    })
    .then(undefined, (e: unknown) => console.error("reindexIfOptedIn failed", (e as Error)?.message));
}

// v3.44.0 — proposal/assessment notification emails. Best effort only,
// same rule as sendReceiptEmail in stripe-webhook: a Resend failure must
// never fail the action (proposal sent, assessment sent, decision
// recorded, assessment submitted) that triggered it.
async function notifyCandidate(
  admin: SupabaseClient<any, any, any>,
  candidateUserId: string,
  subject: string,
  bodyHtml: string,
  emailType: string,
  ctaHtml?: string,
): Promise<void> {
  try {
    const { data: authUser } = await admin.auth.admin.getUserById(candidateUserId);
    const email = authUser?.user?.email;
    if (!email) return;
    const r = await sendBrandedEmail(email, subject, wrapEmail(bodyHtml, undefined, ctaHtml));
    if (!r.ok) console.error("[notifyCandidate] send failed", r.error);
    // v3.47.0 — so the admin panel's email log shows whether this actually sent.
    await admin.from("email_logs").insert({
      user_id: candidateUserId, email_type: emailType, recipient_email: email,
      status: r.ok ? "sent" : "failed", error_message: r.ok ? null : r.error,
    }).then(({ error }: { error: unknown }) => { if (error) console.error("[notifyCandidate] email_logs insert failed", error); });
  } catch (e) {
    console.error("[notifyCandidate] threw", e);
  }
}

// Notifies every member of an org, not just whoever is signed in right
// now — the schema supports multi-seat orgs even though production today
// is solo employers (see v3.29.0 note in docs/map/platform.md).
async function notifyOrgMembers(
  admin: SupabaseClient<any, any, any>,
  orgId: string,
  subject: string,
  bodyHtml: string,
  emailType: string,
  ctaHtml?: string,
): Promise<void> {
  try {
    const { data: members } = await admin.from("org_members").select("user_id").eq("org_id", orgId);
    const ids = [...new Set((members || []).map(m => m.user_id).filter(Boolean))];
    const html = wrapEmail(bodyHtml, undefined, ctaHtml);
    await Promise.all(ids.map(async (uid) => {
      const { data: authUser } = await admin.auth.admin.getUserById(uid);
      const email = authUser?.user?.email;
      if (!email) return;
      const r = await sendBrandedEmail(email, subject, html);
      if (!r.ok) console.error("[notifyOrgMembers] send failed", r.error);
      await admin.from("email_logs").insert({
        user_id: uid, email_type: emailType, recipient_email: email,
        status: r.ok ? "sent" : "failed", error_message: r.ok ? null : r.error,
      }).then(({ error }: { error: unknown }) => { if (error) console.error("[notifyOrgMembers] email_logs insert failed", error); });
    }));
  } catch (e) {
    console.error("[notifyOrgMembers] threw", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const body = await req.json();
    const { action, ...payload } = body;

    // ============ PUBLIC LINK FLOW (no auth) ============
    // Extension generates a random code, opens /extension/approve?code=...
    // in a tab, polls link_poll until status=approved, then receives the token.
    if (typeof action === "string" && LINK_PUBLIC_ACTIONS.has(action)) {
      const admin = createClient(supabaseUrl, serviceKey);

      if (action === "link_start") {
        const { device_label } = payload as { device_label?: string };
        const bytes = new Uint8Array(24);
        crypto.getRandomValues(bytes);
        const code = "ayn_link_" + Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
        const { error } = await admin.from("extension_link_codes").insert({
          code, device_label: device_label || "Chrome", status: "pending",
        });
        if (error) return json({ error: error.message }, 500);
        return json({ code, expires_in: 300 });
      }

      if (action === "link_poll") {
        const { code } = payload as { code?: string };
        if (!code) return json({ error: "code required" }, 400);
        const { data, error } = await admin.from("extension_link_codes")
          .select("status, token, expires_at").eq("code", code).maybeSingle();
        if (error || !data) return json({ status: "not_found" }, 404);
        if (new Date(data.expires_at).getTime() < Date.now()) {
          await admin.from("extension_link_codes").delete().eq("code", code);
          return json({ status: "expired" });
        }
        if (data.status === "approved" && data.token) {
          // Consume — delete after returning token
          await admin.from("extension_link_codes").delete().eq("code", code);
          return json({ status: "approved", token: data.token });
        }
        return json({ status: data.status || "pending" });
      }
    }

    // ============ EXTENSION-AUTH ACTIONS (x-ayn-ext-token) ============
    if (typeof action === "string" && EXT_ACTIONS.has(action)) {
      const token = req.headers.get("x-ayn-ext-token");
      const admin = createClient(supabaseUrl, serviceKey);
      // v3.31.0 — an out of date sideloaded build is refused before it can
      // authenticate, spend money, or write anything.
      {
        const stale = await extVersionGate(admin, req);
        if (stale) return stale;
      }
      let userId: string | null = null;
      let deviceLabel: string | null = null;

      if (token) {
        const tokenHash = await sha256Hex(token);
        const { data: tok } = await admin
          .from("extension_tokens")
          .select("user_id, revoked_at, device_label")
          .eq("token_hash", tokenHash)
          .maybeSingle();
        if (!tok) return json({ error: "Invalid token" }, 401);
        if (tok.revoked_at) return json({ error: "Token revoked" }, 401);
        userId = tok.user_id as string;
        deviceLabel = (tok.device_label as string) ?? null;
        admin.from("extension_tokens").update({ last_used_at: new Date().toISOString() }).eq("token_hash", tokenHash).then(() => {});
      } else {
        return json({ error: "x-ayn-ext-token required" }, 401);
      }

      const tok = { device_label: deviceLabel };
      setAiCtx(admin, userId, String(action || "unknown"));
      {
        const off = await featureGate(admin, "platform");
        if (off) return off;
      }
      if (action === "smart_tailor" || action === "ext_cover_letter_text") {
        const off = await featureGate(admin, "tailoring");
        if (off) return off;
      }
      // v3.28.0 — suspension and per account restrictions apply to the
      // extension lane exactly as they do to the web lane.
      {
        const blocked = await accountGate(admin, userId, String(action || ""));
        if (blocked) return blocked;
      }




      if (action === "ext_bootstrap") {
        // v2.13.0 — bootstrap now returns identity completeness so the
        // sidepanel can prompt the user to fix the profile BEFORE they
        // trigger a fill (instead of learning about it via a mid-fill
        // "no_profile" abort). See docs/map/extension.md sidepanel status.
        const id = await loadIdentity(admin, userId);
        const { data: resume } = await admin.from("resumes")
          .select("id, title, content").eq("user_id", userId).eq("is_primary", true).maybeSingle();
        // v3.35.0 — the sidepanel could not show a credit balance because
        // bootstrap never carried one; the same numbers smart_tailor and
        // ext_cover_letter_text already return on every generation.
        await billingEnsure(admin, userId, "seeker");
        const balance = await creditBalance(admin, userId);
        return json({
          user: { id: userId, email: id.email.value || null, device: tok.device_label },
          profile: id.profile,
          resume,
          identity: {
            complete: id.isComplete(),
            missing: id.missing(),
            sources: id.sourceMap(),
          },
          credits: { balance, costs: { tailored_resume: COST_TAILOR, cover_letter: COST_COVER } },
        });
      }

      // v2.12.0 — ext_tailor, ext_cover_letter, ext_job_ingest removed.
      // Live twins are smart_tailor (tailoring) and ext_cover_letter_text
      // (cover letters). JD ingest/cache lives inline in ext_job_score.
      // v3.86.0 — ext_ingest_job (a separate, older job-ingest path) removed
      // too: zero callers anywhere in extension/ or src/, confirmed by grep;
      // this comment already documented that ingest/cache lives inline in
      // ext_job_score, so this was dead weight since before that note.


      // ext_job_score: full-JD scoring with HONESTY rule + AI-failure fallback.
      // Inputs: { urlHash?, url?, jobTitle?, company?, fullJd?, jobSnippet? }
      // Lookup order: cache by urlHash → ingest inline using fullJd → snippet-only fallback.
      if (action === "ext_job_score") {
        const { urlHash, url, jobTitle, company, fullJd, jobSnippet, resume_version_id } = payload as {
          urlHash?: string; url?: string; jobTitle?: string; company?: string;
          fullJd?: string; jobSnippet?: string; resume_version_id?: string;
        };

        const scoreStarted = Date.now();
        // v2.8.2 — honor tailored resume selection.
        // v3.1.0 — identity is loaded here too, so scoring sees the same
        // applicant view as tailor and cover letter.
        const [resolvedResume, canonical, identity] = await Promise.all([
          resolveResumeContent(admin, userId, resume_version_id),
          loadCanonical(admin, userId),
          loadIdentity(admin, userId, { resume_version_id }).catch(() => null),
        ]);
        const resume = resolvedResume.content ? { content: resolvedResume.content } : null;
        if (!resume?.content && !canonical) {
          return json({ score: 0, matchLabel: "No resume", reasons: [], salaryEstimate: "", missingSkills: [], missingKeywords: [], matchedSkills: [], source: "no_profile" });
        }

        // v2.8.2 — human-readable label for what resume was actually scored.
        let resumeLabel = "Resume";
        if (resolvedResume.source === "primary") resumeLabel = "Primary resume";
        else if (resolvedResume.source === "version") {
          resumeLabel = "Resume version";
          try {
            if (resume_version_id) {
              const { data: v } = await admin
                .from("resume_versions")
                .select("created_for_job_id")
                .eq("id", resume_version_id)
                .eq("user_id", userId)
                .maybeSingle();
              const jobRef = (v?.created_for_job_id as string | undefined) || "";
              if (jobRef) {
                const { data: j } = await admin.from("jobs").select("title").eq("id", jobRef).maybeSingle();
                const t = (j?.title as string | undefined)?.trim();
                if (t) resumeLabel = `Tailored for ${t}`;
              }
            }
          } catch { /* keep default */ }
        }

        // 1. Resolve full JD: cache → inline ingest → snippet-only fallback.
        const normalized = normalizeUrlForHash(url || "");
        const hash = (urlHash && urlHash.length >= 16) ? urlHash
          : normalized ? await sha256Hex(normalized)
          : (fullJd || jobSnippet) ? await sha256Hex((fullJd || jobSnippet || "").slice(0, 400))
          : "";

        let cachedRow: { full_jd: string; parsed: JobParsed; title?: string; company?: string } | null = null;
        if (hash) {
          const { data: c } = await admin.from("job_cache")
            .select("full_jd, parsed, title, company, expires_at")
            .eq("url_hash", hash).maybeSingle();
          if (c && new Date(c.expires_at).getTime() > Date.now()) {
            cachedRow = { full_jd: c.full_jd, parsed: (c.parsed || EMPTY_PARSED) as JobParsed, title: c.title, company: c.company };
          }
        }

        let fullJdResolved = cachedRow?.full_jd || "";
        let parsedJob: JobParsed = cachedRow?.parsed || EMPTY_PARSED;
        let source: "full" | "snippet" | "approximate_keyword_overlap" = "full";

        // v3.1.0 — parseJobMeta used to block the scoring call. It now runs
        // concurrently with it; the score prompt is grounded on the
        // deterministic gap analysis instead of JOB_PARSED, and parsedJob is
        // awaited afterwards for salary and the honesty safety net.
        let parsedJobPromise: Promise<JobParsed> | null = null;
        if (!cachedRow && fullJd && fullJd.length >= 40) {
          fullJdResolved = fullJd.slice(0, 30000);
          const ingestHash = hash || await sha256Hex(fullJd.slice(0, 400));
          parsedJobPromise = parseJobMeta(fullJd, url || "", jobTitle || "", company || "");
          parsedJobPromise.then((pj) => {
            const row = {
              url_hash: ingestHash,
              url: normalized || url || null,
              title: jobTitle || null, company: company || null,
              full_jd: fullJdResolved, parsed: pj,
              created_at: new Date().toISOString(),
              expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            };
            return admin.from("job_cache").upsert(row, { onConflict: "url_hash" });
          }).then((r: any) => {
            if (r?.error) console.warn("job_cache inline-ingest upsert failed", r.error.message);
          }, () => {});
        } else if (!cachedRow) {
          // No full JD available — fall back to the snippet (card-badge path).
          fullJdResolved = (jobSnippet || "").slice(0, 4000);
          source = "snippet";
          // v2.8.2 — refuse to guess from tiny snippets; ask for JD instead.
          if (fullJdResolved.length < 300) {
            return json({
              needsJd: true,
              score: 0,
              matchLabel: "Needs JD",
              reasons: [],
              source: "no_jd",
              scoredAgainst: {
                jobTitle: jobTitle || cachedRow?.title || "",
                company: company || cachedRow?.company || "",
                jdChars: fullJdResolved.length,
                jdSource: source,
                resumeLabel,
                skillsCount: 0,
              },
            });
          }
        }

        // 2. Build honest user-skill index for the HONESTY rule.
        const userSkillIndex = new Map<string, string>();
        if (canonical) {
          for (const s of canonical.skills) {
            const name = String(s?.name || "");
            const k = name.toLowerCase().trim();
            if (k) userSkillIndex.set(k, name);
          }
          for (const t of (canonical.derived.top_skills || [])) {
            const k = String(t).toLowerCase().trim();
            if (k && !userSkillIndex.has(k)) userSkillIndex.set(k, String(t));
          }
        }
        // Resume skills as secondary signal.
        const rc = (resume?.content || {}) as Record<string, unknown>;
        for (const s of ((rc.skills as string[]) || [])) {
          const k = String(s).toLowerCase().trim();
          if (k && !userSkillIndex.has(k)) userSkillIndex.set(k, String(s));
        }

        // 3. Score against the full JD. v3.1.0: structured sections instead
        // of a sliced digest, plus a deterministic gap analysis.
        const scoreBundle = buildSections(identity, canonical);
        const scoreGap = computeGap(fullJdResolved, scoreBundle);
        const canonText = canonicalDigest(canonical);

        // Result cache: (jd, resume selection, applicant snapshot).
        const scoreCacheKey = `score:${userId}:${resume_version_id || "primary"}:${(await sha256Hex(fullJdResolved)).slice(0, 24)}:${(await sha256Hex(scoreBundle.text + canonText)).slice(0, 16)}`;
        const scoreCached = await cacheGet<Record<string, unknown>>(admin, scoreCacheKey);
        if (scoreCached) {
          logAiCall(admin, {
            user_id: userId, purpose: "job_score", cache_hit: true,
            duration_ms: Date.now() - scoreStarted, source_map: identity?.sourceMap() || null,
            gap_matched: scoreGap.matched.length, gap_missing: scoreGap.missing.length,
          });
          return json({ ...scoreCached, cached: true });
        }

        let parsedAI: {
          score?: number; matchLabel?: string; reasons?: string[];
          salaryEstimate?: string; missingKeywords?: string[]; missingSkills?: string[];
          matchedSkills?: string[]; verdict?: string; seniorityFit?: string;
          mustHaves?: Array<{text:string;met:boolean}>;
          niceToHaves?: Array<{text:string;met:boolean}>;
        } = {};
        let aiOk = false;
        try {
          const r = await callAI({
            model: DEFAULT_MODEL,
            // v3.72.0 — no temperature meant two scoring calls on the same JD
            // and profile (e.g. right after a cache expiry) could disagree,
            // the same class of bug already fixed once for the resume
            // optimizer's own score. Low temperature since this is already
            // grounded on a deterministic gap analysis, not free judgment.
            temperature: 0.1,
            system: `You are a senior recruiter. Score the candidate against the FULL job description below.

Return ONLY this JSON (no code fences):
{
  "score": <integer 1-10>,
  "matchLabel": "Poor|Fair|Good|Strong",
  "reasons": ["<reason 1>","<reason 2>","<reason 3>"],
  "mustHaves": [{"text":"<requirement>","met":true|false}, ...],
  "niceToHaves": [{"text":"<nice-to-have>","met":true|false}, ...],
  "matchedSkills": ["<skill exactly as it appears in CANONICAL_SKILLS>"],
  "missingSkills": ["<JD skill not in CANONICAL_SKILLS>"],
  "seniorityFit": "under|match|over|unknown",
  "salaryEstimate": "<e.g. $90K to $120K CAD, follow JD currency>",
  "verdict": "<one sentence>"
}

HONESTY RULE (HARD): Only put a skill in matchedSkills if it appears in CANONICAL_SKILLS (case-insensitive). Anything in JD_SKILLS that is NOT in CANONICAL_SKILLS goes to missingSkills. Never fabricate a matched skill the candidate doesn't have. If unsure, mark it missing.

CURRENCY: infer from the JD text or the posting hostname. NEVER hardcode USD. Format ranges with the word "to": "$90K to $120K CAD" or "£55K to £70K". Never use dashes for ranges.

VOICE: write reasons and verdict the way a thoughtful person writes. Vary sentence length, plain natural language, no AI clichés ("leverage", "passionate", "in today's fast-paced"), no em dashes, no en dashes, never use ' - ' as a connector.

SCORING RUBRIC:
- 9 to 10 Strong: meets all must-haves + senior signals matching the job's stated seniority.
- 7 to 8 Good: meets most must-haves, 1 to 2 coachable gaps.
- 4 to 6 Fair: half the must-haves, real gaps in seniority or core tech.
- 1 to 3 Poor: missing the core requirement.

SENIORITY_FIT: compare canonical.derived.seniority to the seniority the job asks for. "under"/"match"/"over"/"unknown".

OUTPUT RULES: reasons = 3 phrases max 6 words. mustHaves 3-5. niceToHaves 2-4. matchedSkills up to 8. missingSkills up to 8.`,
            user: `CANONICAL_SKILLS: ${Array.from(userSkillIndex.values()).slice(0, 60).join(", ")}
CANONICAL_PROFILE_SUMMARY:
${canonText}

APPLICANT SECTIONS:
${scoreBundle.text}

JOB_TITLE: ${jobTitle || cachedRow?.title || ""}
COMPANY: ${company || cachedRow?.company || ""}
URL: ${url || ""}

FULL_JD:
${fullJdResolved.slice(0, 15000)}${renderGapBlock(scoreGap)}`,
          });
          try {
            const raw = r.text.replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
            const s = raw.indexOf("{"); const e = raw.lastIndexOf("}");
            parsedAI = JSON.parse(s !== -1 ? raw.slice(s, e+1) : raw);
            aiOk = true;
          } catch { aiOk = false; }
        } catch (e) {
          console.warn("ext_job_score AI failed; using keyword fallback:", (e as Error).message);
          aiOk = false;
        }
        // Job metadata was parsed concurrently with the scoring call above.
        if (parsedJobPromise) { try { parsedJob = await parsedJobPromise; } catch { /* keep EMPTY_PARSED */ } }

        // v2.8.2 — grounding metadata so the UI can show WHAT was scored.
        const scoredAgainst = {
          jobTitle: jobTitle || cachedRow?.title || "",
          company: company || cachedRow?.company || "",
          jdChars: fullJdResolved.length,
          jdSource: source === "full" ? "full" : source === "snippet" ? "snippet" : "snippet",
          resumeLabel,
          skillsCount: userSkillIndex.size,
        };

        if (!aiOk) {
          const fb = keywordFallbackScore(canonical, fullJdResolved, parsedJob);
          return json({ ...fb, scoredAgainst });
        }

        // 4. HONESTY enforcement (server-side, never trust the model alone).
        const cleanedMatched: string[] = [];
        const seenMatch = new Set<string>();
        for (const m of (parsedAI.matchedSkills || [])) {
          const k = String(m || "").toLowerCase().trim();
          if (!k || seenMatch.has(k)) continue;
          if (userSkillIndex.has(k)) {
            cleanedMatched.push(userSkillIndex.get(k)!); // canonical casing
            seenMatch.add(k);
          }
        }
        // Anything in matched that didn't pass = move to missing.
        const droppedMatches = (parsedAI.matchedSkills || [])
          .filter(m => !seenMatch.has(String(m || "").toLowerCase().trim()))
          .map(String);
        const missingFromAI = (parsedAI.missingSkills || parsedAI.missingKeywords || []).map(String);
        const missingMerged = Array.from(new Set([...droppedMatches, ...missingFromAI]
          .map(s => s.trim()).filter(Boolean)));
        // Also add JD skills not in user skills (safety net).
        for (const sk of (parsedJob.skills || [])) {
          const k = sk.toLowerCase().trim();
          if (!userSkillIndex.has(k) && !missingMerged.some(x => x.toLowerCase().trim() === k)) {
            missingMerged.push(sk);
          }
        }

        // Salary: prefer the JD-printed currency from parsedJob.salary; else AI; never default USD.
        const salaryDisplay = parsedJob.salary?.display
          || String(parsedAI.salaryEstimate || "").trim();

        const score = Math.max(1, Math.min(10, Math.round(Number(parsedAI.score) || 5)));
        const validLabels = ["Poor", "Fair", "Good", "Strong"];
        const matchLabel = validLabels.includes(parsedAI.matchLabel || "") ? parsedAI.matchLabel!
          : score >= 9 ? "Strong" : score >= 7 ? "Good" : score >= 4 ? "Fair" : "Poor";
        const seniorityFit = ["under","match","over","unknown"].includes(parsedAI.seniorityFit || "")
          ? parsedAI.seniorityFit! : "unknown";

        const scoreResult = {
          score, matchLabel,
          reasons: (parsedAI.reasons || []).slice(0, 3),
          mustHaves: (parsedAI.mustHaves || []).slice(0, 5).map(m => ({ text: String(m.text || ""), met: !!m.met })),
          niceToHaves: (parsedAI.niceToHaves || []).slice(0, 4).map(m => ({ text: String(m.text || ""), met: !!m.met })),
          matchedSkills: cleanedMatched.slice(0, 8),
          missingSkills: missingMerged.slice(0, 8),
          missingKeywords: missingMerged.slice(0, 8), // back-compat alias for the side panel
          seniorityFit,
          salaryEstimate: salaryDisplay,
          verdict: String(parsedAI.verdict || ""),
          source,
          scoredAgainst,
          gapAnalysis: {
            method: scoreGap.method,
            alreadyStrong: scoreGap.matched.map(r => r.text).slice(0, 15),
            stillMissing: scoreGap.missing.map(r => r.text).slice(0, 15),
            niceToHave: scoreGap.niceToHave.map(r => ({ text: r.text, met: r.status === "matched" })).slice(0, 10),
          },
        };
        cacheSet(admin, scoreCacheKey, userId, "job_score", scoreResult, 24 * 60 * 60 * 1000);
        logAiCall(admin, {
          user_id: userId, purpose: "job_score", model: DEFAULT_MODEL,
          duration_ms: Date.now() - scoreStarted, cache_hit: false,
          source_map: identity?.sourceMap() || null,
          gap_matched: scoreGap.matched.length, gap_missing: scoreGap.missing.length,
          meta: { jd_chars: fullJdResolved.length, section_chars: scoreBundle.chars, jd_source: source },
        });
        return json(scoreResult);
      }


      // ext_suggest_roles: suggest best job titles to search for based on resume
      if (action === "ext_suggest_roles") {
        const { data: resume } = await admin.from("resumes").select("content").eq("user_id", userId).eq("is_primary", true).maybeSingle();
        if (!resume?.content) return json({ roles: [], keywords: [] });

        const r = await callAI({
          system: `You are a job search expert for the US and Canadian job markets. Based on this resume, suggest the best job titles to search for on LinkedIn and Indeed.
Return ONLY valid JSON, no code fences:
{
  "roles": ["<title1>", "<title2>", ...],
  "keywords": ["<keyword1>", ...],
  "summary": "<one sentence about their profile>"
}
- roles: 8-10 specific job titles they should search for, ordered best match first
- keywords: 6-8 skills/tools to add to searches for better results
- Be specific to the US and Canadian job markets and their actual experience level`,
          user: JSON.stringify({ basics: resume.content?.basics, work: resume.content?.work, skills: resume.content?.skills }).slice(0, 5000),
        });

        let parsed = { roles: [] as string[], keywords: [] as string[], summary: "" };
        try {
          const raw = r.text.replace(/\`\`\`(?:json)?\s*/gi, "").replace(/\`\`\`/g, "").trim();
          const s = raw.indexOf("{"); const e = raw.lastIndexOf("}");
          parsed = JSON.parse(s !== -1 ? raw.slice(s, e+1) : raw);
        } catch { /* keep defaults */ }

        return json({
          roles: (parsed.roles || []).slice(0, 10),
          keywords: (parsed.keywords || []).slice(0, 8),
          summary: parsed.summary || "",
        });
      }

      // ext_find_contacts: given company + job title, return recruiter search links + outreach message
      if (action === "ext_find_contacts") {
        const { company, jobTitle, jobUrl, jobSnippet } = payload as { company?: string; jobTitle?: string; jobUrl?: string; jobSnippet?: string };
        if (!company) return json({ error: "company required" }, 400);

        const { data: profile } = await admin.from("user_profile_data").select("legal_first_name, legal_last_name, default_answers").eq("user_id", userId).maybeSingle();
        const { data: resume } = await admin.from("resumes").select("content").eq("user_id", userId).eq("is_primary", true).maybeSingle();

        const userName = [profile?.legal_first_name, profile?.legal_last_name].filter(Boolean).join(" ") || "the candidate";
        const aboutMe = (profile?.default_answers as Record<string,unknown>)?.about_me as string || "";

        const candidateBackground = aboutMe.slice(0, 400) || JSON.stringify({
          basics: resume?.content?.basics,
          recent: ((resume?.content?.work as Array<Record<string, unknown>>) || []).slice(0, 2),
        }).slice(0, 700);

        const r = await callAI({
          system: `You help a candidate find the right humans to contact at a company about a specific role. Be CONCRETE — no generic recruiter copy.

Return ONLY this JSON (no code fences):
{
  "contacts": [
    { "role": "<persona title>", "why": "<one sentence>", "linkedinSearchUrl": "<URL>", "titles": ["<variant>", "<variant>"] }
  ],
  "emailFormats": ["firstname.lastname@<domain>", "f.lastname@<domain>"],
  "companyDomain": "<domain.com>",
  "coldOutreach": "<personalized message under 80 words>",
  "subjectLine": "<email subject>"
}

LinkedIn search URL pattern:
https://www.linkedin.com/search/results/people/?keywords=<URL-ENCODED ROLE TITLE>&currentCompany=%5B%22<URL-ENCODED COMPANY>%22%5D&origin=FACETED_SEARCH

Rules:
- Exactly 3 contact personas: (1) Technical/Hiring Recruiter for the role's function, (2) Hiring Manager (use the actual role's likely manager title — e.g. "Engineering Manager" for SWE, "Director of Marketing" for marketing), (3) Team Lead / Senior peer (e.g. "Staff Engineer", "Senior Product Designer").
- For each: 2 title variants real people use at companies of this size.
- emailFormats: 2-3 most likely formats for THIS company size (startups use firstname@, large enterprises use firstname.lastname@).
- companyDomain: best guess from the company name (lowercase, no spaces). If well-known company, use the known domain.
- coldOutreach: written FROM the candidate, addressed to the recruiter. First name reference, the specific role title, ONE concrete reason from candidate's background that maps to the JD, a clear ask (15-min chat). Under 80 words. No "hope this finds you well", no "I am excited to", no "passionate", no "leverage". Write the way a thoughtful person writes: vary sentence length, plain natural language, no AI clichés, no em dashes, no en dashes, never use ' - ' as a connector, and write ranges with the word 'to'. Plain text.
- subjectLine: short, formatted as "Role at Company" or "Role at Company: one-line angle". Use a colon if you need a separator. Never use a dash, em dash, or en dash.`,
          user: `COMPANY: ${company}
JOB TITLE: ${jobTitle || "Not specified"}
JOB URL: ${jobUrl || ""}
JOB SNIPPET: ${(jobSnippet || "").slice(0, 1200)}
CANDIDATE NAME: ${userName}
CANDIDATE BACKGROUND: ${candidateBackground}`,
        });

        let parsed: Record<string, unknown> = {};
        try {
          const raw = r.text.replace(/\`\`\`(?:json)?\s*/gi, "").replace(/\`\`\`/g, "").trim();
          const s = raw.indexOf("{"); const e = raw.lastIndexOf("}");
          parsed = JSON.parse(s !== -1 ? raw.slice(s, e + 1) : raw);
        } catch { /* keep empty */ }

        return json({
          contacts: (parsed.contacts as unknown[] || []).slice(0, 3),
          emailFormats: (parsed.emailFormats as string[] || []).slice(0, 3),
          companyDomain: parsed.companyDomain || "",
          coldOutreach: parsed.coldOutreach || "",
          subjectLine: parsed.subjectLine || "",
        });
      }

      // ext_cover_letter_text — v3.1.0: identity + structured sections (no
      // truncation), real company context, two-pass on the detailed tier,
      // verified figure preservation, cached, logged.
      if (action === "ext_cover_letter_text") {
        return await handleCoverLetter(admin, userId, payload as Record<string, unknown>);
      }



      // v2.8.0 — ext_job_lookup: JD Resolver's backend branch. Given host+path
      // (or a URL), returns the most recent jobs-row with jd_text ≥ 400 chars.
      if (action === "ext_job_lookup") {
        const { host_path, url } = payload as { host_path?: string; url?: string };
        let key = String(host_path || "").trim();
        if (!key && url) {
          try {
            const u = new URL(url);
            key = `${u.hostname.replace(/^www\./,"").toLowerCase()}${u.pathname.replace(/\/+$/,"")}`;
          } catch { /* ignore */ }
        }
        if (!key) return json({ ok: true, job: null });
        // Match jobs whose source_url contains this host+path (any protocol/query).
        const like = `%${key}%`;
        const { data } = await admin.from("jobs")
          .select("id,title,company,source_url,jd_text,created_at")
          .ilike("source_url", like)
          .order("created_at", { ascending: false })
          .limit(5);
        const best = (data || []).find(j => (j.jd_text || "").length >= 400) || null;
        return json({ ok: true, job: best });
      }


      // ext_download_resume_text — returns primary or tailored resume as ATS plain text
      if (action === "ext_download_resume_text") {
        const { resume_version_id } = payload as { resume_version_id?: string };
        const resolved = await resolveResumeContent(admin, userId, resume_version_id);
        if (!resolved.content) return json({ error: "No primary resume saved in AYN" }, 404);
        const resume = { content: resolved.content };
        const c = resume.content as Record<string, unknown>;
        const basics = (c.basics || {}) as Record<string, string>;
        const work = (c.work || []) as Array<Record<string, unknown>>;
        const edu = (c.education || []) as Array<Record<string, unknown>>;
        const skills = (c.skills || []) as string[];
        const lines: string[] = [];
        if (basics.name) lines.push(String(basics.name).toUpperCase());
        if (basics.title) lines.push(String(basics.title));
        const contact = [basics.email, basics.phone, basics.location].filter(Boolean).join(" | ");
        if (contact) lines.push(contact);
        if (basics.summary) { lines.push("", "SUMMARY", String(basics.summary)); }
        if (work.length) {
          lines.push("", "EXPERIENCE");
          work.forEach(w => {
            lines.push("", `${w.title || ""} | ${w.company || ""}  ${w.start || ""} to ${w.end || "Present"}`);
            ((w.bullets || []) as string[]).forEach(b => lines.push(`- ${b}`));
          });
        }
        if (edu.length) {
          lines.push("", "EDUCATION");
          edu.forEach(e => lines.push(`${e.degree || ""} | ${e.school || ""}  ${e.end || ""}`));
        }
        if (skills.length) { lines.push("", "SKILLS", skills.join(", ")); }
        return json({ text: lines.join("\n"), filename: `${(basics.name || "Resume").replace(/\s+/g,"_")}_AYN.txt` });
      }

      // ext_ask — AI career assistant with full context
      if (action === "ext_ask") {
        const{sessionId,question,jobTitle,company,jobText,url}=payload as{sessionId?:string;question?:string;jobTitle?:string;company?:string;jobText?:string;url?:string};
        if(!question)return json({error:"question required"},400);
        const{data:resume}=await admin.from("resumes").select("content").eq("user_id",userId).eq("is_primary",true).maybeSingle();
        const rb=resume?.content as Record<string,unknown>|undefined;
        const bas=(rb?.basics||{}) as Record<string,string>;
        const works=((rb?.work||[]) as Array<Record<string,unknown>>);
        const skills=((rb?.skills||[]) as string[]);
        const resumeCtx=bas.name?`CANDIDATE: ${bas.name}\nTITLE: ${works[0]?.title||""}\nSKILLS: ${skills.slice(0,15).join(", ")}\nSUMMARY: ${(bas.summary||"").slice(0,300)}`:"No resume loaded.";
        const jd = await resolveJobJd(admin, url, jobText);
        const r = await callAI({
          system:`You are AYN, a smart career assistant in a Chrome extension. See the job page and candidate resume below.\nBe direct and specific (max 4 sentences unless more is needed). Never be vague.\nYou help with: fit analysis, salary ranges, interview prep, cold outreach, application question answers, resume gaps.\nFor salary: ALWAYS give a real number range using the word 'to' (e.g. $90K to $130K CAD) based on role + location. Never write the range with a dash.\nFor fit: give a clear verdict (Strong/Good/Fair/Poor) + top 2 gaps.\nFor interview prep: give 3 specific questions + brief answer frameworks.\nFor outreach: write the actual message.\nOUTPUT FORMAT (strict): write plain conversational prose. Never use markdown syntax: no asterisks, no ** bold markers, no bullet characters (*, -, •), no headers (#), no code fences. Use short paragraphs and full sentences instead of bullet lists. No em dashes, no en dashes.\nVoice: write the way a thoughtful person writes. Vary sentence length, plain natural language, no AI clichés ("I am excited to", "leverage", "passionate", "in today's fast-paced"), never use ' - ' as a connector.\n\n${resumeCtx}\n\n${jd?`JOB: ${jobTitle||""} at ${company||""}\n${jd.slice(0,2500)}`:"No job page, general career advice."}`,
          user:question,
        });
        return json({answer:r.text,sessionId:sessionId||crypto.randomUUID()});
      }

      // smart_tailor — v3.1.0: identity-grounded, section-based (no character
      // truncation), deterministic gap analysis, two-pass quality, verified
      // figure preservation, cached, logged. See handleSmartTailor below.
      if (action === "smart_tailor") {
        return await handleSmartTailor(admin, userId, payload as Record<string, unknown>);
      }


      if (action === "ext_profile_canonical_get") {
        const canonical = await loadCanonical(admin, userId);
        return json({ canonical: canonical || EMPTY_CANONICAL, hasProfile: !!canonical });
      }
    }

    // ============ DASHBOARD ACTIONS (Supabase JWT) ============
    const auth = req.headers.get("Authorization") ?? "";
    const jwt = auth.replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "Missing Authorization" }, 401);

    const supa = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: u } = await supa.auth.getUser();
    const user = u?.user;
    if (!user) return json({ error: "Invalid session" }, 401);

    // ---------------- link_approve: user clicks Approve on /extension/approve ----------------
    if (action === "link_approve") {
      const { code, device_label } = payload as { code?: string; device_label?: string };
      if (!code) return json({ error: "code required" }, 400);
      const admin2 = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

      const { data: link } = await admin2.from("extension_link_codes")
        .select("status, expires_at").eq("code", code).maybeSingle();
      if (!link) return json({ error: "Invalid code" }, 404);
      if (new Date(link.expires_at).getTime() < Date.now()) return json({ error: "Code expired" }, 410);
      if (link.status !== "pending") return json({ error: "Code already used" }, 409);

      // Mint a device token bound to this user
      const tokBytes = new Uint8Array(32);
      crypto.getRandomValues(tokBytes);
      const token = "ayn_" + Array.from(tokBytes).map(b => b.toString(16).padStart(2, "0")).join("");
      const tokHash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))))
        .map(x => x.toString(16).padStart(2, "0")).join("");
      const prefix = token.slice(0, 12) + "…";
      const label = device_label || "Chrome";

      const { error: tokErr } = await admin2.from("extension_tokens")
        .insert({ user_id: user.id, token_hash: tokHash, token_prefix: prefix, device_label: label });
      if (tokErr) return json({ error: tokErr.message }, 500);

      const { error: updErr } = await admin2.from("extension_link_codes")
        .update({ user_id: user.id, token, status: "approved", approved_at: new Date().toISOString(), device_label: label })
        .eq("code", code);
      if (updErr) return json({ error: updErr.message }, 500);

      return json({ ok: true });
    }




    // ---------------- extension token management ----------------
    if (action === "token_list") {
      const { data, error } = await supa.from("extension_tokens")
        .select("id, token_prefix, device_label, last_used_at, revoked_at, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return json({ tokens: data });
    }
    if (action === "token_revoke") {
      const id = (payload as { id?: string }).id;
      if (!id) return json({ error: "id required" }, 400);
      const { data: revoked, error } = await supa.from("extension_tokens")
        .update({ revoked_at: new Date().toISOString() }).eq("id", id).select("id").maybeSingle();
      if (error) throw error;
      // RLS already blocks touching someone else's token, but a bad/foreign
      // id previously still got an unconditional {ok:true} back -- same
      // silent-no-op response bug fixed in reveal_decide below.
      if (!revoked) return json({ error: "Token not found." }, 404);
      return json({ ok: true });
    }


    // ---------------- parse_file ----------------
    if (action === "parse_file") {
      const { fileBase64, mimeType } = payload as { fileBase64: string; mimeType: string };
      if (!fileBase64) return json({ error: "fileBase64 required" }, 400);

      const isDocx = (mimeType || "").includes("wordprocessingml") || (mimeType || "").includes("docx");
      const isPdf = (mimeType || "").includes("pdf");
      const isText = (mimeType || "").startsWith("text/");
      const apiKey = Deno.env.get("LOVABLE_API_KEY");
      if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

      // Stage 1: try to extract plain text natively
      let resumeText = "";

      const b64ToBytes = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));

      if (isText) {
        try { resumeText = new TextDecoder("utf-8").decode(b64ToBytes(fileBase64)); } catch (_) { /* noop */ }
      } else if (isDocx) {
        // Use mammoth for real DOCX text extraction
        try {
          const mammoth = await import("npm:mammoth@1.8.0");
          const { value } = await mammoth.extractRawText({ buffer: b64ToBytes(fileBase64) as any });
          resumeText = (value || "").replace(/\s+\n/g, "\n").trim();
        } catch (e) {
          console.warn("mammoth DOCX extraction failed", e);
        }
      }

      const isMeaningful = resumeText.replace(/\s+/g, " ").trim().length >= 80;

      // Stage 2 — text path (fast, accurate when extraction worked)
      if (isMeaningful) {
        const r = await callAI({
          system: `You convert raw resume text into structured JSON. Be faithful — extract exactly what is written. Never invent names, employers, dates, or skills. If a field is missing, return an empty string or empty array. The name, contact info, and companies in this text are real. If the text below does not actually contain resume content (it's garbled, boilerplate, or unrelated), return every field empty — do NOT fill in a generic example/placeholder person or job.`,
          user: `RESUME TEXT:\n${resumeText.slice(0, 18000)}`,
          toolName: "emit_resume",
          toolSchema: RESUME_SCHEMA,
        });
        return json({ resume: r.structured, plainText: resumeText.slice(0, 18000) });
      }

      // Stage 3 — vision/file fallback for PDFs (or DOCX when mammoth failed)
      // Use the gateway's OpenAI-compatible `file` content block with a data URL.
      const realMime = isPdf
        ? "application/pdf"
        : isDocx
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : (mimeType || "application/octet-stream");

      const userContent = [
        { type: "text", text: "Extract ALL information from this resume document: full name, contact details (email, phone, location, links), every job (company, title, dates, bullets), education, skills, certifications, projects. Be exhaustive and faithful — extract exactly what is written, never invent. If, and only if, this document has no actual readable resume content in it at all (blank page, corrupted file, an unrelated document, or an image too degraded to read), call emit_no_content instead and explain why in one sentence. Otherwise call emit_resume." },
        { type: "file", file: { filename: isPdf ? "resume.pdf" : "resume.docx", file_data: `data:${realMime};base64,${fileBase64}` } },
      ];

      // Two tools, not one pinned tool_choice. A forced single tool call gives
      // the model no way to say "there's nothing here" -- reproduced live
      // against a genuinely blank PDF, it filled the required schema with a
      // complete fabricated person (name, employers, degrees, certifications)
      // instead. emit_no_content is the explicit escape hatch; tool_choice
      // "required" still forces SOME call, so the model can't just reply with
      // prose, but it can now honestly decline instead of inventing.
      const r = await fetch(GATEWAY_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: "You convert resume documents into structured JSON. The name, employers, dates, and contact details in the document are real — extract them exactly. Never invent data, and never substitute a generic example or placeholder person/employer when the document is blank or unreadable. If a field is missing, leave it empty. Call emit_no_content if there is no real resume content to read; otherwise call emit_resume." },
            { role: "user", content: userContent },
          ],
          tools: [
            { type: "function", function: { name: "emit_resume", description: "emit_resume", parameters: RESUME_SCHEMA } },
            {
              type: "function",
              function: {
                name: "emit_no_content",
                description: "Call this instead of emit_resume when the document has no readable resume content at all.",
                parameters: {
                  type: "object",
                  properties: { reason: { type: "string", description: "One sentence: why nothing could be extracted." } },
                  required: ["reason"],
                },
              },
            },
          ],
          tool_choice: "required",
        }),
      });

      const noContentMsg = isPdf
        ? "Couldn't read this PDF — it may be scanned/image-based, blank, or corrupted. Paste your resume text instead."
        : "AI couldn't extract resume data. Paste your resume text instead.";
      if (r.status === 429) return json({ error: "AI rate limit. Try again in a minute." }, 429);
      if (r.status === 402) return json({ error: "AI credits exhausted." }, 402);
      if (!r.ok) {
        // A malformed/corrupted upload reaches the provider's own document
        // parser and gets rejected there (reproduced live: a garbage file
        // sent as a PDF got a raw "The document has no pages" 400 from
        // Google AI Studio) -- that used to leak straight to the user as
        // "AI error 400: {...raw upstream JSON, provider name and all...}"
        // instead of the same honest, friendly message every other unreadable-
        // file case already gets. The raw text is kept in `detail` only.
        const t = await r.text();
        return json({ error: noContentMsg, detail: t.slice(0, 300) }, 422);
      }

      const data = await r.json();
      const call = data?.choices?.[0]?.message?.tool_calls?.[0];
      const tc = call?.function?.arguments;
      if (!tc || call?.function?.name === "emit_no_content") {
        const fallback = data?.choices?.[0]?.message?.content;
        let reason: string | null = null;
        if (call?.function?.name === "emit_no_content") {
          try { reason = JSON.parse(tc)?.reason ?? null; } catch { /* noop */ }
        }
        return json({
          error: noContentMsg,
          detail: reason ?? (typeof fallback === "string" ? fallback.slice(0, 400) : null),
        }, 422);
      }

      let resume: unknown;
      try { resume = JSON.parse(tc); } catch { return json({ error: "Failed to parse AI response" }, 500); }

      const plainText = [
        (resume as Record<string, unknown>)?.basics,
        ...(((resume as Record<string, unknown>)?.work as unknown[]) ?? []),
        ...(((resume as Record<string, unknown>)?.education as unknown[]) ?? []),
      ].map(s => JSON.stringify(s)).join("\n");

      return json({ resume, plainText });
    }

    // ---------------- resume_diagnose ----------------
    // Free. A fast, cheap-model read of the resume's CONTENT quality — vague
    // bullets, missing numbers, thin sections, weak framing. Deliberately not
    // about visual layout (columns, tables, fonts): by the time a resume is
    // in this schema, every download AYN produces already goes through one
    // clean single-column PDF/DOCX builder (resumeDocs.ts), so the
    // file-formatting half of "ATS-friendly" is already solved by
    // construction. What's left to diagnose is the writing itself.
    if (action === "resume_diagnose") {
      const adminDiag = createClient(supabaseUrl, serviceKey);
      { const off = await featureGate(adminDiag, "tailoring"); if (off) return off; }
      const { resume, resumeId } = payload as { resume: unknown; resumeId?: string };
      if (!resume) return json({ error: "resume required" }, 400);
      const structured = await scoreResumeContent(resume);
      // Cache onto the resume row (if this is the primary one) so the
      // tailoring flow can show the same score without paying for another
      // AI call every time a job is opened.
      if (resumeId) {
        await adminDiag.from("resumes")
          .update({ ats_score: structured.ats_score ?? null, ats_issues: structured.issues ?? [] })
          .eq("id", resumeId).eq("user_id", user.id);
      }
      return json(structured);
    }

    // ---------------- rewrite (the paid resume optimizer) ----------------
    if (action === "rewrite") {
      const adminRewrite = createClient(supabaseUrl, serviceKey);
      { const off = await featureGate(adminRewrite, "tailoring"); if (off) return off; }
      const creditGate = await assertCredits(adminRewrite, user.id, COST_OPTIMIZE, "resume optimization");
      if (creditGate) return creditGate;
      const { resume, jdText } = payload as { resume: unknown; jdText?: string };
      // Generation only — this call's one job is writing, not grading its
      // own writing. Temperature is allowed to run a bit higher than the
      // scoring call because natural, human-sounding phrasing genuinely
      // needs some variation; the score is computed afterward by a separate,
      // low-temperature, single-purpose call (scoreResumeContent) so the
      // two stochastic jobs never contaminate each other's number.
      const r = await callAI({
        // v3.97.0 — was QUALITY_MODEL (gemini-2.5-pro), measured live at 176s
        // for one call, past this app's own 150s idle timeout. Swapped to
        // the flash tier for latency; scoring already ran on this same tier
        // (scoreResumeContent) with no quality complaint.
        model: DEFAULT_MODEL,
        temperature: 0.3,
        system: `You rewrite a resume to be stronger and more ATS-friendly, without inventing anything, and it must read like a real person wrote it. RULES:
1. NEVER invent or imply experience, employers, titles, dates, or numbers that are not already in the resume.
2. Rewrite every bullet to lead with a strong, specific action verb and, where the underlying fact supports it, surface the result with a real number already implied by the content — do not fabricate a metric that is not there. One bullet, one idea, one line where possible — this has to fit on one page.
3. Keep every company name, job title, and date exactly as given; write dates consistently as "Month YYYY".
4. Tighten vague or generic lines into specific ones using only what is already true.
5. WRITE LIKE A PERSON, NOT A TEMPLATE. Ban these entirely: "proven ability to", "proven track record of", "results-driven", "dynamic professional", "leveraging", "spearheaded transformational initiatives", "passionate about", "in today's fast-paced", any summary sentence that could be copy-pasted onto a stranger's resume unchanged. Prefer plain, direct, specific sentences over dense corporate phrasing. Vary sentence length and structure like a human writer would, not a repeating pattern.
6. skills must be ATOMIC: one skill name per array entry (e.g. "React", "Stakeholder management"), never a category label with a colon and a comma-separated list crammed into one entry. Group related skills by ORDER in the array, not by writing a label into the string.
7. If a job description is provided, weave in its keywords only where the person's real experience already supports them.
8. No em dashes, no en dashes. Ranges use the word "to".
9. The summary's first sentence must open by naming the candidate's own current or most recent job title (their real title, never an invented one, and never the job description's title unless it already matches). A recruiter's fast scan and an ATS both check for a title match before anything else, so it cannot be buried in the second sentence.
10. basics.title (the resume's own header line, separate from any job's title in the work array) must be the candidate's own current or most recent job title, taken from their most recent role in the resume. If basics.title arrives empty, fill it from their most recent work entry's title, never from the job description, and never with a higher seniority word ("Senior", "Lead", "Staff", "Principal") than their real title already has.
Return the complete improved resume in the same schema, plus suggestions: an array of short strings describing what you changed and why.`,
        user: JSON.stringify({ resume, jdText: jdText ?? "" }).slice(0, 40000),
        toolName: "emit_rewrite",
        toolSchema: {
          type: "object",
          properties: {
            resume: RESUME_SCHEMA,
            suggestions: { type: "array", items: { type: "string" } },
          },
          required: ["resume", "suggestions"],
        },
      });
      const rewritten = r.structured as { resume?: unknown; suggestions?: string[] } | undefined;
      if (!rewritten?.resume) return json({ error: "Failed to rewrite resume" }, 500);
      const scored = await scoreResumeContent(rewritten.resume);
      const chargeRewrite = await creditSpend(adminRewrite, user.id, COST_OPTIMIZE, "resume_optimize");
      if (!chargeRewrite.ok) return insufficientCredits(chargeRewrite.balance, COST_OPTIMIZE, "resume optimization");
      return json({
        resume: rewritten.resume,
        suggestions: rewritten.suggestions ?? [],
        ats_score: scored.ats_score,
        verdict: scored.verdict,
        credits: { spent: COST_OPTIMIZE, balance: chargeRewrite.balance },
      });
    }

    // ---------------- match ----------------
    // v3.72.0 — this used to be a bare prompt handed the client's raw resume
    // JSON: no canonical profile (skills with levels, certifications, work
    // auth, known_for — everything Profile actually collects), no
    // deterministic gap analysis, no honesty rule, no temperature control,
    // no cache. The extension's ext_job_score has always had all five. Same
    // response shape as before (score 0-100 / breakdown / missing_keywords /
    // summary) so JobsTab.tsx needed no changes — only what grounds the
    // number changed.
    if (action === "match") {
      const adminMatch = createClient(supabaseUrl, serviceKey);
      { const off = await featureGate(adminMatch, "tailoring"); if (off) return off; }
      const matchStarted = Date.now();
      const { jdText } = payload as { jdText: string };
      if (!jdText) return json({ error: "jdText required" }, 400);

      const [identity, canonical] = await Promise.all([
        loadIdentity(adminMatch, user.id, {}).catch(() => null),
        loadCanonical(adminMatch, user.id),
      ]);
      const bundle = buildSections(identity, canonical);
      if (!bundle.text || bundle.chars < 60) return json({ error: "No resume content available to score" }, 400);
      const gap = computeGap(jdText, bundle);
      const canonText = canonicalDigest(canonical);

      const userSkillIndex = new Map<string, string>();
      if (canonical) {
        for (const s of canonical.skills) { const name = String(s?.name || ""); const k = name.toLowerCase().trim(); if (k) userSkillIndex.set(k, name); }
        for (const t of (canonical.derived.top_skills || [])) { const k = String(t).toLowerCase().trim(); if (k && !userSkillIndex.has(k)) userSkillIndex.set(k, String(t)); }
      }

      const jdHash = (await sha256b(jdText)).slice(0, 24);
      const sectionHash = (await sha256b(bundle.text + canonText)).slice(0, 16);
      const cacheKey = `webmatch:${user.id}:${sectionHash}:${jdHash}`;
      const cached = await cacheGet<Record<string, unknown>>(adminMatch, cacheKey);
      if (cached) {
        logAiCall(adminMatch, {
          user_id: user.id, purpose: "job_score_web", cache_hit: true, duration_ms: Date.now() - matchStarted,
          source_map: identity?.sourceMap() || null, gap_matched: gap.matched.length, gap_missing: gap.missing.length,
        });
        return json({ ...cached, cached: true });
      }

      const r = await callAI({
        temperature: 0.1,
        system: `You are a senior recruiter. Score how well this candidate matches the job description, grounded ONLY in the sections and the deterministic gap analysis below — the gap analysis already computed what is present and missing, do not re-derive it from scratch.

Return score 0-100, breakdown { skills_match, experience_match, education_match } each 0-100, missing_keywords (drawn from the gap analysis's "REQUIRED BUT NOT EVIDENCED" and "NICE TO HAVE" lists, in the JD's own wording), and summary (2-3 plain sentences, no clichés, no em dashes, no en dashes).

HONESTY RULE (HARD): only describe a skill as matched if it appears in CANONICAL_SKILLS or the APPLICANT SECTIONS below. Never credit a skill the candidate has not evidenced. If unsure, treat it as missing.`,
        user: `CANONICAL_SKILLS: ${Array.from(userSkillIndex.values()).slice(0, 60).join(", ")}
CANONICAL_PROFILE_SUMMARY:
${canonText}

APPLICANT SECTIONS:
${bundle.text}

JOB DESCRIPTION:
${jdText.slice(0, 20000)}${renderGapBlock(gap)}`,
        toolName: "emit_match",
        toolSchema: {
          type: "object",
          properties: {
            score: { type: "integer" },
            breakdown: {
              type: "object",
              properties: {
                skills_match: { type: "integer" },
                experience_match: { type: "integer" },
                education_match: { type: "integer" },
              },
              required: ["skills_match", "experience_match", "education_match"],
            },
            missing_keywords: { type: "array", items: { type: "string" } },
            summary: { type: "string" },
          },
          required: ["score", "breakdown", "missing_keywords", "summary"],
        },
      });

      cacheSet(adminMatch, cacheKey, user.id, "job_score_web", r.structured as Record<string, unknown>, 24 * 60 * 60 * 1000);
      logAiCall(adminMatch, {
        user_id: user.id, purpose: "job_score_web", model: DEFAULT_MODEL, duration_ms: Date.now() - matchStarted,
        cache_hit: false, source_map: identity?.sourceMap() || null,
        gap_matched: gap.matched.length, gap_missing: gap.missing.length,
        meta: { jd_chars: jdText.length, section_chars: bundle.chars },
      });
      return json(r.structured);
    }

    // v3.72.0 — same rebuild as `match` above. This used to take the
    // client's raw resume JSON as its only source of truth: no canonical
    // profile (so skill levels, certifications, known_for, work history
    // achievements added in Profile were invisible to it), no deterministic
    // gap analysis to ground what to surface, no figure-preservation check,
    // no cache. handleSmartTailor (the extension's tailor) has always had
    // all four — it just outputs flat ATS text instead of a structured
    // resume, which this action genuinely still needs (JobsTab stores the
    // result as a resume_versions row and resumeDocs.ts builds a PDF/DOCX
    // straight from that structure), so the output schema stays RESUME_SCHEMA.
    // ---------------- tailor ----------------
    if (action === "tailor") {
      const adminTailor = createClient(supabaseUrl, serviceKey);
      { const off = await featureGate(adminTailor, "tailoring"); if (off) return off; }
      const tailorStarted = Date.now();
      const { jdText } = payload as { jdText: string };
      if (!jdText) return json({ error: "jdText required" }, 400);

      const [identity, canonical] = await Promise.all([
        loadIdentity(adminTailor, user.id, {}).catch(() => null),
        loadCanonical(adminTailor, user.id),
      ]);
      const bundle = buildSections(identity, canonical);
      if (!bundle.text || bundle.chars < 60) return json({ error: "No resume content available to tailor" }, 400);
      const gap = computeGap(jdText, bundle);

      const jdHash = (await sha256b(jdText)).slice(0, 24);
      const sectionHash = (await sha256b(bundle.text)).slice(0, 16);
      const cacheKey = `webtailor:${user.id}:${sectionHash}:${jdHash}`;
      const cached = await cacheGet<{ resume: unknown }>(adminTailor, cacheKey);
      if (cached) {
        logAiCall(adminTailor, {
          user_id: user.id, purpose: "tailor_web", cache_hit: true, duration_ms: Date.now() - tailorStarted,
          source_map: identity?.sourceMap() || null, gap_matched: gap.matched.length, gap_missing: gap.missing.length,
        });
        return json({ ...cached, credits: { spent: 0, balance: null } });
      }

      // Gate only after a possible cache hit, so a repeat tailor of the same
      // resume against the same JD never costs a second charge.
      const creditGate = await assertCredits(adminTailor, user.id, COST_TAILOR, "tailored resume");
      if (creditGate) return creditGate;

      const applicantBlock = identity ? identityContactBlock(identity) : "";
      const applicantSection = applicantBlock
        ? `\n\nAPPLICANT HEADER (use these exact contact details, never invent alternatives):\n${applicantBlock}`
        : "";
      const droppedNote = bundle.dropped.length
        ? `\n\nNOTE: these sections were omitted to fit the budget and must not be referenced: ${bundle.dropped.join(", ")}.`
        : "";
      const system = `You are an expert Canadian resume writer. Tailor the candidate's resume to the job description using their full profile below, WITHOUT inventing anything.

RULES — YOU MUST FOLLOW EVERY ONE:
1. NEVER invent, add, or imply experience, skills, tools, certifications, or achievements not already present in APPLICANT SECTIONS.
2. ONLY reword existing bullets to naturally include job keywords where the underlying experience already supports it.
3. Keep every fact, number, percentage, company name, date, and result exactly as-is.
4. You may reorder skills to put the most relevant first, among skills the candidate actually has.
5. You may adjust the summary to echo 2-3 key phrases from the job description — only using experience already in APPLICANT SECTIONS. Its first sentence must still open by naming the candidate's own current or most recent job title.
6. Do NOT change job titles, company names, or dates. This includes basics.title (the resume's own header line): it must be the candidate's own current or most recent job title, taken from their most recent role in APPLICANT SECTIONS. If it arrives empty, fill it from their most recent work entry's title, never from the job description, and never with a higher seniority word ("Senior", "Lead", "Staff", "Principal") than their real title already has.
7. Address the GAP ANALYSIS's "REQUIRED BUT NOT EVIDENCED" items wherever real related experience exists in APPLICANT SECTIONS; stay silent where it does not. Do not add a new claim just to fix a gap.
8. No em dashes. No en dashes. Write dates as "2023 to Present".
9. WRITE LIKE A PERSON, NOT A TEMPLATE. Ban these entirely: "proven ability to", "proven track record of", "results-driven", "dynamic professional", "leveraging", "spearheaded transformational initiatives", "passionate about", "in today's fast-paced", any summary sentence that could be copy-pasted onto a stranger's resume unchanged. Prefer plain, direct, specific sentences over dense corporate phrasing.
10. Return the tailored resume in the RESUME_SCHEMA shape.`;
      const userMsg = `APPLICANT SECTIONS (the only source of truth about this person):
${bundle.text}${applicantSection}${droppedNote}

JOB DESCRIPTION:
${jdText.slice(0, 20000)}${renderGapBlock(gap)}`;

      // v3.97.0 — was QUALITY_MODEL (gemini-2.5-pro): a real tailor_web call
      // measured 176s, past this app's own 150s idle timeout. Flash tier.
      let r = await callAI({ model: DEFAULT_MODEL, temperature: 0.2, system, user: userMsg, toolName: "emit_resume", toolSchema: RESUME_SCHEMA });

      // FIGURE PRESERVATION — verified in code, not just asked for, same as
      // the extension's tailor. Stringifying the structured output is enough
      // to check every number/percentage/date survived somewhere in it.
      let missingFigures = droppedFigures(bundle.text, JSON.stringify(r.structured));
      if (missingFigures.length) {
        const retry = await callAI({
          model: DEFAULT_MODEL, temperature: 0.2, system,
          user: `${userMsg}\n\nPREVIOUS ATTEMPT DROPPED OR ALTERED THESE FIGURES: ${missingFigures.slice(0, 30).join(", ")}\nProduce the tailored resume again with every one of those figures present, unchanged, in the bullet it belongs to.`,
          toolName: "emit_resume", toolSchema: RESUME_SCHEMA,
        });
        const stillMissing = droppedFigures(bundle.text, JSON.stringify(retry.structured));
        if (stillMissing.length < missingFigures.length) { r = retry; missingFigures = stillMissing; }
      }

      const chargeTailor = await creditSpend(adminTailor, user.id, COST_TAILOR, "tailored_resume");
      if (!chargeTailor.ok) return insufficientCredits(chargeTailor.balance, COST_TAILOR, "tailored resume");

      // v3.99.0 — was computed and logged (gap_matched/gap_missing above)
      // but never actually sent back. JobsTab uses this to let the person
      // decide, on their own, whether to add a genuinely missing skill or
      // align the header title to the job's — nothing here is applied
      // automatically, this is only the raw material for that choice.
      const result = {
        resume: r.structured,
        gapAnalysis: { missing: gap.missing.map((req) => req.text).slice(0, 6) },
      };
      cacheSet(adminTailor, cacheKey, user.id, "tailor_web", result, TAILOR_TTL);
      logAiCall(adminTailor, {
        user_id: user.id, purpose: "tailor_web", model: DEFAULT_MODEL, duration_ms: Date.now() - tailorStarted,
        cache_hit: false, source_map: identity?.sourceMap() || null,
        gap_matched: gap.matched.length, gap_missing: gap.missing.length,
        meta: { jd_chars: jdText.length, section_chars: bundle.chars, figures_ok: missingFigures.length === 0 },
      });
      return json({ ...result, credits: { spent: COST_TAILOR, balance: chargeTailor.balance } });
    }

    // ---------------- cover_letter ----------------
    if (action === "cover_letter") {
      const adminCover = createClient(supabaseUrl, serviceKey);
      { const off = await featureGate(adminCover, "tailoring"); if (off) return off; }
      const coverStarted = Date.now();
      const { jdText, tone, company } = payload as { jdText: string; tone?: string; company?: string };
      if (!jdText) return json({ error: "jdText required" }, 400);

      const [identity, canonical, companyCtx] = await Promise.all([
        loadIdentity(adminCover, user.id, {}).catch(() => null),
        loadCanonical(adminCover, user.id),
        fetchCompanyContext(adminCover, company || "").catch(() => ({ text: "", source: "" })),
      ]);
      const bundle = buildSections(identity, canonical);
      if (!bundle.text || bundle.chars < 60) return json({ error: "No resume content available" }, 400);
      const gap = computeGap(jdText, bundle);

      const jdHash = (await sha256b(jdText)).slice(0, 24);
      const sectionHash = (await sha256b(bundle.text)).slice(0, 16);
      const cacheKey = `webcover:${user.id}:${sectionHash}:${jdHash}:${await sha256b(tone || "")}`;
      const cached = await cacheGet<{ body: string }>(adminCover, cacheKey);
      if (cached) {
        logAiCall(adminCover, {
          user_id: user.id, purpose: "cover_letter_web", cache_hit: true, duration_ms: Date.now() - coverStarted,
          source_map: identity?.sourceMap() || null,
        });
        return json({ ...cached, credits: { spent: 0, balance: null } });
      }

      const creditGate = await assertCredits(adminCover, user.id, COST_COVER, "cover letter");
      if (creditGate) return creditGate;

      const applicantBlock = identity ? identityContactBlock(identity) : "";
      const applicantSection = applicantBlock
        ? `\n\nAPPLICANT (use these exact contact details in the header and signature, never invent alternatives):\n${applicantBlock}`
        : "";
      const companySection = companyCtx.text
        ? `\n\nCOMPANY CONTEXT (from ${companyCtx.source}, the employer's own public page):\n${companyCtx.text}`
        : "";
      const system = `Write a concise, specific cover letter (under 280 words). Tone: ${tone || "professional, warm"}. Address ${company || "the hiring team"}.

STRUCTURE (4 short paragraphs, body text only — no address block, no date, no "Dear ..." salutation placeholders, no bracketed fields of any kind):
1) Opening: who you are, the specific role, and one specific thing about this employer drawn from COMPANY CONTEXT if present; otherwise open with the role and the candidate's most relevant strength.
2) Proof: one concrete achievement from the sections that maps to a stated requirement, with the real number if the sections have one.
3) Skill bridge: two or three specific tools or skills the job asks for that the sections genuinely support.
4) Close: a clear ask for a conversation, then sign off with the applicant's real name only.

RULES:
- Use ONLY facts from APPLICANT SECTIONS, the APPLICANT block, and COMPANY CONTEXT. Never invent companies, metrics, dates, names, emails, or phone numbers.
- Never alter a number, percentage, currency figure, headcount, timeframe, date, or job title from what appears in the sections.
- Do not claim any requirement listed as "REQUIRED BUT NOT EVIDENCED" in the gap analysis below unless real related experience is in the sections.
- Never write a placeholder in brackets like "[Hiring Manager name]" — if you do not know a detail, leave it out entirely.
- No clichés ("I am excited to", "leverage", "passionate", "in today's fast-paced"). Voice: write the way a thoughtful person writes. Vary sentence length, plain natural language, no em dashes, no en dashes, never use ' - ' as a connector. Write ranges with the word 'to'.`;
      const userMsg = `APPLICANT SECTIONS:\n${bundle.text}${applicantSection}${companySection}\n\nJOB DESCRIPTION:\n${jdText.slice(0, 20000)}${renderGapBlock(gap)}`;

      const r = await callAI({ system, user: userMsg });
      const chargeCover = await creditSpend(adminCover, user.id, COST_COVER, "cover_letter");
      if (!chargeCover.ok) return insufficientCredits(chargeCover.balance, COST_COVER, "cover letter");

      const result = { body: r.text };
      cacheSet(adminCover, cacheKey, user.id, "cover_letter_web", result, TAILOR_TTL);
      logAiCall(adminCover, {
        user_id: user.id, purpose: "cover_letter_web", duration_ms: Date.now() - coverStarted, cache_hit: false,
        source_map: identity?.sourceMap() || null, meta: { jd_chars: jdText.length, section_chars: bundle.chars },
      });
      return json({ ...result, credits: { spent: COST_COVER, balance: chargeCover.balance } });
    }

    // ── NEW ACTIONS (JWT auth) ──
    // These run after JWT validation using supa client with RLS
    const userId = user.id;
    const adminForNew = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    // v3.24.0 — every AI call made below is attributed to this person and action.
    setAiCtx(adminForNew, userId, String(action || "unknown"));
    { const off = await featureGate(adminForNew, "platform"); if (off) return off; }
    // v3.25.0 — one place that says which switch owns which action. Reading
    // history (assessment_list, employer_assessment_list) is never gated.
    {
      const owner = ACTION_FLAG[String(action || "")];
      if (owner) { const off = await featureGate(adminForNew, owner); if (off) return off; }
    }
    // v3.28.0 — the same shape, one account at a time. Global switch first,
    // then this person's suspension, then the capability they are restricted from.
    {
      const blocked = await accountGate(adminForNew, userId, String(action || ""));
      if (blocked) return blocked;
    }




    // ─────────────────────────────────────────────────────────────
    // v3.14.0 — Billing
    // ─────────────────────────────────────────────────────────────
    const isPlatformAdmin = async (): Promise<boolean> => {
      const { data } = await adminForNew.from("user_roles")
        .select("role").eq("user_id", userId).eq("role", "admin").maybeSingle();
      return !!data;
    };

    if (action === "plans_list") {
      const { data } = await adminForNew.from("plans")
        .select("key, audience, name, price_cents, interval, credits, proposals_limit, assessments_limit, sort")
        .eq("active", true).order("sort");
      return json({ plans: data || [] });
    }

    // Seeker: plan, balance, renewal date, recent ledger.
    if (action === "billing_get") {
      const sub = await billingEnsure(adminForNew, userId, "seeker");
      const [{ data: plan }, balance, { data: ledger }] = await Promise.all([
        adminForNew.from("plans").select("key, name, price_cents, interval, credits")
          .eq("key", sub?.plan_key || "seeker_free").maybeSingle(),
        creditBalance(adminForNew, userId),
        adminForNew.from("credit_ledger").select("delta, reason, balance_after, created_at")
          .eq("user_id", userId).order("created_at", { ascending: false }).limit(20),
      ]);
      return json({
        plan: plan || null,
        status: sub?.status || "active",
        balance,
        current_period_end: sub?.current_period_end || null,
        costs: { tailored_resume: COST_TAILOR, cover_letter: COST_COVER },
        ledger: ledger || [],
      });
    }

    // Employer: plan, what is used this period, trial end.
    if (action === "employer_billing_get") {
      const { org_id } = payload as { org_id?: string };
      if (!org_id) return json({ error: "org_id required" }, 400);
      if (!(await assertOrgMember(org_id))) return json({ error: "not an org member" }, 403);
      const b = await employerBilling(adminForNew, userId, org_id);
      // v3.29.0 — the surface reads the limits actually in force, not the raw plan.
      return json({
        ...b,
        plan: {
          ...b.plan,
          proposals_limit: effectiveLimit(b, "proposal").limit,
          assessments_limit: effectiveLimit(b, "assessment").limit,
          searches_limit: effectiveLimit(b, "search").limit,
        },
        plan_limits: {
          proposals_limit: b.plan.proposals_limit,
          assessments_limit: b.plan.assessments_limit,
          searches_limit: b.plan.searches_limit,
        },
        overridden: !!b.override,
        search_soft_cap: EMPLOYER_SEARCH_SOFT_CAP,
      });
    }

    // Payments are not wired yet, so an upgrade records intent and the team follows up.
    if (action === "billing_upgrade_intent") {
      const { plan_key, note } = payload as { plan_key?: string; note?: string };
      if (!plan_key) return json({ error: "plan_key required" }, 400);
      const { data: plan } = await adminForNew.from("plans").select("key, name").eq("key", plan_key).maybeSingle();
      if (!plan) return json({ error: "unknown plan" }, 404);
      await adminForNew.from("upgrade_intents").insert({
        user_id: userId, plan_key, note: String(note || "").slice(0, 500) || null,
      });
      return json({ ok: true, plan: plan.name, message: "Thanks. We will be in touch to set up billing." });
    }

    // ---- Admin: employer access requests ----
    if (action === "admin_employer_list") {
      if (!(await isPlatformAdmin())) return json({ error: "admin only" }, 403);
      const { data: accounts } = await adminForNew.from("employer_accounts")
        .select("id, user_id, company_name, status, created_at, approved_at, package_notes")
        .order("created_at", { ascending: false }).limit(200);
      const ids = (accounts || []).map(a => a.user_id);
      const [{ data: profiles }, { data: members }, { data: subs }] = await Promise.all([
        ids.length ? adminForNew.from("profiles").select("user_id, email, full_name").in("user_id", ids) : { data: [] },
        ids.length ? adminForNew.from("org_members").select("user_id, org_id").in("user_id", ids) : { data: [] },
        ids.length ? adminForNew.from("subscriptions").select("user_id, plan_key, status, current_period_start, current_period_end, trial_ends_at").in("user_id", ids) : { data: [] },
      ]);
      const orgIds = [...new Set((members || []).map(m => m.org_id))];
      const { data: orgs } = orgIds.length
        ? await adminForNew.from("orgs").select("id, name, website, industry, company_size, headquarters, about").in("id", orgIds)
        : { data: [] };
      const orgByUser = new Map((members || []).map(m => [m.user_id, (orgs || []).find(o => o.id === m.org_id) || null]));
      const profByUser = new Map((profiles || []).map(p => [p.user_id, p]));
      const subByUser = new Map((subs || []).map(s => [s.user_id, s]));

      const rows = [];
      for (const a of (accounts || [])) {
        const org = orgByUser.get(a.user_id) as Record<string, unknown> | null;
        const sub = subByUser.get(a.user_id) || null;
        let usage = null;
        if (org?.id && sub) {
          const b = await employerBilling(adminForNew, a.user_id, String(org.id));
          usage = {
            plan: b.plan.name, proposals_used: b.proposals_used, proposals_limit: effectiveLimit(b, "proposal").limit,
            assessments_used: b.assessments_used, assessments_limit: effectiveLimit(b, "assessment").limit,
            searches_used: b.searches_used, searches_limit: effectiveLimit(b, "search").limit,
            overridden: !!b.override,
            period_end: b.current_period_end,

          };
        }
        rows.push({
          id: a.id, user_id: a.user_id, status: a.status,
          company_name: org?.name || a.company_name,
          website: org?.website || null, industry: org?.industry || null,
          company_size: org?.company_size || null, headquarters: org?.headquarters || null,
          about: org?.about || null,
          email: profByUser.get(a.user_id)?.email || null,
          contact_name: profByUser.get(a.user_id)?.full_name || null,
          requested_at: a.created_at, approved_at: a.approved_at,
          note: a.package_notes,
          subscription: sub, usage,
        });
      }
      return json({ employers: rows });
    }

    if (action === "admin_employer_decide") {
      if (!(await isPlatformAdmin())) return json({ error: "admin only" }, 403);
      const { user_id, decision, note } = payload as { user_id?: string; decision?: string; note?: string };
      if (!user_id || !["approve", "decline", "suspend"].includes(String(decision))) {
        return json({ error: "user_id and a decision of approve, decline or suspend are required" }, 400);
      }
      // Declined and suspended are different things: declined never got in,
      // suspended was approved and then stopped.
      const status = decision === "approve" ? "approved" : decision === "decline" ? "declined" : "suspended";

      const { error } = await adminForNew.from("employer_accounts").update({
        status,
        approved_at: decision === "approve" ? new Date().toISOString() : null,
        approved_by: userId,
        package_notes: String(note || "").slice(0, 500) || null,
      }).eq("user_id", user_id);
      if (error) return json({ error: error.message }, 500);
      // Approval starts the free month automatically.
      if (decision === "approve") await billingEnsure(adminForNew, user_id, "employer");
      return json({ ok: true, status });
    }





    // ---------------- Canonical Profile (Phase 1) ----------------
    // profile_canonical_get: load the saved canonical profile (empty shell if none)
    if (action === "profile_canonical_get") {
      const canonical = await loadCanonical(adminForNew, userId);
      return json({ canonical: canonical || EMPTY_CANONICAL, hasProfile: !!canonical });
    }

    // profile_canonical_extract: run AI to (re)build canonical from primary resume + user_profile_data.
    // Does NOT save automatically; UI shows the result for confirmation/edit.
    if (action === "profile_canonical_extract") {
      const [{ data: resume }, { data: profile }] = await Promise.all([
        adminForNew.from("resumes").select("content").eq("user_id", userId).eq("is_primary", true).maybeSingle(),
        adminForNew.from("user_profile_data").select("*").eq("user_id", userId).maybeSingle(),
      ]);
      if (!resume?.content && !profile) return json({ error: "No primary resume or profile to extract from" }, 404);
      const canonical = await extractCanonical({
        resumeContent: resume?.content || null,
        profileExtras: profile || null,
      });
      return json({ canonical });
    }

    // profile_canonical_save: persist user-edited canonical profile (upsert by user_id).
    if (action === "profile_canonical_save") {
      const { canonical } = payload as { canonical?: Partial<CanonicalProfile> };
      if (!canonical || typeof canonical !== "object") return json({ error: "canonical required" }, 400);
      const row = {
        user_id: userId,
        skills: canonical.skills ?? [],
        experiences: canonical.experiences ?? [],
        education: canonical.education ?? [],
        certifications: canonical.certifications ?? [],
        work_auth: canonical.work_auth ?? {},
        preferences: canonical.preferences ?? {},
        derived: canonical.derived ?? {},
        updated_at: new Date().toISOString(),
      };
      const { error } = await adminForNew.from("user_profile_canonical")
        .upsert(row, { onConflict: "user_id" });
      if (error) return json({ error: error.message }, 500);
      // v2.9.0-A: re-index this user for the talent pool if they've opted in.
      reindexIfOptedIn(adminForNew, userId);
      return json({ ok: true });
    }

    // ─────────────────────────────────────────────────────────────
    // v2.9.0-A — Talent Pool (Phase A: data layer)
    // Seeker-side consent + indexing. Employer search lives in Phase B
    // and runs via the service role, gated on opted_in.
    // ─────────────────────────────────────────────────────────────
    if (action === "talent_pool_get") {
      // v3.2.0 — the Hub renders the employer-facing preview, skills split by
      // provenance, and a freshness line, so this returns everything needed
      // for that in one round trip. v3.5.1 adds the consent wording version.
      const [{ data: consent }, { data: idx }, { data: skillRows }, { data: resumeRow }, { data: canonRow }] = await Promise.all([
        adminForNew.from("talent_pool_consent").select("opted_in, consented_at, consent_version").eq("user_id", userId).maybeSingle(),

        adminForNew.from("candidate_index")
          .select("headline, summary, seniority, location, years_experience, indexed_at, embedding_model")
          .eq("user_id", userId).maybeSingle(),
        adminForNew.from("candidate_skills").select("id, skill, provenance, source").eq("user_id", userId).order("provenance"),
        adminForNew.from("resumes").select("updated_at").eq("user_id", userId).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
        adminForNew.from("user_profile_canonical").select("updated_at").eq("user_id", userId).maybeSingle(),
      ]);
      const skills = (skillRows ?? []) as Array<{ id: string; skill: string; provenance: string; source: string }>;
      // v3.28.0 — say it plainly when an admin has taken this profile out of
      // the pool, instead of showing a toggle that quietly does nothing.
      const discoveryBlock = await discoveryRestriction(adminForNew, userId);
      return json({
        discovery_restricted: discoveryBlock.restricted,
        discovery_restriction_reason: discoveryBlock.reason,
        opted_in: !!consent?.opted_in,
        consented_at: consent?.consented_at ?? null,
        consent_version: (consent as { consent_version?: string } | null)?.consent_version ?? null,

        indexed: !!idx,
        skills_count: skills.length,
        preview: idx
          ? {
              headline: idx.headline ?? "",
              seniority: idx.seniority ?? "",
              location: idx.location ?? "",
              years_experience: idx.years_experience ?? null,
              indexed_at: idx.indexed_at ?? null,
              embedding_model: idx.embedding_model ?? null,
            }
          : null,
        skills,
        indexed_at: idx?.indexed_at ?? null,
        resume_updated_at: resumeRow?.updated_at ?? null,
        profile_updated_at: canonRow?.updated_at ?? null,
      });
    }

    // v3.33.0 — the acceptance itself is recorded by handle_new_user, inside
    // the same transaction as the account, so it cannot be skipped by a failed
    // request or a closed tab. This action only completes that row with the IP
    // address, which only the server can see, and it records a re-acceptance
    // of a newer version as a new row. Append only otherwise.
    if (action === "legal_consent_record") {
      const { terms_version, privacy_version, source } = payload as {
        terms_version?: string; privacy_version?: string; source?: string;
      };
      if (!terms_version || !privacy_version) {
        return json({ error: "terms_version and privacy_version required" }, 400);
      }
      const tv = String(terms_version).slice(0, 32);
      const pv = String(privacy_version).slice(0, 32);
      const fwd = req.headers.get("x-forwarded-for") || "";
      const ip = (fwd.split(",")[0] || req.headers.get("cf-connecting-ip") || "").trim() || null;
      const ua = (req.headers.get("user-agent") || "").slice(0, 500);

      const { data: existing } = await adminForNew
        .from("terms_consent_log")
        .select("id, ip_address, user_agent")
        .eq("user_id", userId)
        .eq("terms_version", tv)
        .eq("privacy_version", pv)
        .eq("terms_accepted", true)
        .order("accepted_at", { ascending: false })
        .limit(1);

      if (existing && existing.length > 0) {
        const row = existing[0] as { id: string; ip_address: string | null; user_agent: string | null };
        if (!row.ip_address || !row.user_agent) {
          const { error } = await adminForNew.from("terms_consent_log")
            .update({ ip_address: row.ip_address || ip, user_agent: row.user_agent || ua })
            .eq("id", row.id);
          if (error) return json({ error: error.message }, 500);
        }
        return json({ ok: true, completed: true });
      }

      const { error } = await adminForNew.from("terms_consent_log").insert({
        user_id: userId,
        terms_version: tv,
        privacy_version: pv,
        privacy_accepted: true,
        terms_accepted: true,
        ip_address: ip,
        source: source === "reaccept" ? "reaccept" : "signup",
        user_agent: ua,
      });
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }



    if (action === "talent_pool_set") {
      const { opted_in, consent_version } = payload as { opted_in?: boolean; consent_version?: string };
      if (typeof opted_in !== "boolean") return json({ error: "opted_in required" }, 400);
      // v3.28.0 — cannot opt back in while restricted from discovery.
      if (opted_in) {
        const block = await discoveryRestriction(adminForNew, userId);
        if (block.restricted) {
          return json({
            code: "account_restricted",
            error: "account_restricted",
            capability: "discovery",
            reason: block.reason,
            message: RESTRICTION_MESSAGE.discovery,
          }, 403);
        }
      }
      const now = new Date().toISOString();
      // v3.5.1 — record WHICH consent wording the user agreed to, so a future
      // copy change never leaves us guessing what they were shown.
      const row = {
        user_id: userId,
        opted_in,
        consented_at: opted_in ? now : null,
        revoked_at: opted_in ? null : now,
        consent_version: opted_in ? (consent_version || "v3.5.1-full-profile") : null,
        updated_at: now,
      };
      const { error } = await adminForNew.from("talent_pool_consent").upsert(row, { onConflict: "user_id" });
      if (error) return json({ error: error.message }, 500);

      if (opted_in) {
        try { await indexCandidate(adminForNew, userId); }
        catch (e) { console.error("indexCandidate failed", (e as Error).message); }
      } else {
        await Promise.all([
          adminForNew.from("candidate_index").delete().eq("user_id", userId),
          adminForNew.from("candidate_skills").delete().eq("user_id", userId),
        ]);
      }
      return json({ ok: true, opted_in });
    }

    // v2.9.1 — manual re-index (Talent Pool card "Re-index my profile" link).
    // Only useful when opted in; refreshes the caller's candidate_index row
    // with the current embedding model.
    if (action === "talent_pool_reindex_self") {
      const { data: consent } = await adminForNew.from("talent_pool_consent")
        .select("opted_in").eq("user_id", userId).maybeSingle();
      if (!consent?.opted_in) return json({ error: "Opt in first" }, 400);
      try {
        const result = await indexCandidate(adminForNew, userId);
        if (!result) return json({ error: "No profile to index" }, 400);
        return json(result);
      } catch (e) {
        return json({ error: (e as Error).message }, 500);
      }
    }





    // ─────────────────────────────────────────────────────────────
    // v2.9.0-B — Employer marketplace (Phase B)
    // Two-step noise cancellation:
    //   1. Deterministic prefilter: EVERY must-have must match an
    //      'extracted' skill (skill_norm or ≥0.8 token overlap).
    //      Inferred skills cannot rescue a missing must-have.
    //   2. AI rerank on ≤12 vector-recalled candidates, with opaque
    //      refs (no user_id/name/email), scored 1-100, inferred cap
    //      10 pts, "why" grounded in provided fields only.
    // ─────────────────────────────────────────────────────────────
    async function assertOrgMember(orgId: string): Promise<boolean> {
      const { data } = await adminForNew.from("org_members")
        .select("org_id").eq("org_id", orgId).eq("user_id", userId).maybeSingle();
      return !!data;
    }

    // v3.10.0 — the company profile a candidate reads on a proposal.
    const ORG_COLS = "id, name, website, industry, company_size, headquarters, about, logo_url, linkedin_url";

    // v3.11.0 — the company profile gate. A UI-only gate is not a gate, so
    // every action that searches for or contacts a candidate checks here too.
    const REQUIRED_ORG_FIELDS: [string, string][] = [
      ["name", "company name"],
      ["website", "website"],
      ["industry", "industry"],
      ["headquarters", "headquarters"],
      ["company_size", "company size"],
      ["about", "about paragraph"],
    ];
    const ABOUT_MIN = 80;

    /** Returns an error response when the org profile is incomplete, else null. */
    async function assertOrgProfileComplete(orgId: string): Promise<Response | null> {
      const { data: org } = await adminForNew.from("orgs")
        .select(ORG_COLS).eq("id", orgId).maybeSingle();
      if (!org) return json({ error: "org not found" }, 404);
      const missing: string[] = [];
      for (const [key, label] of REQUIRED_ORG_FIELDS) {
        const v = String((org as Record<string, unknown>)[key] ?? "").trim();
        if (!v || (key === "about" && v.length < ABOUT_MIN)) missing.push(label);
      }
      if (missing.length === 0) return null;
      return json({
        error: `Complete your company profile first. Still missing: ${missing.join(", ")}. Candidates see this on every proposal.`,
        missing_org_fields: missing,
      }, 428);
    }

    if (action === "employer_org_create") {
      const { name, website } = payload as { name?: string; website?: string };
      if (!name || !name.trim()) return json({ error: "name required" }, 400);
      const { data: org, error } = await adminForNew.from("orgs").insert({
        name: name.trim(), website: website?.trim() || null, created_by: userId,
      }).select(ORG_COLS).single();
      if (error || !org) return json({ error: error?.message || "insert failed" }, 500);
      const { error: mErr } = await adminForNew.from("org_members").insert({
        org_id: org.id, user_id: userId, role: "admin",
      });
      if (mErr) return json({ error: mErr.message }, 500);
      return json({ org });
    }

    if (action === "employer_org_get") {
      const { data: mem } = await adminForNew.from("org_members")
        .select("org_id, role").eq("user_id", userId).limit(1).maybeSingle();
      if (!mem) return json({ org: null });
      const { data: org } = await adminForNew.from("orgs")
        .select(ORG_COLS).eq("id", mem.org_id).maybeSingle();
      return json({ org: org || null, role: mem.role });
    }

    // v3.10.0 — every company profile field stays editable at any time.
    if (action === "employer_org_update") {
      const { org_id, patch } = payload as { org_id?: string; patch?: Record<string, unknown> };
      if (!org_id || !patch) return json({ error: "org_id and patch required" }, 400);
      if (!(await assertOrgMember(org_id))) return json({ error: "not an org member" }, 403);
      const allowed = ["name", "website", "industry", "company_size", "headquarters", "about", "logo_url", "linkedin_url"];
      const clean: Record<string, string | null> = {};
      for (const k of allowed) {
        if (!(k in patch)) continue;
        const raw = patch[k];
        const v = typeof raw === "string" ? raw.trim() : "";
        clean[k] = v ? (k === "about" ? v.slice(0, 600) : v.slice(0, 300)) : null;
      }
      if (clean.name === null) delete clean.name; // a company always has a name
      if (Object.keys(clean).length === 0) return json({ error: "nothing to update" }, 400);
      const { data: org, error } = await adminForNew.from("orgs")
        .update(clean).eq("id", org_id).select(ORG_COLS).maybeSingle();
      if (error) return json({ error: error.message }, 500);
      return json({ org });
    }

    // v3.10.0 — the in-progress intake survives leaving the page.
    if (action === "employer_intake_draft_get") {
      const { org_id } = payload as { org_id?: string };
      if (!org_id) return json({ error: "org_id required" }, 400);
      if (!(await assertOrgMember(org_id))) return json({ error: "not an org member" }, 403);
      const { data } = await adminForNew.from("employer_intake_drafts")
        .select("opening, job_spec, answered, phase, updated_at").eq("org_id", org_id).maybeSingle();
      return json({ draft: data || null });
    }

    if (action === "employer_intake_draft_save") {
      const { org_id, opening, job_spec, answered, phase } = payload as {
        org_id?: string; opening?: string; job_spec?: Record<string, unknown>;
        answered?: string[]; phase?: string;
      };
      if (!org_id) return json({ error: "org_id required" }, 400);
      if (!(await assertOrgMember(org_id))) return json({ error: "not an org member" }, 403);
      const { error } = await adminForNew.from("employer_intake_drafts").upsert({
        org_id,
        opening: String(opening || "").slice(0, 4000),
        job_spec: job_spec || {},
        answered: Array.isArray(answered) ? answered.slice(0, 32).map(String) : [],
        // v3.12.0 — phase now carries the step the employer was actually on,
        // as "asking:work_authorization", so a refresh restores the position
        // and not just the answers. 24 chars truncated the longest step key.
        phase: String(phase || "opening").slice(0, 64),

        updated_at: new Date().toISOString(),
      }, { onConflict: "org_id" });
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    if (action === "employer_intake_draft_clear") {
      const { org_id } = payload as { org_id?: string };
      if (!org_id) return json({ error: "org_id required" }, 400);
      if (!(await assertOrgMember(org_id))) return json({ error: "not an org member" }, 403);
      await adminForNew.from("employer_intake_drafts").delete().eq("org_id", org_id);
      return json({ ok: true });
    }

    // v3.8.0 — intake is a widget wizard on the client, not a conversation.
    // The model's only job here is to read the employer's opening description
    // once and prefill whatever fields it genuinely stated, so the wizard can
    // skip those questions. It never asks anything and never chats.
    if (action === "employer_spec_extract") {
      const { org_id, description } = payload as { org_id?: string; description?: string };
      if (!org_id || typeof description !== "string") return json({ error: "org_id and description required" }, 400);
      if (!(await assertOrgMember(org_id))) return json({ error: "not an org member" }, 403);
      const gate = await assertOrgProfileComplete(org_id);
      if (gate) return gate;
      const text = description.trim().slice(0, 4000);
      if (!text) return json({ job_spec: {}, known: [] });
      const sys = `You extract structured hiring criteria from one description of an open role. Output ONLY JSON, no prose:
{"job_spec":{"title":"","seniority":"","must_have_skills":[],"nice_to_have_skills":[],"location_preference":"","work_mode":"","employment_type":"","min_years":0,"work_authorization":"","notes":""},"known":[]}
Rules, strict:
- Only fill a field if the description actually states it. Leave anything unstated as an empty string, an empty array, or 0.
- "known" lists the field keys you filled from an explicit statement. Never list a field you guessed.
- seniority must be one of: intern, entry, mid, senior, staff_principal, manager, director_plus.
- work_mode must be one of: onsite, hybrid, remote.
- employment_type must be one of: full_time, contract, part_time, internship.
- work_authorization must be one of: authorized_required, open_to_sponsoring.
- Cap must_have_skills and nice_to_have_skills at 6 each. Skills are short plain names.
- Never invent a company, a salary, or a benefit. Never write em dashes or en dashes.`;
      const r = await callAI({ system: sys, user: text });
      let parsed: Record<string, unknown> = { job_spec: {}, known: [] };
      try { parsed = JSON.parse(r.text); }
      catch {
        const m = r.text.match(/\{[\s\S]*\}/);
        try { parsed = m ? JSON.parse(m[0]) : { job_spec: {}, known: [] }; } catch { /* keep default */ }
      }
      return json({ job_spec: parsed.job_spec || {}, known: Array.isArray(parsed.known) ? parsed.known : [] });
    }

    // v3.8.0 — the must-have and nice-to-have chip inputs autocomplete from
    // skills that actually exist on opted-in candidates, with a live count, so
    // an employer cannot filter the pool down to zero on a skill nobody has.
    if (action === "employer_skill_catalog") {
      const { org_id } = payload as { org_id?: string };
      if (!org_id) return json({ error: "org_id required" }, 400);
      if (!(await assertOrgMember(org_id))) return json({ error: "not an org member" }, 403);

      const { data: consented } = await adminForNew.from("talent_pool_consent")
        .select("user_id").eq("opted_in", true);
      // v3.28.0 — a person restricted from discovery is not in the pool.
      const consentedIds = (consented || []).map(r => r.user_id);
      const hiddenCatalog = await discoveryRestrictedIds(adminForNew, consentedIds);
      const ids = consentedIds.filter(id => !hiddenCatalog.has(id));
      if (ids.length === 0) return json({ pool_size: 0, skills: [] });

      const { data: rows } = await adminForNew.from("candidate_skills")
        .select("user_id, skill, skill_norm, provenance").in("user_id", ids)
        .eq("provenance", "extracted");
      const byNorm = new Map<string, { label: string; users: Set<string> }>();
      for (const r of (rows || [])) {
        const norm = String(r.skill_norm || "").trim();
        if (!norm) continue;
        if (!byNorm.has(norm)) byNorm.set(norm, { label: String(r.skill || norm), users: new Set() });
        byNorm.get(norm)!.users.add(r.user_id);
      }
      const skills = [...byNorm.entries()]
        .map(([norm, v]) => ({ skill: v.label, skill_norm: norm, count: v.users.size }))
        .sort((a, b) => b.count - a.count || a.skill_norm.localeCompare(b.skill_norm))
        .slice(0, 500);
      return json({ pool_size: ids.length, skills });
    }

    // v3.9.0 — the free-form results chat is gone. It produced a wrong role
    // reference, a self contradiction about years of experience, and it leaked
    // the internal ref "c1" to the employer. Two structured actions replace it:
    // employer_card_answer (four fixed questions, grounded in the stored cards)
    // and employer_draft_proposal (a pre-written proposal message).
    // Neither ever loads PII: the stored cards are opaque refs only.

    /** Human role line built from the stored spec, so the model never invents one. */
    const SENIORITY_LABEL: Record<string, string> = {
      intern: "intern", entry: "entry level", mid: "mid level", senior: "senior",
      staff_principal: "staff or principal", manager: "manager", director_plus: "director or above",
    };
    const EMPLOYMENT_LABEL_FN: Record<string, string> = {
      full_time: "full time", contract: "contract", part_time: "part time", internship: "internship",
    };
    function roleLine(spec: Record<string, unknown>): string {
      const title = String(spec?.title || "").trim() || "this role";
      const sen = SENIORITY_LABEL[String(spec?.seniority || "")] || "";
      if (!sen) return title;
      // Reproduced live: a job_spec.title of "Senior Wrenlathe Engineer" plus
      // seniority "senior" always prepended the label regardless, producing
      // "a senior Senior Wrenlathe Engineer" in drafted proposals -- most real
      // senior/staff/director/manager titles already say so themselves. Skip
      // prepending when the title already carries one of the seniority's own
      // words.
      const titleLower = title.toLowerCase();
      const senWords = sen.split(/\s+/).filter((w) => w !== "or" && w !== "level" && w !== "above");
      if (senWords.some((w) => titleLower.includes(w))) return title;
      return `${sen} ${title}`;
    }
    function safeCard(c: Record<string, unknown>) {
      return {
        score: c.score, headline: c.headline, seniority: c.seniority,
        first_name: c.first_name || "", // v3.15.1 — first name only, never more.
        years_experience: c.years_experience, location: c.location,
        matched_must_haves: c.matched_must_haves, gaps: c.gaps, why: c.why,
        skills_extracted: c.skills_extracted, skills_inferred: c.skills_inferred,
        summary: typeof c.summary === "string" ? c.summary.slice(0, 900) : "",
      };
    }
    /** Strip markdown symbols and any internal ref that slipped into model text. */
    function cleanEmployerText(s: string, name = ""): string {
      const who = name ? name : "this candidate";
      return String(s || "")
        .replace(/[*_#`]/g, "")
        .replace(/\bcandidate\s+c\d+\b/gi, who)
        .replace(/\bc\d+\b/g, who)
        .replace(/[—–]/g, " to ")
        .trim();
    }
    const VOICE_RULES = `- Plain prose. No markdown symbols, no asterisks, no bullet characters, no headings. Short sentences. No em dashes, no en dashes. Write ranges with the word "to".
- Never write an internal reference like c1 or c2. Refer to a candidate by their first name when one is given, otherwise say "this candidate". You do not know any last name, email or phone.
- Never praise without evidence from the data given. Never write perfect fit, huge asset, or exactly what you are looking for.
- If a fact is not in the data given, say that one fact is not available.  Never guess.`;


    if (action === "employer_card_answer") {
      const { search_id, ref, card } = payload as { search_id?: string; ref?: string; card?: string };
      const CARDS = ["why_score", "what_is_missing", "compare", "screen_questions"];
      if (!search_id || !ref || !card || !CARDS.includes(card)) {
        return json({ error: "search_id, ref and a valid card required" }, 400);
      }
      const { data: search } = await adminForNew.from("employer_searches")
        .select("id, org_id, job_spec, results").eq("id", search_id).maybeSingle();
      if (!search) return json({ error: "search not found" }, 404);
      if (!(await assertOrgMember(search.org_id))) return json({ error: "not an org member" }, 403);

      const cards = (Array.isArray(search.results) ? search.results : []) as Array<Record<string, unknown>>;
      const mine = cards.find(c => c.ref === ref);
      if (!mine) return json({ error: "unknown ref" }, 400);
      const spec = (search.job_spec || {}) as Record<string, unknown>;
      const years = mine.years_experience;

      const ASK: Record<string, string> = {
        why_score: `Explain why this candidate scored ${mine.score} out of 100 for this role. Use only the requirements they matched and the gaps recorded. At most 4 short sentences.`,
        what_is_missing: `List what is missing in this candidate against the role requirements, using only the recorded gaps and the must have skills they did not match. Nothing else. At most 4 short lines.`,
        compare: `Compare this candidate to the others returned by the same search, on the role requirements only. Say who is stronger on what. At most 4 short sentences. Refer to the others by their headline, never by a reference code.`,
        screen_questions: `Write exactly three screening questions to ask this candidate, each grounded in something specific in their recorded experience. One short question per line. No numbering symbols.`,
      };

      const sys = `You are AYN, answering one fixed question for an employer about one candidate from a search they just ran.

THE ROLE, use these words and never describe the role any other way: ${roleLine(spec)}.
${spec.employment_type ? `Employment type: ${EMPLOYMENT_LABEL_FN[String(spec.employment_type)] || String(spec.employment_type)}.` : ""}
${years !== null && years !== undefined ? `This candidate has ${years} years of experience. Use that number. Never say their experience is unspecified.` : `This candidate's years of experience were not recorded. If asked, say that one fact is not available.`}

Rules, strict:
- Answer only the question asked. Do not restate every skill with years. Do not summarise their whole background.
${VOICE_RULES}

ROLE SPEC: ${JSON.stringify(spec)}

THIS CANDIDATE: ${JSON.stringify(safeCard(mine))}

${card === "compare" ? `OTHER CANDIDATES IN THIS SEARCH: ${JSON.stringify(cards.filter(c => c.ref !== ref).map(safeCard))}` : ""}`;

      const r = await callAI({ system: sys, user: ASK[card] });
      return json({ answer: cleanEmployerText(r.text, String(mine.first_name || "")) });
    }

    // v3.9.0 — the proposal message arrives pre-written from the JobSpec and
    // this candidate's match result, so the employer edits instead of staring
    // at a blank box. Never blocks sending: the client falls back to empty.
    if (action === "employer_draft_proposal") {
      const { org_id, search_id, ref } = payload as { org_id?: string; search_id?: string; ref?: string };
      if (!org_id || !search_id || !ref) return json({ error: "org_id, search_id and ref required" }, 400);
      if (!(await assertOrgMember(org_id))) return json({ error: "not an org member" }, 403);
      const { data: search } = await adminForNew.from("employer_searches")
        .select("id, org_id, job_spec, results").eq("id", search_id).maybeSingle();
      if (!search || search.org_id !== org_id) return json({ error: "search not found" }, 404);

      const cards = (Array.isArray(search.results) ? search.results : []) as Array<Record<string, unknown>>;
      const mine = cards.find(c => c.ref === ref);
      if (!mine) return json({ error: "unknown ref" }, 400);
      const spec = (search.job_spec || {}) as Record<string, unknown>;
      const { data: org } = await adminForNew.from("orgs")
        .select("name, industry, company_size, headquarters, about, website").eq("id", org_id).maybeSingle();
      const company = String(org?.name || "our company");
      // v3.10.0 — the only company facts the model may use are the ones the
      // employer typed into their company profile. Nothing else exists.
      const companyFacts = {
        name: company,
        industry: org?.industry || null,
        company_size: org?.company_size || null,
        headquarters: org?.headquarters || null,
        about: org?.about || null,
      };

      // v3.12.0 — the old draft read like a match report read back to the
      // candidate ("9 years in product management, 5 years of experimentation,
      // all noted as must-have skills"). Nobody wants their own resume
      // recited at them. This is an invitation, written the way a good
      // recruiter writes a first email.
      const sys = `You write the first message an employer sends to a candidate they found through AYN. The candidate reads it inside AYN. It is an INVITATION, not an analysis of them.

THE ROLE, use these words and never describe the role any other way: ${roleLine(spec)} at ${company}.

Write exactly this shape, as plain prose in 4 to 6 short sentences:
1. A warm greeting. ${mine.first_name ? `Their first name is ${mine.first_name}, so open with "Hi ${mine.first_name}".` : `You do not know their name, so open with "Hi there".`}
2. One line saying who the company is and what it does, paraphrased only from COMPANY FACTS. If a fact is null it does not exist: never guess an industry, a size, a location, a mission, or a product.
3. One or two lines naming the role and saying, naturally, why the employer thinks they would be a good fit. At most TWO specifics about them, said in passing, in ordinary words.
4. A clear invitation to talk.
5. One line on what happens next: if they say yes, their contact details are shared and the employer reaches out directly.

Forbidden, without exception:
- Never list skills with years attached. Never write anything like "9 years in product management, 5 years of experimentation".
- Never mention more than two things about their background.
- Never write the phrase "must-have skills", "match", "score", "requirements", "gaps", or "profile".
- No bullet points, no headings, no numbered list in the output. Plain paragraphs only.
- No flattery, no sales language, no "perfect fit", no "impressive".
${VOICE_RULES}

COMPANY FACTS: ${JSON.stringify(companyFacts)}

ROLE SPEC: ${JSON.stringify({ title: spec.title, seniority: spec.seniority, employment_type: spec.employment_type, work_mode: spec.work_mode, location_preference: spec.location_preference })}

TWO THINGS YOU MAY MENTION ABOUT THEM, pick at most two and phrase them naturally: ${JSON.stringify({
        headline: mine.headline,
        strengths: (Array.isArray(mine.matched_must_haves) ? mine.matched_must_haves : []).slice(0, 3),
      })}`;


      const r = await callAI({ system: sys, user: "Write the message now. Output only the message text." });
      const message = cleanEmployerText(r.text, String(mine.first_name || "")).slice(0, 1000);
      return json({ subject_hint: `${String(spec.title || "A role")} at ${company}`, message });
    }



    if (action === "employer_match") {
      { const off = await featureGate(adminForNew, "candidate_search"); if (off) return off; }
      const { org_id, job_spec } = payload as { org_id?: string; job_spec?: Record<string, unknown> };
      if (!org_id || !job_spec) return json({ error: "org_id and job_spec required" }, 400);
      if (!(await assertOrgMember(org_id))) return json({ error: "not an org member" }, 403);
      const gate = await assertOrgProfileComplete(org_id);
      if (gate) return gate;

      // v3.27.0 — searches are a plan allowance like proposals and assessments.
      // Plans with no allowance recorded still hit the friendly soft abuse cap.
      const searchBilling = await employerBilling(adminForNew, userId, org_id);
      const searchGate = planLimitReached(searchBilling, "search");
      if (searchGate) return searchGate;
      if (effectiveLimit(searchBilling, "search").limit == null && searchBilling.searches_used >= EMPLOYER_SEARCH_SOFT_CAP) {
        return json({
          error: "search_soft_cap",
          code: "search_soft_cap",
          message: `You have run ${searchBilling.searches_used} searches this period, which is more than anyone hiring normally needs. Get in touch and we will lift the cap on your account.`,
        }, 429);
      }



      const mustHaves = Array.isArray(job_spec.must_have_skills) ? (job_spec.must_have_skills as string[]).map(s => String(s).toLowerCase().trim()).filter(Boolean) : [];
      const niceToHaves = Array.isArray(job_spec.nice_to_have_skills) ? (job_spec.nice_to_have_skills as string[]).map(s => String(s).toLowerCase().trim()).filter(Boolean) : [];

      // Load opted-in candidates.
      const { data: consented } = await adminForNew.from("talent_pool_consent")
        .select("user_id").eq("opted_in", true);
      // v3.28.0 — drop anyone an admin has restricted from discovery.
      const consentedMatchIds = (consented || []).map(r => r.user_id);
      const hiddenMatch = await discoveryRestrictedIds(adminForNew, consentedMatchIds);
      const candidateIds = consentedMatchIds.filter(id => !hiddenMatch.has(id));
      if (candidateIds.length === 0) {
        return json({ search_id: null, results: [], pool_note: "No candidates are in the pool yet." });
      }

      // Load their extracted skills (only extracted can satisfy must-haves).
      const { data: skillRows } = await adminForNew.from("candidate_skills")
        .select("user_id, skill_norm, provenance").in("user_id", candidateIds);
      const extractedByUser = new Map<string, Set<string>>();
      const inferredByUser = new Map<string, Set<string>>();
      for (const r of (skillRows || [])) {
        const bag = r.provenance === "extracted" ? extractedByUser : inferredByUser;
        if (!bag.has(r.user_id)) bag.set(r.user_id, new Set());
        bag.get(r.user_id)!.add(r.skill_norm);
      }

      const tokenOverlap = (a: string, b: string): number => {
        const ta = new Set(a.split(/[^a-z0-9]+/).filter(t => t.length >= 2));
        const tb = new Set(b.split(/[^a-z0-9]+/).filter(t => t.length >= 2));
        if (!ta.size || !tb.size) return 0;
        let inter = 0;
        for (const t of ta) if (tb.has(t)) inter++;
        return inter / Math.max(ta.size, tb.size);
      };
      const hasMust = (mh: string, bag: Set<string>): boolean => {
        if (bag.has(mh)) return true;
        for (const s of bag) if (tokenOverlap(mh, s) >= 0.8) return true;
        return false;
      };
      const eligibleIds = candidateIds.filter(uid => {
        const bag = extractedByUser.get(uid) || new Set<string>();
        return mustHaves.every(mh => hasMust(mh, bag));
      });
      if (eligibleIds.length === 0) {
        return json({ search_id: null, results: [], pool_note: "No candidates in the pool cover every must-have skill yet. The pool grows as job seekers opt in." });
      }

      // v2.9.1 — embed the spec with the real model when available and
      // ONLY cosine-compare against candidate_index rows produced by that
      // same model. Mixing models yields meaningless scores. If some
      // eligible candidates are still on the fallback model, re-index up
      // to 25 of them inline before ranking; the rest will catch up on
      // their next profile save or manual re-index (non-blocking to the
      // user, nothing surfaced in the UI).
      const specText = [job_spec.title, job_spec.notes, mustHaves.join(", "), niceToHaves.join(", ")].filter(Boolean).join("\n");
      const { vector: specEmbedding, model: specModel } = await embedText(String(specText || ""));

      // v3.38.0 — reindex-check still needs each candidate's embedding_model,
      // but no longer needs the embedding vector itself: recall now happens
      // in Postgres (match_candidates_by_embedding), which can use the real
      // HNSW index on candidate_index.embedding instead of every eligible
      // candidate's full 768-dim vector being pulled over the wire and
      // cosine-compared by hand in JavaScript.
      const { data: modelRows } = await adminForNew.from("candidate_index")
        .select("user_id, embedding_model")
        .in("user_id", eligibleIds);

      if (specModel !== FALLBACK_EMBED_MODEL) {
        const stale = (modelRows || []).filter(r => (r.embedding_model || FALLBACK_EMBED_MODEL) !== specModel).slice(0, 25);
        for (const r of stale) {
          try { await indexCandidate(adminForNew, r.user_id); }
          catch (e) { console.error("inline reindex failed", r.user_id, (e as Error).message); }
        }
      }

      const { data: rankedRows, error: rankErr } = await adminForNew.rpc("match_candidates_by_embedding", {
        p_ids: eligibleIds,
        p_embedding: specEmbedding,
        p_model: specModel,
        p_limit: 12,
      });
      if (rankErr) return json({ error: rankErr.message }, 500);
      const ranked = (rankedRows || []) as Array<{
        user_id: string; headline: string | null; seniority: string | null;
        years_experience: number | null; location: string | null; profile_text: string | null; similarity: number;
      }>;


      // Build anonymized rerank input.
      const refMap: Record<string, string> = {};
      const rerankInput = ranked.map((row, i) => {
        const ref = `c${i + 1}`;
        refMap[ref] = row.user_id;
        return {
          ref,
          profile_text: (row.profile_text || "").slice(0, 4000),
          seniority: row.seniority || "",
          years_experience: row.years_experience ?? null,
          location: row.location || "",
          skills: {
            extracted: Array.from(extractedByUser.get(row.user_id) || []),
            inferred: Array.from(inferredByUser.get(row.user_id) || []),
          },
          headline: row.headline || "",
        };
      });

      const rerankSys = `You are AYN's employer-side hiring judge. Score each candidate 1-100 for THIS job_spec. Rules, strict:
- must_have coverage may ONLY cite skills from candidate.skills.extracted. Never let an inferred skill satisfy a must-have.
- Inferred skills may contribute AT MOST 10 total points across nice-to-haves.
- Every sentence in "why" must reference something literally present in the candidate's provided data (profile_text, seniority, years_experience, location, or extracted/inferred skills). No speculation.
- If fewer than 3 candidates are genuinely strong, return fewer and explain in pool_note. Do not pad.
- Never mention refs, ids, names, or emails you were not given. Never invent skills.
- Output ONLY JSON: {"results":[{"ref":"c1","score":87,"why":["...","...","..."],"matched_must_haves":[],"gaps":[]}],"pool_note":""}
- Plain prose only. No markdown, no em dashes, no en dashes. Use the word "to" for ranges.`;
      const rerankUser = JSON.stringify({ job_spec: { title: job_spec.title, seniority: job_spec.seniority, must_have_skills: mustHaves, nice_to_have_skills: niceToHaves, min_years: job_spec.min_years, location_preference: job_spec.location_preference, remote_ok: job_spec.remote_ok, notes: job_spec.notes }, candidates: rerankInput });
      // v3.14.0 cost control — the pro model adds nothing when ranking a handful
      // of people, so it is only used once the prefilter leaves a real shortlist.
      const rerankModel = rerankInput.length < 5 ? DEFAULT_MODEL : QUALITY_MODEL;
      const rr = await callAI({ model: rerankModel, system: rerankSys, user: rerankUser.slice(0, 40000) });
      let rrParsed: { results?: Array<{ ref: string; score: number; why?: string[]; matched_must_haves?: string[]; gaps?: string[] }>; pool_note?: string } = {};
      try { rrParsed = JSON.parse(rr.text); }
      catch {
        const m = rr.text.match(/\{[\s\S]*\}/);
        try { rrParsed = m ? JSON.parse(m[0]) : { results: [], pool_note: "The rerank step returned an unreadable response." }; }
        catch { rrParsed = { results: [], pool_note: "The rerank step returned an unreadable response." }; }
      }
      const rrResults = Array.isArray(rrParsed.results) ? rrParsed.results : [];

      // Merge with anonymized card data, take top 3.
      const cardByRef = new Map(rerankInput.map(r => [r.ref, r]));
      const top = rrResults
        .filter(r => cardByRef.has(r.ref))
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, 3)
        .map(r => {
          const c = cardByRef.get(r.ref)!;
          return {
            ref: r.ref,
            score: r.score,
            headline: c.headline,
            seniority: c.seniority,
            years_experience: c.years_experience,
            location: c.location,
            matched_must_haves: r.matched_must_haves || [],
            gaps: r.gaps || [],
            why: r.why || [],
            // v3.6.0 — candidate detail shows evidence provenance. Still no PII.
            skills_extracted: c.skills.extracted,
            skills_inferred: c.skills.inferred,
            summary: (c.profile_text || "").slice(0, 1200),
          };
        });

      // v3.12.0 — attach a structured, anonymous profile block for the three
      // cards we actually return, so the client renders a candidate profile
      // instead of the embedding blob. Three canonical loads, top three only.
      // v3.15.1 — also attach the FIRST NAME only. "Candidate c1" reads like a
      // row id; a first name is human and still not identifying. Last name,
      // email and phone stay locked until the candidate accepts a proposal.
      for (const card of top) {
        const uid = refMap[card.ref];
        if (!uid) continue;
        try {
          const canon = await loadCanonical(adminForNew, uid);
          if (canon) (card as Record<string, unknown>).profile = buildCandidateProfile(canon);
        } catch (e) {
          console.error("profile block failed", card.ref, (e as Error).message);
        }
        try {
          const { data: prof } = await adminForNew.from("user_profile_data")
            .select("legal_first_name").eq("user_id", uid).maybeSingle();
          const first = String(prof?.legal_first_name || "").trim().split(/\s+/)[0] || "";
          if (first) (card as Record<string, unknown>).first_name = first;
        } catch (e) {
          console.error("first name lookup failed", card.ref, (e as Error).message);
        }
      }




      const { data: search, error: sErr } = await adminForNew.from("employer_searches").insert({
        org_id, created_by: userId, job_spec, results: top, ref_map: refMap,
      }).select("id").single();
      if (sErr) return json({ error: sErr.message }, 500);

      return json({ search_id: search.id, results: top, pool_note: rrParsed.pool_note || "" });
    }

    // v3.6.0 — a reveal request is now a JOB PROPOSAL. The employer must say
    // what the role is and write a message. Contact details are still only
    // released after the candidate accepts (see employer_reveal_status).
    if (action === "employer_reveal_request") {
      { const off = await featureGate(adminForNew, "proposals"); if (off) return off; }
      const {
        search_id, ref, job_title, job_location, employment_type, salary_range, job_url, message,
      } = payload as {
        search_id?: string; ref?: string; job_title?: string; job_location?: string;
        employment_type?: string; salary_range?: string; job_url?: string; message?: string;
      };
      if (!search_id || !ref) return json({ error: "search_id and ref required" }, 400);
      const title = String(job_title || "").trim();
      const msg = String(message || "").trim();
      if (!title) return json({ error: "job_title required" }, 400);
      if (!msg) return json({ error: "message required" }, 400);
      if (msg.length > 1000) return json({ error: "message must be 1000 characters or fewer" }, 400);

      const { data: search } = await adminForNew.from("employer_searches")
        .select("id, org_id, ref_map").eq("id", search_id).maybeSingle();
      if (!search) return json({ error: "search not found" }, 404);
      if (!(await assertOrgMember(search.org_id))) return json({ error: "not an org member" }, 403);
      const { data: proposalOrg } = await adminForNew.from("orgs").select("name").eq("id", search.org_id).maybeSingle();
      const proposalOrgName = proposalOrg?.name || "A company";
      const orgGate = await assertOrgProfileComplete(search.org_id);
      if (orgGate) return orgGate;
      const candidateUserId = (search.ref_map as Record<string, string> | null)?.[ref];
      if (!candidateUserId) return json({ error: "unknown ref" }, 400);

      // Rate limit 1: one open proposal per (org, candidate) at a time.
      const { data: openRow } = await adminForNew.from("reveal_requests")
        .select("id").eq("org_id", search.org_id)
        .eq("candidate_user_id", candidateUserId).eq("status", "pending").maybeSingle();
      if (openRow) {
        return json({ error: "You already have an open proposal with this candidate. Wait for a reply before sending another." }, 429);
      }
      // Rate limit 2: no new proposal within 30 days of a decline.
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: recentDecline } = await adminForNew.from("reveal_requests")
        .select("id, responded_at").eq("org_id", search.org_id)
        .eq("candidate_user_id", candidateUserId).eq("status", "declined")
        .gte("responded_at", cutoff).limit(1).maybeSingle();
      if (recentDecline) {
        return json({ error: "This candidate declined a proposal from you in the last 30 days. You can try again after that." }, 429);
      }

      // v3.14.0 — proposals limit per billing period.
      const propBilling = await employerBilling(adminForNew, userId, search.org_id);
      const propGate = planLimitReached(propBilling, "proposal");
      if (propGate) return propGate;


      const { error: iErr } = await adminForNew.from("reveal_requests").insert({
        org_id: search.org_id,
        candidate_user_id: candidateUserId,
        search_id,
        candidate_ref: ref,
        job_title: title,
        job_location: job_location?.trim() || null,
        employment_type: employment_type?.trim() || null,
        salary_range: salary_range?.trim() || null,
        job_url: job_url?.trim() || null,
        message: msg,
        sent_at: new Date().toISOString(),
      });
      if (iErr) return json({ error: iErr.message }, 500);
      // Awaited: a Deno edge function isolate can be torn down right after
      // the response is sent, so an un-awaited notify can silently never run.
      await notifyCandidate(
        adminForNew,
        candidateUserId,
        `New job proposal from ${proposalOrgName} | AYN`,
        `${heading("You have a new proposal")}
        ${para(`${escapeHtml(proposalOrgName)} sent you a proposal for ${escapeHtml(title)}.`)}`,
        "proposal_received",
        ctaButton("https://ayn.careers/", "View proposal"),
      );
      return json({ ok: true, status: "pending" });
    }

    if (action === "reveal_list") {
      const { data: rows } = await adminForNew.from("reveal_requests")
        .select("id, org_id, search_id, status, created_at, decided_at, job_title, job_location, employment_type, salary_range, job_url, message, sent_at, responded_at")
        .eq("candidate_user_id", userId)
        .order("sent_at", { ascending: false });
      const enriched: Array<Record<string, unknown>> = [];
      for (const r of (rows || [])) {
        const [{ data: org }, { data: s }] = await Promise.all([
          adminForNew.from("orgs")
            .select("name, website, industry, company_size, headquarters, about, logo_url, linkedin_url")
            .eq("id", r.org_id).maybeSingle(),
          r.search_id
            ? adminForNew.from("employer_searches").select("job_spec").eq("id", r.search_id).maybeSingle()
            : Promise.resolve({ data: null }),
        ]);
        enriched.push({
          id: r.id,
          org_name: org?.name || "A company",
          org_website: org?.website || null,
          // v3.10.0 — who is reaching out, so the candidate can judge it.
          org_industry: org?.industry || null,
          org_size: org?.company_size || null,
          org_headquarters: org?.headquarters || null,
          org_about: org?.about || null,
          org_logo_url: org?.logo_url || null,
          org_linkedin_url: org?.linkedin_url || null,
          job_title: r.job_title || (s?.job_spec as { title?: string } | null)?.title || "",
          job_location: r.job_location || null,
          employment_type: r.employment_type || null,
          salary_range: r.salary_range || null,
          job_url: r.job_url || null,
          message: r.message || "",
          status: r.status,
          sent_at: r.sent_at || r.created_at,
          created_at: r.created_at,
          responded_at: r.responded_at || r.decided_at,
          decided_at: r.decided_at,
        });
      }
      return json({ requests: enriched });
    }

    if (action === "reveal_decide") {
      const { id, approve } = payload as { id?: string; approve?: boolean };
      if (!id || typeof approve !== "boolean") return json({ error: "id and approve required" }, 400);
      const status = approve ? "approved" : "declined";
      const now = new Date().toISOString();
      const { data: decided, error } = await adminForNew.from("reveal_requests")
        .update({ status, decided_at: now, responded_at: now })
        .eq("id", id).eq("candidate_user_id", userId)
        .select("org_id, job_title").maybeSingle();
      if (error) return json({ error: error.message }, 500);
      // The ownership filter above can match zero rows -- someone else's id,
      // a typo, an already-consumed link -- and .update() silently succeeds
      // with nothing changed either way. Reproduced live: a second candidate
      // guessing at another candidate's reveal_request id got a false
      // {ok:true} back with no row actually touched. The write itself was
      // never at risk (candidate_user_id already scoped it correctly), but
      // the response claimed success for nothing happening.
      if (!decided) return json({ error: "Proposal not found." }, 404);
      if (decided?.org_id) {
        const roleTitle = decided.job_title ? escapeHtml(decided.job_title) : "your role";
        await notifyOrgMembers(
          adminForNew,
          decided.org_id,
          approve ? "A candidate accepted your proposal | AYN" : "A candidate declined your proposal | AYN",
          approve
            ? `${heading("Your proposal was accepted")}
              ${para(`The candidate for ${roleTitle} accepted your proposal. Their contact details are now available.`)}`
            : `${heading("Your proposal was declined")}
              ${para(`The candidate for ${roleTitle} declined your proposal.`)}`,
          approve ? "proposal_accepted" : "proposal_declined",
          approve
            ? ctaButton("https://ayn.careers/", "View candidate")
            : ctaButton("https://ayn.careers/", "View in EmployerHub"),
        );
      }
      return json({ ok: true, status });
    }

    if (action === "employer_reveal_status") {
      const { search_id } = payload as { search_id?: string };
      const { data: memberships } = await adminForNew.from("org_members")
        .select("org_id").eq("user_id", userId);
      const orgIds = (memberships || []).map(m => m.org_id);
      if (orgIds.length === 0) return json({ requests: [] });

      let q = adminForNew.from("reveal_requests")
        .select("id, org_id, candidate_user_id, candidate_ref, status, job_title, job_location, employment_type, salary_range, job_url, message, sent_at, responded_at, created_at, decided_at")
        .in("org_id", orgIds)
        .order("sent_at", { ascending: false });

      const refByUser = new Map<string, string>();
      if (search_id) {
        const { data: search } = await adminForNew.from("employer_searches")
          .select("org_id, ref_map").eq("id", search_id).maybeSingle();
        if (!search) return json({ error: "not found" }, 404);
        if (!(await assertOrgMember(search.org_id))) return json({ error: "not an org member" }, 403);
        for (const [ref, uid] of Object.entries((search.ref_map as Record<string, string> | null) || {})) refByUser.set(uid, ref);
        q = q.eq("search_id", search_id);
      }

      const { data: rows } = await q;
      const enriched: Array<Record<string, unknown>> = [];
      for (const r of (rows || [])) {
        const base: Record<string, unknown> = {
          id: r.id,
          ref: r.candidate_ref || refByUser.get(r.candidate_user_id) || "",
          status: r.status,
          job_title: r.job_title || "",
          job_location: r.job_location || null,
          employment_type: r.employment_type || null,
          salary_range: r.salary_range || null,
          job_url: r.job_url || null,
          message: r.message || "",
          sent_at: r.sent_at || r.created_at,
          created_at: r.created_at,
          responded_at: r.responded_at || r.decided_at,
          decided_at: r.decided_at,
        };
        // First name only, so a list of proposals for one role is readable.
        // Last name, email and phone are released ONLY on an accepted proposal.
        const { data: prof } = await adminForNew.from("user_profile_data")
          .select("legal_first_name, legal_last_name, email, phone").eq("user_id", r.candidate_user_id).maybeSingle();
        base.first_name = String(prof?.legal_first_name || "").trim().split(/\s+/)[0] || null;
        if (r.status === "approved") {
          const { data: authUser } = await adminForNew.auth.admin.getUserById(r.candidate_user_id);
          base.name = [prof?.legal_first_name, prof?.legal_last_name].filter(Boolean).join(" ") || null;
          base.email = prof?.email || authUser?.user?.email || null;
          base.phone = prof?.phone || null;
        }

        enriched.push(base);
      }
      return json({ requests: enriched });
    }

    // ═══════════════════════════════════════════════════════════
    // v3.13.0 — VERIFICATION ASSESSMENTS
    //
    // An employer can send a short assessment before deciding whether to
    // send a proposal. Questions are generated from THAT candidate's own
    // profile and probe depth of lived experience, not textbook knowledge.
    //
    // ISOLATION OF THE RUBRIC AND THE RESULT (the security property):
    //   - assessments.questions stores ONLY {id, type, text, options}.
    //     The rubric is never written into that column.
    //   - Rubrics live in public.assessment_rubrics, which has ALL
    //     privileges revoked from anon and authenticated. Same for
    //     public.assessment_results. Both are service_role only, and RLS
    //     is on with zero policies, so even a leaked grant denies reads.
    //   - No candidate-lane action here ever returns a rubric, a score,
    //     a verdict, or a per-question observation.
    // ═══════════════════════════════════════════════════════════
    type PubQuestion = { id: string; type: "mc" | "short"; text: string; options?: string[] };

    /** Strip a question down to what the candidate is allowed to see. */
    function publicQuestion(q: Record<string, unknown>): PubQuestion {
      const type = q.type === "short" ? "short" : "mc";
      return {
        id: String(q.id || ""),
        type,
        text: String(q.text || ""),
        ...(type === "mc"
          ? { options: (Array.isArray(q.options) ? q.options : []).map(String).slice(0, 5) }
          : {}),
      };
    }

    function assessmentDeadline(a: Record<string, unknown>): number | null {
      if (!a.started_at) return null;
      return new Date(String(a.started_at)).getTime() + Number(a.time_limit_seconds || 1800) * 1000;
    }

    // ---- Employer: generate a draft assessment from the candidate profile ----
    if (action === "employer_assessment_generate") {
      { const off = await featureGate(adminForNew, "assessments"); if (off) return off; }
      const { org_id, search_id, ref } = payload as { org_id?: string; search_id?: string; ref?: string };
      if (!org_id || !search_id || !ref) return json({ error: "org_id, search_id and ref required" }, 400);
      if (!(await assertOrgMember(org_id))) return json({ error: "not an org member" }, 403);
      const gate = await assertOrgProfileComplete(org_id);
      if (gate) return gate;

      const { data: search } = await adminForNew.from("employer_searches")
        .select("id, org_id, job_spec, ref_map").eq("id", search_id).maybeSingle();
      if (!search || search.org_id !== org_id) return json({ error: "search not found" }, 404);
      const candidateUserId = (search.ref_map as Record<string, string> | null)?.[ref];
      if (!candidateUserId) return json({ error: "unknown ref" }, 400);

      const canon = await loadCanonical(adminForNew, candidateUserId);
      if (!canon) return json({ error: "This candidate has no structured profile to build questions from." }, 409);
      const block = buildCandidateProfile(canon);
      const spec = (search.job_spec as Record<string, unknown>) || {};
      const jobTitle = String(spec.title || "").trim() || block.current_title || "the role";

      const achievements = canon.experiences.slice(0, 4).map(e => ({
        title: e.title, company: e.company,
        dates: [e.start, e.end || (e.current ? "Now" : "")].filter(Boolean).join(" to "),
        achievements: (e.achievements || []).slice(0, 3),
      }));


      const sys = `You write short verification assessments that check whether what a candidate claims on their profile is real.

WHAT YOU ARE CHECKING: depth of lived experience. Not textbook knowledge.
A question that a general language model can answer well without knowing this person is a WASTED question. Do not write one.

FORBIDDEN QUESTION SHAPES:
- Definitions, "what is X", "which of these best describes X"
- Anything answerable from a job description
- Anything about general best practice, frameworks or tooling in the abstract

REQUIRED QUESTION SHAPES, use a mix of these, always anchored to something THIS person actually claims:
- A specific decision or tradeoff on work they list, and why they chose it over the alternative
- What went wrong on a specific project they list, and what they changed after
- Reconstructing a number they cite in an achievement bullet: how it was measured, what the baseline was
- The constraint or messy detail only someone who did the work would know
- Their specific role when a claim is team shaped, separating what they did from what the team did

FORMAT: exactly 4 multiple choice questions and 2 short answer questions. Keep every question and rubric tight, no preamble.
Multiple choice: scenario based, four options, plausible distractors drawn from realistic alternative choices. No obviously silly option. The correct option must be the one consistent with how the work is actually done under the constraints described.
Short answer: ask for 2 to 4 sentences.

Each question also carries a PRIVATE rubric: what a person who genuinely did this work would say, what a bluffer says instead, and for multiple choice which option index is correct and why. The rubric is never shown to the candidate.
${VOICE_RULES}`;

      const schema = {
        type: "object",
        properties: {
          questions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: { type: "string", enum: ["mc", "short"] },
                text: { type: "string" },
                options: { type: "array", items: { type: "string" } },
                rubric: { type: "string" },
                anchor: { type: "string" },
              },
              required: ["type", "text", "rubric"],
            },
          },
        },
        required: ["questions"],
      };

      // Generation sits on the employer's waiting path, so it runs on the fast
      // model. Grading and growth notes stay on QUALITY_MODEL.
      const r = await callAI({
        model: DEFAULT_MODEL,

        system: sys,
        user: `ROLE BEING HIRED FOR: ${JSON.stringify({ title: jobTitle, seniority: spec.seniority, must_have_skills: spec.must_have_skills })}

THE CANDIDATE'S OWN CLAIMS (build every question from these):
${JSON.stringify({ profile: block, work: achievements, education: block.education }, null, 1)}

Write the assessment now.`,
        toolName: "write_assessment",
        toolSchema: schema,
      });

      const parsed = (r.structured as { questions?: Array<Record<string, unknown>> } | undefined)
        || parseJsonLoose<{ questions?: Array<Record<string, unknown>> }>(r.text)
        || {};
      const raw = Array.isArray(parsed.questions) ? parsed.questions : [];
      if (raw.length < 3) return json({ error: "Could not generate an assessment for this candidate. Try again." }, 502);

      const questions: PubQuestion[] = [];
      const rubrics: Array<{ question_id: string; rubric: string }> = [];
      raw.slice(0, 9).forEach((q, i) => {
        const id = `q${i + 1}`;
        const type = q.type === "short" ? "short" : "mc";
        const opts = (Array.isArray(q.options) ? q.options : []).map(String).filter(Boolean).slice(0, 5);
        if (type === "mc" && opts.length < 2) return;
        questions.push({ id, type, text: cleanEmployerText(String(q.text || "")), ...(type === "mc" ? { options: opts } : {}) });
        rubrics.push({ question_id: id, rubric: String(q.rubric || "").slice(0, 2000) });
      });
      if (!questions.length) return json({ error: "Could not generate an assessment for this candidate. Try again." }, 502);

      const { data: row, error: aErr } = await adminForNew.from("assessments").insert({
        org_id, candidate_user_id: candidateUserId, search_id,
        candidate_ref: ref, job_title: jobTitle, status: "draft",
        questions, created_by: userId,
      }).select("id").single();
      if (aErr || !row) return json({ error: aErr?.message || "insert failed" }, 500);

      await adminForNew.from("assessment_rubrics")
        .insert(rubrics.map(x => ({ assessment_id: row.id, ...x })));

      return json({ assessment_id: row.id, job_title: jobTitle, questions });
    }

    // ---- Employer: send the draft, minus any question they removed ----
    if (action === "employer_assessment_send") {
      { const off = await featureGate(adminForNew, "assessments"); if (off) return off; }
      const { assessment_id, keep_ids, time_limit_seconds, expires_days } = payload as {
        assessment_id?: string; keep_ids?: string[];
        time_limit_seconds?: number; expires_days?: number;
      };
      if (!assessment_id) return json({ error: "assessment_id required" }, 400);
      const { data: a } = await adminForNew.from("assessments")
        .select("id, org_id, status, questions, candidate_user_id, job_title").eq("id", assessment_id).maybeSingle();
      if (!a) return json({ error: "assessment not found" }, 404);
      if (!(await assertOrgMember(a.org_id))) return json({ error: "not an org member" }, 403);
      if (a.status !== "draft") return json({ error: "This assessment was already sent." }, 409);

      // v3.14.0 — assessments limit per billing period.
      const assBilling = await employerBilling(adminForNew, userId, a.org_id);
      const assGate = planLimitReached(assBilling, "assessment");
      if (assGate) return assGate;


      const all = (a.questions as Array<Record<string, unknown>>) || [];
      const keep = Array.isArray(keep_ids) && keep_ids.length
        ? all.filter(q => keep_ids.map(String).includes(String(q.id)))
        : all;
      if (keep.length < 3) return json({ error: "Keep at least three questions." }, 400);

      const limit = Math.max(300, Math.min(7200, Math.round(Number(time_limit_seconds) || 1800)));
      const days = Math.max(1, Math.min(30, Math.round(Number(expires_days) || 7)));
      const { error } = await adminForNew.from("assessments").update({
        questions: keep.map(publicQuestion),
        status: "sent",
        time_limit_seconds: limit,
        sent_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + days * 86400000).toISOString(),
      }).eq("id", assessment_id);
      if (error) return json({ error: error.message }, 500);
      if (a.candidate_user_id) {
        const { data: sendOrg } = await adminForNew.from("orgs").select("name").eq("id", a.org_id).maybeSingle();
        const sendOrgName = sendOrg?.name || "A company";
        const minutes = Math.round(limit / 60);
        await notifyCandidate(
          adminForNew,
          a.candidate_user_id,
          `New assessment from ${sendOrgName} | AYN`,
          `${heading("A company wants to verify your background")}
          ${para(`${escapeHtml(sendOrgName)} sent you a short assessment${a.job_title ? ` for ${escapeHtml(a.job_title)}` : ""}. It takes about ${minutes} minutes once you start.`)}`,
          "assessment_received",
          ctaButton("https://ayn.careers/", "View assessment"),
        );
      }
      return json({ ok: true, status: "sent" });
    }

    // ---- Employer: sent assessments with results once submitted ----
    if (action === "employer_assessment_list") {
      const { search_id } = payload as { search_id?: string };
      const { data: memberships } = await adminForNew.from("org_members")
        .select("org_id").eq("user_id", userId);
      const orgIds = (memberships || []).map(m => m.org_id);
      if (!orgIds.length) return json({ assessments: [] });

      let q = adminForNew.from("assessments")
        .select("id, org_id, search_id, candidate_ref, candidate_user_id, job_title, status, questions, answers, time_limit_seconds, started_at, submitted_at, sent_at, expires_at, created_at")
        .in("org_id", orgIds).neq("status", "draft")
        .order("created_at", { ascending: false }).limit(100);
      if (search_id) q = q.eq("search_id", search_id);
      const { data: rows } = await q;

      const ids = (rows || []).map(r => r.id);
      const { data: results } = ids.length
        ? await adminForNew.from("assessment_results")
          .select("assessment_id, overall_score, verification_verdict, per_question, strengths, concerns, employer_summary")
          .in("assessment_id", ids)
        : { data: [] };
      const byId = new Map((results || []).map(r => [r.assessment_id, r]));

      // First name only, so a list of assessments for one role is readable.
      const candIds = [...new Set((rows || []).map(r => r.candidate_user_id).filter(Boolean))];
      const { data: profs } = candIds.length
        ? await adminForNew.from("user_profile_data")
          .select("user_id, legal_first_name").in("user_id", candIds)
        : { data: [] };
      const nameByUser = new Map(
        (profs || []).map(p => [p.user_id, String(p.legal_first_name || "").trim().split(/\s+/)[0] || null]),
      );

      const out = (rows || []).map(r => {
        const expired = r.status !== "submitted" && r.expires_at && new Date(r.expires_at).getTime() < Date.now();
        const res = byId.get(r.id) || null;
        return {
          id: r.id, ref: r.candidate_ref, search_id: r.search_id, job_title: r.job_title,
          first_name: nameByUser.get(r.candidate_user_id) || null,
          status: expired ? "expired" : r.status,
          question_count: ((r.questions as unknown[]) || []).length,
          time_limit_seconds: r.time_limit_seconds,
          sent_at: r.sent_at, started_at: r.started_at, submitted_at: r.submitted_at, expires_at: r.expires_at,
          result: res
            ? {
              overall_score: res.overall_score,
              verification_verdict: res.verification_verdict,
              per_question: res.per_question,
              strengths: res.strengths,
              concerns: res.concerns,
              employer_summary: res.employer_summary,
            }
            : null,
        };
      });
      return json({ assessments: out });
    }

    // ---- Candidate: list assessments addressed to me (no scores, ever) ----
    if (action === "assessment_list") {
      const { data: rows } = await adminForNew.from("assessments")
        .select("id, org_id, job_title, status, questions, time_limit_seconds, started_at, submitted_at, sent_at, expires_at")
        .eq("candidate_user_id", userId).neq("status", "draft")
        .order("sent_at", { ascending: false }).limit(50);
      const out: Array<Record<string, unknown>> = [];
      for (const r of (rows || [])) {
        const { data: org } = await adminForNew.from("orgs").select("name, logo_url").eq("id", r.org_id).maybeSingle();
        const expired = r.status !== "submitted" && r.expires_at && new Date(r.expires_at).getTime() < Date.now();
        out.push({
          id: r.id,
          org_name: org?.name || "A company",
          org_logo_url: org?.logo_url || null,
          job_title: r.job_title || "",
          status: expired ? "expired" : r.status,
          question_count: ((r.questions as unknown[]) || []).length,
          time_limit_seconds: r.time_limit_seconds,
          sent_at: r.sent_at, expires_at: r.expires_at,
          started_at: r.started_at, submitted_at: r.submitted_at,
          deadline_at: r.started_at ? new Date(assessmentDeadline(r)!).toISOString() : null,
        });
      }
      return json({ assessments: out });
    }

    // ---- Candidate: start (server enforced timer) ----
    if (action === "assessment_start") {
      const { id } = payload as { id?: string };
      if (!id) return json({ error: "id required" }, 400);
      const { data: a } = await adminForNew.from("assessments")
        .select("id, org_id, job_title, status, questions, answers, time_limit_seconds, started_at, expires_at")
        .eq("id", id).eq("candidate_user_id", userId).maybeSingle();
      if (!a) return json({ error: "assessment not found" }, 404);
      if (a.status === "submitted") return json({ error: "You already submitted this assessment." }, 409);
      if (a.status === "expired") return json({ error: "This assessment expired." }, 409);
      if (a.expires_at && new Date(a.expires_at).getTime() < Date.now()) {
        await adminForNew.from("assessments").update({ status: "expired" }).eq("id", id);
        return json({ error: "This assessment expired." }, 409);
      }

      let started = a.started_at as string | null;
      if (!started) {
        started = new Date().toISOString();
        await adminForNew.from("assessments").update({ status: "started", started_at: started }).eq("id", id);
      }
      const deadline = new Date(started).getTime() + Number(a.time_limit_seconds || 1800) * 1000;
      if (deadline < Date.now()) {
        await finaliseAssessment(id);
        return json({ error: "Your time on this assessment ran out. It has been submitted." }, 409);
      }
      const { data: org } = await adminForNew.from("orgs").select("name").eq("id", a.org_id).maybeSingle();
      return json({
        id: a.id,
        org_name: org?.name || "A company",
        job_title: a.job_title || "",
        // Only the public shape. The rubric is in another table entirely.
        questions: ((a.questions as Array<Record<string, unknown>>) || []).map(publicQuestion),
        answers: a.answers || {},
        deadline_at: new Date(deadline).toISOString(),
        seconds_left: Math.max(0, Math.round((deadline - Date.now()) / 1000)),
      });
    }

    // ---- Candidate: autosave one answer, with time spent on it ----
    if (action === "assessment_answer") {
      const { id, question_id, answer, ms } = payload as {
        id?: string; question_id?: string; answer?: string; ms?: number;
      };
      if (!id || !question_id) return json({ error: "id and question_id required" }, 400);
      const { data: a } = await adminForNew.from("assessments")
        .select("id, status, answers, started_at, time_limit_seconds")
        .eq("id", id).eq("candidate_user_id", userId).maybeSingle();
      if (!a) return json({ error: "assessment not found" }, 404);
      if (a.status !== "started") return json({ error: "This assessment is not open." }, 409);
      const deadline = assessmentDeadline(a as Record<string, unknown>);
      if (deadline && deadline < Date.now()) {
        await finaliseAssessment(id);
        return json({ error: "Time ran out. Your answers were submitted." }, 409);
      }
      const answers = { ...((a.answers as Record<string, unknown>) || {}) };
      answers[String(question_id)] = {
        answer: String(answer ?? "").slice(0, 3000),
        ms: Math.max(0, Math.min(3600000, Math.round(Number(ms) || 0))),
        at: new Date().toISOString(),
      };
      const { error } = await adminForNew.from("assessments").update({ answers }).eq("id", id);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    // ---- Candidate: submit. Returns a plain confirmation and nothing else ----
    if (action === "assessment_submit") {
      const { id } = payload as { id?: string };
      if (!id) return json({ error: "id required" }, 400);
      const { data: a } = await adminForNew.from("assessments")
        .select("id, org_id, status").eq("id", id).eq("candidate_user_id", userId).maybeSingle();
      if (!a) return json({ error: "assessment not found" }, 404);
      if (a.status === "submitted") return json({ error: "Already submitted." }, 409);
      const { data: org } = await adminForNew.from("orgs").select("name").eq("id", a.org_id).maybeSingle();
      await finaliseAssessment(id);
      // No score, no verdict, no feedback. Deliberately.
      return json({ ok: true, org_name: org?.name || "the company" });
    }

    // ---- Candidate: the growth note, and only the growth note ----
    if (action === "assessment_growth_notes") {
      const { data: rows } = await adminForNew.from("assessments")
        .select("id").eq("candidate_user_id", userId).eq("status", "submitted").limit(20);
      const ids = (rows || []).map(r => r.id);
      if (!ids.length) return json({ notes: [] });
      const { data: res } = await adminForNew.from("assessment_results")
        .select("assessment_id, seeker_growth_note, created_at").in("assessment_id", ids)
        .order("created_at", { ascending: false }).limit(3);
      // Only the note text travels. No score, no verdict, no observation.
      const notes = (res || [])
        .map(r => String(r.seeker_growth_note || "").trim())
        .filter(Boolean);
      return json({ notes });
    }

    /**
     * Grade a submitted assessment. Runs entirely server side with the
     * service role. Everything it writes lands in assessment_results,
     * which no client role can select from.
     */
    async function finaliseAssessment(assessmentId: string): Promise<void> {
      const { data: a } = await adminForNew.from("assessments")
        .select("id, org_id, candidate_user_id, job_title, questions, answers, started_at, submitted_at, time_limit_seconds")
        .eq("id", assessmentId).maybeSingle();
      if (!a || a.submitted_at) return;
      const submittedAt = new Date().toISOString();
      await adminForNew.from("assessments")
        .update({ status: "submitted", submitted_at: submittedAt }).eq("id", assessmentId);

      const { data: rubricRows } = await adminForNew.from("assessment_rubrics")
        .select("question_id, rubric").eq("assessment_id", assessmentId);
      const rubricById = new Map((rubricRows || []).map(r => [r.question_id, r.rubric]));
      const questions = (a.questions as Array<Record<string, unknown>>) || [];
      const answers = (a.answers as Record<string, { answer?: string; ms?: number }>) || {};

      const canon = await loadCanonical(adminForNew, a.candidate_user_id);
      const claims = canon ? buildCandidateProfile(canon) : null;

      const items = questions.map(q => {
        const id = String(q.id);
        const ans = answers[id] || {};
        return {
          id,
          type: q.type,
          question: q.text,
          options: q.options ?? null,
          private_rubric: rubricById.get(id) || "",
          candidate_answer: String(ans.answer ?? ""),
          seconds_spent: Math.round(Number(ans.ms || 0) / 1000),
        };
      });

      const sys = `You grade a verification assessment for an employer. The candidate never sees any of this.

WHAT YOU ARE JUDGING: whether the answers read like someone who actually did the work they claim, or like someone reciting general knowledge.
Use each question's private rubric. Reward specific constraints, real tradeoffs, named failure modes, and honest uncertainty about details. Penalise generic best practice prose, restated question text, and confident claims with no texture.

Also note timing where it is informative: a long, flawless short answer written in under twenty seconds is worth mentioning as an observation. State it as an observation, never as an accusation.

Scores: overall_score 0 to 100. verification_verdict is exactly one of "consistent", "partly consistent", "inconsistent", judged against what the candidate claims on their profile.
employer_summary: 2 to 4 sentences, plain prose, what the employer should take away.
seeker_growth_note: ONE sentence the candidate may later be shown. It must be about how their RESUME presents their work, never about the assessment, never about what they got wrong, never a score. Example shape: "Your resume undersells your work on data pipelines."
${VOICE_RULES}`;

      const schema = {
        type: "object",
        properties: {
          overall_score: { type: "number" },
          verification_verdict: { type: "string", enum: ["consistent", "partly consistent", "inconsistent"] },
          per_question: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                score: { type: "number" },
                observed: { type: "string" },
              },
              required: ["id", "score", "observed"],
            },
          },
          strengths: { type: "array", items: { type: "string" } },
          concerns: { type: "array", items: { type: "string" } },
          employer_summary: { type: "string" },
          seeker_growth_note: { type: "string" },
        },
        required: ["overall_score", "verification_verdict", "per_question", "employer_summary"],
      };

      let out: Record<string, unknown> = {};
      try {
        const r = await callAI({
          model: QUALITY_MODEL,
          system: sys,
          user: `WHAT THE CANDIDATE CLAIMS ON THEIR PROFILE:
${JSON.stringify(claims, null, 1)}

THE ASSESSMENT, WITH PRIVATE RUBRICS AND THEIR ANSWERS:
${JSON.stringify(items, null, 1)}

Grade it now.`,
          toolName: "grade_assessment",
          toolSchema: schema,
        });
        out = (r.structured as Record<string, unknown>) || parseJsonLoose<Record<string, unknown>>(r.text) || {};
      } catch (e) {
        console.error("assessment grading failed", e);
      }

      const verdicts = ["consistent", "partly consistent", "inconsistent"];
      const perQ = Array.isArray(out.per_question) ? out.per_question as Array<Record<string, unknown>> : [];
      const byQ = new Map(perQ.map(p => [String(p.id), p]));
      await adminForNew.from("assessment_results").upsert({
        assessment_id: assessmentId,
        overall_score: Math.max(0, Math.min(100, Math.round(Number(out.overall_score) || 0))),
        verification_verdict: verdicts.includes(String(out.verification_verdict))
          ? String(out.verification_verdict) : "partly consistent",
        per_question: items.map(it => {
          const p = byQ.get(it.id);
          return {
            id: it.id,
            question: it.question,
            answer: it.candidate_answer,
            seconds_spent: it.seconds_spent,
            score: Math.max(0, Math.min(100, Math.round(Number(p?.score) || 0))),
            observed: cleanEmployerText(String(p?.observed || "No observation available.")),
          };
        }),
        strengths: (Array.isArray(out.strengths) ? out.strengths : []).map(s => cleanEmployerText(String(s))).slice(0, 5),
        concerns: (Array.isArray(out.concerns) ? out.concerns : []).map(s => cleanEmployerText(String(s))).slice(0, 5),
        employer_summary: cleanEmployerText(String(out.employer_summary || "")).slice(0, 1200),
        seeker_growth_note: cleanEmployerText(String(out.seeker_growth_note || "")).slice(0, 300),
      }, { onConflict: "assessment_id" });

      // No score, no candidate identity in the email body — same rule the
      // product's own UI already follows (v3.13.0), just a heads up to go look.
      if (a.org_id) {
        const roleTitle = a.job_title ? escapeHtml(String(a.job_title)) : "your role";
        await notifyOrgMembers(
          adminForNew,
          a.org_id,
          "An assessment was completed | AYN",
          `${heading("An assessment was completed")}
          ${para(`A candidate for ${roleTitle} finished the assessment you sent. Results and observations are ready to review.`)}`,
          "assessment_completed",
          ctaButton("https://ayn.careers/", "View results"),
        );
      }
    }


    return json({ error: "Unknown action" }, 400);

  } catch (e) {
    console.error("resume-hub error", e);
    return json({ error: e instanceof Error ? e.message : "Server error" }, 500);
  }
});

// ══════════════════════════════════════════════════════════════
// v3.1.0 — Tailor and Cover Letter
//
// These two are THE product now that autofill is gone, so they get the
// full treatment: identity everywhere, structured sections instead of
// character slices, a DETERMINISTIC gap analysis computed in code (the
// model never discovers what is missing, it only decides what to surface
// and how to phrase it), a self-critique revision pass, and programmatic
// verification that no number, percentage, currency figure or year was
// altered. Results are cached by (user, resume version, jd hash) and one
// telemetry row is written per AI call.
// ══════════════════════════════════════════════════════════════

const TAILOR_TTL = 7 * 24 * 60 * 60 * 1000;

// ══════════════════════════════════════════════════════════════
// v3.14.0 — BILLING
// Seeker credits: a tailored resume costs 2, a cover letter costs 1.
// Everything else (scoring, Ask AYN, the extension, the profile, talent
// pool discovery, proposals, assessments, downloads) is free on every
// tier and is never touched by this code. Cache hits cost nothing.
// Employer limits: proposals and assessments are metered per period,
// searching is unlimited with a soft abuse cap.
// Balances are the sum of credit_ledger rows, never a bare counter.
// ══════════════════════════════════════════════════════════════
const COST_TAILOR = 2;
const COST_COVER = 1;
const COST_OPTIMIZE = 15;
const EMPLOYER_SEARCH_SOFT_CAP = 200;

type Anyish = SupabaseClient<any, any, any>;

async function billingEnsure(admin: Anyish, userId: string, audience: "seeker" | "employer" = "seeker") {
  const { data } = await admin.rpc("billing_ensure", { _user_id: userId, _audience: audience });
  return (Array.isArray(data) ? data[0] : data) as
    | { user_id: string; plan_key: string; status: string; current_period_start: string; current_period_end: string; trial_ends_at: string | null }
    | null;
}

async function creditBalance(admin: Anyish, userId: string): Promise<number> {
  const { data } = await admin.rpc("credit_balance", { _user_id: userId });
  return Number(data ?? 0);
}

async function creditSpend(admin: Anyish, userId: string, amount: number, reason: string, ref?: string) {
  const { data } = await admin.rpc("credit_spend", {
    _user_id: userId, _amount: amount, _reason: reason, _ref: ref ?? null,
  });
  return (data || { ok: false, balance: 0, cost: amount }) as { ok: boolean; balance: number; cost: number };
}

async function creditRefund(admin: Anyish, userId: string, amount: number, reason: string, ref?: string) {
  try { await admin.rpc("credit_grant", { _user_id: userId, _amount: amount, _reason: reason, _ref: ref ?? null }); }
  catch (e) { console.error("credit refund failed", (e as Error).message); }
}

function insufficientCredits(balance: number, cost: number, what: string): Response {
  return json({
    error: "insufficient_credits",
    code: "insufficient_credits",
    balance,
    cost,
    message: `A ${what} costs ${cost} ${cost === 1 ? "credit" : "credits"} and you have ${balance} left. Credits reset at the start of your next period.`,
  }, 402);
}

// Enough credit to run? Charge only after the generation succeeds.
async function assertCredits(admin: Anyish, userId: string, cost: number, what: string): Promise<Response | null> {
  await billingEnsure(admin, userId, "seeker");
  const balance = await creditBalance(admin, userId);
  if (balance < cost) return insufficientCredits(balance, cost, what);
  return null;
}

interface LimitOverride {
  proposals_limit: number | null;
  assessments_limit: number | null;
  searches_limit: number | null;
  monthly_credits: number | null;
  reason: string;
}

interface EmployerBilling {
  plan: { key: string; name: string; price_cents: number; interval: string; proposals_limit: number | null; assessments_limit: number | null; searches_limit: number | null };
  /** v3.29.0 per account override. Null on a field means fall back to the plan, 0 is a real zero. */
  override: LimitOverride | null;
  status: string;
  current_period_start: string;
  current_period_end: string;
  trial_ends_at: string | null;
  proposals_used: number;
  assessments_used: number;
  searches_used: number;
}

/** The one place null versus zero is decided. Null override falls back to the plan. */
function effectiveLimit(b: EmployerBilling, kind: "proposal" | "assessment" | "search"): { limit: number | null; overridden: boolean } {
  const planValue = kind === "proposal" ? b.plan.proposals_limit
    : kind === "assessment" ? b.plan.assessments_limit
    : b.plan.searches_limit;
  const ovValue = !b.override ? null
    : kind === "proposal" ? b.override.proposals_limit
    : kind === "assessment" ? b.override.assessments_limit
    : b.override.searches_limit;
  if (ovValue !== null && ovValue !== undefined) return { limit: ovValue, overridden: true };
  return { limit: planValue ?? null, overridden: false };
}

async function employerBilling(admin: Anyish, userId: string, orgId: string): Promise<EmployerBilling> {
  const sub = await billingEnsure(admin, userId, "employer");
  const planKey = sub?.plan_key || "employer_trial";
  const { data: plan } = await admin.from("plans")
    .select("key, name, price_cents, interval, proposals_limit, assessments_limit, searches_limit").eq("key", planKey).maybeSingle();
  const { data: override } = await admin.from("account_limit_overrides")
    .select("proposals_limit, assessments_limit, searches_limit, monthly_credits, reason")
    .eq("user_id", userId).maybeSingle();
  const start = sub?.current_period_start || new Date(Date.now() - 30 * 86400000).toISOString();

  const [{ count: proposals }, { count: assessments }, { count: searches }] = await Promise.all([
    admin.from("reveal_requests").select("id", { count: "exact", head: true }).eq("org_id", orgId).gte("created_at", start),
    admin.from("assessments").select("id", { count: "exact", head: true }).eq("org_id", orgId).neq("status", "draft").gte("sent_at", start),
    admin.from("employer_searches").select("id", { count: "exact", head: true }).eq("org_id", orgId).gte("created_at", start),
  ]);

  return {
    plan: plan || { key: planKey, name: "Free month", price_cents: 0, interval: "month", proposals_limit: 5, assessments_limit: 3, searches_limit: 25 },
    override: (override as LimitOverride | null) || null,
    status: sub?.status || "trialing",
    current_period_start: start,
    current_period_end: sub?.current_period_end || new Date(Date.now() + 30 * 86400000).toISOString(),
    trial_ends_at: sub?.trial_ends_at || null,
    proposals_used: proposals || 0,
    assessments_used: assessments || 0,
    searches_used: searches || 0,
  };
}

function planLimitReached(b: EmployerBilling, kind: "proposal" | "assessment" | "search"): Response | null {
  const { limit, overridden } = effectiveLimit(b, kind);
  const used = kind === "proposal" ? b.proposals_used
    : kind === "assessment" ? b.assessments_used
    : b.searches_used;
  if (limit === null || limit === undefined) return null;
  if (used < limit) return null;
  const noun = kind === "proposal" ? "proposals" : kind === "assessment" ? "assessments" : "candidate searches";
  const resets = new Date(b.current_period_end).toDateString();
  const message = overridden
    ? limit === 0
      ? `This account is set to 0 ${noun} per period. Contact support if you need that changed.`
      : `This account is set to ${limit} ${noun} per period and you have used all of them. Your period resets on ${resets}. Contact support if you need a higher number.`
    : `Your ${b.plan.name} plan includes ${limit} ${noun} per period and you have used all of them. Your period resets on ${resets}. Upgrade to ${kind === "search" ? "search more" : "send more"}.`;
  return json({
    error: "plan_limit_reached",
    code: "plan_limit_reached",
    kind,
    used,
    limit,
    overridden,
    plan: b.plan.name,
    message,
  }, 402);
}





function parseJsonLoose<T>(text: string): T | null {
  try {
    const raw = String(text || "").replace(/```(?:json)?\s*/gi, "").replace(/```/g, "").trim();
    const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
    return JSON.parse(s !== -1 ? raw.slice(s, e + 1) : raw) as T;
  } catch { return null; }
}

interface TailorOut {
  keywords?: Array<Record<string, unknown>>;
  tailoredText?: string;
  changes?: string[];
  atsScore?: number;
  scoreReasoning?: string;
}

function normalizeTailorOut(p: TailorOut | null) {
  return {
    keywords: Array.isArray(p?.keywords)
      ? p!.keywords.slice(0, 14).map((k) => ({
        text: String(k.text || ""), inResume: Boolean(k.inResume), importance: String(k.importance || "medium"),
      }))
      : [],
    tailoredText: String(p?.tailoredText || ""),
    // Defensive: the model is asked for plain strings, but a self-critique
    // pass can drift into returning {text/description/summary/change}
    // objects instead -- a raw .map(String) on those produces the literal
    // text "[object Object]", reproduced live. Pull a real string out of
    // the common shapes first; only fall back to String() for anything
    // that's genuinely already a primitive.
    changes: Array.isArray(p?.changes)
      ? p!.changes.map((c) => {
          if (typeof c === "string") return c;
          if (c && typeof c === "object") {
            const o = c as Record<string, unknown>;
            const s = o.text ?? o.description ?? o.summary ?? o.change ?? o.reason;
            if (typeof s === "string" && s) return s;
          }
          return String(c ?? "");
        }).filter(Boolean).slice(0, 6)
      : [],
    atsScore: Math.max(0, Math.min(100, Math.round(Number(p?.atsScore) || 0))),
    scoreReasoning: String(p?.scoreReasoning || ""),
  };
}

const TAILOR_RULES = `
TAILORED RESUME:
- Start with the APPLICANT HEADER lines verbatim if provided (name, contact, location, links). Never invent a name, email, or phone number. If no APPLICANT HEADER is provided, use the header from the sections unchanged. Any professional title shown for the candidate (in the header or right under their name) must be their own current or most recent real title from the sections, taken from their most recent role if it is missing entirely — never the job description's title, and never a higher seniority word ("Senior", "Lead", "Staff", "Principal") than their real title already has.
- Keep ALL company names, titles, dates EXACTLY as in the sections. Never change facts.
- Never alter numbers. Every metric, percentage, dollar figure, headcount, timeframe, date, and job title must appear in the output exactly as it appears in the input. Do not round, scale, add, or remove figures.
- For each requirement under "REQUIRED BUT NOT EVIDENCED": look for genuinely related experience already present in the sections and surface it in the job description's own terminology. If there is no real basis in the sections, leave it out entirely and do not imply it.
- Never add a skill to the skills section that is not supported by the sections.
- Re-order skills to surface the job's terms first, among skills the candidate actually has.
- Strengthen verbs (Led, Shipped, Reduced, Owned). Quantify only with numbers already present.
- If a summary or profile line exists in the sections, its first sentence must open by naming the candidate's own current or most recent job title, never the job description's title unless it already matches.
- Output as clean ATS plain text: section headers in CAPS, dashes for bullets, one column, no tables, no emojis.

KEYWORDS (10 to 14): the most important hard skills, tools, certs and methodologies from the job description. Mark inResume=true only if the term (or a very close variant) is present in the sections. importance: high if it is a stated must have or repeated; medium otherwise; low for nice to haves.

CHANGES (3 to 6): plain-language list of edits, each naming the requirement it addresses and the existing experience it drew on.

ATS SCORE: keyword coverage (60%), title alignment (20%), seniority match (20%). Honest.

VOICE: write the way a thoughtful person writes. Vary sentence length, plain natural language, no AI clichés ("leverage", "passionate", "in today's fast-paced", "proven ability to", "proven track record of", "results-driven", "dynamic professional", "spearheaded transformational initiatives"), no em dashes, no en dashes, never use ' - ' as a connector. Write ranges with the word 'to'.`;

async function handleSmartTailor(
  admin: SupabaseClient<any, any, any>,
  userId: string,
  payload: Record<string, unknown>,
): Promise<Response> {
  const started = Date.now();
  const resumeText = String(payload.resumeText || "");
  const jobTitle = String(payload.jobTitle || "");
  const company = String(payload.company || "");
  const url = payload.url ? String(payload.url) : undefined;
  const resumeVersionId = payload.resume_version_id ? String(payload.resume_version_id) : undefined;
  const matchedSkills = Array.isArray(payload.matched_skills) ? (payload.matched_skills as unknown[]).map(String).slice(0, 20) : [];
  const missingSkills = Array.isArray(payload.missing_skills) ? (payload.missing_skills as unknown[]).map(String).slice(0, 20) : [];

  const jd = await resolveJobJd(admin, url, payload.jdText ? String(payload.jdText) : undefined);
  if (!jd || jd.length < 40) return json({ error: "jd required" }, 400);

  const [identity, canonical] = await Promise.all([
    loadIdentity(admin, userId, { resume_version_id: resumeVersionId }).catch(() => null),
    loadCanonical(admin, userId),
  ]);

  const bundle = buildSections(identity, canonical, resumeText);
  if (!bundle.text || bundle.chars < 60) return json({ error: "No resume content available to tailor" }, 400);

  const gap = computeGap(jd, bundle, { jdSkills: [...matchedSkills, ...missingSkills] });

  const jdHash = (await sha256b(jd)).slice(0, 24);
  const sectionHash = (await sha256b(bundle.text)).slice(0, 16);
  const cacheKey = `tailor:${userId}:${resumeVersionId || "primary"}:${sectionHash}:${jdHash}`;
  const cached = await cacheGet<Record<string, unknown>>(admin, cacheKey);
  if (cached) {
    logAiCall(admin, {
      user_id: userId, purpose: "tailor", cache_hit: true, duration_ms: Date.now() - started,
      source_map: identity?.sourceMap() || null,
      gap_matched: gap.matched.length, gap_missing: gap.missing.length,
      gap_surfaced: Number((cached as any).gapAnalysis?.surfacedCount || 0),
      meta: { jd_chars: jd.length, section_chars: bundle.chars },
    });
    return json({ ...cached, cached: true });
  }

  // v3.14.0 — a tailored resume costs credits. Refuse before spending any
  // model time; the charge itself happens only after the result exists.
  const creditGate = await assertCredits(admin, userId, COST_TAILOR, "tailored resume");
  if (creditGate) return creditGate;



  const applicantBlock = identity ? identityContactBlock(identity) : "";
  const applicantSection = applicantBlock
    ? `\n\nAPPLICANT HEADER (use these exact lines at the top of the tailored resume, never invent alternatives, never omit):\n${applicantBlock}`
    : "";
  const droppedNote = bundle.dropped.length
    ? `\n\nNOTE: these sections were omitted from the payload to fit the budget and must not be referenced: ${bundle.dropped.join(", ")}.`
    : "";

  const userMsg = `TARGET ROLE: ${jobTitle} at ${company}${applicantSection}

APPLICANT SECTIONS (the only source of truth about this person):
${bundle.text}${droppedNote}

JOB DESCRIPTION:
${jd.slice(0, 20000)}${renderGapBlock(gap)}`;

  const system = `You are an ATS resume editor. Tailor the candidate's resume to this job WITHOUT inventing experience.

Return ONLY this JSON (no code fences):
{
  "keywords": [{"text":"<keyword>","inResume": true|false, "importance":"high|medium|low"}],
  "tailoredText": "<full plain-text ATS resume>",
  "changes": ["<change 1>", "<change 2>"],
  "atsScore": <integer 0-100>,
  "scoreReasoning": "<one sentence on the score>"
}
${TAILOR_RULES}`;

  // PASS 1 — draft.
  // v3.97.0 — was QUALITY_MODEL (gemini-2.5-pro). This handler chains two
  // full calls unconditionally (draft + self-critique), so it was the
  // worst-case path for the 176s-measured latency that pushed rewrite/
  // tailor_web past this app's own 150s idle timeout. Flash tier.
  const draftRes = await callAI({ model: DEFAULT_MODEL, system, user: userMsg });
  let out = normalizeTailorOut(parseJsonLoose<TailorOut>(draftRes.text));
  if (!out.tailoredText) return json({ error: "Failed to parse AI response" }, 500);

  // PASS 2 — self critique, then revise. Always for tailoring.
  const critiqueRes = await callAI({
    model: DEFAULT_MODEL,
    system: `You are a strict reviewer of a tailored resume. Check the DRAFT against the SECTIONS and the GAP ANALYSIS on four points:
1. Every claim is grounded in the SECTIONS. Flag anything that is not.
2. Every number, percentage, currency figure, date and year is unchanged from the SECTIONS.
3. No skill appears in the skills section that the SECTIONS do not support.
4. The draft addresses the top items under "REQUIRED BUT NOT EVIDENCED" wherever real related evidence exists, and stays silent where it does not.

Then output the CORRECTED version. Return ONLY the same JSON shape as the draft:
{"keywords":[{"text":"<keyword>","inResume":true|false,"importance":"high|medium|low"}],"tailoredText":"<full plain-text ATS resume>","changes":["<change 1>","<change 2>"],"atsScore":<integer 0-100>,"scoreReasoning":"<one sentence on the score>"}
"changes" must be plain strings, one sentence each describing an edit to the resume -- never an object, and never a note about the changes list itself.
Keep everything that was already correct. Do not add new claims to fix a gap.${TAILOR_RULES}`,
    user: `${userMsg}\n\nDRAFT TO REVIEW:\n${JSON.stringify(out).slice(0, 40000)}`,
  });
  const revised = normalizeTailorOut(parseJsonLoose<TailorOut>(critiqueRes.text));
  if (revised.tailoredText && revised.tailoredText.length > out.tailoredText.length * 0.5) {
    // The critique pass's own restated changes/atsScore/scoreReasoning are
    // unreliable, reproduced live: when it made no real edit to the resume
    // text, it still has to fill out the same JSON shape, and instead of
    // repeating pass 1's fields it invents meta-commentary about its own
    // review ("No changes were made to the tailoredText section...") and
    // the score frequently comes back 0 — a value this rubric can never
    // legitimately produce for a real resume. Pass 1's values are already
    // grounded and valid, so keep them whenever pass 2 didn't actually
    // change the text, and use them as a fallback even when it did.
    const priorChanges = out.changes;
    const priorScore = out.atsScore;
    const priorReasoning = out.scoreReasoning;
    const textActuallyChanged = revised.tailoredText.trim() !== out.tailoredText.trim();
    out = revised;
    if (!textActuallyChanged) {
      out.changes = priorChanges;
      out.atsScore = priorScore;
      out.scoreReasoning = priorReasoning;
    } else {
      if (!out.atsScore) { out.atsScore = priorScore; out.scoreReasoning = priorReasoning; }
      if (!out.changes.length) out.changes = priorChanges;
    }
  }

  // FIGURE PRESERVATION — verified in code, not asked for.
  let missingFigures = droppedFigures(bundle.text, out.tailoredText);
  if (missingFigures.length) {
    const retry = await callAI({
      model: DEFAULT_MODEL,
      system,
      user: `${userMsg}\n\nPREVIOUS ATTEMPT DROPPED OR ALTERED THESE FIGURES: ${missingFigures.slice(0, 30).join(", ")}\nProduce the tailored resume again with every one of those figures present, unchanged, in the bullet it belongs to.`,
    });
    const fixed = normalizeTailorOut(parseJsonLoose<TailorOut>(retry.text));
    if (fixed.tailoredText) {
      const stillMissing = droppedFigures(bundle.text, fixed.tailoredText);
      if (stillMissing.length < missingFigures.length) { out = fixed; missingFigures = stillMissing; }
    }
  }

  // SURFACED — recompute the gap against the tailored output. Requirements
  // that were missing before and are evidenced now were genuinely surfaced.
  const afterBundle: SectionBundle = { sections: bundle.sections, text: out.tailoredText, dropped: [], chars: out.tailoredText.length };
  const afterGap = computeGap(jd, afterBundle, { jdSkills: [...matchedSkills, ...missingSkills] });
  const afterMatched = new Set(afterGap.requirements.filter((r) => r.status === "matched").map((r) => r.text));
  const surfaced = gap.missing.filter((r) => afterMatched.has(r.text)).map((r) => r.text);

  const result = {
    ...out,
    gapAnalysis: {
      method: gap.method,
      alreadyStrong: gap.matched.map((r) => ({ text: r.text, evidence: r.evidence })),
      surfaced,
      surfacedCount: surfaced.length,
      stillMissing: gap.missing.filter((r) => !afterMatched.has(r.text)).map((r) => r.text),
      niceToHave: gap.niceToHave.map((r) => ({ text: r.text, met: r.status === "matched" })),
      counts: { matched: gap.matched.length, missing: gap.missing.length, surfaced: surfaced.length },
    },
    figuresVerified: missingFigures.length === 0,
    figuresAltered: missingFigures.slice(0, 20),
    sectionsUsed: { chars: bundle.chars, dropped: bundle.dropped },
  };

  // Charge now that the generation actually succeeded.
  const charge = await creditSpend(admin, userId, COST_TAILOR, "tailored_resume", jdHash);
  if (!charge.ok) return insufficientCredits(charge.balance, COST_TAILOR, "tailored resume");

  cacheSet(admin, cacheKey, userId, "tailor", result, TAILOR_TTL);
  logAiCall(admin, {
    user_id: userId, purpose: "tailor", model: DEFAULT_MODEL, duration_ms: Date.now() - started,
    cache_hit: false, source_map: identity?.sourceMap() || null,
    gap_matched: gap.matched.length, gap_missing: gap.missing.length, gap_surfaced: surfaced.length,
    meta: { jd_chars: jd.length, section_chars: bundle.chars, dropped: bundle.dropped, figures_ok: missingFigures.length === 0, passes: 2, credits_spent: COST_TAILOR },
  });

  return json({ ...result, credits: { spent: COST_TAILOR, balance: charge.balance } });
}

async function handleCoverLetter(
  admin: SupabaseClient<any, any, any>,
  userId: string,
  payload: Record<string, unknown>,
): Promise<Response> {
  const started = Date.now();
  const resumeText = String(payload.resumeText || "");
  const tone = String(payload.tone || "professional, warm");
  const company = String(payload.company || "");
  const jobTitle = String(payload.jobTitle || "");
  const url = payload.url ? String(payload.url) : undefined;
  const resumeVersionId = payload.resume_version_id ? String(payload.resume_version_id) : undefined;
  const lengthKey = String(payload.length || "standard");
  const wordCap = lengthKey === "short" ? 180 : lengthKey === "detailed" ? 400 : 280;
  const guidanceRaw = String(payload.guidance || "").trim().slice(0, 200);
  const guidanceLine = guidanceRaw
    ? `\n- The applicant asked you to emphasize: ${guidanceRaw}. Honour this only where the sections support it; if it is not supported, ignore the request rather than inventing anything.`
    : "";

  const jd = await resolveJobJd(admin, url, payload.jdText ? String(payload.jdText) : undefined);
  if (!jd || jd.length < 40) return json({ error: "jd required" }, 400);

  const [identity, canonical, companyCtx] = await Promise.all([
    loadIdentity(admin, userId, { resume_version_id: resumeVersionId }).catch(() => null),
    loadCanonical(admin, userId),
    fetchCompanyContext(admin, company, url).catch(() => ({ text: "", source: "" })),
  ]);

  const bundle = buildSections(identity, canonical, resumeText);
  if (!bundle.text || bundle.chars < 60) return json({ error: "No resume content available" }, 400);
  const gap = computeGap(jd, bundle);

  const jdHash = (await sha256b(jd)).slice(0, 24);
  const sectionHash = (await sha256b(bundle.text)).slice(0, 16);
  const cacheKey = `cover:${userId}:${resumeVersionId || "primary"}:${sectionHash}:${jdHash}:${lengthKey}:${await sha256b(tone + guidanceRaw)}`.slice(0, 200);
  const cached = await cacheGet<Record<string, unknown>>(admin, cacheKey);
  if (cached) {
    logAiCall(admin, {
      user_id: userId, purpose: "cover_letter", cache_hit: true, duration_ms: Date.now() - started,
      source_map: identity?.sourceMap() || null, meta: { length: lengthKey },
    });
    return json({ ...cached, cached: true });
  }

  // v3.14.0 — a cover letter costs one credit. Cache hits above are free.
  const creditGate = await assertCredits(admin, userId, COST_COVER, "cover letter");
  if (creditGate) return creditGate;



  const applicantBlock = identity ? identityContactBlock(identity) : "";
  const applicantSection = applicantBlock
    ? `\n\nAPPLICANT (use these exact contact details in the header and signature, never invent alternatives):\n${applicantBlock}`
    : "";
  const companySection = companyCtx.text
    ? `\n\nCOMPANY CONTEXT (from ${companyCtx.source}, the employer's own public page):\n${companyCtx.text}`
    : "";

  const system = `Write a cover letter under ${wordCap} words. Tone: ${tone}. Address ${company || "the hiring team"}${jobTitle ? ` for the ${jobTitle} role` : ""}.

STRUCTURE (4 short paragraphs):
1) Opening: who you are, the specific role, and one specific thing about this employer drawn from COMPANY CONTEXT. If COMPANY CONTEXT is absent or says nothing concrete, open with the role and the candidate's most relevant strength instead. Never invent enthusiasm or facts about the company.
2) Proof: one concrete achievement from the sections that maps to a stated requirement. Include the number or scale if it is present in the sections.
3) Skill bridge: two or three specific tools or skills the job asks for that the sections genuinely support. Tie them to outcomes, not lists.
4) Close: a clear ask for a conversation, then sign off.

RULES:
- Use ONLY facts from the APPLICANT SECTIONS, the APPLICANT block, and COMPANY CONTEXT. Never invent companies, metrics, dates, names, emails, or phone numbers.
- Never alter numbers. Every metric, percentage, currency figure, headcount, timeframe, date and job title must appear exactly as in the sections.
- Do not claim any requirement listed as not evidenced in the GAP ANALYSIS unless real related experience is in the sections.
- The signature MUST use the applicant's real name from the APPLICANT block if provided. Never invent a name.
- No clichés ("I'm excited to apply", "I hope this finds you well", "results-driven", "passionate", "leverage", "in today's fast-paced").
- Write the way a thoughtful person writes: vary sentence length, plain natural language, no em dashes, no en dashes, never use ' - ' as a connector. Write ranges with the word 'to'.
- Plain text, no markdown.${guidanceLine}`;

  const userMsg = `APPLICANT SECTIONS:\n${bundle.text}${applicantSection}${companySection}\n\nJOB DESCRIPTION:\n${jd.slice(0, 20000)}${renderGapBlock(gap)}`;

  const draft = await callAI({ model: QUALITY_MODEL, system, user: userMsg });
  let body = String(draft.text || "").trim();
  let passes = 1;

  // Two-pass quality on the detailed tier only.
  if (lengthKey === "detailed" && body) {
    const critique = await callAI({
      model: QUALITY_MODEL,
      system: `${system}\n\nYou are now revising a draft. Check it on four points: every claim is grounded in the sections, every number and date is unchanged, no skill is claimed without support, and it addresses the top requirements where real evidence exists. Return ONLY the corrected letter as plain text, nothing else.`,
      user: `${userMsg}\n\nDRAFT TO REVISE:\n${body}`,
    });
    const revised = String(critique.text || "").trim();
    if (revised.length > body.length * 0.5) { body = revised; passes = 2; }
  }

  // A cover letter only cites a handful of figures, so we verify the other
  // direction: every figure IN the letter must exist verbatim in the sections.
  let missingFigures = droppedFigures(body, bundle.text).filter((f) => f.length > 1);
  if (missingFigures.length) {
    const retry = await callAI({
      model: QUALITY_MODEL,
      system,
      user: `${userMsg}\n\nTHE PREVIOUS DRAFT CITED FIGURES THAT DO NOT APPEAR IN THE SECTIONS: ${missingFigures.slice(0, 20).join(", ")}\nRewrite the letter using only figures that appear verbatim in the sections, or no figures at all.`,
    });
    const fixed = String(retry.text || "").trim();
    if (fixed) {
      const still = droppedFigures(fixed, bundle.text).filter((f) => f.length > 1);
      if (still.length < missingFigures.length) { body = fixed; missingFigures = still; }
    }
  }

  const result = {
    body,
    companyContext: companyCtx.text ? { source: companyCtx.source, chars: companyCtx.text.length } : null,
    figuresVerified: missingFigures.length === 0,
    figuresUnsupported: missingFigures.slice(0, 20),
    sectionsUsed: { chars: bundle.chars, dropped: bundle.dropped },
  };

  const charge = await creditSpend(admin, userId, COST_COVER, "cover_letter", jdHash);
  if (!charge.ok) return insufficientCredits(charge.balance, COST_COVER, "cover letter");

  cacheSet(admin, cacheKey, userId, "cover_letter", result, TAILOR_TTL);
  logAiCall(admin, {
    user_id: userId, purpose: "cover_letter", model: QUALITY_MODEL, duration_ms: Date.now() - started,
    cache_hit: false, source_map: identity?.sourceMap() || null,
    gap_matched: gap.matched.length, gap_missing: gap.missing.length,
    meta: { jd_chars: jd.length, section_chars: bundle.chars, length: lengthKey, passes, company_ctx: !!companyCtx.text, figures_ok: missingFigures.length === 0, credits_spent: COST_COVER },
  });

  return json({ ...result, credits: { spent: COST_COVER, balance: charge.balance } });
}


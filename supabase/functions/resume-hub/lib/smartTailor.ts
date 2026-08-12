// v3.131.0 — stage 11 of the resume-hub reorganization: tailor and cover
// letter, "the product now that autofill is gone" (see the section
// comment just below) — identity everywhere, structured sections instead
// of character slices, a DETERMINISTIC gap analysis computed in code (the
// model never discovers what is missing, it only decides what to surface
// and how to phrase it), a self-critique revision pass, and programmatic
// verification that no number/percentage/currency figure/year was
// altered. handleSmartTailor/handleCoverLetter are the extension lane's
// versions; the web lane's own tailor/cover_letter actions in the
// Deno.serve dispatcher share TAILOR_TTL/parseJsonLoose but have their
// own separate inline implementations (not touched by this move — only
// the extension-lane handlers were ever factored into named functions).
// Pure code movement, zero logic changes.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.45.0";
import { loadIdentity, identityContactBlock } from "../../_shared/identity.ts";
import { para } from "../../_shared/emailTemplate.ts";
import {
  sha256 as sha256b, buildSections, computeGap, renderGapBlock, droppedFigures,
  cacheGet, cacheSet, logAiCall, fetchCompanyContext,
  verifyProseQuality, violationsToRetryNote,
  type SectionBundle,
} from "../../_shared/tailoring.ts";
import { json } from "./utils.ts";
import { DEFAULT_MODEL, QUALITY_MODEL, callAI } from "./ai.ts";
import { loadCanonical } from "./canonicalProfile.ts";
import { resolveJobJd } from "./jobParsing.ts";
import { COST_TAILOR, COST_COVER, assertCredits, creditSpend, insufficientCredits } from "./billing.ts";

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

export const TAILOR_TTL = 7 * 24 * 60 * 60 * 1000;






export function parseJsonLoose<T>(text: string): T | null {
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
- If the sections list more than about 5 roles or reach back more than 10 to 15 years, give full bullets only to the most recent, most relevant roles and compress the rest to one line each (title, company, dates, no bullets).
- Strengthen verbs (Led, Shipped, Reduced, Owned). Quantify only with numbers already present. Shape a bullet as Accomplished-[X]-measured-by-[Y]-by-doing-[Z] wherever the underlying fact supports it.
- If a summary or profile line exists in the sections, its first sentence must open by naming the candidate's own current or most recent job title, never the job description's title unless it already matches. The whole summary stays 1 to 2 sentences, no more.
- No first-person pronouns ("I", "me", "my", "we"). The current role is written in present tense; every past role is written in past tense.
- If a bullet uses an internal-only company term or project codename, translate it into the plain, industry-standard equivalent so an outside reader recognizes it immediately — rephrase only, never invent a detail about what the internal thing was.
- Output as clean ATS plain text: section headers in CAPS, dashes for bullets, one column, no tables, no emojis.

KEYWORDS (10 to 14): the most important hard skills, tools, certs and methodologies from the job description. Mark inResume=true only if the term (or a very close variant) is present in the sections. importance: high if it is a stated must have or repeated; medium otherwise; low for nice to haves.

CHANGES (3 to 6): plain-language list of edits, each naming the requirement it addresses and the existing experience it drew on.

ATS SCORE: keyword coverage (60%), title alignment (20%), seniority match (20%). Honest.

VOICE: write the way a thoughtful person writes. Vary sentence length, plain natural language, no AI clichés ("leverage", "passionate", "in today's fast-paced", "proven ability to", "proven track record of", "results-driven", "dynamic professional", "spearheaded transformational initiatives", "realm", "intricate", "showcasing", "pivotal", "delve", "synergy", "hard-working", "detail-oriented"), no em dashes, no en dashes, never use ' - ' as a connector. Write ranges with the word 'to'.`;

export async function handleSmartTailor(
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

  // SELF-VERIFICATION — figures, banned phrases, pronouns, dashes, all
  // checked in code, not asked for. One retry naming every violation found.
  let missingFigures = droppedFigures(bundle.text, out.tailoredText);
  let proseViolations = verifyProseQuality(out.tailoredText);
  if (missingFigures.length || proseViolations.length) {
    const figureNote = missingFigures.length
      ? `- Dropped or altered these figures: ${missingFigures.slice(0, 30).join(", ")}. Include every one of them, unchanged, in the bullet it belongs to.\n`
      : "";
    const proseNote = proseViolations.length ? violationsToRetryNote(proseViolations) : "";
    const retry = await callAI({
      model: DEFAULT_MODEL,
      system,
      user: `${userMsg}\n\n${figureNote}${proseNote}`,
    });
    const fixed = normalizeTailorOut(parseJsonLoose<TailorOut>(retry.text));
    if (fixed.tailoredText) {
      const stillMissing = droppedFigures(bundle.text, fixed.tailoredText);
      const stillProse = verifyProseQuality(fixed.tailoredText);
      if (stillMissing.length + stillProse.length < missingFigures.length + proseViolations.length) {
        out = fixed; missingFigures = stillMissing; proseViolations = stillProse;
      }
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

export async function handleCoverLetter(
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
  const wordCap = lengthKey === "short" ? 180 : lengthKey === "detailed" ? 400 : 300;
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

STRUCTURE (4 short paragraphs, target word counts assume the standard length; scale proportionally for short/detailed):
1) Hook (about 50 words): who you are, the specific role, and one specific thing about this employer drawn from COMPANY CONTEXT. If COMPANY CONTEXT is absent or says nothing concrete, open with the role and the candidate's most relevant strength instead. Never invent enthusiasm or facts about the company.
2) Proof (about 100 words): one or two concrete achievements from the sections that map to the job's hardest stated requirements. Include the number or scale if it is present in the sections. Show, don't tell.
3) Alignment (about 75 words): two or three specific tools or skills the job asks for that the sections genuinely support. Tie them to outcomes and to why this employer specifically, not a generic list.
4) Close (about 40 words): a clear, low-friction ask for a conversation, then sign off.

RULES:
- Use ONLY facts from the APPLICANT SECTIONS, the APPLICANT block, and COMPANY CONTEXT. Never invent companies, metrics, dates, names, emails, or phone numbers.
- Never alter numbers. Every metric, percentage, currency figure, headcount, timeframe, date and job title must appear exactly as in the sections.
- Do not claim any requirement listed as not evidenced in the GAP ANALYSIS unless real related experience is in the sections.
- The signature MUST use the applicant's real name from the APPLICANT block if provided. Never invent a name.
- No clichés ("I'm excited to apply", "I hope this finds you well", "results-driven", "passionate", "leverage", "in today's fast-paced", "realm", "intricate", "showcasing", "pivotal", "delve", "synergy").
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
  // Banned phrases and dashes checked too; pronouns are NOT — a cover
  // letter is legitimately first person, unlike a resume bullet.
  let missingFigures = droppedFigures(body, bundle.text).filter((f) => f.length > 1);
  let coverProseViolations = verifyProseQuality(body, false);
  if (missingFigures.length || coverProseViolations.length) {
    const figureNote = missingFigures.length
      ? `THE PREVIOUS DRAFT CITED FIGURES THAT DO NOT APPEAR IN THE SECTIONS: ${missingFigures.slice(0, 20).join(", ")}\nRewrite the letter using only figures that appear verbatim in the sections, or no figures at all.\n`
      : "";
    const proseNote = coverProseViolations.length ? violationsToRetryNote(coverProseViolations) : "";
    const retry = await callAI({
      model: QUALITY_MODEL,
      system,
      user: `${userMsg}\n\n${figureNote}${proseNote}`,
    });
    const fixed = String(retry.text || "").trim();
    if (fixed) {
      const still = droppedFigures(fixed, bundle.text).filter((f) => f.length > 1);
      const stillProse = verifyProseQuality(fixed, false);
      if (still.length + stillProse.length < missingFigures.length + coverProseViolations.length) {
        body = fixed; missingFigures = still; coverProseViolations = stillProse;
      }
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


// Extracted from index.ts as part of the monolith reorganization. Browse Jobs actions: job_board_score, role_finder, job_board_trending.
// Pure code movement: each handler is the original inline block, unchanged,
// taking the request context it used to close over.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { loadIdentity } from "../../_shared/identity.ts";
import { sha256 as sha256b, buildSections, computeGap, cacheGet, cacheSet, flattenResumeSkillsAndProse, computeQuickScore } from "../../_shared/tailoring.ts";
import { evaluateResumeText, RESUME_EVALUATION_VERSION } from "../../_shared/resumeEvaluation.ts";
import { json } from "./utils.ts";
import { featureGate, accountGate, rateLimitGate } from "./gates.ts";
import { loadCanonical } from "./canonicalProfile.ts";
import { mapConcurrent } from "../../_shared/concurrency.ts";
import type { BaseCtx } from "./actionCtx.ts";
import { publicResumeReview } from "../../_shared/publicResumeReview.ts";

// ---------------- job_board_score (free) ----------------
// v3.134.0 — the point of storing real, clean JD text from job_postings
// ahead of time (job-board-sync) is that a browse list can show a real
// match score per job, not just a list of titles.
//
// v3.317.0 — the deliberate v3.134.0/v3.149.0 tradeoff (a zero-AI-call
// deterministic score, honestly cruder than match/tailor/job_fit_advice)
// is retired. Asked directly for one accurate scoring system used
// everywhere, not a crude one for browse lists and an accurate one for
// a single opened job — and confirmed first, with real data, that the
// JD text itself was never the problem (2,617 of 2,788 real postings
// already carry a substantial, complete description, median 5,572
// characters) — the gap was always the SCORING METHOD, not the input.
// Now runs the identical computeGap + semanticGapRecheck pipeline the
// real match action trusts, so a browse-list score and a clicked-into
// score can no longer disagree about what's genuinely matched. Kept
// affordable the same way every other AI-touching action in this file
// already is: real, per-job caching (ai_result_cache, 24h, keyed on
// job content + this profile's own section text) so a repeat view of
// the same job by the same profile costs nothing after the first —
// only a genuinely new-to-this-user job on a page ever pays for an
// embedding call, and even then only for whatever the deterministic
// pass didn't already resolve, same as match's own real cost profile.
export async function handleJobBoardScore(ctx: BaseCtx): Promise<Response> {
  const { supabaseUrl, serviceKey, action, payload, user } = ctx;
  const adminScore = createClient(supabaseUrl, serviceKey);
  { const off = await featureGate(adminScore, "tailoring"); if (off) return off; }
  { const blocked = await accountGate(adminScore, user.id, action); if (blocked) return blocked; }
  { const limited = await rateLimitGate(adminScore, user.id, action, 60, 15); if (limited) return limited; }
  const { jobs } = payload as { jobs?: Array<{ id: string; title?: string; description: string; skills?: string[] }> };
  if (!Array.isArray(jobs) || !jobs.length) return json({ error: "jobs required" }, 400);
  const capped = jobs.slice(0, 50);

  const identity = await loadIdentity(adminScore, user.id, {}).catch(() => null);
  const document = identity?.resume.raw;
  if (!document) {
    return json({ scores: capped.map((j) => ({ id: j.id, match_pct: null })) });
  }
  // Flattened once, reused for every job below -- evaluateResumeText
  // does the identical computeGap match/tailor/job_fit_advice now share,
  // just against pre-flattened text so a 50-job page doesn't re-flatten
  // the same resume 50 times. A browse-list score and a clicked-into
  // score can no longer disagree about what's genuinely matched.
  const documentText = flattenResumeSkillsAndProse(document);
  const sectionHash = (await sha256b(documentText)).slice(0, 16);
  const scores = await mapConcurrent(capped, 2, async (j) => {
    const jdText = String(j.description || "");
    if (!jdText.trim()) return { id: j.id, match_pct: null };
    const jdHash = (await sha256b(jdText)).slice(0, 24);
    const cacheKey = `boardscore:${RESUME_EVALUATION_VERSION}:${user.id}:${sectionHash}:${jdHash}`;
    const cached = await cacheGet<{ match_pct: number }>(adminScore, cacheKey);
    if (cached) return { id: j.id, match_pct: cached.match_pct };

    const { matchPct: match_pct } = evaluateResumeText(documentText, jdText);

    if (match_pct != null) cacheSet(adminScore, cacheKey, user.id, "job_board_score", { match_pct }, 24 * 60 * 60 * 1000);
    return { id: j.id, match_pct };
  });
  return json({ scores });
}

// ---------------- role_finder (free) ----------------
// v3.151.0 — the grounded answer to "what other real job titles fit
// me," instead of an LLM inventing 15 titles with guessed salary and
// demand numbers (the exact fabrication shape this app's own deleted
// free-form chat produced once already, v3.8.0). Same computeQuickScore
// job_board_score already uses, swept across the live job_postings
// catalog instead of one browse page, then grouped by real title —
// "openings" is a real count of currently-listed postings under that
// title, never a guessed demand label. Still zero AI calls.
export async function handleRoleFinder(ctx: BaseCtx): Promise<Response> {
  const { supabaseUrl, serviceKey, action, user } = ctx;
  const adminRoles = createClient(supabaseUrl, serviceKey);
  { const off = await featureGate(adminRoles, "tailoring"); if (off) return off; }
  { const blocked = await accountGate(adminRoles, user.id, action); if (blocked) return blocked; }
  { const limited = await rateLimitGate(adminRoles, user.id, action, 10, 15); if (limited) return limited; }

  const [identity, canonical] = await Promise.all([
    loadIdentity(adminRoles, user.id, {}).catch(() => null),
    loadCanonical(adminRoles, user.id),
  ]);
  const bundle = buildSections(identity, canonical);
  if (!bundle.text || bundle.chars < 60) return json({ roles: [], has_profile: false });

  const profile = {
    skills: bundle.sections.skills,
    title: identity?.current_title.value || "",
    yearsExperience: identity?.computed_years_experience.value || 0,
  };

  const { data: postings, error: postingsErr } = await adminRoles
    .from("job_postings")
    .select("id, title, company, description, posted_at, skills")
    .order("posted_at", { ascending: false })
    .limit(6000);
  if (postingsErr) return json({ error: postingsErr.message }, 500);

  type Bucket = { title: string; sumScore: number; count: number; companies: Set<string>; bestId: string; bestScore: number };
  const buckets = new Map<string, Bucket>();
  for (const row of (postings || []) as Array<{ id: string; title: string | null; company: string | null; description: string | null; skills: string[] | null }>) {
    const title = String(row.title || "").trim();
    if (!title) continue;
    const q = computeQuickScore(String(row.description || ""), title, profile, row.skills || undefined);
    const key = title.toLowerCase();
    let b = buckets.get(key);
    if (!b) { b = { title, sumScore: 0, count: 0, companies: new Set(), bestId: row.id, bestScore: -1 }; buckets.set(key, b); }
    b.sumScore += q.score;
    b.count += 1;
    if (row.company) b.companies.add(String(row.company));
    if (q.score > b.bestScore) { b.bestScore = q.score; b.bestId = row.id; }
  }

  const roles = Array.from(buckets.values())
    .map((b) => ({
      title: b.title,
      match_pct: Math.round(b.sumScore / b.count),
      openings: b.count,
      companies: Array.from(b.companies).slice(0, 3),
      sample_job_id: b.bestId,
    }))
    .filter((r) => r.match_pct >= 30)
    .sort((a, b) => b.match_pct - a.match_pct || b.openings - a.openings)
    .slice(0, 15);

  return json({ roles, has_profile: true });
}

// ---------------- job_board_trending (free) ----------------
// v3.166.0 — real posting volume, nationally and scoped to a chosen
// city, over the last 3 days. Deliberately NOT freehire's own view/
// applied counts: a live sample of real postings confirmed those are
// almost always zero, not a usable signal. This counts what's actually
// landing instead -- same "code decides facts, never invents a demand
// number" rule role_finder right above already follows.
// v3.169.0 — the original fetch-then-aggregate-in-JS approach capped
// at .limit(8000) with no .order(), assuming the 3-day window would
// stay comfortably under that. It didn't: found live during a
// verification sweep that the real window already holds 9,449+ rows,
// so the hand-aggregated "top 10" was being computed from an
// arbitrary, unordered ~84% slice, not the true totals (confirmed:
// direct SQL put SpaceX at 2,131 in-window postings, the old code
// reported 373). Moved the aggregation into Postgres itself
// (job_board_trending_counts, a real GROUP BY) -- correct at any
// table size, not a bigger guess at a limit that will just be wrong
// again once the table grows past it.
export async function handleJobBoardTrending(ctx: BaseCtx): Promise<Response> {
  const { supabaseUrl, serviceKey, action, payload, user } = ctx;
  const adminTrend = createClient(supabaseUrl, serviceKey);
  { const off = await featureGate(adminTrend, "tailoring"); if (off) return off; }
  { const blocked = await accountGate(adminTrend, user.id, action); if (blocked) return blocked; }
  { const limited = await rateLimitGate(adminTrend, user.id, action, 30, 15); if (limited) return limited; }

  const { city } = payload as { city?: string };
  const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  const cityArg = city && String(city).trim() ? String(city).trim() : null;

  const { data: rows, error: rpcErr } = await adminTrend.rpc("job_board_trending_counts", {
    p_since: cutoff,
    p_city: cityArg,
  });
  if (rpcErr) return json({ error: rpcErr.message }, 500);

  type Row = { scope: string; metric: string; label: string; cnt: number };
  const all = (rows || []) as Row[];
  const pick = (scope: string, metric: "category" | "company") =>
    all
      .filter((r) => r.scope === scope && r.metric === metric)
      .map((r) => ({ [metric]: r.label, count: Number(r.cnt) }));

  const national = { byCategory: pick("national", "category"), byCompany: pick("national", "company") };

  let cityResult: { name: string; byCategory: unknown[]; byCompany: unknown[] } | null = null;
  if (cityArg) {
    cityResult = { name: cityArg, byCategory: pick("city", "category"), byCompany: pick("city", "company") };
  }

  return json({ national, city: cityResult });
}

/** Public (no-account) literal resume-vs-JD check. Pure text-in, deterministic
 * logic out: no AI call, no outbound fetch, no write. */
export function handleResumeCheckPublic(payload: Record<string, unknown>): Response {
  const { resumeText, jdText } = payload as { resumeText?: string; jdText?: string };
  if (typeof resumeText !== 'string' || typeof jdText !== 'string' || !resumeText.trim() || !jdText.trim()) {
    return json({ error: "resumeText and jdText are both required" }, 400);
  }
  if (resumeText.length > 20_000 || jdText.length > 20_000) {
    return json({ error: "That's longer than a real resume or job description ever needs to be. Please paste the real text, not a whole page." }, 413);
  }
  return json(publicResumeReview(resumeText, jdText));
}

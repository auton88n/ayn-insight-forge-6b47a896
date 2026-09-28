// v3.327.0 — extracted from index.ts, part of the ~58-action dispatcher
// split into per-domain files. employer_match: the two-step noise
// cancellation described in the header comment right above where this
// action used to sit inline -- a deterministic must-have prefilter, then
// vector recall (match_candidates_by_embedding), then a grounded AI
// rerank on opaque refs, then attaching each top card's anonymous
// profile block and first name. This is the single largest and most
// security-sensitive handler in the file (the candidate-search pipeline
// itself), so it gets its own file rather than being folded into a
// broader domain grouping. Pure code movement, zero logic changes.
import type { ActionCtx } from "./actionCtx.ts";
import { json } from "./utils.ts";
import { featureGate, rateLimitGate, discoveryRestrictedIds } from "./gates.ts";
import { callAI, DEFAULT_MODEL, QUALITY_MODEL } from "./ai.ts";
import { FALLBACK_EMBED_MODEL, embedText } from "./embeddings.ts";
import { indexCandidate, buildCandidateProfile } from "./candidateIndex.ts";
import { loadCanonical } from "./canonicalProfile.ts";
import { EMPLOYER_SEARCH_SOFT_CAP, employerBilling, planLimitReached, effectiveLimit } from "./billing.ts";

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
export async function handleEmployerMatch(ctx: ActionCtx): Promise<Response> {
  { const off = await featureGate(ctx.admin, "candidate_search"); if (off) return off; }
  { const limited = await rateLimitGate(ctx.admin, ctx.userId, ctx.action, 15, 15); if (limited) return limited; }
  const { org_id, job_spec } = ctx.payload as { org_id?: string; job_spec?: Record<string, unknown> };
  if (!org_id || !job_spec) return json({ error: "org_id and job_spec required" }, 400);
  if (!(await ctx.assertOrgMember(org_id))) return json({ error: "not an org member" }, 403);
  const gate = await ctx.assertOrgProfileComplete(org_id);
  if (gate) return gate;

  // v3.27.0 — searches are a plan allowance like proposals and assessments.
  // Plans with no allowance recorded still hit the friendly soft abuse cap.
  const searchBilling = await employerBilling(ctx.admin, ctx.userId, org_id);
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
  const { data: consented } = await ctx.admin.from("talent_pool_consent")
    .select("user_id").eq("opted_in", true);
  // v3.28.0 — drop anyone an admin has restricted from discovery.
  const consentedMatchIds = (consented || []).map(r => r.user_id);
  const hiddenMatch = await discoveryRestrictedIds(ctx.admin, consentedMatchIds);
  const candidateIds = consentedMatchIds.filter(id => !hiddenMatch.has(id));
  if (candidateIds.length === 0) {
    return json({ search_id: null, results: [], pool_note: "No candidates are in the pool yet." });
  }

  // Load their extracted skills (only extracted can satisfy must-haves).
  const { data: skillRows } = await ctx.admin.from("candidate_skills")
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
  const { data: modelRows } = await ctx.admin.from("candidate_index")
    .select("user_id, embedding_model")
    .in("user_id", eligibleIds);

  if (specModel !== FALLBACK_EMBED_MODEL) {
    const stale = (modelRows || []).filter(r => (r.embedding_model || FALLBACK_EMBED_MODEL) !== specModel).slice(0, 25);
    // v3.160.0 — was a sequential for-await loop, adding the sum of up
    // to 25 candidates' own embedding-call latency to this one live
    // search request. Each call is independent (its own userId, its
    // own candidate_index row, nothing shared between iterations), so
    // fanning out concurrently is safe — same pattern embedBatch
    // already uses elsewhere in this file for the identical reason.
    // allSettled (not all) so one candidate's failure never drops the
    // others' successful reindex, matching the prior per-iteration
    // try/catch's own behavior.
    const results = await Promise.allSettled(stale.map(r => indexCandidate(ctx.admin, r.user_id)));
    results.forEach((res, i) => {
      if (res.status === "rejected") console.error("inline reindex failed", stale[i].user_id, res.reason);
    });
  }

  const { data: rankedRows, error: rankErr } = await ctx.admin.rpc("match_candidates_by_embedding", {
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
  // Impact-to-tenure: a deterministic count of quantified results
  // (numbers, percentages, dollar/scale figures) in what the candidate
  // actually wrote, divided by years of experience — one more real
  // signal, counted in code rather than guessed at by the model, same
  // design rule as the rest of this file ("the model never discovers
  // what is missing, code does that"). A high ratio means concrete,
  // provable delivery relative to tenure; a null ratio (0 years on
  // file) is left null rather than guessed.
  const IMPACT_METRIC_RE = /(\d[\d,.]*\s?%|[$€£]\s?\d[\d,.]*\s?(?:k|m|b|bn|million|billion)?|\b\d[\d,.]*\s?(?:x|\+)\b)/gi;
  const countImpactMetrics = (text: string): number => (String(text || "").match(IMPACT_METRIC_RE) || []).length;

  const refMap: Record<string, string> = {};
  const rerankInput = ranked.map((row, i) => {
    const ref = `c${i + 1}`;
    refMap[ref] = row.user_id;
    const impactCount = countImpactMetrics(row.profile_text || "");
    const yoe = row.years_experience || 0;
    const impactToTenure = yoe > 0 ? Math.round((impactCount / yoe) * 10) / 10 : null;
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
      impact_metrics_count: impactCount,
      impact_to_tenure_ratio: impactToTenure,
    };
  });

  const rerankSys = `You are AYN's employer-side hiring judge. Score each candidate 1-100 for THIS job_spec. Rules, strict:
- must_have coverage may ONLY cite skills from candidate.skills.extracted. Never let an inferred skill satisfy a must-have.
- Inferred skills may contribute AT MOST 10 total points across nice-to-haves.
- Every sentence in "why" must reference something literally present in the candidate's provided data (profile_text, seniority, years_experience, location, or extracted/inferred skills). No speculation.
- candidate.impact_to_tenure_ratio (quantified results per year of experience, counted from their own words, null if years unknown) is one more real signal on delivery, not a replacement for skills or seniority fit. A high ratio is a genuine plus worth a line in "why" when it is notably high; never let it override a clear skills or must-have mismatch.
- If fewer than 3 candidates are genuinely strong, return fewer and explain in pool_note. Do not pad.
- Never mention refs, ids, names, or emails you were not given. Never invent skills.
- Output ONLY JSON: {"results":[{"ref":"c1","score":87,"why":["...","...","..."],"matched_must_haves":[],"gaps":[]}],"pool_note":""}
- Plain prose only. No markdown. NO EM DASHES, NO EN DASHES, EVER, NO EXCEPTIONS. Use the word "to" for ranges. Must not read as AI-generated: no telltale AI phrasing, no uniform sentence rhythm, no overused connector words.`;
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
        impact_to_tenure_ratio: c.impact_to_tenure_ratio,
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
      const canon = await loadCanonical(ctx.admin, uid);
      if (canon) (card as Record<string, unknown>).profile = buildCandidateProfile(canon);
    } catch (e) {
      console.error("profile block failed", card.ref, (e as Error).message);
    }
    try {
      const { data: prof } = await ctx.admin.from("user_profile_data")
        .select("legal_first_name").eq("user_id", uid).maybeSingle();
      const first = String(prof?.legal_first_name || "").trim().split(/\s+/)[0] || "";
      if (first) (card as Record<string, unknown>).first_name = first;
    } catch (e) {
      console.error("first name lookup failed", card.ref, (e as Error).message);
    }
  }




  const { data: search, error: sErr } = await ctx.admin.from("employer_searches").insert({
    org_id, created_by: ctx.userId, job_spec, results: top, ref_map: refMap,
  }).select("id").single();
  if (sErr) return json({ error: sErr.message }, 500);

  return json({ search_id: search.id, results: top, pool_note: rrParsed.pool_note || "" });
}

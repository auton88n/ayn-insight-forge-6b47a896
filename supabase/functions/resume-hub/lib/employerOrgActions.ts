// v3.326.0 — extracted from index.ts, part of the ~58-action dispatcher
// split into per-domain files. Company profile CRUD, the intake-widget
// draft autosave, the AI job-spec extractor, the live skill-catalog
// autocomplete, and the two structured post-search AI writers (card
// answers, proposal drafting). Pure code movement, zero logic changes.
import type { ActionCtx } from "./actionCtx.ts";
import { json } from "./utils.ts";
import { rateLimitGate, discoveryRestrictedIds } from "./gates.ts";
import { callAI } from "./ai.ts";
import { ORG_COLS } from "./employerContext.ts";
import { roleLine, safeCard, cleanEmployerText, VOICE_RULES, EMPLOYMENT_LABEL_FN } from "./employerText.ts";

export async function handleEmployerOrgCreate(ctx: ActionCtx): Promise<Response> {
  // v3.129.0 — the one employer action that runs before any org (and
  // therefore assertOrgMember) exists, so it needs its own copy of the
  // same approval check that function now enforces for everything after it.
  if (!(await ctx.isApprovedEmployer())) return json({ error: "Employer access is not approved for this account yet." }, 403);
  const { name, website } = ctx.payload as { name?: string; website?: string };
  if (!name || !name.trim()) return json({ error: "name required" }, 400);
  const { data: org, error } = await ctx.admin.from("orgs").insert({
    name: name.trim(), website: website?.trim() || null, created_by: ctx.userId,
  }).select(ORG_COLS).single();
  if (error || !org) return json({ error: error?.message || "insert failed" }, 500);
  const { error: mErr } = await ctx.admin.from("org_members").insert({
    org_id: org.id, user_id: ctx.userId, role: "admin",
  });
  if (mErr) return json({ error: mErr.message }, 500);
  return json({ org });
}

export async function handleEmployerOrgGet(ctx: ActionCtx): Promise<Response> {
  const { data: mem } = await ctx.admin.from("org_members")
    .select("org_id, role").eq("user_id", ctx.userId).limit(1).maybeSingle();
  if (!mem) return json({ org: null });
  const { data: org } = await ctx.admin.from("orgs")
    .select(ORG_COLS).eq("id", mem.org_id).maybeSingle();
  return json({ org: org || null, role: mem.role });
}

// v3.10.0 — every company profile field stays editable at any time.
export async function handleEmployerOrgUpdate(ctx: ActionCtx): Promise<Response> {
  const { org_id, patch } = ctx.payload as { org_id?: string; patch?: Record<string, unknown> };
  if (!org_id || !patch) return json({ error: "org_id and patch required" }, 400);
  if (!(await ctx.assertOrgMember(org_id))) return json({ error: "not an org member" }, 403);
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
  const { data: org, error } = await ctx.admin.from("orgs")
    .update(clean).eq("id", org_id).select(ORG_COLS).maybeSingle();
  if (error) return json({ error: error.message }, 500);
  return json({ org });
}

// v3.10.0 — the in-progress intake survives leaving the page.
export async function handleEmployerIntakeDraftGet(ctx: ActionCtx): Promise<Response> {
  const { org_id } = ctx.payload as { org_id?: string };
  if (!org_id) return json({ error: "org_id required" }, 400);
  if (!(await ctx.assertOrgMember(org_id))) return json({ error: "not an org member" }, 403);
  const { data } = await ctx.admin.from("employer_intake_drafts")
    .select("opening, job_spec, answered, phase, updated_at").eq("org_id", org_id).maybeSingle();
  return json({ draft: data || null });
}

export async function handleEmployerIntakeDraftSave(ctx: ActionCtx): Promise<Response> {
  const { org_id, opening, job_spec, answered, phase } = ctx.payload as {
    org_id?: string; opening?: string; job_spec?: Record<string, unknown>;
    answered?: string[]; phase?: string;
  };
  if (!org_id) return json({ error: "org_id required" }, 400);
  if (!(await ctx.assertOrgMember(org_id))) return json({ error: "not an org member" }, 403);
  const { error } = await ctx.admin.from("employer_intake_drafts").upsert({
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

export async function handleEmployerIntakeDraftClear(ctx: ActionCtx): Promise<Response> {
  const { org_id } = ctx.payload as { org_id?: string };
  if (!org_id) return json({ error: "org_id required" }, 400);
  if (!(await ctx.assertOrgMember(org_id))) return json({ error: "not an org member" }, 403);
  await ctx.admin.from("employer_intake_drafts").delete().eq("org_id", org_id);
  return json({ ok: true });
}

// v3.8.0 — intake is a widget wizard on the client, not a conversation.
// The model's only job here is to read the employer's opening description
// once and prefill whatever fields it genuinely stated, so the wizard can
// skip those questions. It never asks anything and never chats.
export async function handleEmployerSpecExtract(ctx: ActionCtx): Promise<Response> {
  { const limited = await rateLimitGate(ctx.admin, ctx.userId, ctx.action, 20, 15); if (limited) return limited; }
  const { org_id, description } = ctx.payload as { org_id?: string; description?: string };
  if (!org_id || typeof description !== "string") return json({ error: "org_id and description required" }, 400);
  if (!(await ctx.assertOrgMember(org_id))) return json({ error: "not an org member" }, 403);
  const gate = await ctx.assertOrgProfileComplete(org_id);
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
- Never invent a company, a salary, or a benefit. NO EM DASHES, NO EN DASHES, EVER, NO EXCEPTIONS, in any field, including notes.`;
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
export async function handleEmployerSkillCatalog(ctx: ActionCtx): Promise<Response> {
  const { org_id } = ctx.payload as { org_id?: string };
  if (!org_id) return json({ error: "org_id required" }, 400);
  if (!(await ctx.assertOrgMember(org_id))) return json({ error: "not an org member" }, 403);

  const { data: consented } = await ctx.admin.from("talent_pool_consent")
    .select("user_id").eq("opted_in", true);
  // v3.28.0 — a person restricted from discovery is not in the pool.
  const consentedIds = (consented || []).map(r => r.user_id);
  const hiddenCatalog = await discoveryRestrictedIds(ctx.admin, consentedIds);
  const ids = consentedIds.filter(id => !hiddenCatalog.has(id));
  if (ids.length === 0) return json({ pool_size: 0, skills: [] });

  const { data: rows } = await ctx.admin.from("candidate_skills")
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
export async function handleEmployerCardAnswer(ctx: ActionCtx): Promise<Response> {
  { const limited = await rateLimitGate(ctx.admin, ctx.userId, ctx.action, 30, 15); if (limited) return limited; }
  const { search_id, ref, card } = ctx.payload as { search_id?: string; ref?: string; card?: string };
  const CARDS = ["why_score", "what_is_missing", "compare", "screen_questions"];
  if (!search_id || !ref || !card || !CARDS.includes(card)) {
    return json({ error: "search_id, ref and a valid card required" }, 400);
  }
  const { data: search } = await ctx.admin.from("employer_searches")
    .select("id, org_id, job_spec, results").eq("id", search_id).maybeSingle();
  if (!search) return json({ error: "search not found" }, 404);
  if (!(await ctx.assertOrgMember(search.org_id))) return json({ error: "not an org member" }, 403);

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
export async function handleEmployerDraftProposal(ctx: ActionCtx): Promise<Response> {
  { const limited = await rateLimitGate(ctx.admin, ctx.userId, ctx.action, 20, 15); if (limited) return limited; }
  const { org_id, search_id, ref } = ctx.payload as { org_id?: string; search_id?: string; ref?: string };
  if (!org_id || !search_id || !ref) return json({ error: "org_id, search_id and ref required" }, 400);
  if (!(await ctx.assertOrgMember(org_id))) return json({ error: "not an org member" }, 403);
  const { data: search } = await ctx.admin.from("employer_searches")
    .select("id, org_id, job_spec, results").eq("id", search_id).maybeSingle();
  if (!search || search.org_id !== org_id) return json({ error: "search not found" }, 404);

  const cards = (Array.isArray(search.results) ? search.results : []) as Array<Record<string, unknown>>;
  const mine = cards.find(c => c.ref === ref);
  if (!mine) return json({ error: "unknown ref" }, 400);
  const spec = (search.job_spec || {}) as Record<string, unknown>;
  const { data: org } = await ctx.admin.from("orgs")
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

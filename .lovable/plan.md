
# The honest diagnosis (and why we keep going in circles)

I examined jobright.ai end-to-end. The reason every round of fixes "doesn't feel smarter" is **architectural, not a bug**. We keep editing `extension/content.js` selectors and prompts, but the thing that makes jobright feel intelligent has nothing to do with their extension — it's three server-side assets we don't have:

1. **A pre-ingested job corpus** (8M jobs, refreshed hourly, full JD text, semantically indexed in a vector DB). Their score is a `<50ms` lookup against this corpus. Ours is a live LLM call on whatever truncated DOM we managed to scrape. That's why our scores feel random and theirs feel calibrated — and why "See more" truncation isn't even a problem for them.
2. **A canonical structured profile** parsed once from the resume (`skills[]`, `experiences[] with dates`, `education[]`, `certs[]`, work auth, YoE per skill, sponsorship needs). Every autofill, score, tailor, cover-letter call reads from this one source of truth. We re-send raw resume text every time, so the AI guesses differently each call — that's why autofill answers are inconsistent and tabs feel disconnected.
3. **Answer memory keyed to the user, not the page.** Their profile stores "5 years Python", "needs H-1B", "OK with relocation" once. Ours re-derives them from raw text per request.

Everything else (Workday iframe pain, hallucinated bullets, custom-question weakness) — jobright has those bugs too. Those are industry-wide. We don't need to beat them there; we need to **stop losing on the parts they actually win on**.

The mistake we keep making: we treat the extension as the product. Jobright treats the extension as a thin client over a backend brain. Until we flip that, every round of "fix the extension" gives us the same disappointment.

# What we're going to build (the brain, not more selectors)

Four backend assets, in this order. The extension barely changes in Phase 1–3 — it just calls the new endpoints.

## Phase 1 — Canonical Structured Profile (highest leverage, smallest scope)

The single change that fixes Fill, Score, Cover Letter, and Tailor at once.

- New table `user_profile_canonical`: one row per user. Columns for `skills jsonb` (each skill: name, years, last_used, evidence), `experiences jsonb` (company, title, start, end, bullets, tech), `education jsonb`, `certifications jsonb`, `work_auth jsonb` (citizenship, needs_sponsorship_now, needs_sponsorship_future, visa_type), `preferences jsonb` (remote, relocation, salary_min, willing_to_travel), `derived jsonb` (total_yoe, seniority, primary_function), `updated_at`. RLS scoped to `auth.uid()`, full grants block.
- New edge function `profile-extract`: takes the user's primary resume + any uploaded profile docs, runs Gemini-2.5-pro with a strict JSON schema (no free text) to produce the canonical profile. Idempotent — re-running just updates. Runs once on resume upload, re-runs on user edit.
- New "Profile" tab in Resume Hub showing the structured profile with inline edit. Users can correct any field; corrections persist and override AI-extracted values (so we stop the hallucination loop).
- All existing handlers (`ext_autofill`, `ext_job_score`, `ext_cover_letter`, `smart_tailor`) updated to **load the canonical profile** instead of receiving raw resume text in the request body. Extension stops sending resume text on every call.

Outcome after Phase 1: autofill answers become consistent across applications; YoE math becomes deterministic (no more "let the AI guess"); work-auth/sponsorship questions filled from a real stored value, not inferred.

## Phase 2 — Server-Side Job Ingest & Cache

Stops the "truncated JD" problem and makes scoring real.

- New table `job_corpus`: `id`, `source` (linkedin/indeed/workday/greenhouse/lever/manual), `source_job_key` (unique per source — the LinkedIn job ID, Greenhouse posting ID, etc.), `url`, `company`, `title`, `location`, `jd_text_full`, `jd_html`, `parsed jsonb` (must_have_skills, nice_to_have, min_yoe, seniority, work_auth, salary_range), `embedding vector(768)` if pgvector available else skip for now, `ingested_at`, `last_seen_at`. Unique index on `(source, source_job_key)` for dedup.
- Extension change (the only Phase-2 extension edit): when a job is detected, send `{ source, source_job_key, url, raw_dom_text }` to a new `job-ingest` endpoint. Backend uses the raw DOM as a seed, but if it's clearly truncated (`< 800 chars` or contains "See more"), it server-side fetches the URL with the existing `firecrawl` connector to get the full JD. Stores parsed `must_have_skills` / `min_yoe` / `seniority` once. Re-detections of the same `source_job_key` are instant cache hits.
- Score becomes: `canonical_profile × job_corpus.parsed` — a deterministic rubric (skills coverage %, YoE gap, seniority match, location match, work-auth compatibility) plus a small LLM call only for the qualitative summary. Returns per-axis breakdown, not one blended number.

Outcome after Phase 2: scores load in <500ms (cache hit) instead of 3–8s; same job clicked twice returns the exact same score; per-axis breakdown actually explains *why* a job is 72 vs 41.

## Phase 3 — Answer Memory & Per-ATS Field Maps

Makes Fill actually fill.

- New table `user_form_answers`: `user_id`, `question_canonical` (normalized question text — lowercased, stripped of company/role), `question_type` (yesno / number / freetext / select), `answer`, `answer_source` (profile / user_edit / ai_generated), `times_used`, `last_used_at`. Unique on `(user_id, question_canonical)`. When autofill hits a question we've answered before, reuse the stored answer (no LLM call). When the user edits an autofilled answer, upsert with `answer_source = user_edit` so we never overwrite their correction.
- Per-ATS field maps in `extension/ats/` (new folder): one file per ATS (`workday.js`, `greenhouse.js`, `lever.js`, `ashby.js`, `linkedin.js`, `indeed.js`). Each exports `{ matches(url), fieldMap, fileInputSelector, submitSelector, iframeStrategy }`. Generic semantic matcher stays as the fallback, but known ATSes use the explicit map first. This is the single biggest accuracy win for autofill — jobright's edge here isn't AI, it's hand-tuned selectors.
- `all_frames: true` added to `manifest.json` content script registration so Workday's nested iframe forms actually receive the script. Drops `host_permissions` to the ATS domains we actually support (Web Store readiness side-effect).

Outcome after Phase 3: Workday/Greenhouse fields filled at ~90% accuracy instead of ~50%; second time you apply to a Workday job, custom answers are instant (no LLM call); file input attachment best-effort via per-ATS file selector.

## Phase 4 — Honest UX (no more fake "AI Agent")

- Rename "AYN AI Agent" anywhere it implies auto-submission to "AYN Autofill Assistant". Match jobright's reality: extension fills, **user clicks Submit**. Stop overpromising.
- Score tab shows the per-axis breakdown from Phase 2 plus missing must-have skills as removable chips (so the user can see exactly *why* the score is what it is).
- Tracker auto-logs on submit-button click (already partly built) but now writes to `user_form_answers` so the next similar app is faster.
- Cover letter draws from canonical profile + job_corpus.parsed only — no raw text round-trip.

# Out of scope (deliberately, to avoid another "touched 6 things" round)

- No real-time vector embeddings / pgvector setup yet. Phase 2's rubric is deterministic + LLM-summary; embeddings are Phase 5 if/when we want jobright-style "recommend jobs you haven't seen".
- No H-1B/LCA primary-data integration (jobright's unique moat — separate project).
- No insider-connections feature (requires LinkedIn data licensing we don't have).
- No autonomous submission. Be honest: we don't have it, jobright doesn't really have it either.
- No UI redesign. Visual changes only where Phase 2's per-axis score breakdown requires new components.

# Technical notes

- All new tables get the standard grant block (`GRANT SELECT, INSERT, UPDATE, DELETE ON ... TO authenticated; GRANT ALL ON ... TO service_role;`) immediately after `CREATE TABLE` and before `ENABLE ROW LEVEL SECURITY` — non-negotiable per project memory.
- `profile-extract` and `job-ingest` are new edge functions; existing `resume-hub/index.ts` handlers get refactored to read from `user_profile_canonical` and `job_corpus` instead of receiving raw text.
- Firecrawl already wired in the project — Phase 2's fallback fetch reuses the existing API key, no new connector.
- All AI calls use the existing `callAI` (with the fallback chain we shipped in v1.4.3). Model: `google/gemini-2.5-pro` for `profile-extract` (one-shot, accuracy matters), `gemini-2.5-flash` for everything else.
- Extension version stays on 1.4.x through Phase 1–2 (only payload shape changes, not behavior); bumps to 1.5.0 at Phase 3 when `all_frames` and ATS maps ship.

# Verification per phase (so we stop shipping "fixed but nothing changed")

- **Phase 1**: Re-run autofill on the same Greenhouse form twice — answers identical. Edit "Years of Python" in the Profile tab to 7, re-autofill — form shows 7. Delete the user's resume — autofill still works from canonical profile.
- **Phase 2**: Click the same LinkedIn job twice — second load <500ms, identical score. Open a job with "See more" truncated description — score reflects the full text. Score returns five axes, not one number.
- **Phase 3**: Open a Workday application in an iframe — fields populate. Answer a custom Workday question, navigate to another Workday job with the same question — auto-filled with the prior answer, no LLM call.
- **Phase 4**: Read the extension UI top to bottom — no claim the extension submits anything.

# What I need from you before I start

One decision: **do Phase 1 alone first** (ship the canonical profile, prove it fixes consistency, then go), or **commit to all 4 phases as a single push** (longer turnaround, but a coherent v1.5 release)?

My recommendation: Phase 1 alone, this round. It's the change that mathematically can't fail to improve the other tabs, and it un-blocks Phase 2–4 cleanly. If we batch all four, we repeat exactly the mistake you're calling out.


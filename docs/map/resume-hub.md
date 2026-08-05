# Resume Hub map (web app + resume-hub backend)

## Surface
src/pages/ResumeHub.tsx with six tabs in src/components/resume-hub/ (Resumes removed in v3.4.0, Proposals added in v3.6.0):

| key | label | hint | component |
|---|---|---|---|
| home | Home | Start here | HomeTab (next actions, replaced OverviewTab) |
| profile | Profile | You, your resume, your goals | ProfileTab (resume group + four field groups) |
| jobs | Jobs | Score and tailor | JobsTab (saved jobs, score, tailor, cover letter, generated documents, handoff) |
| proposals | Proposals | Roles employers want you for | ProposalsTab (pending proposal cards, accept or decline, collapsed history) |
| discovery | Get discovered | Let employers find you | DiscoveryTab (TalentPoolCard only since v3.6.0) |
| extension | Browser extension | Score jobs as you browse | ExtensionTab (zip download, version check, device tokens) |

Old nav for reference: Overview / Profile / Resumes / Saved jobs / Extension. TrackerTab was deleted in v3.0.1, OverviewTab in v3.3.0, CanadianProfileForm.tsx in v3.2.0, BuilderTab.tsx in v3.4.0.

## Sign out (v3.39.0 fix)
The account-menu "Sign out" item calls `handleSignOut`, an `async () => { await supabase.auth.signOut(); navigate("/"); }` defined near the top of `ResumeHub.tsx`. Before v3.39.0 it was a bare `supabase.auth.signOut()` with no await and no navigation, so the session cleared underneath but the page never reacted — `ResumeHub.tsx` is a top-level route (`src/App.tsx`), not nested inside `Index.tsx`'s `AuthedShell`, so `AuthedShell`'s own `onAuthStateChange` listener was never in the tree to catch it. `EmployerHub.tsx` had the identical bug at two buttons (desktop sidebar, mobile bottom nav) with the same fix, `handleSignOut` defined once and reused at both call sites. `EmployerPending.tsx` and the delete-account flow in `PrivacySettings.tsx` already did this correctly and were the reference pattern.


## One profile, one resume (v3.4.0)

BuilderTab and ProfileTab edited the same facts (name, location, summary, company, experience) in two places, and a resume library implied resumes are things a user maintains. Both are gone.

RULES:
1. A user has exactly ONE active resume: the `resumes` row with `is_primary = true`. Uploading a replacement flips every other row to `is_primary = false`; nothing is deleted.
2. Profile is the only place any of those fields are edited. No other surface writes name, location, summary, titles, dates, experience, education, or skills.
3. Tailored resumes and cover letters are OUTPUTS of a job, not resumes. They live on the job in JobsTab.

PROFILE GROUP 0, "Your resume", line "Everything AYN writes starts from this.": the active resume title, the date it was added, Download (PDF), and Replace resume. Replace asks for confirmation, then reveals ResumeUpload; the parse refreshes the derived profile fields via mapResumeToCareer and fires reindexTalentPool("resume_upload"). No list, no versions, no set-as-primary, no resume title editing.

MIGRATION AFFORDANCE: accounts created before v3.4.0 can hold several rows. ProfileTab loads all of them, treats the primary (or newest) as the resume, and shows one quiet line: "You have <n> older resumes from an earlier version of AYN." Expanding lists them read only with download and delete. It is not a manager: no editing, no switching active resume from the list.

TAILORED OUTPUTS (JobsTab): the newest `resume_versions` row with `created_for_job_id = job.id` and the newest `cover_letters` row with `job_id = job.id` render as "Documents for this job" with the generated date and PDF / Word downloads. Regenerating deletes the previous copy for that job and inserts the new one, so there is at most one of each per job. Cache behaviour in the edge function is unchanged. ResumeDiffViewer survives as "See what changed" on the tailored resume, comparing it against the active source resume.

Document building moved into the web app at src/lib/resumeDocs.ts (jsPDF + docx, real selectable text, same contract as extension/resumeFormat.js): resumeToText (plain text, feeds ResumeDiffViewer only), buildResumePdfBlob, buildResumeDocxBlob (build directly from structured `ResumeContent`, replaced the old text-flattening `buildTextPdfBlob`/`buildTextDocxBlob` in v3.65.0 — see below), downloadBlob, fileBase.

## Resume diagnosis and optimizer (v3.64.0)

Two backend actions, both operating on the ACTIVE resume's structured content (`ResumeContent`), never the original uploaded file — by the time a resume is in this schema, `resumeDocs.ts` already guarantees single-column, real-text, ATS-friendly output regardless of what the source file looked like, so nothing here diagnoses visual layout, only writing quality.

`resume_diagnose` (free, `resumeHubApi.diagnose`): `DEFAULT_MODEL`, returns `{ats_score, verdict, issues}` — 3 to 6 specific, concrete problems naming the actual weak bullet or missing section, not generic advice. Pass `resumeId` to cache the result onto `resumes.ats_score`/`resumes.ats_issues` (the former existed unused since before this feature, the latter added by this migration: `20260805120000_add_resume_ats_issues.sql`). `ProfileTab.tsx` calls this automatically, silently, right after every upload, and offers a manual "Check my resume" button for anyone who uploaded before this shipped.

`rewrite` (paid, 15 credits, `COST_OPTIMIZE`, `resumeHubApi.rewrite`): was already built and returning `{resume, ats_score, suggestions}` but had zero callers anywhere in `src/` and no credit gate at all. Now gated like `tailor`/`cover_letter` (`assertCredits`/`creditSpend`, `QUALITY_MODEL`), with a stricter prompt: never invent a metric that is not already implied by the resume's own content, consistent "Month YYYY" dates, no em/en dashes. `ProfileTab.tsx`'s `optimizeResume()` calls it, then performs the exact same `is_primary` swap as a fresh upload (old rows to `false`, new row inserted as the primary with the new `ats_score`) — paying for this is the acceptance, there is no separate preview-then-accept step, matching how `tailor` already works. Shows a "what changed" list from `suggestions` afterward and lets the person download the new resume immediately.

`JobsTab.tsx` reads the cached `ats_score` and shows an amber warning below the tailor/cover-letter buttons when it is under 70 ("tailoring still works, but a weak base resume means a weaker one for every job"), linking back to Profile via a new `onOpenProfile` prop threaded through from `ResumeHub.tsx`. Tailoring itself is unaffected either way — the warning is informational, not a gate.

### v3.65.0 fix: the actual output was two pages, unbolded, and read like AI wrote it

Reported directly against the founder's own downloaded PDF after using the feature. `resumeDocs.ts`'s PDF/DOCX builders are rebuilt from `ResumeContent` directly rather than a flattened text string (see the Document building line above). Two independent problems, both real: (1) the PDF had no shrink-to-fit logic, so a normal 4-job resume silently spilled onto a second page with one line of skills on it; (2) bolding was guessed from ALL-CAPS text-matching, which only ever caught section headers, never the name or a job title. Also tightened the `rewrite` prompt: banned specific resume-cliché phrases, required atomic `skills` entries (one skill per array item — the model had been writing category-prefixed comma lists into a single entry, e.g. "Technical Stack: React, TypeScript, Supabase...", which is what rendered as a dense wall of text). Verified by rebuilding the PDF from the founder's actual resume content and inspecting the raw PDF bytes: `/Count 1`, `/F2` (Helvetica-Bold) selected before the name and every title line.

### v3.66.0 fix: the score bounced around on identical input, root cause and real fix

Reported directly: running the optimizer on the same resume showed 75/100, running it again showed 65/100, "what are the ground rules for it." First attempt (already live, undocumented until now) added `ATS_RUBRIC`, a fixed point-deduction rubric shared by both actions, plus low temperature. That alone genuinely fixed `resume_diagnose` (identical input now scores within a few points every time, same verdict every time) but did NOT fix `rewrite`, measured directly: two back-to-back calls on the exact same input scored 90 then 70, an even wider swing than before. Root cause: `rewrite` was doing two stochastic jobs in one completion — writing new resume content AND grading its own writing — so both the content and the self-assigned score wobbled together, and there was no way to tell which one was actually responsible for a given score change.

Real fix: scoring was pulled out into one shared function, `scoreResumeContent(resume)`, the same low-temperature (0.1), rubric-driven call `resume_diagnose` already used. `rewrite` now does two calls in sequence: first a generation-only call (temperature raised slightly to 0.3, since natural human-sounding phrasing genuinely needs some variation and no longer has to also hold a score steady) that returns just the rewritten resume and `suggestions`, then `scoreResumeContent` is called on that output exactly the way a fresh diagnosis would be. This guarantees a diagnosis and an optimize's reported score are always computed by the literal same function, not two different prompts that happen to share a rubric.

Verified live against the exact same test resume across 3 consecutive `rewrite` calls: scores 75, 75, 80, verdict "Good" all three times, versus the prior 90-then-70 swing. The rewritten bullets differ each run (expected — that's the point of temperature on the generation side, so a re-optimize doesn't read like a template), but the number attached to them no longer does.

## Home next actions (v3.3.0)

OverviewTab was a counts dashboard (resume count, saved job count, primary resume ATS badge, a static getting-started list). It told the user nothing to do, so it was deleted. HomeTab renders at most four cards, each only when its condition holds, from one loader: src/lib/hubSnapshot.ts -> loadHubSnapshot(userId).

| Card | Condition | Button |
|---|---|---|
| "<n> employers want an intro" (always sorts first) | pending reveal_list requests > 0 | Get discovered |
| "Add your resume" | resumes count = 0 | Profile (v3.4.0, was Resumes) |
| "Complete your profile" (names the incomplete groups) | any groupGaps entry incomplete | Profile |
| "<n> saved jobs not scored yet" | jobs without a job_matches row | Jobs |

When all four are clear: one line, "You are set up. Open a job posting and AYN will score it.", plus the active resume name and whether the talent pool is on. No streaks, no completion percentage, no invented engagement metrics.

Gap logic moved out of ProfileTab into src/lib/profileGaps.ts -> computeGroupGaps(), so Home, Get discovered, and Profile cannot disagree.

## Single profile (v3.2.0)

The Hub used to show a Profile and a Canonical Profile. Canonical is an internal engineering concept and it leaked into the UI, so ProfileTab.tsx now renders exactly ONE profile. The word canonical appears nowhere user facing. Both tables stay; this is a UI and read-path consolidation, not a migration.

READ PATH: the UI mirrors _shared/identity.ts precedence, profile > canonical > resume > account. ProfileTab loads user_profile_canonical, user_profile_data, the primary resume, and auth.getUser in one Promise.all. Personal fields resolve through a `fallback` memo built from resume basics and the account email; a field shows the user-entered value when present, otherwise the fallback, with a muted source label: "You entered this", "From your resume", "From your account". Editing any field always writes the user-entered layer (user_profile_data) so it wins afterwards.

FIVE GROUPS (v3.5.0 order), each a collapsible card with a heading and a purpose line, open state remembered per session in sessionStorage, two columns on desktop for paired short fields and one column on mobile, autosave on blur with a small saved indicator and no Save button:
1. Your resume - Everything AYN writes starts from this. (the one active resume, upload or replace, download)
2. About you (first and last name, email, phone, location, current title, current company, LinkedIn, GitHub, portfolio) - Used in your tailored resumes and cover letters.
3. Your experience (skills with level and recency, work history with industry, team size and achievements, education with field of study, derived years and seniority, what you are known for) - This is what AYN scores against a job and tailors from.
4. What you are looking for (desired titles, desired locations, minimum salary and currency, remote, relocation, employment type, availability, company stage) - Employers searching for candidates match on this first.
5. Work eligibility (countries, citizenship, sponsorship now, sponsorship later, work permit expiry) - Employers filter on this before anything else.

NEW FIELDS IN v3.5.0 AND WHY EACH EXISTS FOR MATCHING:
| Field | Where | Why it is matched on |
|---|---|---|
| skill.level (familiar, proficient, advanced, expert) | Your experience | "React" alone is unrankable. Level separates a user from an owner. |
| skill.years | Your experience | Employers filter on depth, e.g. 5+ years Python. |
| skill.last_used (this year, within 2 years, over 2 years ago) | Your experience | Recency decides whether a skill is live or historic. |
| experience.industry | Your experience | Domain is a hard filter for fintech, healthcare, government roles. |
| experience.team_size | Your experience | The only clean signal for management scope. |
| experience.bullets (2 to 5 achievements, labelled when they came from the resume) | Your experience | The tailoring engine rewrites these. Empty bullets means tailoring has nothing to work with. |
| education.field | Your experience | A real filter for regulated and technical roles. |
| derived.known_for (up to 3 lines) | Your experience | Feeds cover letters and the employer-facing summary. |
| preferences.employment_types (full time, contract, part time, internship) | What you are looking for | Cheap to answer, excludes wrong matches outright. |
| preferences.availability (immediately, 2 weeks, 1 month, 3 months, just looking) | What you are looking for | Employers with a start date filter on it first. |
| preferences.company_stages (early startup, growth, large, no preference) | What you are looking for | Stage fit is a common recruiter screen. |
| work_auth.work_permit_expires | Work eligibility | Shown only when a non-citizen country is selected. Prevents matches that expire mid-hire. |

SKILL MIGRATION: existing bare strings load as { name, level: null, years: null, last_used: null }. Nothing is lost and nothing is guessed. The user is prompted once, on their top skills only, to add levels; the group header shows "n of m have a level".

PROVENANCE DISPLAY RULES (v3.5.0, replacing the eight repetitions of "You entered this"): a field derived from the resume with no user edit shows "From your resume". A field the user changed away from a resume value shows "Edited by you" with a revert control. A field the user simply typed, with no resume value to compare against, shows nothing. The read precedence itself is unchanged.

MATCHING READINESS LINE: at the top of the tab, one sentence naming the one or two highest-impact missing things, from src/lib/profileGaps.ts -> computeReadiness(), which extends the same gap logic the findability panel uses to the new fields. Never a percentage. When nothing is missing it says so in one calm line.


TALENT POOL CARD (src/components/resume-hub/TalentPoolCard.tsx, new in v3.2.0): when opted in it renders a "What employers see" preview (headline, seniority, years, location, skill chips), described honestly as the summary employers see first, with the note that they can also see the full profile and that email and phone are only shared after an approved intro. Skills are split by the candidate_skills.provenance column into "Backed by your resume" (extracted) and "AYN inferred these" (inferred); inferred chips have a delete control calling talent_pool_skill_delete. A freshness line reads "Your profile was last indexed <relative time>", and flips to "Your resume changed since AYN last indexed you" with a Refresh button when indexed_at is older than resume or profile updated_at. Completeness nudges are tied to matching, not to a percentage bar: missing work eligibility or desired titles each get one line.

CONSENT (v3.5.1, "honest discovery consent"). The card no longer claims an "anonymized profile", because that is not what employers get. Copy when OFF: "Turn this on and employers searching AYN can see your full profile: your resume, work history, skills, education, what you are looking for, and where you can work. AYN's AI uses all of it to match you to roles you would not have found on your own. Employers reach you through AYN. Your email and phone are only shared when you approve a specific request." Copy when ON: "You are discoverable. Employers searching AYN can see your full profile, and AYN's AI matches you to open roles using everything you have provided. Your email and phone stay private until you approve an intro. Turn this off anytime and your profile leaves the pool immediately." Switching ON opens an AlertDialog ("Make your profile discoverable" / "Turn on discovery" / "Cancel") and nothing is written until the user confirms; switching OFF is immediate. talent_pool_set now takes consent_version and writes it to the new talent_pool_consent.consent_version column alongside consented_at (current value: v3.5.1-full-profile, constant CONSENT_VERSION in TalentPoolCard.tsx, bump it whenever the wording changes). talent_pool_get returns consent_version.


REINDEX TRIGGERS (v3.2.1, the real bug behind the redesign: resumes and profile fields are written client side and bypass the edge function, so the pool index never rebuilt). All call sites go through ONE helper, src/lib/talentPoolSync.ts -> reindexTalentPool(reason). The helper enforces the rules so no call site can get them wrong: fire and forget, never awaited by the save path, errors swallowed, skipped entirely when the seeker is not opted in (opt-in state cached 5 minutes and seeded by TalentPoolCard), concurrent calls coalesced, and on success it dispatches the AYN_POOL_REINDEXED window event. TalentPoolCard listens for that event and reloads, so the freshness line updates in front of the user.

Call sites, one per client write that changes indexed content:
| Write | File | reason |
|---|---|---|
| Resume upload or replacement (becomes the one active resume) | ProfileTab.tsx handleResumeParsed() | resume_upload |

| Profile field save (user_profile_data + user_profile_canonical upserts) | ProfileTab.tsx save() | profile_save |

ResumeUpload.tsx deliberately does NOT call it: the component only parses, it never persists a row. Both of its callers reindex after their own insert, so firing inside the component would run before the row existed and double fire. ProfileTab.save() writes the two profile tables directly rather than through profile_canonical_save, so nothing reindexes server side and the client ping is required (no double fire). indexCandidate rebuilds both candidate_index and candidate_skills, so provenance stays accurate.

Production embedding audit (v3.2.1, checked against project dfkoxuokfkttjhfjcecx): candidate_index has 0 rows, candidate_skills 0 rows, talent_pool_consent 0 rows and 0 opted in. There are no deterministic-v1 rows to re-index because nobody has ever been indexed. Re-run this query before marketing the pool.

Bridges: src/lib/resumeHub.ts (session JWT client for the edge function), src/lib/extension.ts (AYN_PING, AYN_PROFILE_UPDATED, handoffUrl; extension id bjbifnpjbcbdojhgjpedkakkfjpcjmdl). src/pages/Handoff.tsx fallback when extension absent. src/pages/ExtensionApprove.tsx approves link codes. src/pages/ResumeMatch.tsx (standalone matcher using the resume-match function) was deleted in v3.58.0, found orphaned during the site navigation audit.

## Backend action registry (supabase/functions/resume-hub, one POST, body { action, ...payload })
Public (anon key): link_start, link_poll, ats_config_get (v2.10.0 — returns { config, version } from the ats_config 'registry' row so the extension can pull server-driven adapter rules before sign-in).
Public (anon key): link_start, link_poll.
Extension lane (x-ayn-ext-token): ext_bootstrap, ext_ingest_job, ext_cover_letter_text, ext_job_score, ext_suggest_roles, ext_find_contacts, ext_download_resume_text, ext_ask, smart_tailor, ext_profile_canonical_get, ext_job_lookup (v2.8.0 JD resolver backend branch, matches jobs.source_url ilike host+path, returns newest row with jd_text >= 400 chars). v3.0.0 REMOVED every write-path action: ext_autofill, ext_vision_fill, ext_log_result, ext_profile, ext_get_resume_blob, ats_config_get, answers_list/update/delete. v3.0.1 REMOVED the tracker actions: ext_save_application, ext_get_applications, ext_update_application.
Web lane (JWT): link_approve, token_mint, token_list, token_revoke, parse, parse_file, rewrite, match, tailor, cover_letter, profile_canonical_get, profile_canonical_extract, profile_canonical_save.
Dual-auth lane (v2.8.4 — accept EITHER x-ayn-ext-token OR a session JWT): answers_list, answers_update, answers_delete, ext_ingest_job. Defined by DUAL_AUTH_ACTIONS in supabase/functions/resume-hub/index.ts. When called from src/lib/resumeHub.ts (Learned Answers UI in ProfileTab, save-job in JobsTab), the edge function resolves userId from the Bearer JWT and runs the same handler with the admin client. All other EXT_ACTIONS keep the strict ext-token requirement.

resolveResumeContent(admin, userId, resumeVersionId): honors a tailored resume_versions row when passed, otherwise the is_primary resume. loadIdentity(admin, userId, { resume_version_id }) in supabase/functions/_shared/identity.ts is the single identity source of truth and is now wired into ext_job_score, smart_tailor and ext_cover_letter_text.
Aux functions: resume-match (standalone web matcher) — still deployed, but orphaned since v3.58.0 deleted its only caller, src/pages/ResumeMatch.tsx. All fill-only functions were deleted in v3.0.0 and every other unused function was deleted in v3.21.0.

## Tables
resumes (content jsonb, is_primary), resume_versions (content, created_for_job_id), jobs (jd_text, source_url, dedupe_hash sha256 of company|title|urlPath), job_matches, cover_letters, job_cache (url_hash, full_jd, parsed, expires_at 24h), device tokens (token_prefix, device_label, last_used_at, revoked_at), user_profile_data (legal names, email, phone, address jsonb, links jsonb, default_answers jsonb), canonical profile (loadCanonical / profile_canonical_*), candidate_index (talent pool embeddings). v3.1.0 adds ai_result_cache (cache_key, purpose, payload, expires_at) and ai_call_telemetry (purpose, model, duration_ms, cache_hit, source_map, gap_matched/missing/surfaced, meta). DEPRECATED: applications table (old split-brain tracker), job_applications (tracker removed in v3.0.1); never write to either.

## Integration truth table
| Seam | Mechanism | Status |
|---|---|---|
| Sign in / device link | link_start/poll/approve + token | CONNECTED |
| Download + latest version display | /ayn-extension.zip + ayn-extension-version.json | CONNECTED (v2.7.0) |
| Installed-version detection | AYN_PING | CONNECTED |
| One-click autofill from Hub | AYN_TRIGGER_AUTOFILL, /handoff fallback | CONNECTED |
| Tailored resume reaches fill | handoff resumeId -> HANDOFF_ARRIVED -> ext_autofill resume_version_id | CONNECTED (v2.7.0; before, sidepanel dropped resumeId and backend hardcoded is_primary) |
| Profile edits reach extension | AYN_PROFILE_UPDATED clears cache; 24h TTL fallback | CONNECTED (v2.7.0) |
| Job capture ext to hub | ext_ingest_job -> jobs -> JobsTab | CONNECTED |
| Application tracking | AUTO_TRACK_SUBMIT -> ext_save_application -> job_applications -> TrackerTab | CONNECTED (v2.7.0 unified) |
| Fill telemetry to user | ext_log_result -> autofill_runs -> TrackerTab | CONNECTED (v2.7.0) |
| Learned answers view/edit | ext_answers in ProfileTab | CONNECTED (v2.7.0) |
| Auto update of sideloaded builds | none; manual re-download | GAP. Ideas: sidepanel banner comparing manifest vs ayn-extension-version.json, or Chrome Web Store. |
| AUTO_TRACK_SUBMIT enrichment | v2.8.0: LAST_MATCH per tab (set by SCORE_JOB_CARD) attaches match_score + job_id at submit | CONNECTED |
| JD Resolver (full JD before AI) | v2.8.0: manual paste → current page → opener tab → registry fuzzy → listing fetch (PARSE_JOB_HTML) → ext_job_lookup; sidepanel provenance banner shows source + quality | CONNECTED |
| Preview-domain bridge | externally_connectable gates aynn.io | PARTIAL: on lovable.app previews AYN_PING falls back to handoff. Expected, but confusing in testing. |

## Talent pool (v2.9.0-A, Phase A data layer)

Foundation for a two-sided marketplace. Phase A ships schema, consent, and indexing only; Phase B (employer mode inside the dashboard chat) is pending.

Tables:
- **talent_pool_consent** (user_id pk → auth.users, opted_in, consented_at, revoked_at, updated_at). RLS: users manage only their own row.
- **candidate_index** (user_id pk → auth.users, headline, summary, seniority, location, years_experience, embedding vector(768), profile_text, indexed_at). RLS: users can read only their own row. NO cross-user select policy. Employer search in Phase B runs via the service role and MUST filter on talent_pool_consent.opted_in.
- **candidate_skills** (id, user_id → auth.users, skill, skill_norm lowercased, provenance 'extracted'|'inferred', source, unique(user_id, skill_norm, provenance)). RLS: users can read and delete only their own rows.
- pgvector HNSW cosine index on candidate_index.embedding.

Web-lane actions (session JWT, in supabase/functions/resume-hub/index.ts):
- **talent_pool_get**: returns { opted_in, consented_at, indexed, skills_count } for the caller.
- **talent_pool_set** { opted_in: boolean }: upserts consent (consented_at/revoked_at). Turning ON runs indexCandidate() synchronously; turning OFF deletes the caller's candidate_index and candidate_skills rows immediately.
- **talent_pool_reindex_self** (v2.9.1): re-runs indexCandidate for the caller (must be opted in) and returns { model, skills_count }. Wired to the Refresh button in TalentPoolCard and fired automatically after every client-side write that changes indexed content (v3.2.0).
- **talent_pool_skill_delete** (v3.2.0): deletes one candidate_skills row owned by the caller so a seeker can remove an inferred skill they disagree with.

Embedding provider (v2.9.1):
- **embedText(text)** returns `{ vector, model }`. Calls the AI gateway `/v1/embeddings` with `openai/text-embedding-3-small` and `dimensions: 768` so the existing `vector(768)` column is unchanged. On any error (missing LOVABLE_API_KEY, non-2xx, malformed body, network) it falls back to `deterministicEmbed` and returns model `'deterministic-v1'`. Logs which path was used once per call at debug level.
- `candidate_index` now carries `embedding_model text not null default 'deterministic-v1'` and `embedded_at timestamptz`, so a row can be traced back to the model that produced its vector.
- indexCandidate uses embedText and stores both `embedding` and `embedding_model`.

Indexing routine indexCandidate(admin, userId):
1. Loads canonical profile (loadCanonical) + primary resume.
2. Builds profile_text. v3.5.0 widened it so employers can match on what the form now collects: seniority, function, YoE, current title, what the candidate is known for, each skill written as "name level years recency", a repeated "Strongest current skills" line for advanced or expert skills not stale (this is how level and recency get weight in the embedding, no schema change needed), per role title, company, dates, industry, team size and up to 5 achievement bullets, education with field of study, certifications, availability, employment type, company stage, desired titles, remote and relocation, and the resume summary. **Still excludes name, email, phone, address, links** — matching is anonymous until a reveal.
3. Embedding: `embedText(profile_text)` (see above). Real model when the gateway is reachable, `deterministicEmbed` fallback otherwise; the returned model tag is stored on the row.
4. Upserts candidate_index (vector, model, embedded_at).
5. Rebuilds candidate_skills. **Provenance rule (Graphify-inspired):** skills literally present in canonical.skills OR primary resume.skills → 'extracted' (source 'canonical_profile' or 'resume'). Skills in canonical.derived.top_skills NOT already extracted → 'inferred'. Phase B matcher must satisfy must-have requirements ONLY from 'extracted' edges; 'inferred' edges may support nice-to-haves. This is the noise-cancellation rule. v3.5.0 added three nullable columns to candidate_skills, `level`, `years` and `last_used`, carried through from canonical skills on extracted edges only; inferred edges always write null because AYN did not observe them.



Re-index hooks: profile_canonical_save fires reindexIfOptedIn(admin, userId) non-blocking after upsert. Toggling talent_pool_set to true also triggers a fresh index. (The resume is written client side in ProfileTab.tsx, which calls reindexTalentPool after the insert; users can also force a reindex by toggling the switch off and on.)

Hub UI (TalentPoolCard.tsx): "Let employers find me" switch wired to resumeHubApi.talentPoolGet / talentPoolSet. talent_pool_get returns opted_in, preview (headline, seniority, location, years_experience, indexed_at, embedding_model), skills[] with provenance, and indexed_at / resume_updated_at / profile_updated_at for the freshness check.

## Employer marketplace (v2.9.0-B)

Employer experience lives inside the AYN dashboard. Top-right "Hiring mode" button opens `src/components/dashboard/EmployerChatPanel.tsx` as a full-surface overlay. All employer calls are session-JWT web-lane actions in `supabase/functions/resume-hub/index.ts`, gated on `org_members` membership.

Tables:
- **orgs** (id, name, website, created_by, created_at). RLS: members select their own org rows; creator inserts.
- **org_members** (org_id, user_id, role, pk (org_id, user_id)). RLS: members select their own rows.
- **employer_searches** (id, org_id, created_by, job_spec jsonb, results jsonb, ref_map jsonb, created_at). RLS: NO client select policy. All reads go through the edge function via service role. **ref_map (opaque ref → user_id) never leaves the server.**
- **reveal_requests** — since v3.6.0 this is the PROPOSALS table, name kept for compatibility. (id, org_id, candidate_user_id, search_id, candidate_ref, status pending|approved|declined, created_at, decided_at, and the v3.6.0 columns job_title text NOT NULL default '', job_location, employment_type, salary_range, job_url, message text NOT NULL default '' with a CHECK ≤1000 chars, sent_at timestamptz default now(), responded_at timestamptz). Partial unique index on (org_id, candidate_user_id) WHERE status='pending'. RLS: candidates select/update rows where candidate_user_id = auth.uid(); employer reads go only through the edge function.

Web-lane actions:
- **employer_org_create** { name, website }: creates org + admin membership.
- **employer_org_get**: caller's first org (or null) plus role.
- **employer_intake_chat** { org_id, messages[] }: intake agent. System prompt asks at most 3 clarifying questions, then returns either `{done:false, question}` or `{done:true, job_spec:{ title, seniority ∈ intern|entry|mid|senior|staff|principal|manager|director, must_have_skills[≤6], nice_to_have_skills[≤6], location_preference, remote_ok, min_years, notes }}`. No markdown, no em/en dashes, ranges use "to".
- **employer_card_answer** { search_id, ref, card } (v3.9.0, replaces employer_results_chat): four fixed questions only, `why_score`, `what_is_missing`, `compare`, `screen_questions`. Loads the stored `employer_searches` row and answers from the stored card for that ref (plus the sibling cards for `compare`). The system prompt hard-codes the role line built from job_spec (seniority label plus title) so the model can never re-describe the role, states the candidate's years_experience as fact when it exists, and forbids internal refs. Server strips markdown symbols and any leftover `c1` style ref before returning. Client caches answers per search_id|ref|card in `CandidateAskCards.tsx`, so a second click never re-runs the model.
- **employer_draft_proposal** { org_id, search_id, ref } (v3.9.0): writes the proposal message before the employer sees the dialog. 4 to 6 plain sentences, opens with the role and company name, cites only matched must-haves and the stored why lines, opens with "Hi there" because no name is known, ends with what happens on accept. Capped at 1000 chars. Failure is silent: the dialog just keeps its placeholder and sending still works. "Rewrite draft" re-runs it.
- **employer_match** { org_id, job_spec }: THE HYBRID MATCHER. Two-step noise cancellation:
  1. **Deterministic extracted-only prefilter (zero AI).** Load opted-in candidates → for each, EVERY must_have_skill must match a `candidate_skills` row with `provenance='extracted'` (skill_norm equality OR token-overlap ≥ 0.8). Inferred edges cannot rescue a missing must-have.
  2. **Vector recall (v2.9.1 same-model guard, v3.38.0 moved into Postgres).** Embed the job spec text with `embedText`. If some eligible candidates are still on `'deterministic-v1'` while the spec is on the real model, re-index up to 25 of them inline first (bounded, non-blocking to the user, nothing surfaced). Ranking itself is now the SECURITY DEFINER RPC `match_candidates_by_embedding(p_ids, p_embedding, p_model, p_limit)`: `SELECT ... WHERE user_id = ANY(p_ids) AND embedding_model = p_model ORDER BY embedding <=> p_embedding LIMIT p_limit` — the same-model guard is a plain WHERE clause now, cosine distance runs inside Postgres via pgvector's `<=>` operator (able to use the real HNSW index on `candidate_index.embedding`, `vector_cosine_ops`), and only the top 12 rows cross the wire instead of every eligible candidate's full 768-dim vector. `employer_match` no longer touches embeddings in JavaScript at all. Grants: `service_role` only, nothing for `authenticated`/`anon` — it takes an arbitrary id list and returns real profile data with no authorization check of its own, so it must never be reachable directly via PostgREST, same restriction shape as `assessment_rubrics`/`assessment_results` (v3.13.0).
  3. **Grounded AI rerank (one call).** Anonymized payload only: opaque refs (c1, c2…), profile_text, seniority, years_experience, location, skills split into extracted[]/inferred[], headline. Never user_ids, names, or emails. Rules baked into the system prompt: score 1-100; must_have coverage may only cite extracted skills; inferred skills contribute at most 10 total points via nice-to-haves; every sentence in "why" must reference something literally in the provided data; if fewer than 3 candidates are genuinely strong, return fewer with a `pool_note` instead of padding.
  4. Persist to `employer_searches` (job_spec, top-3 results, ref_map). Return `{ search_id, results[≤3], pool_note }`. The ref_map stays server-side.

- **employer_reveal_request** { search_id, ref, job_title (required), job_location, employment_type, salary_range, job_url, message (required, ≤1000 chars) }: THE PROPOSAL. Resolves ref → user_id via the server-side ref_map, then enforces two rate limits before inserting into `reveal_requests`:
  1. One OPEN proposal per (org, candidate). A second send while a row is `pending` returns 429 with "You already have an open proposal with this candidate."
  2. No new proposal within 30 days of a decline from that candidate to that org (checked on `responded_at`), returns 429.
  A partial unique index `reveal_requests_one_open_per_org_candidate` on (org_id, candidate_user_id) WHERE status='pending' enforces limit 1 at the database level too.
- **reveal_list** (candidate side): every proposal for the signed-in candidate, newest first by `sent_at`, enriched with org name and website. Returns the full proposal body (title, location, employment type, salary range, url, message, sent_at, responded_at, status).
- **reveal_decide** { id, approve } (candidate side): sets status approved|declined plus `decided_at` and `responded_at`, own rows only. The employer never learns a decline reason because none is collected.
- **employer_reveal_status** { search_id? }: for org members. Without `search_id` it returns every proposal across the caller's orgs (the Sent list); with one it is scoped to that search. Includes name + email + phone ONLY for rows where status='approved' (from user_profile_data, falling back to auth.users for email). Otherwise no PII of any kind.

### v3.6.0 the proposal loop, end to end
1. Seeker turns discovery ON in Get discovered. If it is OFF they are not in `talent_pool_consent` with `opted_in=true`, so `employer_match` never loads them.
2. Approved employer lands on `src/pages/EmployerHub.tsx` (routed from Index.tsx AuthedShell when profiles.role='employer' and employer_accounts.status='approved') and answers the intake widgets (v3.8.0).
3. `employer_match` returns up to three candidates, each with score, headline, seniority, years, location, matched must-haves, gaps, three why lines, plus `skills_extracted`, `skills_inferred`, and an anonymous `summary` slice of profile_text (v3.6.0 additions, still no PII).
4. Candidate detail dialog shows the full reasoning and the skills provenance split. No name, email, phone or user id exists in this payload.
5. Employer sends a proposal from the detail dialog, with the message pre-written by `employer_draft_proposal` (v3.9.0) and editable. The button becomes "Proposal sent, waiting for a reply".
6. Seeker sees it on the Proposals tab (`src/components/resume-hub/ProposalsTab.tsx`), badged with the pending count in the rail and as the first Home next-action.
7. Seeker chooses "Share my contact details" or "Not interested". Accepted and declined proposals collapse into a History section.
8. On accept only, `employer_reveal_status` starts returning name, email and phone to the org, and contact happens outside AYN.

Reveal ladder, what each side can see at each step: employer sees anonymous card → anonymous full reasoning → proposal sent (still anonymous) → on accept, name + email + phone. Seeker sees the org name, the full job details and the employer's message from the first moment.

v3.44.0 — no longer true. Sending a proposal (`employer_reveal_request`) now also emails the candidate (`notifyCandidate`, `_shared/emailTemplate.ts`), and `reveal_decide` emails every member of the org (`notifyOrgMembers`) on both accept and decline, no candidate identity or PII in the email body either way. Same pair of helpers, and the same "assessment sent"/"assessment submitted" wiring, are used by `employer_assessment_send` and `finaliseAssessment` below. In-app badge/Home-next-action notification is unchanged and still there too — email is additive, not a replacement. v3.47.0 — both helpers also write to `email_logs` now (each call site passes an explicit `emailType` string: `proposal_received`, `proposal_accepted`, `proposal_declined`, `assessment_received`, `assessment_completed`), readable from the admin System → Email pane. No FK-timing risk here the way `auth-send-email` had (see docs/map/platform.md v3.47.0 entry): every recipient here is an already-established account, never a same-transaction brand-new signup.



## v3.1.0 Tailor and Cover Letter (supabase/functions/_shared/tailoring.ts)

Tailor and cover letter are THE product now, so both run through one shared module instead of ad hoc prompt strings.

buildSections(identity, canonical, pastedResumeText) -> { sections, text, dropped[], chars }. Replaces resumeText.slice(0, 8000) in smart_tailor and slice(0, 6000) in ext_cover_letter_text. Budget is 24000 chars and nothing is ever cut mid item: whole sections are dropped in a fixed order (projects, certifications, education, then the oldest roles) and the dropped list is returned to the client and named in the prompt. Canonical experiences win over resume work when they are at least as complete; the pasted resume is appended verbatim when there is room, and used whole when there is nothing structured at all.

computeGap(jd, bundle, extra) -> GapAnalysis. DETERMINISTIC, no model call. It extracts requirement items from the JD (bullets plus lines under requirement / qualification / nice to have headings, with benefits and EEO sections excluded), tokenises each one with a stopword list, and tests the terms against the normalized section text. Short skill phrases (up to 3 terms) need full presence; longer sentences count as evidenced at 60 percent term overlap. Output is matched / missing / niceToHave with the evidencing terms attached. The model receives the result and only decides what to surface and how to phrase it.

Two pass quality. Tailoring always runs draft then a self critique and revise pass checking grounding, unchanged numbers, unsupported skills, and coverage of the top missing requirements. Cover letters run the second pass on the detailed length tier only.

Figure preservation is verified, not requested. extractFigures / droppedFigures pull every number, percentage, currency figure and year. For tailoring, every input figure must still be present in the output; for cover letters, every figure cited must exist in the sections. One retry on failure, then the draft ships with figuresVerified: false and the offending list.

fetchCompanyContext(admin, company, jobUrl): server side fetch of the employer's own About or home page, ATS hosts excluded, robots.txt respected, 3.5s timeout, 500 to 1000 chars, cached 7 days in ai_result_cache, fails open. Never LinkedIn, never anything behind a login. The prompt says to ground the opening in it or say nothing rather than invent enthusiasm.

Caching. tailor and cover by (user_id, resume_version_id, section hash, jd hash) for 7 days; ext_job_score by (jd hash, resume_version_id, applicant snapshot hash) for 24h. JD resolution is shared through job_cache so score, tailor, cover and ask reuse one fetch.

Speed. ext_job_score no longer awaits parseJobMeta before scoring: metadata parsing runs concurrently with the scoring call and is awaited afterwards for salary and the honesty safety net. The score prompt is grounded on the deterministic gap block instead of JOB_PARSED.

Client contract. smart_tailor returns gapAnalysis { method, alreadyStrong[], surfaced[], stillMissing[], niceToHave[], counts } plus figuresVerified / figuresAltered and sectionsUsed. surfaced is computed by re-running the gap analysis against the tailored output, so it reflects what actually landed. The sidepanel renders this as "Where you stand" under the tailored resume: surfaced, already strong, and genuinely missing with an explicit note that AYN left those out on purpose.

Telemetry. logAiCall writes one ai_call_telemetry row per AI call: purpose, model, duration_ms, cache hit, the identity sourceMap, and for tailor the matched / missing / surfaced counts.

## Findability panel (Get discovered tab)

TalentPoolCard renders a per-group findability list instead of ad hoc nudges. It moved out of ProfileTab into DiscoveryTab in v3.3.0.
Props: `groupGaps: GroupGap[]` from src/lib/profileGaps.ts, supplied by loadHubSnapshot.

| Group | Complete when | Consequence when missing |
|---|---|---|
| About you | first name + email + (current title or city) | Employers cannot place you on a shortlist |
| What you're looking for | at least one desired title | You will not surface for role based searches |
| Where you can work | a work-auth country or citizenship | Excluded from most searches, employers filter here first |
| Your experience | at least one skill and one experience | Nothing for the matcher to compare a job against |

Freshness line and Refresh (talent_pool_reindex_self) are unchanged from v3.2.1.
Reindex triggers remain the seven call sites routed through src/lib/talentPoolSync.ts.

## v3.3.0 labels rewritten

| Where | Was | Now |
|---|---|---|
| Nav | Saved jobs | Jobs |
| Nav | Extension / "Install AYN" | Browser extension / "Score jobs as you browse" |
| Nav | Overview / "Snapshot" | Home / "Start here" |
| TalentPoolCard freshness | "Your profile was last indexed X" | "Employers have seen this version since X" |
| TalentPoolCard stale line | "changed since AYN last indexed you" | "changed since AYN last refreshed what employers see" |
| TalentPoolCard toasts | "Profile re-indexed" / "Couldn't re-index" | "Profile refreshed" / "Couldn't refresh" |
| TalentPoolCard empty states | "No skills indexed yet" / "Not indexed yet" | "No skills saved yet" / "Nothing to show yet" |
| JobsTab primary action | "Calculate match" | "Score this job" |
| ExtensionTab hero copy | autofill, recruiters, application tracking (all removed features) | "Score any job posting while you browse, and tailor your resume without leaving the page." |
| ProfileTab footer | (none) | "This profile is what employers search when you are in the talent pool" linking to Get discovered |

The words canonical, index, vector, embedding, and ingest no longer appear in any user-facing seeker string. They remain in code, table names, and these docs.

Embedding audit (2026-07-30): `select embedding_model, count(*) from candidate_index group by 1` returns zero rows. No 'deterministic-v1' rows exist, so no backfill is needed.


## v3.10.1 employer surface tokens (measured, not eyeballed)

The orange scope lives in src/index.css `.employer-surface` (--primary, --primary-foreground, --ring, --ayn-orange). Rule: the class must be on BOTH the page wrapper in src/pages/EmployerHub.tsx and on document.body via a mount effect. Portalled shadcn content (Dialog, AlertDialog, Popover, Select) attaches to document.body and inherits nothing from the page wrapper, so the body class is what turns the proposal dialog's Send proposal button orange. Measured after the fix: body --primary resolves 24 95% 53% and a body-level `.bg-primary` node computes rgb(249, 112, 21) on white text.

Company profile (orgs table: website, industry, company_size, headquarters, about, logo_url, linkedin_url) is edited in src/components/employer/CompanyProfile.tsx, rendered inside EmployerHub under the intake. It surfaces in two places: the seeker's Proposals card (ProposalsTab.tsx renders logo, industry, size, headquarters, website link and about), and the COMPANY FACTS block passed into employer_draft_proposal, where a null field is stated to be nonexistent so the model cannot invent one.

Intake draft persistence lives in employer_intake_drafts keyed by org, saved after every answered step and restored on return, with Start over clearing it. The step map jumps back to any completed step and only clears later answers the change genuinely invalidates.

## v3.11.0 company profile first (the gate)

REQUIRED before an employer can use the product: `name`, `website`, `industry`, `headquarters`, `company_size`, `about` (minimum 80 characters after trim). OPTIONAL and labelled "optional" in the UI: `linkedin_url`, `logo_url`. Website and LinkedIn are validated as links when present, and a bare domain is normalised to `https://` rather than rejected (`normaliseUrl` / `isValidUrl` in src/lib/employer.ts, which is also where `REQUIRED_ORG_FIELDS`, `missingOrgFields` and `isOrgComplete` live so client and copy stay in one place).

CLIENT GATE: src/pages/EmployerHub.tsx computes `profileComplete` from the loaded org. While it is false the ONLY thing rendered inside `<main>` is `<CompanyProfile onboarding />` (heading "Tell candidates who you are", sub "Candidates see this on every proposal. AYN cannot search until it is filled in."). The intake wizard, the results list and the sent proposals list are not rendered at all, not disabled. Saving the last required field unlocks in place with a toast, no reload.

BACKEND GATE: `assertOrgProfileComplete(orgId)` in supabase/functions/resume-hub/index.ts re-reads the org and returns HTTP 428 with `{ error, missing_org_fields }` when any required field is empty (or `about` is under 80 chars). It runs after the org-membership check in `employer_spec_extract` (the intake action that replaced employer_intake_chat in v3.8.0), `employer_match`, and `employer_reveal_request`. A UI-only gate is not a gate.

CLEARING A REQUIRED FIELD LATER: everything stays editable at all times. If an edit empties a required field, `handleOrgSaved` compares completeness before and after and shows a destructive toast naming the field ("Website is now empty. Candidate search and proposals are paused until you fill it back in."), and the surface re-locks to onboarding on the same render. The backend independently refuses the same three actions.

NUDGES: no percentage bar and no score. `missingOrgFields` produces one specific line per missing field ("Add your website so candidates can check you out"), rendered as a list in the same left-rule style as the seeker findability panel.

UI: the company size buttons are now the same `OptionCard` language as IntakeWizard (rounded-xl bordered card, `border-primary bg-primary text-primary-foreground` when selected, so they resolve to AYN orange under `.employer-surface`). The logo Upload button is a normal `secondary` button instead of a heavy outline.

## v3.12.0 — employer surface, properly

### Why the buttons were black, again
`.employer-surface` in src/index.css redefines `--primary`, but this repo's shadcn Button variants are written with `bg-foreground` / `border-foreground` utilities, not `bg-primary`. The token redefinition therefore never reached the default and outline variants, which is why the company size option cards (hand written, token driven) went orange while "Find candidates" and "Start over" stayed black. Fix: the scope also retints `button.bg-foreground` and `button.border-foreground`. Measured in Chromium inside the scope: primary background `rgb(249,112,21)`, outline background transparent, both 44px tall, `gap-3` between them, Start over rendered as outline so the hierarchy reads.

### Why intake drafts did not survive a refresh
Two independent bugs. (1) The persist effect returned early while `phase === "opening"`, so the free text opening description was never written even once. (2) The step the employer was on was never stored, so even a restored draft reopened at the first unanswered question. Now: the opener saves as it is typed (500ms debounce), and the cursor travels inside `phase` as `asking:<step>` (`summary` and `opening` are the other two values). The backend truncation on `phase` was widened from 24 to 64 characters, which had been silently cutting the longest step keys.

### Candidate background block
`employer_match` attaches `profile` to each of the top three cards, built by `buildCandidateProfile(canonical)`: seniority, years, current title, known for, `skills_by_level` (expert / advanced / proficient / familiar / other), experience rows (title, company, dates, industry), education lines, certifications, and a seeking list. Rendered by `src/components/employer/CandidateProfile.tsx`. No label is ever rendered for an empty value, and `buildProfileText` (the embedding text) was fixed for the same class of bug: it used to emit `YoE: .`, `Current title: .` and `Education: BSc  at`. Still anonymous: no name, email, phone, address, or links. `summary` (the old blob) remains on the type only so previously stored searches still render.

### Proposal draft
`employer_draft_proposal` writes an invitation, not an analysis. Shape: greeting ("Hi there", the employer does not know their name), one line on the company from the company profile only, one or two lines on the role and why they might fit with at most TWO specifics, an invitation to talk, then what happens next on accept. Forbidden in the prompt: skills with years attached, more than two facts about them, and the words "must-have skills", "match", "score", "requirements", "gaps", "profile".

### Navigation and branding
EmployerHub has an AYN branded sticky header (Brain mark, "Hiring / <company>", company menu on the right with Company profile and Sign out) and a left nav in the Resume Hub language: Search (intake plus results), Proposals (sent, with status), Company (opens the profile dialog). The v3.11.0 gate is unchanged and now also hides the nav: while a required company field is missing the onboarding profile is the only thing rendered. Once complete, the company profile no longer sits as a card in the flow; it lives in a dialog behind the menu and stays fully editable.

Resume Hub's top left "Back" button is gone (it had nowhere sensible to go). It is now the AYN mark, with Sign out in a dropdown on the right, matching the employer treatment.

### Legacy dashboard
Deleted: `src/components/Dashboard.tsx` and `src/components/dashboard/DashboardContainer.tsx`. `/dashboard` and `/dashboard/*` redirect to `/`, which routes by role (Resume Hub for a seeker, EmployerHub for an approved employer). `src/components/dashboard/` still exists because DashboardPricing, Sidebar and the simulator live there; nothing in it renders the old chat shell.

## v3.13.0 — verification assessments

### The idea
Before spending a proposal, an employer can send the candidate a short assessment generated from that candidate's own claimed background against the JobSpec of the search they were found in. It is not a quiz on textbook knowledge; the prompt (QUALITY_MODEL) is told to probe lived experience, so a person who did the work answers easily and a person who listed the skill does not.

### Schema
Three tables, and the split between them is the whole security design.

- `assessments` — one row per sent assessment: org, search, candidate ref, resolved user, job title, questions (no answers, no rubric), status (`sent`, `started`, `submitted`, `expired`), timer, sent/started/submitted timestamps. Grants: `SELECT` to `authenticated` only; `anon` has nothing; every write goes through the edge function as `service_role`. RLS: the candidate reads their own rows, an org member reads their org's rows.
- `assessment_rubrics` — what a good answer contains, per question. ALL privileges revoked from `anon` and `authenticated`. `service_role` only. No policies, RLS on, so even a stray grant cannot leak it.
- `assessment_results` — score, verdict, per question observations, per question `ms`. Same isolation as rubrics: `service_role` only. The candidate never sees a score, so nothing can be reverse engineered by re-taking.

Verified after the migration with `has_table_privilege`: `assessment_rubrics` and `assessment_results` return false for SELECT and INSERT for both `anon` and `authenticated`; `assessments` returns SELECT true for `authenticated` only, INSERT false.

### Backend actions (supabase/functions/resume-hub/index.ts)
Employer lane: `employer_assessment_generate` (draft questions from the candidate's canonical profile plus the JobSpec, returns questions and lets the employer cut or edit them; the rubric is generated alongside and never returned), `employer_assessment_send`, `employer_assessment_list` (results, service role, org scoped).
Candidate lane: `assessment_list`, `assessment_start` (stamps `started_at`, which is what the timer is measured against server side), `assessment_answer` (autosave per question, records `ms` spent), `assessment_submit` (calls `finaliseAssessment`, which grades against the private rubric and writes `assessment_results`), `assessment_growth_notes` (what the candidate gets back instead of a score: where their answers were thin, phrased as something to work on).

### Notifications (v3.44.0)
`employer_assessment_send` emails the candidate (`notifyCandidate`) with the company name, job title if known, and roughly how many minutes it takes. `finaliseAssessment` — the single function all three submission paths (`assessment_submit`, and the two server-side timeout paths inside `assessment_start`/`assessment_answer`) funnel through — emails every org member (`notifyOrgMembers`) once grading is written to `assessment_results`, deliberately with no score, verdict, or candidate identity in the email body, matching the same anonymity rule the product's own UI already follows; it just says an assessment was completed and links back into the app.

### Anti gaming
The timer is enforced from `started_at` on the server, not from a client clock. Per question `ms` is recorded and surfaced to the employer next to the answer, because a flawless four paragraph answer written in eleven seconds is the signal. The rubric is never sent to the client at any point in the flow, and results are readable only through a service role action that checks org membership first.

### UI
Employer: `src/components/employer/AssessmentDialog.tsx` (generate, review, edit, send) opened from "Send an assessment" in the candidate dialog, and `src/components/employer/AssessmentsPanel.tsx` on a new Assessments tab in the left nav.
Candidate: `src/components/resume-hub/AssessmentsTab.tsx`, a new badged tab in Resume Hub, with the timer, autosave, and the growth notes after submitting.
Client API: `src/lib/assessments.ts`.

# Resume Hub map (web app + resume-hub backend)

## Surface
src/pages/ResumeHub.tsx with five tabs in src/components/resume-hub/: OverviewTab (stats), ProfileTab (v3.2.0 SINGLE profile, see below), BuilderTab (resumes, versions, diff viewer, upload/parse), JobsTab (saved jobs, match score, tailor, cover letter, Open job with AYN handoff), ExtensionTab (download zip, version from ayn-extension-version.json, AYN_PING install detection, connected device tokens with revoke). TrackerTab was deleted in v3.0.1. CanadianProfileForm.tsx was deleted in v3.2.0 (its fields were autofill answers; they now live in the grouped profile as matching signals).

## Single profile (v3.2.0)

The Hub used to show a Profile and a Canonical Profile. Canonical is an internal engineering concept and it leaked into the UI, so ProfileTab.tsx now renders exactly ONE profile. The word canonical appears nowhere user facing. Both tables stay; this is a UI and read-path consolidation, not a migration.

READ PATH: the UI mirrors _shared/identity.ts precedence, profile > canonical > resume > account. ProfileTab loads user_profile_canonical, user_profile_data, the primary resume, and auth.getUser in one Promise.all. Personal fields resolve through a `fallback` memo built from resume basics and the account email; a field shows the user-entered value when present, otherwise the fallback, with a muted source label: "You entered this", "From your resume", "From your account". Editing any field always writes the user-entered layer (user_profile_data) so it wins afterwards.

FOUR GROUPS, each labelled with what it powers:
1. About you (name, contact, location, current title and company, links) - Used in your tailored resumes and cover letters.
2. What you're looking for (desired titles, desired locations, minimum salary and currency, remote and relocation) - Helps employers searching the talent pool find you for the right roles.
3. Work eligibility (countries you can work in, citizenship, sponsorship now, sponsorship later) - Employers filter on this. Getting it right means fewer wrong matches.
4. Your experience (skills, work history, education, derived years and seniority) - This is what AYN scores against a job and tailors from.

TALENT POOL CARD (src/components/resume-hub/TalentPoolCard.tsx, new in v3.2.0): when opted in it renders a "What employers see" preview of the anonymized card exactly as employer_match returns it (headline, seniority, years, location, skill chips, no name and no contact). Skills are split by the candidate_skills.provenance column into "Backed by your resume" (extracted) and "AYN inferred these" (inferred); inferred chips have a delete control calling talent_pool_skill_delete. A freshness line reads "Your profile was last indexed <relative time>", and flips to "Your resume changed since AYN last indexed you" with a Refresh button when indexed_at is older than resume or profile updated_at. Completeness nudges are tied to matching, not to a percentage bar: missing work eligibility or desired titles each get one line.

REINDEX TRIGGERS (v3.2.1, the real bug behind the redesign: resumes and profile fields are written client side and bypass the edge function, so the pool index never rebuilt). All call sites go through ONE helper, src/lib/talentPoolSync.ts -> reindexTalentPool(reason). The helper enforces the rules so no call site can get them wrong: fire and forget, never awaited by the save path, errors swallowed, skipped entirely when the seeker is not opted in (opt-in state cached 5 minutes and seeded by TalentPoolCard), concurrent calls coalesced, and on success it dispatches the AYN_POOL_REINDEXED window event. TalentPoolCard listens for that event and reloads, so the freshness line updates in front of the user.

Call sites, one per client write that changes indexed content:
| Write | File | reason |
|---|---|---|
| Resume insert or update (Save) | BuilderTab.tsx save() | resume_insert / resume_update |
| Primary resume switch | BuilderTab.tsx setPrimary() | primary_resume_change |
| Primary resume deleted | BuilderTab.tsx removeResume() | primary_resume_deleted |
| Resume upload, saved as primary | BuilderTab.tsx handleFileParsed() | resume_upload |
| AI Improve overwrites content | BuilderTab.tsx aiImprove() | resume_ai_rewrite |
| Resume upload, saved as primary | ProfileTab.tsx handleResumeParsed() | resume_upload |
| Profile field save (user_profile_data + user_profile_canonical upserts) | ProfileTab.tsx save() | profile_save |

ResumeUpload.tsx deliberately does NOT call it: the component only parses, it never persists a row. Both of its callers reindex after their own insert, so firing inside the component would run before the row existed and double fire. ProfileTab.save() writes the two profile tables directly rather than through profile_canonical_save, so nothing reindexes server side and the client ping is required (no double fire). indexCandidate rebuilds both candidate_index and candidate_skills, so provenance stays accurate.

Production embedding audit (v3.2.1, checked against project dfkoxuokfkttjhfjcecx): candidate_index has 0 rows, candidate_skills 0 rows, talent_pool_consent 0 rows and 0 opted in. There are no deterministic-v1 rows to re-index because nobody has ever been indexed. Re-run this query before marketing the pool.

Bridges: src/lib/resumeHub.ts (session JWT client for the edge function), src/lib/extension.ts (AYN_PING, AYN_PROFILE_UPDATED, handoffUrl; extension id bjbifnpjbcbdojhgjpedkakkfjpcjmdl). src/pages/Handoff.tsx fallback when extension absent. src/pages/ExtensionApprove.tsx approves link codes. src/pages/ResumeMatch.tsx standalone matcher using the resume-match function.

## Backend action registry (supabase/functions/resume-hub, one POST, body { action, ...payload })
Public (anon key): link_start, link_poll, ats_config_get (v2.10.0 — returns { config, version } from the ats_config 'registry' row so the extension can pull server-driven adapter rules before sign-in).
Public (anon key): link_start, link_poll.
Extension lane (x-ayn-ext-token): ext_bootstrap, ext_ingest_job, ext_cover_letter_text, ext_job_score, ext_suggest_roles, ext_find_contacts, ext_download_resume_text, ext_ask, smart_tailor, ext_profile_canonical_get, ext_job_lookup (v2.8.0 JD resolver backend branch, matches jobs.source_url ilike host+path, returns newest row with jd_text >= 400 chars). v3.0.0 REMOVED every write-path action: ext_autofill, ext_vision_fill, ext_log_result, ext_profile, ext_get_resume_blob, ats_config_get, answers_list/update/delete. v3.0.1 REMOVED the tracker actions: ext_save_application, ext_get_applications, ext_update_application.
Web lane (JWT): link_approve, token_mint, token_list, token_revoke, parse, parse_file, rewrite, match, tailor, cover_letter, profile_canonical_get, profile_canonical_extract, profile_canonical_save.
Dual-auth lane (v2.8.4 — accept EITHER x-ayn-ext-token OR a session JWT): answers_list, answers_update, answers_delete, ext_ingest_job. Defined by DUAL_AUTH_ACTIONS in supabase/functions/resume-hub/index.ts. When called from src/lib/resumeHub.ts (Learned Answers UI in ProfileTab, save-job in JobsTab), the edge function resolves userId from the Bearer JWT and runs the same handler with the admin client. All other EXT_ACTIONS keep the strict ext-token requirement.

resolveResumeContent(admin, userId, resumeVersionId): honors a tailored resume_versions row when passed, otherwise the is_primary resume. loadIdentity(admin, userId, { resume_version_id }) in supabase/functions/_shared/identity.ts is the single identity source of truth and is now wired into ext_job_score, smart_tailor and ext_cover_letter_text.
Aux functions: resume-match (standalone web matcher), cc-generate (report tools). All fill-only functions were deleted in v3.0.0.

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
2. Builds profile_text: seniority, function, YoE, current title, skills, experience bullets, education, certifications, resume summary. **Excludes name, email, phone, address, links** — matching is anonymous until a Phase B reveal.
3. Embedding: `embedText(profile_text)` (see above). Real model when the gateway is reachable, `deterministicEmbed` fallback otherwise; the returned model tag is stored on the row.
4. Upserts candidate_index (vector, model, embedded_at).
5. Rebuilds candidate_skills. **Provenance rule (Graphify-inspired):** skills literally present in canonical.skills OR primary resume.skills → 'extracted' (source 'canonical_profile' or 'resume'). Skills in canonical.derived.top_skills NOT already extracted → 'inferred'. Phase B matcher must satisfy must-have requirements ONLY from 'extracted' edges; 'inferred' edges may support nice-to-haves. This is the noise-cancellation rule.


Re-index hooks: profile_canonical_save fires reindexIfOptedIn(admin, userId) non-blocking after upsert. Toggling talent_pool_set to true also triggers a fresh index. (Resumes are saved client-side in BuilderTab.tsx; users can force a reindex today by toggling the switch off and on.)

Hub UI (TalentPoolCard.tsx): "Let employers find me" switch wired to resumeHubApi.talentPoolGet / talentPoolSet. talent_pool_get returns opted_in, preview (headline, seniority, location, years_experience, indexed_at, embedding_model), skills[] with provenance, and indexed_at / resume_updated_at / profile_updated_at for the freshness check.

## Employer marketplace (v2.9.0-B)

Employer experience lives inside the AYN dashboard. Top-right "Hiring mode" button opens `src/components/dashboard/EmployerChatPanel.tsx` as a full-surface overlay. All employer calls are session-JWT web-lane actions in `supabase/functions/resume-hub/index.ts`, gated on `org_members` membership.

Tables:
- **orgs** (id, name, website, created_by, created_at). RLS: members select their own org rows; creator inserts.
- **org_members** (org_id, user_id, role, pk (org_id, user_id)). RLS: members select their own rows.
- **employer_searches** (id, org_id, created_by, job_spec jsonb, results jsonb, ref_map jsonb, created_at). RLS: NO client select policy. All reads go through the edge function via service role. **ref_map (opaque ref → user_id) never leaves the server.**
- **reveal_requests** (id, org_id, candidate_user_id, search_id, candidate_ref, status pending|approved|declined, created_at, decided_at). RLS: candidates select/update rows where candidate_user_id = auth.uid(); employer reads go only through the edge function.

Web-lane actions:
- **employer_org_create** { name, website }: creates org + admin membership.
- **employer_org_get**: caller's first org (or null) plus role.
- **employer_intake_chat** { org_id, messages[] }: intake agent. System prompt asks at most 3 clarifying questions, then returns either `{done:false, question}` or `{done:true, job_spec:{ title, seniority ∈ intern|entry|mid|senior|staff|principal|manager|director, must_have_skills[≤6], nice_to_have_skills[≤6], location_preference, remote_ok, min_years, notes }}`. No markdown, no em/en dashes, ranges use "to".
- **employer_match** { org_id, job_spec }: THE HYBRID MATCHER. Two-step noise cancellation:
  1. **Deterministic extracted-only prefilter (zero AI).** Load opted-in candidates → for each, EVERY must_have_skill must match a `candidate_skills` row with `provenance='extracted'` (skill_norm equality OR token-overlap ≥ 0.8). Inferred edges cannot rescue a missing must-have.
  2. **Vector recall (v2.9.1 same-model guard).** Embed the job spec text with `embedText`. Cosine-compare ONLY against `candidate_index` rows whose `embedding_model` equals the spec's model — mixing models produces meaningless scores. If some eligible candidates are still on `'deterministic-v1'` while the spec is on the real model, re-index up to 25 of them inline (bounded, non-blocking to the user, nothing surfaced) before ranking, then reload the index rows. Rank the same-model subset by cosine similarity; take top 12.
  3. **Grounded AI rerank (one call).** Anonymized payload only: opaque refs (c1, c2…), profile_text, seniority, years_experience, location, skills split into extracted[]/inferred[], headline. Never user_ids, names, or emails. Rules baked into the system prompt: score 1-100; must_have coverage may only cite extracted skills; inferred skills contribute at most 10 total points via nice-to-haves; every sentence in "why" must reference something literally in the provided data; if fewer than 3 candidates are genuinely strong, return fewer with a `pool_note` instead of padding.
  4. Persist to `employer_searches` (job_spec, top-3 results, ref_map). Return `{ search_id, results[≤3], pool_note }`. The ref_map stays server-side.

- **employer_reveal_request** { search_id, ref }: resolves ref → user_id via the server-side ref_map, inserts `reveal_requests` (idempotent per search+candidate).
- **reveal_list** (candidate side): pending + decided requests enriched with org name and job title (from the search's job_spec).
- **reveal_decide** { id, approve } (candidate side): updates status + decided_at, own rows only.
- **employer_reveal_status** { search_id }: for org members. Includes name + email ONLY for rows where status='approved' (pulled from user_profile_data and auth.users). Otherwise no PII.

Hub UI (ProfileTab.tsx): "Intro requests" card appears when the seeker is opted in and has any reveal requests. Share contact / Decline buttons call reveal_decide; contact details are shared only after approval.


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

## v3.2.0 findability panel (Profile tab)

TalentPoolCard now renders a per-group findability list instead of ad hoc nudges.
Props: `groupGaps: { group, complete, consequence }[]`, computed in ProfileTab.tsx.

| Group | Complete when | Consequence when missing |
|---|---|---|
| About you | first name + email + (current title or city) | Employers cannot place you on a shortlist |
| What you're looking for | at least one desired title | You will not surface for role based searches |
| Where you can work | a work-auth country or citizenship | Excluded from most searches, employers filter here first |
| Your experience | at least one skill and one experience | Nothing for the matcher to compare a job against |

Freshness line and Refresh (talent_pool_reindex_self) are unchanged from v3.2.1.
Reindex triggers remain the seven call sites routed through src/lib/talentPoolSync.ts.

Embedding audit (2026-07-30): `select embedding_model, count(*) from candidate_index group by 1` returns zero rows. No 'deterministic-v1' rows exist, so no backfill is needed.

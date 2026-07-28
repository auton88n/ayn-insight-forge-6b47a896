# Resume Hub map (web app + resume-hub backend)

## Surface
src/pages/ResumeHub.tsx with six tabs in src/components/resume-hub/: OverviewTab (stats), ProfileTab (canonical profile, CanadianProfileForm with default_answers incl. work auth and EEO preferences, learned answers view/edit), BuilderTab (resumes, versions, diff viewer, upload/parse), JobsTab (saved jobs, match, tailor, cover letter, Autofill with AYN button), TrackerTab (pipeline board saved/applied/interview/offer/rejected plus fill telemetry from autofill_runs), ExtensionTab (download zip, version from ayn-extension-version.json, AYN_PING install detection, connected device tokens with revoke).

Bridges: src/lib/resumeHub.ts (session JWT client for the edge function), src/lib/extension.ts (AYN_PING, AYN_TRIGGER_AUTOFILL, AYN_PROFILE_UPDATED, handoffUrl; extension id bjbifnpjbcbdojhgjpedkakkfjpcjmdl). src/pages/Handoff.tsx fallback when extension absent. src/pages/ExtensionApprove.tsx approves link codes. src/pages/ResumeMatch.tsx standalone matcher using the resume-match function.

## Backend action registry (supabase/functions/resume-hub, one POST, body { action, ...payload })
Public (anon key): link_start, link_poll, ats_config_get (v2.10.0 — returns { config, version } from the ats_config 'registry' row so the extension can pull server-driven adapter rules before sign-in).
Extension lane (x-ayn-ext-token): ext_bootstrap, ext_ingest_job, ext_profile (compact fact vector; EXCLUDES work-auth/EEO/salary by design, those stay AI-side), ext_autofill (v2.12.2 — early-returns `{ error: 'no_profile', values: [], sourceDigest: '' }` with NO AI call when the merged profile+resume lacks basic identity `(first_name || full_name) && (email || phone)`, logs an `autofill_runs` row with `meta.reason='no_profile'`; on success returns `sourceDigest` — a normalized concatenation of every legitimate personal fact used by the extension's Layer 3 provenance gate to drop AI-proposed identity values that don't appear in the user's real data; system prompt leads with an ABSOLUTE PROVENANCE RULE forbidding invented placeholder identities like example.com / +1234567890 / John Doe), ext_log_result, ext_vision_fill, ext_cover_letter_text (v2.11.4 — accepts optional length 'short'|'standard'|'detailed' -> 180/280/400 word caps and free-text guidance ≤ 200 chars, honoured only when supported by the resume), ext_job_score (v2.8.2 — accepts optional resume_version_id and uses resolveResumeContent so tailored versions are scored against, not just the primary; returns scoredAgainst { jobTitle, company, jdChars, jdSource 'full'|'snippet', resumeLabel, skillsCount } on every success; refuses to score when the snippet fallback is under 300 chars and returns { needsJd: true, source: 'no_jd' } instead), ext_suggest_roles, ext_find_contacts, ext_save_application (v2.8.0 accepts job_id + match_score), ext_get_applications, ext_update_application, ext_download_resume_text, ext_ask, smart_tailor (v2.11.4 — accepts optional matched_skills[] and missing_skills[] from ext_job_score with a "surface missing skills only if genuinely supported" rule plus explicit metric-preservation so numbers/percentages/dollar figures/headcount/timeframes/dates/titles appear exactly as in input), ext_get_resume_blob, ext_profile_canonical_get, answers_list, answers_update, answers_delete, ext_job_lookup (v2.8.0 — JD resolver backend branch, matches jobs.source_url ilike host+path, returns newest row with jd_text ≥ 400 chars). v2.12.0 REMOVED (dead code, no callers): ext_tailor and ext_cover_letter (superseded by smart_tailor / ext_cover_letter_text), ext_job_ingest (cache logic lives inline in ext_job_score), ext_save_answer / ext_lookup_answer (superseded by the direct PostgREST learning store in extension/question-engine/learning/supabase-store.ts).
Web lane (JWT): link_approve, token_mint, token_list, token_revoke, parse, parse_file, rewrite, match, tailor, cover_letter, profile_canonical_get, profile_canonical_extract, profile_canonical_save.
Dual-auth lane (v2.8.4 — accept EITHER x-ayn-ext-token OR a session JWT): answers_list, answers_update, answers_delete, ext_ingest_job. Defined by DUAL_AUTH_ACTIONS in supabase/functions/resume-hub/index.ts. When called from src/lib/resumeHub.ts (Learned Answers UI in ProfileTab, save-job in JobsTab), the edge function resolves userId from the Bearer JWT and runs the same handler with the admin client. All other EXT_ACTIONS keep the strict ext-token requirement.

resolveResumeContent(admin, userId, resumeVersionId): since v2.7.0 ext_autofill and ext_get_resume_blob honor resume_version_id (tailored version from resume_versions); otherwise is_primary resume.
Aux functions: ext-memory (question learning store), ext-vision-discover (vision zone discovery). ext-fill-form-retry is LEGACY, no longer called.

## Tables
resumes (content jsonb, is_primary), resume_versions (content, created_for_job_id), jobs (jd_text, source_url, dedupe_hash sha256 of company|title|urlPath), job_matches, cover_letters, job_applications (job_title, company, job_url, status, match_score, salary_estimate, notes, applied_at, job_id since 20260721; upsert conflict user_id,job_url), ext_answers (question_hash sha256 of normalized question, answer_text, use_count), device tokens (token_prefix, device_label, last_used_at, revoked_at), user_profile_data (legal names, email, phone, address jsonb, links jsonb, default_answers jsonb), canonical profile (loadCanonical / profile_canonical_*), autofill_runs (inject_results, filled, failed, failure_classes, resolved_by, completed_at). DEPRECATED: applications table (old split-brain tracker); never write to it.

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
- **talent_pool_reindex_self** (v2.9.1): re-runs indexCandidate for the caller (must be opted in) and returns { model, skills_count }. Wired to a "Re-index my profile" text link in the Talent Pool card in ProfileTab so a seeker can refresh after editing their profile.

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

Hub UI (ProfileTab.tsx): "Let employers find me" Card wired to resumeHubApi.talentPoolGet / talentPoolSet. Shows "In the pool · N skills indexed" when on.

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

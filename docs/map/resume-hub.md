# Resume Hub map (web app + resume-hub backend)

## Surface
src/pages/ResumeHub.tsx with six tabs in src/components/resume-hub/: OverviewTab (stats), ProfileTab (canonical profile, CanadianProfileForm with default_answers incl. work auth and EEO preferences, learned answers view/edit), BuilderTab (resumes, versions, diff viewer, upload/parse), JobsTab (saved jobs, match, tailor, cover letter, Autofill with AYN button), TrackerTab (pipeline board saved/applied/interview/offer/rejected plus fill telemetry from autofill_runs), ExtensionTab (download zip, version from ayn-extension-version.json, AYN_PING install detection, connected device tokens with revoke).

Bridges: src/lib/resumeHub.ts (session JWT client for the edge function), src/lib/extension.ts (AYN_PING, AYN_TRIGGER_AUTOFILL, AYN_PROFILE_UPDATED, handoffUrl; extension id bjbifnpjbcbdojhgjpedkakkfjpcjmdl). src/pages/Handoff.tsx fallback when extension absent. src/pages/ExtensionApprove.tsx approves link codes. src/pages/ResumeMatch.tsx standalone matcher using the resume-match function.

## Backend action registry (supabase/functions/resume-hub, one POST, body { action, ...payload })
Public (anon key): link_start, link_poll.
Extension lane (x-ayn-ext-token): ext_bootstrap, ext_ingest_job, ext_job_ingest, ext_profile (compact fact vector; EXCLUDES work-auth/EEO/salary by design, those stay AI-side), ext_autofill, ext_log_result, ext_vision_fill, ext_tailor, ext_cover_letter, ext_cover_letter_text, ext_job_score (v2.8.2 — accepts optional resume_version_id and uses resolveResumeContent so tailored versions are scored against, not just the primary; returns scoredAgainst { jobTitle, company, jdChars, jdSource 'full'|'snippet', resumeLabel, skillsCount } on every success; refuses to score when the snippet fallback is under 300 chars and returns { needsJd: true, source: 'no_jd' } instead), ext_suggest_roles, ext_find_contacts, ext_save_application (v2.8.0 accepts job_id + match_score), ext_get_applications, ext_update_application, ext_download_resume_text, ext_ask, smart_tailor, ext_save_answer, ext_lookup_answer, ext_get_resume_blob, ext_profile_canonical_get, answers_list, answers_update, answers_delete, ext_job_lookup (v2.8.0 — JD resolver backend branch, matches jobs.source_url ilike host+path, returns newest row with jd_text ≥ 400 chars).
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

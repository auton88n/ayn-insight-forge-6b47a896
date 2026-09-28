-- Audit finding, confirmed live via pg_index (not a string-match heuristic,
-- which produced false negatives on this same check): 7 foreign keys in
-- public with no supporting index at all. All 7 tables are small or empty
-- right now (orgs: 2 rows, cookie_consent_log: 65, the rest 0-35) -- no
-- current sequential-scan emergency -- but two of these (inbox_messages,
-- job_postings_seen) are on the hot path of real, actively-used features
-- (the inbox loop, the per-user "seen this job" check on every card
-- render) and will scan the full table on every lookup once they carry
-- real volume, exactly the failure mode a missing FK index produces.
-- Cheap, purely additive, zero behavior change -- fixed now rather than
-- after it's a real, live slow-query complaint.
create index if not exists idx_alert_history_user_id on public.alert_history (user_id);
create index if not exists idx_cookie_consent_log_user_id on public.cookie_consent_log (user_id);
create index if not exists idx_llm_failures_user_id on public.llm_failures (user_id);
create index if not exists idx_orgs_created_by on public.orgs (created_by);
create index if not exists idx_threat_detection_user_id on public.threat_detection (user_id);
create index if not exists idx_inbox_messages_sender_user_id on public.inbox_messages (sender_user_id);
create index if not exists idx_job_postings_seen_job_posting_id on public.job_postings_seen (job_posting_id);

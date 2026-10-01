-- v3.361.0 -- final pass of the same schema-wide grant hygiene sweep this
-- session. None of what follows is a live exploit (RLS already backstops
-- every one of these, confirmed by the actual policy set in place for
-- each table) -- this is closing needlessly wide table-level GRANTs down
-- to exactly what each table's real policies use, so a future careless
-- policy addition fails safe instead of silently becoming exploitable.
--
-- TRUNCATE, REFERENCES, and TRIGGER are revoked from every table below
-- regardless of what else it keeps: TRUNCATE cannot be filtered by RLS
-- at all (it is all-or-nothing at the table level), and REFERENCES/
-- TRIGGER are schema-design privileges a REST client has no legitimate
-- reason to hold on any table.

-- employer_searches: a real oversight from this session's own earlier
-- fix -- every policy was dropped (the ref_map leak fix) but the table's
-- own grant was never tightened to match. Zero legitimate client access
-- exists at all now; every real read/write goes through resume-hub's
-- service-role client.
revoke all on public.employer_searches from anon, authenticated;

-- Tables with a real SELECT-only policy: keep SELECT, drop everything else.
revoke insert, update, delete, truncate, references, trigger
  on public.account_erasures, public.account_limit_overrides,
     public.account_restrictions, public.assessments, public.credit_ledger,
     public.email_logs, public.job_postings, public.plans, public.subscriptions
  from anon, authenticated;

-- Tables with real INSERT+SELECT policies: keep those two.
revoke update, delete, truncate, references, trigger
  on public.employer_accounts, public.ext_diagnostics, public.orgs,
     public.terms_consent_log
  from anon, authenticated;

-- Tables with real INSERT+SELECT+UPDATE policies: keep those three.
revoke delete, truncate, references, trigger
  on public.auto_apply_consent, public.talent_pool_consent
  from anon, authenticated;

-- Tables with a real FOR ALL policy or the equivalent full set of four
-- separate policies: keep the four basic commands, only drop the three
-- that no RLS policy can ever meaningfully cover.
revoke truncate, references, trigger
  on public.cover_letters, public.resumes, public.resume_versions,
     public.jobs, public.user_answer_bank, public.user_profile_canonical,
     public.support_tickets, public.ticket_messages
  from anon, authenticated;

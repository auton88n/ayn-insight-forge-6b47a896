-- v3.361.0 -- same defense-in-depth pass as the earlier grant tightening
-- migration this session. Three more tables had far broader table-level
-- GRANTs to anon/authenticated than their actual RLS policies use.
-- Live-verified before writing this, not assumed: form_widget_patterns
-- has zero policies at all and correctly refuses both a real SELECT
-- (empty result) and a real INSERT (42501) from an authenticated user --
-- genuinely safe today, RLS is doing its job. Tightening the grant is
-- purely to remove a needlessly wide surface for a future policy mistake
-- to land on, same reasoning as the earlier migration.

-- candidate_index: only a SELECT (own row) policy exists. This is the
-- table holding a candidate's own derived embedding/profile_text -- real,
-- deliberately real writes only ever happen via resume-hub's own
-- indexCandidate(), through the service-role client.
revoke insert, update, delete, truncate, references, trigger
  on public.candidate_index from anon, authenticated;

-- candidate_skills: SELECT and DELETE (own row) policies exist -- DELETE
-- is real and used (a candidate can remove an inferred skill at any
-- time, a documented privacy-policy right). INSERT/UPDATE have no policy
-- and are correctly service-role only already.
revoke insert, update, truncate, references, trigger
  on public.candidate_skills from anon, authenticated;

-- form_widget_patterns: zero policies, confirmed live to already deny
-- every command from anon/authenticated. Grant had no reason to include
-- write privileges at all for a table this app's own architecture notes
-- describe as service-role only.
revoke insert, update, delete, truncate, references, trigger
  on public.form_widget_patterns from anon, authenticated;

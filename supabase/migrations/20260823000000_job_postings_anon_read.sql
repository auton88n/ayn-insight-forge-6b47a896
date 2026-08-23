-- v3.201.0 — a real public job board (/jobs): "browse jobs" visible without
-- signing in, per direct founder request. job_postings holds no PII (real
-- company career-page content only -- title, description, location,
-- apply_url, all sourced from a company's own career page), so exposing it
-- to anon costs nothing and risks nothing beyond normal public-web
-- discovery of content that was always meant to be public-facing.
--
-- The one thing that must never leak to an anonymous reader: a listing the
-- scam checker (job-checker/) has confirmed suspicious. The authenticated
-- Browse Jobs page already filters this client side
-- (`.or("scam_suspected.is.null,scam_suspected.eq.false")`), but a public,
-- unauthenticated reader gets no such guarantee from trusting the client --
-- baked into the RLS policy itself instead, so it holds regardless of what
-- query the caller actually sends.
create policy job_postings_select_anon
  on public.job_postings
  for select
  to anon
  using (scam_suspected is not true);

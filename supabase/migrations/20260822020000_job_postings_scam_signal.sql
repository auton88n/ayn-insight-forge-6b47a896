-- v3.196.0 -- the closure checker already visits a listing's real page
-- for every check it runs; asking it one more question in that same call
-- costs nothing extra, so it's also now asked whether the page shows
-- explicit job-scam patterns (fee-up-front, sensitive-info-before-a-real-
-- interview, unrealistic pay for no real work). Captured for visibility
-- only -- unlike a confirmed closure, a scam judgment is not acted on
-- automatically (no auto-delete), since it's a fuzzier call than "is
-- there literally a closed banner on the page."
alter table public.job_postings
  add column if not exists scam_suspected boolean,
  add column if not exists scam_reason text;

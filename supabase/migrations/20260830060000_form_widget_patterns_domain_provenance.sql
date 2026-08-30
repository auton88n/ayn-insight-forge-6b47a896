-- Real, per-site provenance on the shared Form Intelligence cache --
-- which real domains have actually taught AYN this widget shape, kept
-- as observability metadata only, never as part of the match key.
--
-- The cache stays deliberately keyed by structural shape alone (see
-- form_widget_patterns.signature_hash / canonicalSignature() in
-- formIntelligence.ts) -- that is what lets one real classification of
-- "Ashby's own toggle-button widget" cover every Ashby-hosted company,
-- not just the one whose page first triggered it. Keying by domain
-- instead would throw that away for no real benefit: the same component
-- library produces the identical structural shape on every company
-- using that platform, so a domain-keyed cache would just mean paying
-- for the same real classification once per company, forever, exactly
-- the "go back and forth" this whole layer was built to end.
--
-- What domain-tracking IS genuinely worth having: real visibility into
-- which sites have actually contributed to and benefited from a given
-- pattern -- useful for a human debugging a specific site's real
-- coverage, and for an honest answer to "how many real, distinct
-- companies has this one classification actually served."
alter table public.form_widget_patterns
  add column if not exists sample_domains text[] not null default '{}';

comment on column public.form_widget_patterns.sample_domains is
  'A capped, deduplicated sample of real hostnames this exact structural shape has actually been seen on -- observability only, never part of the match key (see signature_hash). Bounded to MAX_SAMPLE_DOMAINS entries in code so a shape shared by thousands of companies on one ATS platform does not grow this without limit.';

-- Atomic dedup+cap array append, the same reason increment_widget_pattern_
-- flag exists rather than a plain JS read-then-write: two real classify
-- calls for the same widget shape landing at nearly the same moment (a
-- popular ATS platform, several real users hitting it together) must not
-- lose one caller's own domain to a race. A no-op (0 rows affected) is
-- expected and harmless when the row doesn't exist yet -- the main
-- classification upsert in the same request already creates it.
create or replace function public.record_widget_domain(
  p_hash text,
  p_domain text,
  p_max integer default 20
) returns void
language sql
security definer
set search_path = public
as $$
  update public.form_widget_patterns
  set sample_domains = array_append(sample_domains, p_domain)
  where signature_hash = p_hash
    and not (p_domain = any(sample_domains))
    and cardinality(sample_domains) < p_max;
$$;

revoke all on function public.record_widget_domain(text, text, integer) from public;
grant execute on function public.record_widget_domain(text, text, integer) to service_role;

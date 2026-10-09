-- Run after the migration inside BEGIN, then roll back every fixture.
do $$
declare t public.job_postings; slug text := 'ayn-location-fixture-' || gen_random_uuid(); r jsonb; n int;
begin
  select * into t from public.job_postings limit 1;
  if t.id is null then raise exception 'Need posting template'; end if;
  t.company_slug := slug; t.company := 'Location fixture'; t.scam_suspected := false;
  for n in 1..45 loop
    t.id := gen_random_uuid(); t.external_id := t.id::text; t.apply_url := 'https://fixture.invalid/location/' || t.id;
    t.location := case when n=45 then null else 'Austin, TX' end;
    insert into public.job_postings select (t).*;
  end loop;
  t.id := gen_random_uuid(); t.external_id := t.id::text; t.apply_url := 'https://fixture.invalid/location/' || t.id;
  t.location := 'Private scam fixture'; t.scam_suspected := true;
  insert into public.job_postings select (t).*;
  r := public.company_location_summary(slug);
  if (r->>'total')::int <> 45 or (r->>'with_location')::int <> 44
    or (r->'groups'->0->>'roles')::int <> 44 or (r->>'source_groups')::int <> 1 then
    raise exception 'Whole-catalog location/unknown/scam counts failed: %', r;
  end if;
  if not has_function_privilege('anon', 'public.company_location_summary(text)', 'execute')
    or has_table_privilege('anon','public.job_postings_archive','select') then raise exception 'Public privileges'; end if;
  if (public.company_location_summary(slug || '-other')->>'total')::int <> 0 then raise exception 'Company scope leaked'; end if;
  raise notice 'Company locations: complete catalog beyond 40, unknowns, company scope, scams and grants passed';
end $$;
rollback;

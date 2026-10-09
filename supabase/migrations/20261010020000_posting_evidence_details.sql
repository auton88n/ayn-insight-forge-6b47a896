-- Older length-only description records cannot be reconstructed.
alter table public.job_posting_changes add column if not exists old_excerpt text;
alter table public.job_posting_changes add column if not exists new_excerpt text;
create or replace function public.job_postings_capture_description_excerpt()
returns trigger language plpgsql security definer set search_path = public as $$
declare a text; b text; lo integer := 0; hi integer; mid integer; start_at integer;
begin
  if new.source is distinct from old.source or new.description is not distinct from old.description then return new; end if;
  a := regexp_replace(coalesce(old.description, ''), '\s+', ' ', 'g');
  b := regexp_replace(coalesce(new.description, ''), '\s+', ' ', 'g');
  if lower(a) = lower(b) or length(coalesce(new.description, '')) < 40 then return new; end if;
  hi := least(length(a), length(b));
  while lo < hi loop
    mid := (lo + hi + 1) / 2;
    if left(a, mid) = left(b, mid) then lo := mid; else hi := mid - 1; end if;
  end loop;
  start_at := greatest(1, lo - 179);
  update public.job_posting_changes set old_excerpt = substring(a from start_at for 780), new_excerpt = substring(b from start_at for 780)
  where id = (select id from public.job_posting_changes where job_posting_id = new.id and field = 'description' and changed_at = now() order by id desc limit 1);
  return new;
exception when others then return new;
end $$;
drop trigger if exists trg_capture_description_excerpt on public.job_postings;
create trigger trg_capture_description_excerpt after update of description on public.job_postings for each row execute function public.job_postings_capture_description_excerpt();

-- Preserve the existing explicit projection. The base cannot be called by API users.
alter function public.job_posting_evidence(uuid) rename to job_posting_evidence_base;
revoke all on function public.job_posting_evidence_base(uuid) from public, anon, authenticated, service_role;
create function public.job_posting_evidence(p_job_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare result jsonb; posting jsonb; appearances jsonb; changes jsonb;
begin
  result := public.job_posting_evidence_base(p_job_id);
  if result is null then return null; end if;
  select to_jsonb(j) - 'embedding' into posting from public.job_postings j where j.id = p_job_id;
  if posting is null then
    select a.data into posting from public.job_postings_archive a where a.job_posting_id = p_job_id and a.removal_reason <> 'scam' order by a.archived_at desc limit 1;
  end if;
  select coalesce(jsonb_agg(x.entry order by x.archived_at), '[]'::jsonb) into appearances from (
    select a.archived_at, jsonb_build_object('archive_id', a.archive_id, 'first_observed_at', coalesce(a.data->>'created_at', a.first_seen_at::text), 'removed_at', a.archived_at, 'removal_reason', a.removal_reason) as entry
    from public.job_postings_archive a where a.job_posting_id <> p_job_id and a.removal_reason <> 'scam'
      and a.archived_at <= (posting->>'created_at')::timestamptz
      and lower(a.company_slug) = lower(posting->>'company_slug') and lower(a.title) = lower(posting->>'title')
      and lower(coalesce(a.location, '')) = lower(coalesce(posting->>'location', ''))
    order by a.archived_at desc limit least(20, greatest(coalesce((result->>'repost_count')::integer, 0), 0))
  ) x;
  select coalesce(jsonb_agg(e.value || jsonb_build_object('old_excerpt', left(c.old_excerpt, 780), 'new_excerpt', left(c.new_excerpt, 780)) order by e.ordinality), '[]'::jsonb)
  into changes from jsonb_array_elements(result->'changes') with ordinality e(value, ordinality)
  left join public.job_posting_changes c on c.id = (e.value->>'id')::bigint and c.job_posting_id = p_job_id;
  return result || jsonb_build_object('appearances', appearances, 'changes', changes);
end $$;
revoke all on function public.job_posting_evidence(uuid) from public;
grant execute on function public.job_posting_evidence(uuid) to anon, authenticated, service_role;
notify pgrst, 'reload schema';

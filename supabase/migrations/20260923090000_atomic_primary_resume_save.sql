-- Preserve prior base resumes and their related documents. The complete
-- primary switch is one transaction; a failed insert cannot erase content.
create or replace function public.save_primary_resume(
  p_id uuid,
  p_title text,
  p_content jsonb,
  p_ats_score integer,
  p_ats_issues jsonb
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_existing public.resumes%rowtype;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_id is null or p_title is null or length(trim(p_title)) = 0
     or length(p_title) > 300 or p_content is null
     or jsonb_typeof(p_content) <> 'object' or p_content = '{}'::jsonb
     or (p_ats_score is not null and (p_ats_score < 0 or p_ats_score > 100))
     or (p_ats_issues is not null and jsonb_typeof(p_ats_issues) <> 'array') then
    raise exception 'Invalid resume' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text, 923));
  select * into v_existing from public.resumes where id = p_id and user_id = v_user;
  if found then
    if v_existing.content is distinct from p_content then
      raise exception 'Save identifier already used' using errcode = '22023';
    end if;
    -- A lost-response retry must not create a duplicate or reactivate an
    -- older version after a more recent successful save.
    return p_id;
  end if;

  insert into public.resumes(id, user_id, title, content, is_primary, ats_score, ats_issues)
  values (p_id, v_user, p_title, p_content, false, p_ats_score, p_ats_issues);
  update public.resumes set is_primary = false where user_id = v_user and is_primary;
  update public.resumes set is_primary = true where id = p_id and user_id = v_user;
  return p_id;
end;
$$;

revoke all on function public.save_primary_resume(uuid, text, jsonb, integer, jsonb) from public, anon;
grant execute on function public.save_primary_resume(uuid, text, jsonb, integer, jsonb) to authenticated;

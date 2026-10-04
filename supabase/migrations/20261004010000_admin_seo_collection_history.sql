-- Bounded operational history; never return query payloads or credentials.
create or replace function public.get_admin_seo_collection_history()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_role((select auth.uid()), 'admin'::public.app_role) then
    raise exception 'Admin access required';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', id, 'source', source, 'attempted_at', taken_at,
      'status', coalesce(data->>'collection_status', 'unknown'),
      'collected_at', data->>'collected_at',
      'error', case when data->>'collection_status' = 'error'
        then left(data->>'collection_error', 100) end
    ) order by taken_at desc)
    from (select id, source, taken_at, data from public.seo_snapshots
      order by taken_at desc limit 20) recent
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.get_admin_seo_collection_history() from public, anon;
grant execute on function public.get_admin_seo_collection_history() to authenticated;

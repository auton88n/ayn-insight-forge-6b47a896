-- Read-only transaction; run after the history migration on an existing DB.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
do $$
begin
  begin
    perform public.get_admin_seo_collection_history();
    raise exception using errcode = 'XX000', message = 'Non-admin read unexpectedly succeeded';
  exception when raise_exception then
    if sqlerrm <> 'Admin access required' then raise; end if;
  end;
end;
$$;
reset role;
do $$
declare admin_id uuid; result jsonb;
begin
  if has_function_privilege('anon', 'public.get_admin_seo_collection_history()', 'EXECUTE') then
    raise exception 'Anonymous EXECUTE must be denied';
  end if;
  select user_id into admin_id from public.user_roles where role = 'admin' limit 1;
  if admin_id is null then raise exception 'Admin fixture required'; end if;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', admin_id, 'role', 'authenticated')::text, true);
  set local role authenticated;
  result := public.get_admin_seo_collection_history();
  if jsonb_typeof(result) <> 'array' or jsonb_array_length(result) > 20 then
    raise exception 'Invalid history response';
  end if;
  if exists (select 1 from jsonb_array_elements(result) row,
      lateral jsonb_object_keys(row) key
      where key not in ('id','source','attempted_at','status','collected_at','error')) then
    raise exception 'Unexpected history field';
  end if;
  raise notice 'Admin history allowed; non-admin and anonymous blocked; payload bounded';
end;
$$;
rollback;

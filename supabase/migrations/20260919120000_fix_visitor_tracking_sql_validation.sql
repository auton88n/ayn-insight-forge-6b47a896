-- PostgreSQL's regular-expression repetition limit rejects the prior
-- `{0,299}` pathname check at runtime. Keep the same input boundary using
-- explicit length checks, which are clearer and valid on the live engine.
create or replace function public.record_visitor_pageview(
  p_visitor_id text,
  p_page_path text,
  p_referrer text,
  p_source_hash text
) returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_event_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  if p_visitor_id is null
    or char_length(p_visitor_id) not between 20 and 80
    or p_visitor_id !~ '^[A-Za-z0-9-]+$'
    or p_page_path is null
    or char_length(p_page_path) > 300
    or p_page_path !~ '^/[^?#]*$'
    or p_source_hash is null
    or char_length(p_source_hash) <> 64
    or p_source_hash !~ '^[0-9a-f]+$'
    or (p_referrer is not null and (
      char_length(p_referrer) > 200
      or p_referrer !~ '^https?://[^/?#]+$'
    )) then
    raise exception 'Invalid visitor event';
  end if;

  delete from public.visitor_analytics_rate_limits
  where source_hash in (
    select source_hash
    from public.visitor_analytics_rate_limits
    where last_seen_at < now() - interval '2 days'
    order by last_seen_at
    limit 100
  );

  insert into public.visitor_analytics_rate_limits as limits
    (source_hash, window_started_at, event_count, last_seen_at)
  values (p_source_hash, now(), 1, now())
  on conflict (source_hash) do update
    set window_started_at = case
          when limits.window_started_at < now() - interval '1 minute' then now()
          else limits.window_started_at
        end,
        event_count = case
          when limits.window_started_at < now() - interval '1 minute' then 1
          else limits.event_count + 1
        end,
        last_seen_at = now()
  returning event_count into v_event_count;

  if v_event_count > 60 then
    return false;
  end if;

  insert into public.visitor_analytics (visitor_id, page_path, referrer)
  values (p_visitor_id, p_page_path, p_referrer);
  return true;
end;
$function$;

revoke all on function public.record_visitor_pageview(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.record_visitor_pageview(text, text, text, text)
  to service_role;

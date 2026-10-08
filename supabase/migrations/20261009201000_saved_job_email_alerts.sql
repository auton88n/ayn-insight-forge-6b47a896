alter table public.user_settings add column if not exists email_saved_job_alerts boolean not null default false;

create table public.saved_job_email_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  archive_id bigint not null,
  title text not null, company text not null,
  status text not null default 'pending' check(status in ('pending','sending','sent','failed','skipped')),
  attempts integer not null default 0,
  queued_at timestamptz not null default now(), next_attempt_at timestamptz not null default now(),
  sent_at timestamptz, last_error text, resend_id text,
  send_payload jsonb, send_started_at timestamptz,
  unique(job_id, archive_id)
);
alter table public.saved_job_email_alerts enable row level security;
revoke all on public.saved_job_email_alerts from public, anon, authenticated;
grant all on public.saved_job_email_alerts to service_role;
create index saved_job_alerts_due on public.saved_job_email_alerts(next_attempt_at) where status in ('pending','sending');
create index saved_job_alerts_user on public.saved_job_email_alerts(user_id);
create index if not exists saved_jobs_apply_norm_idx on public.jobs(lower(split_part(source_url, '?', 1))) where source = 'job_board';

-- Future archive events only; never email old removals to newly opted-in users.
-- Exact saved URL, not a fuzzy company/title match which may be another role.
create function public.queue_saved_job_removal_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.saved_job_email_alerts(user_id,job_id,archive_id,title,company)
    select j.user_id,j.id,new.archive_id,left(coalesce(new.title,j.title,''),300),left(coalesce(new.company,j.company,''),300)
    from public.jobs j join public.user_settings s on s.user_id = j.user_id and s.email_saved_job_alerts
    where j.source = 'job_board' and j.application_status = 'saved'
      and nullif(new.data->>'apply_url','') is not null
      and lower(split_part(j.source_url,'?',1)) = lower(split_part(new.data->>'apply_url','?',1))
    on conflict(job_id,archive_id) do nothing;
  return new;
end;
$$;
revoke all on function public.queue_saved_job_removal_email() from public, anon, authenticated;
create trigger queue_saved_job_removal_email after insert on public.job_postings_archive
for each row execute function public.queue_saved_job_removal_email();

create function public.claim_saved_job_alerts(p_limit integer default 3)
returns setof public.saved_job_email_alerts
language plpgsql security definer set search_path = public as $$
begin
  update public.saved_job_email_alerts set status='failed',last_error='Final attempt lease expired; inspect email provider before resending'
  where status='sending' and attempts>=4 and next_attempt_at<=now();
  return query
  with due as (
    select id from public.saved_job_email_alerts
    where status in ('pending','sending') and next_attempt_at <= now() and attempts < 4
    order by queued_at for update skip locked limit greatest(1,least(coalesce(p_limit,3),10))
  ) update public.saved_job_email_alerts a
    set status='sending', attempts=a.attempts+1, next_attempt_at=now()+interval '10 minutes'
    from due where a.id=due.id returning a.*;
end;
$$;
revoke all on function public.claim_saved_job_alerts(integer) from public, anon, authenticated;
grant execute on function public.claim_saved_job_alerts(integer) to service_role;

create function public.saved_job_alert_sendable(p_id uuid) returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.saved_job_email_alerts a
    join public.user_settings s on s.user_id=a.user_id and s.email_saved_job_alerts
    join public.jobs j on j.id=a.job_id and j.user_id=a.user_id and j.application_status='saved'
    where a.id=p_id and not exists(select 1 from public.job_postings p
      where lower(split_part(p.apply_url,'?',1))=lower(split_part(j.source_url,'?',1))));
$$;
revoke all on function public.saved_job_alert_sendable(uuid) from public,anon,authenticated;
grant execute on function public.saved_job_alert_sendable(uuid) to service_role;

-- Soft account erasure already removes user_settings. Clear the outbox there
-- too; auth-user deletion and deleting the saved job also cascade.
create function public.erase_saved_job_alerts() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.saved_job_email_alerts where user_id=old.user_id;
  return old;
end;
$$;
revoke all on function public.erase_saved_job_alerts() from public, anon, authenticated;
create trigger erase_saved_job_alerts before delete on public.user_settings
for each row execute function public.erase_saved_job_alerts();

do $$
declare definition text;
begin
  select pg_get_functiondef('public.self_export_account()'::regprocedure) into definition;
  if position('''export_version''' in definition)=0 then raise exception 'Unexpected account export'; end if;
  definition:=replace(definition,'''export_version'',',
    '''saved_job_email_alerts'', (select coalesce(jsonb_agg(to_jsonb(a) - ''send_payload''), ''[]''::jsonb) from public.saved_job_email_alerts a where a.user_id=v_uid), ''export_version'',');
  execute definition;
end;
$$;

create function public.admin_saved_job_alert_health() returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin
  if not public.has_role(auth.uid(),'admin'::public.app_role) then raise exception 'Forbidden' using errcode='42501'; end if;
  return jsonb_build_object(
    'pending',(select count(*) from public.saved_job_email_alerts where status in ('pending','sending')),
    'failed',(select count(*) from public.saved_job_email_alerts where status='failed' or (status='sending' and attempts>=4 and next_attempt_at<now())),
    'sent',(select count(*) from public.saved_job_email_alerts where status='sent'),
    'skipped',(select count(*) from public.saved_job_email_alerts where status='skipped'),
    'opted_in',(select count(*) from public.user_settings where email_saved_job_alerts)
  );
end;
$$;
revoke all on function public.admin_saved_job_alert_health() from public,anon;
grant execute on function public.admin_saved_job_alert_health() to authenticated;

create unique index saved_job_email_log_once on public.email_logs((metadata->>'resend_id'))
where email_type='saved_job_removed' and status='sent' and metadata->>'resend_id' is not null;

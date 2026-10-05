-- Snapshot the exact request before sending. Existing queue RLS and account
-- erasure apply to these fields too; no new client permissions are granted.
alter table public.welcome_emails
  add column if not exists send_key uuid not null default gen_random_uuid(),
  add column if not exists send_payload jsonb,
  add column if not exists send_started_at timestamptz;

create or replace function public.welcome_reset_send_request()
returns trigger language plpgsql set search_path = public as $$
begin
  -- Only an explicit terminal-state requeue creates a new logical email.
  -- A sending->pending retry retains its original key and request body.
  if old.status in ('sent','failed','skipped') and new.status = 'pending' then
    new.send_key := gen_random_uuid();
    new.send_payload := null;
    new.send_started_at := null;
  end if;
  return new;
end;
$$;
create trigger welcome_reset_send_request before update on public.welcome_emails
  for each row execute function public.welcome_reset_send_request();

-- Retried acknowledgement of the same provider send must not inflate reports.
create unique index welcome_email_log_provider_once
  on public.email_logs ((metadata->>'resend_id'))
  where email_type = 'welcome' and status = 'sent' and metadata->>'resend_id' is not null;

-- Extend the existing owner-scoped export without replacing its other fields.
do $$
declare definition text;
begin
  select pg_get_functiondef('public.self_export_account()'::regprocedure) into definition;
  if position('''welcome_email''' in definition) = 0 then
    if position('''export_version''' in definition) = 0 then
      raise exception 'Unexpected self_export_account definition';
    end if;
    definition := replace(definition, '''export_version'',',
      '''welcome_email'', (select to_jsonb(w) - ''send_key'' from public.welcome_emails w where w.user_id = v_uid), ''export_version'',');
    execute definition;
  end if;
end;
$$;

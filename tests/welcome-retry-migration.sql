\set ON_ERROR_STOP on
begin;
create schema auth;
create table auth.users(id uuid primary key);
create table public.welcome_emails(user_id uuid primary key references auth.users, status text, attempts int);
create table public.email_logs(metadata jsonb, email_type text, status text);
create function public.self_export_account() returns jsonb language plpgsql as $$
declare v_uid uuid := '00000000-0000-0000-0000-000000000001';
begin return jsonb_build_object('export_version','1.0'); end; $$;
\ir ../supabase/migrations/20261005140000_welcome_retry_payload.sql
insert into auth.users values ('00000000-0000-0000-0000-000000000001');
insert into welcome_emails(user_id,status,attempts,send_payload) values ('00000000-0000-0000-0000-000000000001','sending',1,'{"subject":"hello"}');
do $$
declare before_key uuid; after_key uuid;
begin
 select send_key into before_key from welcome_emails;
 update welcome_emails set status='pending';
 select send_key into after_key from welcome_emails;
 if before_key <> after_key then raise exception 'Retry changed the send key'; end if;
 if (select send_payload is null from welcome_emails) then raise exception 'Retry lost payload'; end if;
 if not (self_export_account() ? 'welcome_email') then raise exception 'Export missing welcome'; end if;
 update welcome_emails set status='sent';
 update welcome_emails set status='pending';
 select send_key into after_key from welcome_emails;
 if before_key = after_key then raise exception 'Explicit resend reused key'; end if;
 if (select send_payload is not null from welcome_emails) then raise exception 'Resend retained old payload'; end if;
end; $$;
rollback;

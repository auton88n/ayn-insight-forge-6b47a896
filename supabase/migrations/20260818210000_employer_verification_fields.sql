-- Employer verification, requested directly: right now an employer account
-- reaches the admin approval queue with nothing checkable behind it — a
-- company name typed into a box, no real evidence it's a real business or
-- that the person behind it is who they say. Same class of gap blueprint.md
-- already warns about generally ("a UI-only gate is not a gate"), just
-- applied to identity/company verification instead of billing.
--
-- Four real, cheap, code-only checks, no outside verification service:
--   1. Business email can't be a known personal-email provider.
--   2. That email's domain must match the company website's own domain.
--   3. Company country must be US or CA — AYN's own current operating
--      scope, narrowed the same day this was requested. Catches a
--      same-named company that isn't actually the one operating here.
--   4. Position and phone are required, not optional — a real, accountable
--      identity behind the account, not just a company name.
--
-- All four run inside handle_new_user_profile, the same trigger that
-- already creates the employer_accounts row in the same transaction as the
-- auth.users row (v3.36.0) — raising an exception here aborts the whole
-- signup atomically, so a failing check means the account is never created
-- at all, not created-then-flagged.
alter table public.employer_accounts
  add column if not exists position_title text,
  add column if not exists company_website text,
  add column if not exists company_address text,
  add column if not exists company_country text;

comment on column public.employer_accounts.position_title is 'The signer''s own job title at the company, collected at signup for accountability.';
comment on column public.employer_accounts.company_country is 'US or CA — must match AYN''s current operating scope, checked at signup.';

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_role_raw text := nullif(trim(v_meta ->> 'role'), '');
  v_role public.user_role := case when v_role_raw = 'employer' then 'employer'::public.user_role else 'job_seeker'::public.user_role end;
  v_company text := nullif(trim(v_meta ->> 'company_name'), '');
  v_position text := nullif(trim(v_meta ->> 'position_title'), '');
  v_phone text := nullif(trim(v_meta ->> 'phone'), '');
  v_website text := nullif(trim(v_meta ->> 'company_website'), '');
  v_address text := nullif(trim(v_meta ->> 'company_address'), '');
  v_country text := upper(nullif(trim(v_meta ->> 'company_country'), ''));
  v_email_domain text;
  v_website_domain text;
  v_personal_providers text[] := array[
    'gmail.com','googlemail.com','yahoo.com','yahoo.co.uk','outlook.com',
    'hotmail.com','hotmail.co.uk','live.com','msn.com','icloud.com','me.com',
    'mac.com','aol.com','protonmail.com','proton.me','gmx.com','gmx.net',
    'mail.com','yandex.com','yandex.ru','zoho.com','qq.com','163.com','126.com'
  ];
begin
  insert into public.profiles (user_id, role, company_name, created_at, updated_at)
  values (new.id, v_role, case when v_role = 'employer' then v_company else null end, now(), now())
  on conflict (user_id) do nothing;

  if v_role = 'employer' then
    -- Real signup, not a re-auth or metadata-less path — apply the checks
    -- only when the employer fields were actually supplied, so an admin
    -- correcting a record by hand or a legacy row is never blocked.
    if v_meta ? 'company_website' then
      v_email_domain := lower(split_part(new.email, '@', 2));

      if v_email_domain = any(v_personal_providers) then
        raise exception 'Please sign up with your business email address, not a personal email provider.';
      end if;

      if v_website is null then
        raise exception 'Company website is required.';
      end if;
      v_website_domain := lower(regexp_replace(v_website, '^(https?://)?(www\.)?([^/]+).*$', '\3'));
      if v_email_domain is distinct from v_website_domain
         and v_email_domain !~ ('(^|\.)' || regexp_replace(v_website_domain, '[.]', '\\.', 'g') || '$') then
        raise exception 'Your email domain must match your company website (% does not match %).', v_email_domain, v_website_domain;
      end if;

      if v_country not in ('US', 'CA') then
        raise exception 'AYN currently operates only in the United States and Canada.';
      end if;

      if v_position is null then
        raise exception 'Your position at the company is required.';
      end if;
      if v_phone is null then
        raise exception 'A phone number is required.';
      end if;
      if v_address is null then
        raise exception 'A company address is required.';
      end if;
    end if;

    insert into public.employer_accounts (
      user_id, company_name, status, position_title, phone,
      company_website, company_address, company_country
    )
    values (
      new.id, coalesce(v_company, 'Unnamed company'), 'pending_approval',
      v_position, v_phone, v_website, v_address, v_country
    )
    on conflict (user_id) do nothing;
  end if;

  return new;
end;
$function$;

-- v3.361.0 -- minor/defense-in-depth finding from the same security pass,
-- not exploitable for real harm (checked before touching anything): the
-- existing prevent_system_field_modification trigger already blocks a
-- non-admin from self-modifying account_status/last_login/total_sessions,
-- but never included role, even though it's the most consequential field
-- on this table by a wide margin. Confirmed the real impact is cosmetic
-- rather than a security bypass -- grepped resume-hub's entire backend
-- for any authorization decision keyed on profiles.role and found none;
-- the two real frontend readers (useUserRole.ts, Billing.tsx) only ever
-- use it to pick which UI shell/billing tab to show. The actual employer
-- gate is employer_accounts.status (fixed earlier this same pass) plus
-- org membership, both checked server-side and untouched by this field.
-- Closed anyway since it sits directly beside fields the same trigger
-- already protects, and there's no legitimate reason a user should ever
-- set this column themselves rather than it being set at signup.

create or replace function public.prevent_system_field_modification()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
BEGIN
  -- Only apply to non-admin users
  IF NOT has_role(auth.uid(), 'admin'::app_role) AND TG_OP = 'UPDATE' THEN
    -- Prevent modification of system-managed fields
    IF OLD.account_status IS DISTINCT FROM NEW.account_status THEN
      RAISE EXCEPTION 'Cannot modify account_status field';
    END IF;

    IF OLD.last_login IS DISTINCT FROM NEW.last_login THEN
      RAISE EXCEPTION 'Cannot modify last_login field';
    END IF;

    IF OLD.total_sessions IS DISTINCT FROM NEW.total_sessions THEN
      RAISE EXCEPTION 'Cannot modify total_sessions field';
    END IF;

    IF OLD.role IS DISTINCT FROM NEW.role THEN
      RAISE EXCEPTION 'Cannot modify role field';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

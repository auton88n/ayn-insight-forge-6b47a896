-- Sept 2026, found by a real authorized production pentest (Strix/DeepSeek)
-- and independently verified live before fixing: employer_accounts' own
-- INSERT policy only ever checked `user_id = auth.uid()`, with no
-- restriction at all on status/approved_by/approved_at/internal_note/
-- package_notes. Any signed-in account with no existing employer_accounts
-- row (a plain job seeker, or any brand-new signup) could POST directly to
-- /rest/v1/employer_accounts with status:'approved' and forge approved_by/
-- internal_note, completely bypassing the founder's manual employer
-- review. isApprovedEmployer() (resume-hub) trusts this column outright,
-- so the exploit reaches real functionality -- confirmed live: the
-- self-approved test account successfully called employer_org_create and
-- got a real org, the same capability a genuinely reviewed employer gets.
--
-- Fixed at the row's own creation, not by tightening the RLS check (which
-- would risk rejecting some legitimate insert path this migration can't
-- fully enumerate): every new row is forced to the safe pending defaults
-- regardless of what the INSERT statement itself supplied. Real approval
-- is already modeled as a separate UPDATE (admin_employer_approve, a
-- SECURITY DEFINER function bypassing RLS entirely), so this can never
-- block or interfere with that path -- it only ever governs row creation.
create or replace function public.employer_accounts_force_pending_defaults()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  new.status := 'pending_approval'::employer_status;
  new.approved_by := null;
  new.approved_at := null;
  new.internal_note := null;
  new.package_notes := null;
  return new;
end;
$function$;

drop trigger if exists trg_employer_accounts_force_pending on public.employer_accounts;
create trigger trg_employer_accounts_force_pending
  before insert on public.employer_accounts
  for each row execute function public.employer_accounts_force_pending_defaults();

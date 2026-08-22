-- v3.197.0 -- the sticky trigger from the previous migration blocked its
-- own intended escape hatch: it can't tell "a routine automated re-sync
-- silently found nothing this pass" apart from "a human deliberately
-- correcting a confirmed false positive" -- both are a plain true-to-false
-- UPDATE. Found live, the hard way: three real false positives (a
-- Twilio anti-fraud disclaimer, a Hy-Vee equipment list mentioning
-- "Western Union", an employee-gift-card benefits line) needed correcting
-- right after they were found, and the trigger silently overrode the
-- correction back to true even though the UPDATE reported success.
--
-- Fixed with a session-scoped bypass: the automated ingestion functions
-- (job-board-sync, ats-direct-sync) never set it, so they stay exactly as
-- protected as before; a deliberate manual correction wraps its UPDATE in
-- `SET LOCAL ayn.allow_scam_downgrade = 'true'` first.
create or replace function public.job_postings_scam_sticky() returns trigger as $$
begin
  if TG_OP = 'UPDATE' and coalesce(current_setting('ayn.allow_scam_downgrade', true), 'false') <> 'true' then
    if coalesce(old.scam_suspected, false) and not coalesce(new.scam_suspected, false) then
      new.scam_suspected := true;
      if new.scam_reason is null or new.scam_reason = '' then
        new.scam_reason := old.scam_reason;
      end if;
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

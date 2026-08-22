-- v3.197.0 -- job-board-sync re-upserts the same ~2000 freehire rows every
-- 2 hours in one blanket call, with no separate insert-vs-update code path
-- to safely tell "this is genuinely new" apart from "this already exists
-- and might already carry a real finding". Without this trigger, a row the
-- deeper AI checker (job-checker/) had already confirmed scam_suspected =
-- true could get silently flipped back to false on the very next routine
-- resync, since the cheap keyword pass at ingestion found nothing on that
-- pass and would otherwise overwrite it. Once true, it stays true --
-- centralized here at the database level so it protects the table
-- regardless of which function writes to it, not just the ones that
-- happen to remember to check.
create or replace function public.job_postings_scam_sticky() returns trigger as $$
begin
  if TG_OP = 'UPDATE' then
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

drop trigger if exists trg_job_postings_scam_sticky on public.job_postings;
create trigger trg_job_postings_scam_sticky
  before update on public.job_postings
  for each row
  execute function public.job_postings_scam_sticky();

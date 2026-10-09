-- The feed mistook prior internship experience for this role's engagement.
-- Do not infer full-time/contract from its pay or title. Unknown is safer.
begin;
update public.job_postings
set employment_type = null
where id = '9936c233-72da-4764-8506-0130743de63e'
  and source = 'freehire'
  and title = 'DEPUTY CITY ATTORNEY I/II or SENIOR DEPUTY CITY ATTORNEY - PUBLIC SAFETY/HR DIVISION'
  and employment_type = 'internship'
  and description ~* 'prior[^.\n]{0,100}internship experience';
commit;

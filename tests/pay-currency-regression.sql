-- ONLY run in an empty isolated test database, not production.
create role anon;
create role authenticated;
create table public.job_postings (
 id integer, company_slug text, company text, category text, city text,
 location text, title text, seniority text, salary_min numeric, salary_max numeric,
 salary_currency text, salary_text_annual_min numeric, salary_text_annual_max numeric,
 salary_text_currency text, scam_suspected boolean, description text
);
\ir ../supabase/migrations/20261010230000_pay_currency_conflicts.sql
insert into public.job_postings(id,salary_min,salary_max,salary_currency,description) values
 (1,195000,205000,'CAD','Salary USD 195,000 - 205,000 per year'),
 (2,195000,205000,'USD','Salary USD 195,000 - 205,000 per year'),
 (3,100000,120000,null,'Pay range 100,000 - 120,000'),
 (4,100000,120000,'CAD','Annual CAD range'),
 (5,100000,120000,'USD','US USD and Canadian CAD salary ranges');
insert into public.job_postings(id,salary_text_annual_min,salary_text_annual_max,salary_text_currency,description)
 values(6,70000,90000,'USD','Salary USD 35 - 45 per hour');
do $$ begin
 if (select array_agg(id order by id) from public.job_pay) <> array[2,4,6] then
   raise exception 'Currency conflicts or missing currency leaked into benchmarks';
 end if;
 if has_table_privilege('anon','public.job_pay','select') or has_table_privilege('authenticated','public.job_pay','select') then
   raise exception 'Private pay view exposed';
 end if;
end $$;

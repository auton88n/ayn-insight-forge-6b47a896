-- Do not silently turn missing currency into USD or benchmark a posting whose
-- explicit currency codes contradict the extracted/feed currency. Mixed-currency
-- descriptions are conservatively excluded until their separate ranges are parsed.
-- Original feed fields and posting text remain untouched.
create or replace view public.job_pay as
select jp.id, jp.company_slug, jp.company, jp.category, jp.city, jp.location, jp.title, jp.seniority,
       pay.annual_min, pay.annual_max, pay.currency, pay.pay_source
  from public.job_postings jp
 cross join lateral (select (jp.salary_min is not null and jp.salary_max is not null
                             and (jp.salary_min + jp.salary_max) / 2.0 between 15000 and 1500000) as ok) lst
 cross join lateral (select
   case when lst.ok then jp.salary_min else jp.salary_text_annual_min end as annual_min,
   case when lst.ok then jp.salary_max else jp.salary_text_annual_max end as annual_max,
   upper(nullif(btrim(case when lst.ok then jp.salary_currency else jp.salary_text_currency end), '')) as currency,
   case when lst.ok then 'listed' else 'text' end as pay_source
 ) pay
 where jp.scam_suspected is not true
   and (lst.ok or jp.salary_text_annual_min is not null)
   and pay.currency is not null
   and not exists (
     select 1 from regexp_matches(coalesce(jp.description, ''),
       '\m(USD|CAD|EUR|GBP|AUD|AED|SGD|INR|NZD|CHF|JPY)\M', 'gi') as codes(code)
      where upper(codes.code[1]) <> pay.currency
   );
revoke all on public.job_pay from anon, authenticated;

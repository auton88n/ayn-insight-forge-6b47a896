-- "Explore roles" used to load thousands of full job descriptions into memory to score them one by
-- one, and the server killed the request. The database now finds the closest roles directly from the
-- stored job vectors, and groups them by title.
create index if not exists job_postings_embedding_hnsw
  on public.job_postings using hnsw (embedding vector_cosine_ops);

create or replace function public.role_finder_nearest(p_embedding vector(768), p_model text, p_limit int default 15)
returns table(title text, avg_cos double precision, openings bigint, companies text[], best_id uuid)
language sql stable security definer set search_path = public
as $$
  with near as (
    select id, title, company, 1 - (embedding <=> p_embedding) as cos
      from job_postings
     where embedding is not null and embedding_model = p_model and coalesce(scam_suspected, false) = false
     order by embedding <=> p_embedding
     limit 600
  ), grouped as (
    select lower(title) as k, min(title) as title, avg(cos) as avg_cos,
           (array_agg(distinct company))[1:3] as companies,
           (array_agg(id order by cos desc))[1] as best_id
      from near
     where title is not null and btrim(title) <> ''
     group by lower(title)
  )
  select g.title, g.avg_cos::double precision,
         (select count(*) from job_postings jp where lower(jp.title) = g.k) as openings,
         g.companies, g.best_id
    from grouped g
   order by g.avg_cos desc
   limit greatest(p_limit, 1)
$$;

revoke all on function public.role_finder_nearest(vector, text, int) from public, anon, authenticated;
grant execute on function public.role_finder_nearest(vector, text, int) to service_role;

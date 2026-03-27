-- WorldMonitor cache table — stores live API responses for 10-min TTL caching
create table if not exists ayn_worldmonitor_cache (
  domain        text        not null,
  response      jsonb,
  fetched_at    timestamptz not null default now(),
  primary key (domain)
);

-- RLS: only service_role can write; authenticated users read via the proxy function only
alter table ayn_worldmonitor_cache enable row level security;

create policy "service role full access"
  on ayn_worldmonitor_cache
  for all
  to service_role
  using (true)
  with check (true);

comment on table ayn_worldmonitor_cache is
  'Caches WorldMonitor API responses per domain (conflict, maritime, aviation, etc.) with 10-minute TTL.';

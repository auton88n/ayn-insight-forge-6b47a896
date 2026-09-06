-- v3.357.0 -- extending automatic error reporting to cover "quiet"
-- frontend failures (an unhandled promise rejection, a JS error outside
-- React's own render -- a click handler, a background save) the same
-- way ErrorBoundary already covers a page-crashing one, and feeding all
-- three into the same error-alert-check email pipeline.
--
-- Found while wiring this up, checked live rather than assumed: a
-- genuinely signed-out visitor could never report an error at all.
-- error_logs' own RLS has a single permissive policy scoped to `anon`
-- ("Block anonymous error_logs access", USING(false)/CHECK(false) for
-- every command), and nothing else grants that role anything -- so
-- ErrorBoundary.reportError's own insert has been silently failing (and
-- silently swallowed, by its own design: "error reporting should never
-- break the app") for every crash that ever happened before someone
-- signed in. Most real traffic to a landing/marketing page is signed
-- out, which is exactly the traffic you'd most want a crash report
-- from. Permissive policies for the same command OR together, so this
-- adds a second, narrow one for INSERT only -- SELECT/UPDATE/DELETE for
-- anon stay exactly as blocked as before, only a genuinely anonymous
-- row (user_id IS NULL, never spoofable to someone else's id since
-- there's no session to spoof from) can now land.
create policy "anon_insert_own_error_logs"
  on public.error_logs for insert
  to anon
  with check (user_id is null);

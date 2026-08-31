# Deployment & VPS operations

AYN is self-hosted on a Hostinger VPS (Ubuntu, Docker Compose), not Lovable Cloud and not Supabase's own hosted platform. This file is the "how do I actually ship a change" reference — read it before touching the VPS directly. It's a companion to `blueprint.md` (what to touch for a given kind of change), not a replacement for it.

## The box

- **IP**: `2.25.109.213`
- **Access**: `ssh root@2.25.109.213` — key-based, no password prompt in this environment.
- **Domain**: `ayn.careers`. Supabase itself is merged onto the bare domain (no `supabase.` subdomain) via Traefik path-prefix routing — see `blueprint.md`/CLAUDE.md's own domain-merge history if touching routing.

## Directory layout on the VPS

- `/root/supabase/docker/` — the self-hosted Supabase stack itself (docker-compose.yml, `.env` with `ANON_KEY`/`SERVICE_ROLE_KEY`/etc).
- `/root/supabase/docker/volumes/functions/` — the edge functions volume. One directory per function (matches `supabase/functions/*` in the repo) plus `_shared/` for the shared modules. This is what `supabase-edge-functions` actually serves from.
- `/root/ayn-repo/` — a separate git checkout of this same repo, used only for building the frontend. `npm run build` here produces `/root/ayn-repo/dist`, which `ayn-frontend` serves.
- `/root/auto_deploy.sh` — the one-command official deploy script (see below).

**`docker-compose.yml` and `auto_deploy.sh` are infrastructure, not application code — neither is tracked in this git repo.** They live only on the VPS. `auto_deploy.sh` copies an explicit, hardcoded list of named function directories (adding a new function means adding its own `rm -rf ... && cp -r ...` line by hand); `docker-compose.yml` is the self-hosted Supabase install's own compose file. A schema/app change ships through this repo as normal; an infrastructure change (a new function needing a deploy-script entry, a new secret needing a compose-file line) has to be made directly on the VPS and is only ever *described* here, not version-controlled.

## The containers that matter

- `supabase-db` — Postgres. Real, live production data.
- `supabase-edge-functions` — the Deno runtime serving everything under `/root/supabase/docker/volumes/functions/`. Restarting it is how a function change actually takes effect; it does not hot-reload.
- `ayn-frontend` — serves the built React app (the `/root/ayn-repo/dist` output).

## Two ways to deploy — pick based on what you're doing

### 1. Fast iteration on a single edge function (what you want while actively debugging)

```bash
scp supabase/functions/<name>/index.ts root@2.25.109.213:/root/supabase/docker/volumes/functions/<name>/index.ts
ssh root@2.25.109.213 "docker restart supabase-edge-functions"
```

Same pattern for a shared module: `scp supabase/functions/_shared/<file>.ts root@2.25.109.213:/root/supabase/docker/volumes/functions/_shared/<file>.ts`, then restart. Restarting the container reloads *every* function, not just the one you changed, so one restart is enough even if you touched a shared file plus its callers.

This updates the live function in seconds, but it is **not** the official deploy — the local git repo and `/root/ayn-repo` are now out of sync with what's actually running. Always follow up with a real commit + push once the change is verified, and fold it into a full deploy (below) before calling the work done. Skipping this step is exactly the failure mode CLAUDE.md's own history documents once already (a silent auto-deploy revert, caused by uncommitted VPS-side drift accumulating until `git pull` had nothing to do).

Frontend-only changes have no equivalent fast path — `ayn-frontend` serves a built bundle, not source, so any `.tsx`/`.css` change needs a real build. Use the full deploy for those, or `npm run build` locally + eyeball the dist output if you just need to confirm it compiles.

### 2. The official deploy (what "done" means)

```bash
git add <files> && git commit -m "..." && git push origin main
ssh root@2.25.109.213 "bash /root/auto_deploy.sh"
```

`auto_deploy.sh` does, in order: `git pull` in `/root/ayn-repo`, `npm run build`, restart `ayn-frontend`, copy the tracked edge-function directories into the functions volume, restart `supabase-edge-functions`. This is the only path that keeps the VPS, the git remote, and what's actually served all in agreement — treat it as the real finish line for any change, not the scp-and-restart shortcut above.

After running it, confirm the deploy actually landed rather than trusting the script's own success output — the bundle filenames are content-hashed per build, so grepping for a string from your change in the *locally* built `dist/` won't match what's live:

```bash
BUNDLE=$(ssh root@2.25.109.213 "ls /root/ayn-repo/dist/assets/ | grep <ComponentName>")
curl -s "https://ayn.careers/assets/$BUNDLE" | grep -o "<a distinctive string from your change>"
```

## Postgres access

```bash
ssh root@2.25.109.213 "docker exec -i supabase-db psql -U postgres -d postgres < /tmp/query.sql"
```

Write the SQL to a local file first and pipe it in via stdin (`< file`), don't use `-f /path`. `-f` resolves the path **inside the container's own filesystem**, not the host's — scp'ing a file to the VPS's `/tmp` and passing `-f /tmp/file.sql` fails with "No such file or directory" even though the file is right there on the host, because the container can't see the host's `/tmp`. Same trap applies to `\copy ... to '/tmp/out.tsv'` inside a psql session — it writes inside the container, not the host; `docker cp` it out, or better, just `select json_agg(row_to_json(t)) from (...) t` and capture stdout directly, which sidesteps the whole container/host boundary.

For a one-off inline query, `docker exec supabase-db psql -U postgres -d postgres -c "..."` works, but regex/special characters going through the ssh → local-shell → remote-shell → docker exec → psql chain are fragile — a `\$`, a `\b`, or an unescaped quote can get mangled by any layer in that chain. Prefer the file+stdin form above for anything beyond a trivial query.

**Postgres regex gotcha, found the hard way this session**: Postgres's own POSIX ERE dialect does not support `\b` as a word-boundary token — it's a silent no-op, so `\bindia\b` matches nothing at all rather than erroring, and a cleanup query built on it will look like it worked while quietly matching zero rows. The real token is `\y`. This does NOT apply to JS/TypeScript regex (where `\b` works correctly) — only to regex evaluated inside Postgres itself (a `~*` filter, a `regexp_matches` call, etc.). Verify a Postgres cleanup regex actually matched something before trusting it ran clean, don't just check for a zero exit code.

Reading the anon/service-role keys directly off the VPS (needed for curling an edge function or a REST endpoint as a specific role):

```bash
ssh root@2.25.109.213 "grep -E 'ANON_KEY|SERVICE_ROLE_KEY' /root/supabase/docker/.env"
```

## Migrations

Files under `supabase/migrations/` in this repo are the historical record of schema changes, not an automated migration runner — there is no CI/CD step or `supabase db push` wired up against this self-hosted stack. A schema change means: write the migration file (for the record, and so a future reader can see what changed and why), then actually apply it live via the Postgres access pattern above. The file and the live database only stay in sync because both steps are done by hand, together, in the same pass — writing the migration file alone changes nothing live.

## Verifying a change live against real production data

The standing pattern this app's own history uses for "prove it, don't assume it," and the one to keep using:

1. Sign up a real throwaway account directly against the live auth API:
   ```bash
   curl -s -X POST "https://ayn.careers/auth/v1/signup" \
     -H "apikey: <anon key>" -H "Content-Type: application/json" \
     -d '{"email":"...@example.com","password":"...","data":{"full_name":"..."}}'
   ```
2. Confirm its email directly in Postgres (no real inbox needed): `update auth.users set email_confirmed_at = now() where email = '...';`
3. Sign in for a real session: `POST /auth/v1/token?grant_type=password` with the same credentials — returns a real `access_token`/`refresh_token` pair.
4. For a UI check: inject that session into the Browser pane's `localStorage` under the Supabase JS client's storage key, then navigate to the app. The key is derived from `SUPABASE_URL` — since `src/config.ts` defaults to `https://ayn.careers`, setting the value under all of `sb-ayn-auth-token`, `sb-ayn.careers-auth-token`, and `sb-localhost-auth-token` covers every environment this has actually been run against; the app picks up whichever one matches. Use `javascript_tool` to call `localStorage.setItem(key, JSON.stringify(session))` for each.
5. For a pure backend check: use the `access_token` directly as a `Bearer` token against `/rest/v1/...` or `/functions/v1/<name>`.
6. Clean up when done: `POST /rest/v1/rpc/self_delete_account` with `{"p_confirm_email": "..."}` and the same bearer token. Confirm zero rows remain in whatever tables the test touched — this app's own erasure coverage has had real, documented gaps before (see CLAUDE.md's history), so a clean confirm is worth the extra query, not just trusting the RPC's own success response.

**The live `https://ayn.careers` domain itself may be blocked by the Browser pane's own navigation policy** in some sessions (external-domain restriction, not an app problem). When that happens, use `preview_start` with `{name: "dev"}` (the `dev` config in `.claude/launch.json`, `npm run dev` on port 3000) instead — a local dev server is not subject to the same external-URL block, and since `SUPABASE_URL` defaults to the real production backend with no local override, it exercises the exact same live data and live edge functions as the deployed site. The session-injection steps above work identically against `http://localhost:3000`.

## Adding a new edge function secret

`supabase/docker/.env` is **not** automatically forwarded to a container's environment — Docker Compose only uses it for `${VAR}` substitution *inside* `docker-compose.yml` itself. `supabase-edge-functions`' actual environment is the explicit list under the `functions:` service's `environment:` block in `docker-compose.yml` (e.g. `AI_RELAY_URL: ${AI_RELAY_URL}`) — a new secret has to be added as its own line there, by name, or `Deno.env.get()` will never see it no matter what's in `.env`.

**A plain `docker restart supabase-edge-functions` will not pick up a new or changed secret either way.** A container's environment is baked in at *creation* time from the compose file; `restart` just restarts the same process inside the same already-materialized container. Confirmed live this session: appending a line to `.env` and restarting left a brand-new secret invisible to `Deno.env.get()` for two full restart cycles, until recreating the container properly fixed it:

```bash
ssh root@2.25.109.213 "cd /root/supabase/docker && docker compose -p supabase -f docker-compose.yml up -d --force-recreate functions"
```

Use `--force-recreate functions` (real service name, not the `supabase-edge-functions` container-name alias) whenever a secret changes; a plain `docker restart` is still correct and sufficient for a pure code/file change in the functions volume, since that part *is* read fresh on every restart.

## A second, internal-only service: the job closure checker

`ayn-job-checker` (v3.195.0, ScrapeGraphAI swapped for Crawl4AI at v3.318.0) is a standalone Docker container, **not** part of `docker-compose.yml`, running a small Python/FastAPI service (`job-checker/` in this repo) built on Crawl4AI plus a headless Chromium. It visits a job posting's real `apply_url` and asks whether it's genuinely still open — the real, verified alternative to guessing from freehire's own (proven unreliable) `posted_at`. `job-board-sync` calls it before pruning a listing past `FRESHNESS_DAYS`. The fetch (Crawl4AI, free, boilerplate-stripped markdown) and the AI judgment (exactly one capped call through `ai-openai-bridge`) are two separate, explicit steps now, not one opaque bundled call — swapped after real 2026 pricing research confirmed ScrapeGraphAI was the highest-priced of the real options checked (Crawl4AI, Firecrawl, ScrapeGraphAI), almost certainly because `SmartScraperGraph` could silently chunk an oversized page into multiple billed LLM calls with no visible cap.

It is deliberately **not exposed on any public port** — attached only to the `supabase_default` Docker network, reachable from `supabase-edge-functions` by container name (`http://ayn-job-checker:8000/check`), authenticated by a `CHECKER_SECRET` header shared only between the two. It never holds the real AI gateway credential itself; it calls through `ai-openai-bridge` (a small edge function, service-role-key-gated) so that credential never leaves the edge runtime.

Build and run it fresh (e.g. after a `job-checker/` source change):

```bash
scp -r job-checker root@2.25.109.213:/root/job-checker
ssh root@2.25.109.213 'cd /root/job-checker && docker build -t ayn-job-checker .'
SERVICE_KEY=$(ssh root@2.25.109.213 "grep '^SERVICE_ROLE_KEY=' /root/supabase/docker/.env | cut -d= -f2-")
CHECK_SECRET=$(ssh root@2.25.109.213 "grep '^CHECKER_SECRET=' /root/supabase/docker/.env | cut -d= -f2-")
ssh root@2.25.109.213 "docker rm -f ayn-job-checker 2>/dev/null; docker run -d --name ayn-job-checker --network supabase_default --restart unless-stopped --memory=1.5g --cpus=1 -e SERVICE_ROLE_KEY='$SERVICE_KEY' -e CHECKER_SECRET='$CHECK_SECRET' ayn-job-checker"
```

`CHECKER_SECRET` itself must be a real line in `.env` **and** explicitly added to `docker-compose.yml`'s `functions:` environment block (see above) — it is not part of this repo's own migration/deploy tracking since `docker-compose.yml` isn't tracked here at all.

**A real timeout was hit and fixed this session, worth knowing before touching the checker's batch sizes.** The Edge Runtime's own worker supervisor killed a `job-board-sync` invocation outright (`WorkerRequestCancelled`) when the checker's wall-clock budget was too generous on top of the function's existing fetch+upsert work — there is a real, hard ceiling here, tighter than the 150s figure documented elsewhere in this codebase for other functions. Keep the checker's own batch size and wall-clock budget conservative (current values: 8 + 3 candidates, 20s budget) and watch real `time` output after any increase rather than assuming headroom.

## Things that will bite you if you assume otherwise

- A `docker restart supabase-edge-functions` reloads the *whole* functions volume, not one function — convenient (one restart covers a shared-module change plus every caller) but means a half-finished edit to an unrelated function will also go live the moment you restart for something else. Check `git status` / diff the functions volume mentally before restarting if you've been mid-edit on more than one function. It does **not**, however, pick up a new environment variable — see above.
- The frontend has no fast path — `ayn-frontend` serves a pre-built `dist/`, so a CSS/TSX change is invisible until a real `npm run build` + container restart happens, either via `auto_deploy.sh` or by hand.
- Bundle filenames are content-hashed per build. Never grep a *locally* built bundle to confirm a *remote* deploy landed — always pull the actual filename the VPS just built (`ls /root/ayn-repo/dist/assets/`) before checking its contents.
- `/root/ayn-repo` and this local checkout are two independent git working copies of the same remote. Uncommitted local changes don't exist on the VPS until pushed and pulled — the fast-iteration scp path is the only way to get an unpushed change onto the VPS, and it bypasses git entirely, which is exactly why it must always be followed by a real commit.

# AYN search-growth operating loop

The goal is qualified paid job-seeker demand, not a high article count. AYN
already publishes catalog-backed reports through `content-engine` on a
founder-controlled cron; the new daily monitor checks whether search engines
can read them. Do not treat a published article, sitemap URL, or social share as
proof of indexing, ranking, AI citation, signup, or a paid subscriber.

## One-time Google connection

1. In Google Search Console, open the verified **URL-prefix** property
   `https://ayn.careers/` (not the retired `aynn.io` property).
2. Under Sitemaps, submit `sitemap.xml`, `sitemap-jobs.xml`, and
   `sitemap-insights.xml`. Check the resulting status in Search Console;
   the live XML files alone do not establish submission.
   All three were submitted on 2 October 2026. The jobs sitemap succeeded;
   the main and Insights sitemaps initially showed “Couldn't fetch”. On 3 October
   Search Console showed Success for all three (38, 4 and 5,919 discovered
   pages; the Insights count predates later articles and updates on Google's
   next read).
3. For automated, read-only performance measurement, enable the Search Console
   API in a Google Cloud project, create a dedicated service account, and add
   its email as a user on that exact Search Console property. Run
   `npm run seo:gsc` only in a private environment with
   `GSC_SERVICE_ACCOUNT_JSON` set securely. Never put the key in the repo,
   a chat, or an issue. Scope that account to the property, rotate it if
   exposed, and avoid granting owner access unless necessary.

The public GitHub repository's daily workflow saves only the public
`seo-health` report. Do **not** upload private Search Console metrics as
Actions artifacts here. If the key is absent, `npm run seo:gsc` explicitly
says it is unconfigured. The Search Console API provides *page-level* trends
after Google's reporting delay, not full index-coverage proof. GitHub Actions
schedules may run late, and only run once the workflow is on the default
branch. The service-account comparison remains optional; the separate daily
VPS snapshot collector below now uses the existing OAuth authorization.

## Private VPS collection (October reliability follow-up)

`scripts/seo-snapshot.py` collects each source independently, retries transient
HTTP/network failures at most three times, and emits sanitized error snapshots
instead of fabricated zero traffic. Failed snapshots retain the prior payload
and `collected_at`; `taken_at` is the attempt timestamp. The admin SEO view
warns on failures or readings older than 48 hours. No tables or RPC grants change.

Deploy the script and `seo-collector-run.sh` to `/opt/ayn-seo/`, and the supplied
`ayn-seo-collector.service` / `.timer` units to `/etc/systemd/system/`. The timer
runs daily at 05:00 UTC (09:00 Dubai), with up to ten minutes of jitter and
missed-run catchup. The service has a 20-minute timeout and a non-overlap lock.
It uses the isolated SEO Monster Python environment, writes only SEO snapshots
through local Docker/psql, and never changes articles or calls Google write APIs.
It runs as root because the existing local Docker database interface requires
that privilege; hardening does not make Docker access a least-privilege boundary.

Google token `/opt/ayn-seo/token.json` and optional PageSpeed key
`/opt/ayn-seo/psi-key` are private 0600 files inside a 0700 directory, never in
git or public CI. Missing optional PageSpeed configuration records a visible
failure without dropping Search Console results. Refreshes replace the token
atomically. The existing consent has broader scopes than this collector uses;
reauthorize separately to narrow them. Testing-mode OAuth can require renewed
consent; a service account restricted to the property is a future alternative.

Check `systemctl status ayn-seo-collector.service`, `systemctl list-timers
ayn-seo-collector.timer`, and `journalctl -u ayn-seo-collector.service` for
operational status. A failed run exits nonzero; failures are visible in Admin
SEO when the database is reachable. Total service/database outages surface via
stale-data warnings, not a fabricated success. There is no email/SMS alert wired
to this service. To pause only collection: `systemctl disable --now
ayn-seo-collector.timer`. Article publishing cadence is independent and unchanged.

After collector code changes, copy the tracked scripts into `/opt/ayn-seo/`;
the existing app deployment script does not update this private directory.
Run Python unit tests with `python3 -m unittest discover -s tests -p
'test_seo_snapshot.py'`; they run in CI without real credentials.

## Weekly decision rule

- Fix critical HTTP, sitemap, canonical, or server-rendered content failures
  first. The public monitor fails its workflow on these.
- Review each `thin_article` warning manually. The 450-word number is AYN's own
  editorial floor, **not a Google ranking rule**. Improve thin reports with
  distinct, source-supported analysis; never pad them for length.
- Investigate pages with a sustained impression decline. A decline can reflect
  demand or indexing changes; it is a signal to inspect, not a command to
  overwrite an article.
- Review title/search intent for high-impression, low-CTR pages. Treat the
  thresholds in `gsc-performance.mjs` as triage heuristics, not causal proof.
- Track the downstream funnel separately: organic landing -> checker or job
  interaction -> signup -> paid plan. Existing consent-gated analytics is the
  source for site behavior; this worker intentionally holds no visitor data.

## Where seo-monster fits

[`seo-monster`](https://github.com/avansaber/seo-monster) is an optional local
MCP analyst for deeper Search Console, GA4, PageSpeed, and AI-citation
investigation. It is not the article scheduler or a 24-hour VPS worker.
Configure it with a separate read-only Google OAuth or property-scoped service
account, then use its query-gap, decaying-page, coverage-audit, and content
opportunity tools to inform editorial decisions. Keep the auth cache outside
the repo. Its optional paid AI citation services are not required for the
AYN-native monitor. Do not use Google's restricted Indexing API to push normal
articles; rely on sitemaps and ordinary crawling.

## Publication guardrails

The article generator's source is current AYN job-catalog statistics. Its
numeric validator and minimum length are safety checks, not independent
fact-checking. The admin Articles section is the place to archive or restore
specific reports and adjust cadence. Archived reports must not republish on
the next cron run; deploy the accompanying archive-safety migration before
deploying the updated generator. Neither the monitor nor Search Console
analytics changes the publication cadence automatically. Requiring a real
conversion result before increasing volume prevents scaled, low-value output.

# Visitor measurement map

## Scope

AYN's first-party visitor measurement exists to answer one operational question: which public routes receive consented traffic. It is not session replay, user profiling, job-application tracking, or a substitute for product analytics providers. The browser records nothing until the person accepts analytics cookies, and Global Privacy Control disables it.

The intentionally small event is:

- a random, local browser identifier;
- the route pathname, without query string or fragment; and
- an external referrer origin, without its path or query string.

It never includes a signed-in account id, email, IP address, resume, form value, job-description text, or application data.

## Live seam

```text
CookieConsent / existing consent -> VisitorTracker -> src/lib/analytics.ts
  -> POST /functions/v1/visitor-track
  -> record_visitor_pageview(...) -> visitor_analytics
  -> get_admin_visitor_analytics() -> System > Visitor analytics
```

`src/lib/analytics.ts` stores the random id under `ayn-visitor-id` only after consent. `VisitorTracker.tsx` covers SPA route changes. The consent dialog records the initial view once when a person accepts; returning visitors are recorded by the route tracker. `src/lib/analytics.test.ts` proves that no event is sent without consent and that query strings are rejected client-side.

## Server boundary

`visitor-track` is intentionally configured with `verify_jwt = false`: visitors are often signed out. It instead requires the site's anon API key, accepts only `POST`, applies the shared origin allowlist, and validates every field before using a service-role client to call the database RPC.

`record_visitor_pageview` is service-role-only. It hashes the proxy-provided source address with the service key solely for rate limiting, accepts at most 60 events per source per minute, and deletes inactive hashes after two days. The hash never enters `visitor_analytics`; raw IP addresses and browser fingerprints are never stored. Browser roles have no INSERT, UPDATE, or DELETE privilege on the event table.

`get_admin_visitor_analytics` checks `has_role(auth.uid(), 'admin')` and returns only 24-hour, 7-day, and 30-day totals, 14 daily aggregate rows, and the 20 most-viewed routes. The admin UI does not display individual visitor records.

## Coupled files

| Change | Update and verify |
|---|---|
| Event fields or consent behavior | `src/lib/analytics.ts`, `VisitorTracker.tsx`, `CookieConsent.tsx`, Cookies/Privacy legal content, `visitor-track`, SQL validation, and tests. Bump `COOKIE_CONSENT_VERSION` if collection changes materially. |
| Database collection/reporting | `20260919110000_retire_autofill_add_visitor_tracking.sql` and its PostgreSQL validation correction `20260919120000_fix_visitor_tracking_sql_validation.sql`, service-role/RLS grants, `useAdminVisitorAnalytics`, and `VisitorAnalyticsPane`. |
| Edge deployment | `supabase/config.toml`, the VPS functions volume, and `/root/auto_deploy.sh`'s explicit function list. A new directory is not deployed by that script until its copy line is added. |

## Retirement boundary

The following were retired together and must not be restored as hidden endpoints or tables: the Chrome extension and its zip, `/autofill`, `AutoApplyPanel`, the `resume-hub` auto-apply/answer-bank/diagnostic actions, `form-intel-bridge`, `form-intel-retrain`, application-fill consent and widget-pattern data, extension credentials, and legacy autofill telemetry. The standalone `job-checker` remains, but only to check whether a catalogue posting is still open; it does not read, fill, or submit application forms.

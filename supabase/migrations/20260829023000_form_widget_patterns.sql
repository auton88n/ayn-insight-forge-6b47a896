-- v3.290.0 -- the shared, cross-user "form intelligence" pattern library.
--
-- Both real form-reading paths this app has (the extension's own
-- content.js, running client-side in a real browser, and job-checker's
-- server-side Playwright extraction) have always hand-coded their own,
-- separate list of "here is how you recognize and operate this kind of
-- widget" heuristics -- and they had visibly drifted apart: content.js
-- had already grown real support for ARIA radiogroups, aria-pressed
-- toggle-button pairs, role=combobox dropdowns, and listbox-diff-based
-- typeahead fields (each added one real user report at a time), while
-- job-checker's _extract_fields (job-checker/server.py) still only ever
-- scanned plain <input>/<select>/<textarea> -- none of that.
--
-- This table is what stops "a user reports a screenshot, an engineer
-- hand-patches one of the two implementations, the other one silently
-- stays behind" from being the permanent shape of this feature. A widget
-- shape gets classified ONCE -- by the deterministic heuristics first
-- (free, instant, no network call), and only by AI when nothing
-- deterministic recognizes it -- and the classification is cached here,
-- keyed by a hash of the widget's own STRUCTURAL shape (tag, role, aria
-- attribute names, immediate-child tag counts, a short class hint),
-- never by the specific question text or any personal data. Because ATS
-- platforms (Greenhouse, Lever, Ashby, Workday, and the rest) each reuse
-- one fixed component library across every company's own job board built
-- on them, one real classification of "Ashby's own toggle-button widget"
-- covers every company's Ashby-hosted application from then on, for
-- every AYN user, not just the one whose page first triggered it.
--
-- Service-role only, matching every other cross-user, no-per-row-owner
-- table in this schema (assessment_rubrics, job_cache): RLS on, zero
-- policies for anon/authenticated, so a signed-in user can never read or
-- write this directly over PostgREST -- only resume-hub's own service
-- client does, after its own auth/rate-limit gates already ran.
create table if not exists public.form_widget_patterns (
  id uuid primary key default gen_random_uuid(),
  signature_hash text not null unique,
  -- One of a small, fixed vocabulary -- never a free-form string the AI
  -- invents on its own. See resume-hub/lib/formIntelligence.ts's own
  -- WIDGET_TYPES constant for the enforced list.
  widget_type text not null,
  -- A small, fixed-shape recipe (open/activate method, how options are
  -- found, how a fill is verified) -- interpreted by a fixed set of
  -- functions already used and read-back-verified elsewhere in this
  -- app (fillCombobox/fillRadio-equivalent logic), never executed as
  -- code. See docs/map/extension.md's "Form Intelligence" section.
  interaction_recipe jsonb not null default '{}'::jsonb,
  -- 'ai': classified by a model and never yet confirmed by a real,
  -- successful, read-back-verified fill. 'verified': at least one real
  -- fill using this recipe actually succeeded live. Never downgraded
  -- automatically -- a single failed attempt on a slow page isn't
  -- proof the recipe itself is wrong.
  confidence text not null default 'ai' check (confidence in ('ai', 'verified')),
  sample_count integer not null default 1,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.form_widget_patterns enable row level security;

comment on table public.form_widget_patterns is
  'Cross-user, cross-page cache of "what kind of widget is this, and how do you operate it" -- keyed by structural shape, never by question text or personal data. Service-role only.';

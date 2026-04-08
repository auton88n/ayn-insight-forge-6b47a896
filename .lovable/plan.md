

## Fix: Country Intelligence Cards Not Showing + Error on Open

### Root Cause

1. **Cards not visible**: The `ayn_country_intelligence` table has RLS enabled with only an `authenticated` policy. If the user is browsing without being logged in, the Supabase query returns empty data, so the section is hidden (`countryIntel.length > 0` evaluates to false).

2. **Error on click**: The `handleMapClick` function has an incomplete ISO2 mapping (e.g., `DE` maps to `'EU'`, `FR` maps to `'EU'`), which means clicking Germany or France on the map tries to match the wrong ID. Additionally, the `CountryIntel` interface is missing the `opportunities` field that's being selected in the query — this extra data is harmless but the interface should be complete.

### Plan

**Step 1 — Add anon read policy for country intelligence**
- Create a migration adding a `SELECT` policy for `anon` on `ayn_country_intelligence`, so the data loads for all visitors (this is public economic data, not sensitive).

**Step 2 — Fix silent fetch failures**
- Add a console.warn in the `fetchCountryIntel` catch block so errors aren't silently swallowed.
- Add a fallback: if data is empty after fetch, show a "No country data available" placeholder instead of hiding the entire section.

**Step 3 — Fix ISO2 country code mapping**
- Correct the mapping: `DE` should map to `'DEU'` (not `'EU'`), `FR` to `'FRA'` (not `'EU'`).
- Add missing country codes that exist in the database (SA, QA, SG, CA, etc.).

**Step 4 — Add `opportunities` to the interface**
- Add `opportunities?: { snippet?: string; title?: string }[]` to the `CountryIntel` interface for type safety.

### Files to change
- **New migration**: Add anon read policy for `ayn_country_intelligence`
- **`src/pages/WorldIntelligence.tsx`**: Fix ISO2 mapping, add error logging, update interface, show fallback when empty


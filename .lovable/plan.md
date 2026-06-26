## Goal
Make the Chrome extension actually work end-to-end (not just on real job sites), give clearer feedback when something is off, and stop blocking features on a "100% complete" profile.

## What's broken / missing today

1. **Misleading error on non-job pages.** When you click "Fill This Form Now" on a page that isn't an application (like the AYN dashboard), it returns `no_values` and shows "Could not fill any fields. Make sure your profile is completed…" — blames your profile when the real reason is "no real form here."
2. **Stale zip.** The downloadable `public/ayn-extension.zip` is v1.2.0 with old wording. Repo code is newer (v1.2.1) and recent edits never got repacked.
3. **Score / Contacts / Cover Letter / Tailor** all silently fail on pages without a job description, with no friendly empty state.
4. **Profile-completion gate.** A few flows behave like the profile must be ~100% complete. Should work with whatever fields are filled.
5. **Tracker** has no "Save this application" entry point from the Fill view after a successful fill.
6. **Cover Letter** tab in the extension calls `ext_cover_letter` which requires a `job_id` in DB — the side panel only has scraped page text, so it errors. Needs a text-only path.

## Fix plan

### A. Extension UX — clear, page-aware states
- Add a page-type detector in `content.js`: returns `{ kind: 'application' | 'job_listing' | 'job_board' | 'other', hasForm, hasJD, fieldCount }`.
- In `sidepanel.js`, when user opens any tab, show the right empty state:
  - Fill: "No application form detected on this page. Open a job's apply form (LinkedIn Easy Apply, Workday, Greenhouse, Lever, etc.) and try again." + a small "Scan again" button.
  - Score / Contacts / Cover Letter / Tailor: "Open a job posting first" with a one-line example.
- After a successful Fill, show a "Save to Tracker" button that calls `ext_save_application` with the detected title/company/url.

### B. Edge function — better error taxonomy + partial profile
In `supabase/functions/resume-hub/index.ts` `ext_autofill`:
- If `fields.length === 0` → return `{ error: 'no_form_fields' }` (already handled client-side, just make it explicit server-side too for direct calls).
- Tell the AI: "It is fine if the profile is partial. Fill whatever you can from available data. Leave others empty. Never refuse just because some fields are missing." Currently the prompt is strict and the model returns empty for everything when it senses gaps.
- Return `meta: { profileFieldsUsed: [...], jobDetected: bool }` so the panel can show "Filled 7/12 — added phone, email, name; skipped salary (not set)."

Add a new action `ext_cover_letter_text` (text-only, no job_id needed) — wraps current logic but takes `jdText` + `company` + `title` directly so the side panel works without first ingesting the job.

### C. Repack + version bump
- Bump `manifest.json` to **v1.2.2**.
- Rebuild `public/ayn-extension.zip` from `extension/` after all changes.
- Update the version label in `ExtensionTab.tsx` to v1.2.2.

### D. Profile-completion messaging in app
- In `CanadianProfileForm`, change the "ready" copy from a hard 94% gate to: "Profile saved. AYN will use whatever fields are filled to autofill applications. The more you add, the more fields it can fill."
- Remove any UI that blocks Save / extension features when completion < 100%.

### E. Console error noise (out of scope of this request but flagged)
`SubscriptionContext` shows "Failed to fetch" against the check-subscription edge function inside the Lovable preview iframe. Not related to the extension. Will leave untouched unless you want it addressed.

## Files touched

```text
extension/content.js              # page-type detector + iframe scan stays
extension/sidepanel.js            # empty states, save-to-tracker button, cover letter text path
extension/sidepanel.html          # small UI for new states
extension/manifest.json           # version bump
public/ayn-extension.zip          # repacked
supabase/functions/resume-hub/index.ts  # softer prompt, partial-profile, ext_cover_letter_text
src/components/resume-hub/CanadianProfileForm.tsx  # gentler completion copy
src/components/resume-hub/ExtensionTab.tsx         # v1.2.2 label
```

No database migration required.

## Acceptance check
- On AYN dashboard: extension shows "Open a job application form" message, no scary error.
- On a real LinkedIn Easy Apply with profile at ~60% complete: Fill returns N filled / total + list of what it filled and what it skipped, no "complete your profile" message.
- Score, Contacts, Cover Letter, Tailor each show a friendly empty state on non-job pages.
- After Fill, "Save to Tracker" appears and adds the row.
- Downloaded zip says v1.2.2 in the manifest.

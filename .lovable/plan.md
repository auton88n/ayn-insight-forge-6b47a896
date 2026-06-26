## Goal
Replace the paste-a-token login in the Chrome extension with a one-click "Sign in with AYN" flow, and fix every broken feature (autofill, score, contacts, cover letter, tracker, tailor) so the extension actually works end-to-end.

## Part 1 — One-click "Sign in with AYN"

### Flow the user sees
```text
[ Extension side panel ]                [ aynn.io in a new tab ]
  "Sign in with AYN"  ─── click ───▶   /extension/approve?code=ABC123
                                        - Must be logged in to AYN
                                        - Shows: "AYN Resume Tailor wants
                                          to connect this browser"
                                        - [ Approve ]   [ Cancel ]
                                              │
                                              ▼
                                        Mints a device token bound to ABC123
                                              │
   Extension polls ◀────────────────────────  │
   gets the token, saves it, signs in.
```

### How it works under the hood
1. Extension generates a random `code` (e.g. `ayn_link_xxx`) and opens `https://aynn.io/extension/approve?code=...&name=Chrome%20-%20MacBook` in a new tab.
2. New page `/extension/approve` shows the consent screen. If the user is not signed into AYN, it routes them through normal login first, then returns.
3. User clicks Approve → frontend calls `resume-hub` action `link_approve` with the `code` and a device label. Backend mints a device token tied to that `code` and stores the user_id + token in a short-lived `extension_link_codes` table.
4. The extension polls `resume-hub` action `link_poll` with the same `code` every 2 seconds (max 5 minutes). When it sees `approved`, it saves the token in `chrome.storage.local` and switches to the signed-in view.
5. Codes expire after 5 minutes. Once consumed, they are deleted.

### Why this is secure
- The token never travels through the URL or the clipboard.
- Approval requires being signed into AYN in the browser (same SSO/Google flow you already use).
- Each browser gets its own revokable token, scoped only to `ext_*` actions.
- Codes are single-use, short-lived, and bound to one user_id.

## Part 2 — Fix every extension feature

### Backend (`supabase/functions/resume-hub/index.ts`)
- Add `link_start`, `link_approve`, `link_poll` actions for the new flow.
- Add `ext_save_application`, `ext_get_applications`, `ext_update_application` to the extension-token whitelist so the Tracker tab works.
- Make `ext_cover_letter` accept pasted resume + job text (not just a stored `job_id`) so it works from the Cover Letter tab.
- Tighten `ext_autofill` to return per-field reasons (matched / no data / sensitive / skipped) so the UI can show exactly what happened.

### Database
- New table `extension_link_codes` (code, user_id nullable, token nullable, status, expires_at, device_label).
- Per-user RLS so users only see their own pending codes.
- GRANTs as required.

### Frontend page (new)
- `/extension/approve` route on aynn.io:
  - Reads `?code=...&name=...` from URL.
  - Requires login; if not logged in, redirects through normal auth and back.
  - Shows clean "Allow AYN Resume Tailor to connect this browser?" card with Approve / Cancel.
  - On Approve calls `link_approve`, on success shows "You can close this tab" message.

### Extension
- Replace the email/password login screen with a single big "Sign in with AYN" button + small "Paste token instead" link as fallback.
- New `background.js` flow: generate code, open approve URL, poll, save token, notify side panel.
- Switch every backend call to use `x-ayn-ext-token` + anon key (no Supabase JWT, no refresh tokens).
- Standardize action names: `ext_autofill`, `ext_job_score`, `ext_suggest_roles`, `ext_find_contacts`, `ext_cover_letter`, `ext_save_application`, `ext_get_applications`, `ext_update_application`.

### Content script (form detection + injection)
- Stronger field scanner for CSOD, Workday, Greenhouse, Lever, Ashby, SmartRecruiters, LinkedIn Easy Apply, and generic forms.
- Late-load retry (re-scan after 1s and 3s for SPA forms).
- Scan inside same-origin iframes when accessible.
- Injection uses React-native setters, dispatches `input` / `change` / `blur` / keyboard events, and supports selects, radios, checkboxes, contenteditable, and common combobox controls.
- Returns detailed per-field results.

### Side panel UI
- Replace misleading "no fillable fields" message with specific states: page blocked, refresh needed, iframe inaccessible, no profile data, no AI values, partial fill.
- Show a small "X of Y fields filled" summary plus a per-field list with reasons.
- Clean up unused login form code.

### Resume Hub → Extension tab
- Remove the device-token UI noise (keep it as an advanced fallback).
- Make the primary CTA the download button.
- Keep the "Connected devices" list so users can revoke any browser.

### Repackage
- Rebuild `public/ayn-extension.zip` so the download button serves the fixed version.

## Files I will touch
- `extension/manifest.json`
- `extension/background.js`
- `extension/content.js`
- `extension/sidepanel.html`
- `extension/sidepanel.js`
- `extension/README.md`
- `supabase/functions/resume-hub/index.ts`
- New migration for `extension_link_codes`
- `src/pages/ExtensionApprove.tsx` (new)
- `src/App.tsx` (add `/extension/approve` route)
- `src/components/resume-hub/ExtensionTab.tsx` (simplify)
- `public/ayn-extension.zip` (rebuild)

## Out of scope (won't touch)
- Landing page, dashboard chat, admin panel, billing, world intelligence, any other feature outside the extension.
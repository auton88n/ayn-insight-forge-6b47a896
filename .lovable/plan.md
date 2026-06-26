## Change

Remove account switching from the extension entirely. One browser = one AYN account. Strengthen sign-out so no data from a previous session can leak.

## Edits

### 1. `extension/sidepanel.html`
- Remove the `#switch-acct-btn` button I just added. Keep only the email label and **Sign out**.

### 2. `extension/sidepanel.js`
- Remove the `#switch-acct-btn` event listener and its toggle in `show()`.
- Keep the stale-token auto-clear behavior from v1.2.4 (when `BOOTSTRAP` returns 401/error, wipe the token and show the sign-in screen).
- Harden **Sign out** to wipe every cached key, not just `ayn_token` + `savedResume`: also clear `lastJobText`, `lastJobTitle`, `lastJobUrl`, `lastJobCompany`, `detectedAt`, and any tracker cache. Do this by calling `chrome.storage.local.clear()` on sign-out so nothing from user A is visible to user B on the same browser profile.
- Update `background.js` `SIGN_OUT` handler to use `chrome.storage.local.clear()` instead of the targeted remove.

### 3. `src/pages/ExtensionApprove.tsx`
- Keep the "This browser will be linked to: `<email>`" panel so the user can confirm the account before approving.
- Remove the "Not you? Sign in as a different account" link. Privacy posture: if it's the wrong account, the user cancels and signs in fresh on their own.

### 4. Edge function — unchanged
- `ext_bootstrap` still returns the real `auth.users.email` so the side panel shows the correct account.

### 5. Repack
- Bump `extension/manifest.json` and `ExtensionTab.tsx` to **v1.2.5**.
- Rebuild `public/ayn-extension.zip`.

## Out of scope
- No DB or RLS changes — extension data is already per-`user_id` and tokens are per-account; the privacy boundary is already enforced server-side.
- No UI changes elsewhere in Resume Hub.

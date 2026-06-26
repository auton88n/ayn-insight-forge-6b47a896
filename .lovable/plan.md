## Problem

1. **Wrong account shown (ghazi vs crossmint7)** — The extension stores a single `ayn_token`. When you re-approve from a *different* AYN account, a new token is minted on the server, but the extension never receives it because polling only runs during an active "Sign in with AYN" flow inside the side panel. The old ghazi token stays in `chrome.storage.local` and `ext_bootstrap` keeps returning ghazi's profile.
2. **Email source is misleading** — `ext_bootstrap` returns `profile.email` from `user_profile_data`, not the real `auth.users.email`. If a user changed their profile email or it was never set, the display can drift from the actual logged-in account.
3. **"Other functions not working"** — Score / Contacts / Cover / Tailor / Tracker all gate on an active job page. Your current tab is `aynn.io/extension/approve`, which is detected as `kind: "ayn"`, so they correctly show the empty state. They are not broken, but the empty-state copy and the lack of a one-click "Switch account" hides the real issue.

## Fix

### 1. Extension auth — force token to match the approving account
- **`extension/sidepanel.js`**: replace silent `restoreSession()` with a check that calls `ext_bootstrap` and surfaces the real email. Add a visible **"Switch account"** button next to the current email that:
  1. Calls `SIGN_OUT` (clears `ayn_token` + `savedResume`).
  2. Immediately triggers `startSignIn()` so a fresh approval is required.
- **Auto-recovery**: on every BOOTSTRAP failure (401 / invalid token), clear local token and show the sign-in screen — currently it only clears on 401s inside `callFunction`, not on stale-token startup.
- **Display**: show the email from `auth.users` (see §2) and the device label underneath it, so you can confirm which account this browser is linked to.

### 2. Edge function — return real auth email
- **`supabase/functions/resume-hub/index.ts` → `ext_bootstrap`**: also fetch `auth.admin.getUserById(userId)` and return `{ user: { id, email, device } }`. The side panel uses this email as the source of truth, not the profile row.

### 3. Approve page — show which AYN account is about to be linked + "use a different account"
- **`src/pages/ExtensionApprove.tsx`**: above the Approve button, show the currently signed-in AYN email in bold with a small **"Not you? Sign in as a different account"** link that signs out and reloads the approve flow with the same `code`. This prevents the exact mistake of approving as the wrong user.

### 4. Verify the other tabs actually work on a real job page
After the auth fix, I'll drive Playwright to:
- Open a public Greenhouse / Lever job posting in a tab.
- Confirm `DETECT_PAGE` returns `kind: "application"` and `hasForm: true`.
- Trigger Fill, Cover Letter, and Tailor flows end-to-end against the live edge function with a valid token.

If a tab fails, I'll fix the specific code path — but the architecture (background.js → resume-hub) is already wired, so this is verification, not a rewrite.

### 5. Repack
- Bump `extension/manifest.json` and `ExtensionTab.tsx` to **v1.2.4**.
- Repack `public/ayn-extension.zip`.

## Out of scope
- No UI redesign of the side panel beyond the "Switch account" button and email line.
- No changes to Resume Hub dashboard tabs.
- No new tables; the `extension_tokens` and `extension_link_codes` schemas are unchanged.

## What you'll do after
Reinstall v1.2.4, click **"Switch account"** in the side panel header, and approve as **crossmint7**. The header should then show `crossmint7@…` and all tabs will work on real job pages.

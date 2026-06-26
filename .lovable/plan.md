## What's broken

Looking at your screenshot:
- Active tab is the CSOD application form (Project Manager, with First/Last/Email fields).
- The green banner still says **"ayn-insight-forge | Lovable — Job detected"** and the red error says **"no fillable form fields"**.

Root cause: the side panel only detects the job/scans the form **once when you switch tabs inside the panel**. It never re-runs when you change Chrome tabs. So all detection (and the autofill click) is firing against the *previous* tab (the AYN preview tab, whose title is "ayn-insight-forge | Lovable"), not the CSOD form you're looking at.

That single bug explains both symptoms — the "Lovable" word and the "no fillable fields" error.

## Fix

**1. `extension/sidepanel.js` — listen for tab changes**
- Add `chrome.tabs.onActivated` and `chrome.tabs.onUpdated` listeners. Whenever the active tab in the current window changes or finishes loading, re-run the detector for whichever tab the user is on (`detectForFill`, `detectForContacts`, `detectForCover`, `detectForTailor`).
- Clear the green job banner, contact card, and cover banner first so stale data from the previous tab never lingers.
- Strip any trailing ` | Lovable`, ` – Lovable`, ` — Lovable`, or ` - Lovable` from any title shown in the panel (defensive — handles dev preview titles).

**2. `extension/content.js` — scan iframes too**
- CSOD, Workday and some ATS embed the form in a same-origin iframe. Extend `scanFormFields()` and `injectValues()` to also walk `document.querySelectorAll('iframe')`, and for each accessible `iframe.contentDocument` repeat the scan/inject. Skip iframes that throw on access (cross-origin) silently.
- Bump version to 1.2.1 in `manifest.json` so you know the new build loaded.

**3. Repack the zip** served by Resume Hub → Extension so the Download button gives the fixed build.

## Out of scope

- No backend, no UI redesign, no auth changes.
- Resume Hub web pages untouched.

## Technical notes

- Tab listeners must be added inside the side panel; the background service worker can't push DOM updates.
- `iframe.contentDocument` access throws for cross-origin frames — wrap in try/catch and silently continue.
- The `_idx` field for iframe fields needs to be namespaced (e.g. `frame1:7`) so injection finds the right element back inside the iframe.

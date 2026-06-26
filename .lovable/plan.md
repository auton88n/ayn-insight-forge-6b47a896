## What is actually wrong

Most errors you pasted are from Indeed itself, not AYN:
- `homepageRemoteEntry... Unsatisfied version...`, Apollo invariant errors, 403 logging, 404 svg, `share-modal.js` are Indeed page scripts.
- AYN should not try to fix those. The extension must avoid making them worse and keep working even when the page has its own errors.

The real AYN error is this:
- `chrome-extension://.../content.js:91:60 Cannot read properties of undefined (reading 'length')`

That crash happens inside `extractJobText()` when the generic fallback reads `el.innerText.length` on elements that do not expose `innerText`. Once that throws, the side panel loses job detection, Score, Contacts, Cover Letter, Resume tailoring, and Fill context.

There is also a delivery problem:
- You may still be downloading or loading an older unpacked folder, so the dashboard needs a clearer version and fresh package path.

## Plan

1. **Harden AYN content script so it cannot crash on Indeed or broken pages**
   - Replace unsafe `el.innerText.length` with a safe text helper.
   - Wrap `extractJobText()`, `DETECT_PAGE`, and `SCAN_FORM` in defensive fallbacks so one bad DOM node never breaks the extension.
   - Add safer handling for hidden or non HTMLElement nodes.

2. **Prevent duplicate content script listeners**
   - Add an install guard at the top of `content.js` so if Chrome injects the script twice, it does not register duplicate submit listeners, message listeners, mutation observers, or scoring handlers.
   - Clean up old AYN listeners before reinitializing where possible.
   - This targets the repeated listener symptom without touching Indeed’s own `contentscript.js` warnings.

3. **Make scoring safer and less spammy on job cards**
   - Throttle/debounce the card MutationObserver.
   - Track cards already being scored to avoid repeated requests while scrolling.
   - Limit simultaneous card scoring so Indeed pages do not become noisy or slow.

4. **Fix field injection reliability**
   - Make radio and checkbox matching frame aware.
   - Improve fallback lookup for inputs whose id/name changes.
   - Report exact skipped fields instead of silently failing.

5. **Make the extension package impossible to confuse with the old one**
   - Bump the extension to `v1.4.2`.
   - Add a visible “build version” line in the side panel and dashboard download card.
   - Rebuild `/public/ayn-extension.zip` from the current `extension/` folder.
   - Optionally remove or stop referencing old package names like `ayn-autofill.zip` if they are not used.

6. **Add a simple local diagnostic panel**
   - Show “Content script connected”, “Job detected”, “Fields found”, and “Last error” in the side panel.
   - This lets you see immediately whether Chrome loaded the newest extension and whether the page is scannable.

## What I will not change

- I will not try to fix Indeed’s internal React, Apollo, Mosaic, 403, or SVG errors because they are not from AYN.
- I will not change your account privacy model.
- I will not redesign the whole extension UI again. This is a reliability fix first.

## Validation

After implementation I will:
- Check `content.js` parse safety.
- Rebuild the zip.
- Confirm the dashboard points to the rebuilt `v1.4.2` zip.
- Provide exact install steps so Chrome does not keep using the old unpacked extension folder.
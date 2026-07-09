## Goal
Stop the answers from disappearing during Ashby autofill and make the next build conclusively debuggable.

## What the current logs show
- The newest snapshot log strings are now visibly running in `content.bundle.js`, so this is no longer only a stale-extension problem.
- The repeated `contentscript.js:14083 MaxListenersExceededWarning` and `ObjectMultiplex` lines are almost certainly from another injected extension, not AYN, because AYN ships `content.js` / `content.bundle.js`, not `contentscript.js`.
- The immediate AYN problem is that snapshot saving keeps saying `snapshot save skipped — no answered questions yet`, even after `rich=21` / `rich=22` scans. That means `buildSnapshot()` is reading engine questions, but none of those questions have `q.answer`, so the reload snapshot has nothing useful to persist.
- There is also an older `html2canvas` path still running from `content.js` vision fallback, despite the SnapDOM bridge existing in `content.entry.js`. This is separate noise but worth cleaning if it is still part of the extension runtime.

## Plan
1. **Fix snapshot source of truth**
   - Keep the existing engine snapshot behavior.
   - Add a second snapshot path that captures the actual values being injected by `content.js`, because that is the place where answers definitely exist.
   - Store those injected values into the same reload snapshot key before/during fill, so a real full-page reload can recover even if the engine `Question[]` objects never received `q.answer`.

2. **Restore saved injected values after reload**
   - On startup, continue setting `window.__AYN_RESTORED_ANSWERS__` from the bridge.
   - In `content.js`, read `window.__AYN_RESTORED_ANSWERS__` and merge/replay restored values through the existing injection path only when fresh and relevant.
   - Add concise logs that say how many restored values were found and how many were replayed.

3. **Prevent empty scans from triggering a false no-fallback path**
   - Keep the existing v2.5.4 empty-scan guard in `content.entry.js`.
   - Adjust `scanFormFieldsHybrid()` only if needed so it does not treat a transient `rich=0` as authoritative while a restored snapshot exists.

4. **Remove stale html2canvas runtime path if safe**
   - Inspect the current vision fallback implementation and replace its direct `html2canvas` import with the SnapDOM-backed bridge if possible.
   - If changing that risks scope creep, leave it untouched and focus only on disappearing answers.

5. **Build and verify packaged output**
   - Run `node extension/build.mjs`.
   - Confirm `public/ayn-extension.zip` contains the updated `content.js` and `content.bundle.js`.
   - Confirm the shipped files include the snapshot save/restore logs, the new injected-value snapshot path, the empty-scan guard string, `aynSetChecked`, and the version remains `2.5.5`.

## Validation notes
For the next retest, use AYN as the only enabled extension. The `contentscript.js` ObjectMultiplex warnings should disappear or be ignored unless they still appear with every other extension disabled.
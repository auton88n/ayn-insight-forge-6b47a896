
## What's actually wrong

Two distinct bugs, both caused by the post-fill pipeline treating each stage as independent:

### Bug 1 — correct answer gets deleted after rerender

The pipeline runs in this order inside `INJECT_VALUES` (content.js ~3596):

```
injectValues → settleReapply → postInjectVerify → retryUnverified → closedLoopReplan → visionFallback → stabilizeAfterRender
```

Each stage rescans the DOM and rewrites fields. Two failure modes:

1. **False "unverified"** — after React rerenders, `aynPostInjectVerify` re-resolves a field via `aynResolveFieldEl(id)`, but the DOM node was replaced. Verify can't find it (or finds a fresh empty twin), marks it unverified, and pushes its id into `unverifiedIds`. `aynClosedLoopReplan` then asks the AI for a *new* answer and re-injects — overwriting the value that was actually correct on screen.
2. **No "current == want" short-circuit** — `retryUnverified`, `closedLoopReplan`, and `stabilizeAfterRender` all reapply without first checking the live DOM value. If a stale `__AYN_BG_MAP__` entry points at a dead node, they click the wrong button; if AI returns a slightly different label, they overwrite the correct one.

### Bug 2 — still-missing fields

- `__AYN_BG_MAP__` / `__AYN_TEXT_FIELD_MAP__` are populated once at scan time. After a rerender, the stored node refs are dead, so buttongroups log `buttongroup meta missing` and get skipped forever.
- `aynFuseVisionIntoFields` runs only during the initial scan (line 3566), never after a rerender reveals conditional fields (e.g. "Requires sponsorship?" only appears after picking a country).
- Resume/file fields sometimes drop out because `probeFormOnce` counts them but the scan pipeline doesn't re-emit them as fillable when the dropzone rerenders.

## Fix

### 1. Live re-anchor before every write (content.js)

Replace the stale-map lookup in `aynResolveFieldEl`, `findButtongroupOption`, and `retryUnverified` with a live-DOM re-anchor:

- Rebuild `__AYN_BG_MAP__` / `__AYN_TEXT_FIELD_MAP__` from the current DOM at the start of each stabilization pass, keyed by question fingerprint (normalized label + option-signature hash), not by node ref.
- If the fingerprint can't be re-anchored, mark the field `stale_dom` and skip — don't guess.

### 2. Current-value guard on every reapply path

At the top of `aynRetryUnverified`, `aynClosedLoopReplan`, and each `aynStabilizeAfterRender` pass:

```js
if (aynLiveMatchesWanted(id, want)) { res.ok = true; res.verified = true; continue; }
```

`aynLiveMatchesWanted` re-reads the live DOM (text input value OR selected buttongroup label OR checked radio) and compares against `want` with the same normalization used elsewhere. This kills the "AI overwrites correct answer" path completely.

### 3. Filter unverifiedIds against live DOM before replan

In `aynClosedLoopReplan`, drop any id whose live DOM value already matches its intended `want` before calling the AI. The AI only sees genuinely broken fields.

### 4. Post-fill rescan for newly revealed fields

After `aynStabilizeAfterRender` finishes, run one bounded rescan pass:

- Re-run the Question Engine detector.
- Diff against `window.__AYN_QUESTIONS__` — any new question ids are "revealed by rerender."
- If any exist, request answers from the decision loop and inject just those (single pass, no recursion).

### 5. Rebuild BG map on every rescan

`aynRegisterEngineGroups` already exists but is only called once. Call it at the top of every stabilization pass AND after the post-fill rescan so buttongroup metadata never goes stale.

### 6. Resume field persistence

In the scan response (line 3577), keep `_fileFields` even when the dropzone rerendered mid-scan by merging with the previous scan's file fields (dedup by label). Add explicit `kind: 'resume-upload'` flag so the sidepanel shows a clear "manual upload required" state instead of dropping the field.

### 7. Rebuild bundles

Update `extension/content.bundle.js`, `extension/question-engine.bundle.js`, refresh `public/ayn-extension.zip`, bump version to `2.4.2`.

## Files touched

- `extension/content.js` — new `aynLiveMatchesWanted`, `aynRebuildFieldMaps`, `aynRescanForNewFields`; guards added to retry/replan/stabilize; scan merges file fields.
- `extension/question-engine/field-detector.ts` — expose fingerprint (label + option-signature) used by re-anchor.
- `extension/question-engine/adapters/ashby.ts` — surface stable question fingerprints on buttongroups.
- `extension/manifest.json` + `extension/constants.js` — version bump.
- `extension/content.bundle.js`, `extension/question-engine.bundle.js`, `public/ayn-extension.zip` — rebuild.

## Explicitly NOT changing

- Memory reuse rules (`filler.js canReuseMemory`) — already tightened in v2.4.1.
- Edge functions — this bug is entirely in-browser pipeline ordering.
- Vision provider — same reason.

# Phase 8 — Ship the new AYN Resume Tailor

Goal: produce an installable Chrome build (`public/ayn-extension.zip`) whose content script is powered by the new `extension/question-engine/` (TypeScript) instead of the legacy scanner, without breaking the existing filler.

## 1. Bundler for the engine

- Add `extension/build.mjs` using **esbuild** (already in the dep tree via Vite).
  - Entry: `extension/question-engine/index.ts`
  - Output: `extension/question-engine.bundle.js` (IIFE, global `AYNQuestionEngine`, target `chrome110`, no external deps, sourcemap off for prod).
  - Second entry: `extension/content.entry.js` → `extension/content.bundle.js` (bridges engine → legacy filler).
- Add npm script `build:extension` that runs the esbuild script, then zips `extension/` into `public/ayn-extension.zip` via `nix run nixpkgs#zip`.
- `.gitignore` the two `*.bundle.js` outputs? No — they must ship in the zip. Keep them tracked or generate at package time. Choice: generate at package time, include a prebuild step before zipping.

## 2. Content-script integration

- New file `extension/content.entry.js` (bundled → `content.bundle.js`):
  1. Import `scanForm`, `observeForm`, `projectToLegacy` from the engine.
  2. On `document_idle`, run `scanForm(document)` → `Question[]`.
  3. Map each Question through `projectToLegacy` to the shape the existing `filler.js` expects (`{fid, selector, kind, semanticType, label, options, required}`).
  4. Expose `window.__AYN_QUESTIONS__` and dispatch `ayn:questions-ready` for `content.js` / sidepanel to consume.
  5. Start `observeForm` with a 200ms debounce; re-emit deltas.
- Update `manifest.json` `content_scripts[0].js` to:
  `["constants.js", "question-engine.bundle.js", "content.bundle.js", "filler.js", "dom.js", "content.js"]`
  (engine + bridge load before the legacy filler; legacy filler is patched to prefer `window.__AYN_QUESTIONS__` when present, else fall back to its own scan).

## 3. Legacy filler bridge (minimal, non-invasive)

- Add a small shim block at the top of `filler.js` (or a new `filler-bridge.js` loaded before it) that:
  - Reads `window.__AYN_QUESTIONS__`.
  - Overrides the legacy scanner entry point to return the projected list when available.
  - Preserves existing native/React `_valueTracker` injection path unchanged — we only replace *what* to fill, not *how*.
- No changes to EEO/consent deterministic rules, skip-logging, or main-world bridge.

## 4. Manifest + versioning

- Bump `manifest.json` `version` to `2.3.0` (new understanding layer = minor).
- Update `description` unchanged.
- Keep `key`, permissions, DNR rules, externally_connectable as-is.

## 5. Corpus gate (soft, non-blocking for this ship)

- Leave `__corpus__/fixtures/` empty for now; `benchmark.ts` stays runnable locally but is **not** wired into CI in this phase.
- Add `TODO(phase-9)` note in `__corpus__/README.md` so it's tracked but doesn't block the release.

## 6. README + install docs

- Update `extension/README.md`: bump version, add one line "Now powered by the AYN Universal Question Engine."
- No changes to `src/components/resume-hub/ExtensionTab.tsx` copy unless the version string is displayed there (verify during build).

## 7. Verification checklist before declaring done

1. `tsgo` clean on `extension/question-engine/**`.
2. `node extension/build.mjs` emits both bundles, no warnings.
3. `public/ayn-extension.zip` regenerated; unzip and confirm bundles + manifest v2.3.0 present.
4. Load unpacked in Chrome, open a Greenhouse or Lever test posting, confirm:
   - Console shows `ayn:questions-ready` with a non-empty list.
   - Autofill still runs via existing filler path.
   - No CSP/host-permission regressions.
5. Web app download link (`fetch('/ayn-extension.zip')`) serves the new zip.

## Out of scope (deferred)

- Populating real captured fixtures for the 6 ATSes.
- Turning on the benchmark gate in CI.
- Wiring the vision provider (`setVisionProvider`) to a real backend — stays no-op.
- Any UI changes in the web dashboard beyond the zip swap.

## Technical notes

- Engine is DOM-pure and stamps `fid` attributes; running it before the legacy filler means the filler sees the same stamped nodes it already expects.
- `projectToLegacy` already exists in `extension/question-engine/legacy.ts` — this phase only *consumes* it, does not modify it.
- esbuild IIFE output keeps us MV3-compliant (no dynamic import, no eval).

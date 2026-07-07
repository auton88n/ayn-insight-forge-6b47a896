## Force the engine path — no legacy fallback

You want to see the new system, not the safety net. Rip the fallback out so if the engine misses, we see it miss instead of legacy quietly taking over.

## Edits (all in `extension/content.js`, then rebuild)

### 1. `scanFormFieldsHybrid()` (~line 1134) — engine-only

Replace the body so it never calls `scanFormFields()`:

- Log `[AYN-HYBRID] rich=<n> legacy=<n>` every call.
- Read `window.__AYN_QUESTIONS__` (rich). If present and non-empty:
  - Call `aynRegisterEngineGroups(rich)`.
  - Return a legacy-shaped array built from `rich` directly (mirror `projectToLegacy`'s kind/type mapping inline: `single_choice`→`structradio`/`radio`, `multi_choice`→`checkbox`/`checkbox`, `boolean`→`buttongroup`/`buttongroup`, `text`→`text`/`text`, `file`→`file`/`file`, `date`→`text`/`text`). Keep `id` as the engine id. Set `_engine: true`, `labelSource: 'engine'`.
- If `rich` is empty or missing: return `[]` and log `[AYN-HYBRID] engine returned nothing — no fallback`. No `scanFormFields()` call.
- If the try block throws: log `[AYN-HYBRID] engine path threw:` with the error and return `[]`. Still no fallback.

### 2. `aynRegisterEngineGroups()` (~line 1107) — key by engine id

- Register into `__AYN_STRUCTRADIO_MAP__` when `q.kind === 'single_choice'`, key = `q.id`.
- Register into `__AYN_MULTICHECK_MAP__` when `q.kind === 'multi_choice'`, key = `q.id`.
- Remove the `indexOf('__structradio__:')` / `'__checkbox__:multi:'` string tests — those are legacy id shapes engine questions never carry.

### 3. Rebuild

`node extension/build.mjs` → regenerates `extension/question-engine.bundle.js`, `extension/content.bundle.js`, and `public/ayn-extension.zip`. Flag stays `true`, manifest stays `2.3.1`.

## What you should see after reload

- `[AYN-HYBRID] rich=N legacy=N` in console before every fill.
- `[AYN-BG] question-match resolved for ...` lines show engine ids (no more `__textfield__:gfN` / `__structradio__:gfN`).
- Whatever the engine misses, misses visibly — no legacy scanner covering it up. That's the diagnostic signal you're asking for.

## Not changing

- Engine/adapter logic.
- Manifest version.
- Flag (stays `true`).
- The `scanFormFields()` function itself stays in the file (still referenced by other helpers); it's just not called from the hybrid anymore.

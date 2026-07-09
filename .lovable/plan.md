## What the logs actually show

From your AYN-only lines on the Ashby application page:

```
[AYN-HYBRID] rich=21 legacy=21          <- first scan, real questions
[AYN-HYBRID] rich=0  legacy=0           <- second scan, empty
[AYN-HYBRID] engine returned nothing — no fallback
[AYN-HYBRID] rich=0  legacy=0           <- third scan, empty
[AYN-HYBRID] engine returned nothing — no fallback
snapshot saved: 16 answers, key= ayn_reload_snapshot:https://jobs.ashbyhq.com/.../application
snapshot lookup for key= ayn_reload_snapshot:https://www.recaptcha.net/recaptcha/api2/anchor?... found= false
```

Two concrete bugs, nothing more:

### Bug A — pipeline runs 3x per page (the "AI answers three times")
There is no guard preventing the hybrid scan → answer → inject cycle from re-running on every DOM mutation. First run finds 21 fields and fills them. The DOM changes as a result. Two follow-up runs fire, both find 0 fields, and each one still hits the "no fallback" path (which in prior builds was itself capable of triggering an AI call). This is what's burning credits and causing the "answered three times" symptom.

### Bug B — reload snapshot key includes the full URL
`saveReloadSnapshot` keys the snapshot by `location.href`. On the Ashby page that's `.../application`. On reload, restore runs in every frame — including the reCAPTCHA iframe, whose `location.href` is `https://www.recaptcha.net/recaptcha/api2/anchor?...`. That lookup always misses. Worse, if the top frame's URL gained/lost a query param or hash between save and restore, the top-frame lookup misses too. Result: snapshot is saved every time, restored never.

## Fix plan (extension only, no UI changes)

### Fix A — one scan per stable form, per page load
In `extension/content.js`, around the `[AYN-HYBRID]` scan block:

1. Add a module-level `__aynScanInFlight` boolean and `__aynLastScanSignature` string.
2. Compute a cheap form signature (count of visible inputs + concatenated field names, hashed).
3. Skip the scan if `__aynScanInFlight === true` OR the signature equals the last one that already produced a fill within the last 8s.
4. When the scan runs, set in-flight true, clear it in `finally`.
5. When a scan returns `rich=0 legacy=0`, do NOT log "engine returned nothing — no fallback" and do NOT re-enter the pipeline; return silently — an empty rescan after a successful fill is expected, not an error.
6. Keep the existing MutationObserver but wrap its callback in a 600ms trailing debounce so a burst of React re-renders collapses to one scan.

### Fix B — snapshot key that survives reload and iframes
In `extension/content.entry.js`, replace the current key derivation:

- Compute key from `location.origin + location.pathname` only. Strip query string and hash. That keeps `/application` stable across reCAPTCHA callbacks and Ashby's own `?source=...` rewrites.
- On save, additionally persist under the top-frame's origin+pathname (via `window.top.location` guarded by a try/catch for cross-origin frames). Iframes then save nothing; only the top frame writes.
- On restore, only the top frame reads. Skip restore entirely when `window.top !== window`. That kills the reCAPTCHA-iframe "found=false" line.
- Log the normalized key on both save and lookup so we can eyeball a match next run.

### Verification after build

1. Rebuild extension, reload it, confirm version bumps to 2.5.7.
2. On the Ashby page with only AYN enabled, expected AYN log sequence:
   - one `[AYN-HYBRID] rich=N legacy=N` with N>0
   - one `snapshot saved: N answers, key= ayn_reload_snapshot:https://jobs.ashbyhq.com/.../application` (no query string)
   - zero `engine returned nothing` lines
   - on a manual reload: one `snapshot lookup ... found= true` on the top frame, zero lookups from reCAPTCHA/other iframes
3. Paste the AYN-only log lines back so we can confirm.

## Out of scope for this turn

- The `ObjectMultiplex` / `MaxListenersExceededWarning` / `share-modal.js` / `html2canvas` CORS lines. Those are other extensions and Ashby's own page. We cannot fix them from our extension and they are not what's breaking fills.
- No changes to the resolver, EEO rules, or vision fallback.

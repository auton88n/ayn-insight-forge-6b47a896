

# Plan — Fix dashboard crash (1 file, 1 line)

## Root cause
`src/components/shared/MessageFormatter.tsx` line 6 imports a CSS file from a package that isn't installed:

```ts
import 'highlight.js/styles/github-dark.min.css';
```

The project only has `rehype-highlight` in `package.json` — not `highlight.js` itself. Vite throws "Failed to resolve import" → the module can't compile → `Dashboard.tsx` dynamic import fails → **the entire dashboard fails to load**.

That's why:
- World Intelligence sections don't work
- Admin panel doesn't open
- Settings don't open
- Buttons do nothing
- Bonus credits display is missing
- The page feels stuck/laggy (it's actually crashed and the ErrorBoundary is rendering)

The chat itself (the eye + input) works because that part is rendered by the loading wrapper in `Index.tsx`, before Dashboard is reached.

## Fix (1 file)

**`src/components/shared/MessageFormatter.tsx`** — replace the broken import with the bundled CSS that lives inside `rehype-highlight`'s peer dep, OR simply remove the import and use a self-contained `<style>` block already used elsewhere.

The cleanest fix: install `highlight.js` as a real dependency so the existing import resolves. It's a tiny, well-maintained library that `rehype-highlight` is already designed to pair with.

```
bun add highlight.js
```

No code changes needed — the import on line 6 will then resolve correctly and Dashboard will load again.

## Why not just delete the import?
Code blocks in chat (when AYN replies with code) would render unstyled. The whole point of `MessageFormatter` is to syntax-highlight markdown code fences. Installing `highlight.js` keeps that working and matches the existing `rehype-highlight` integration.

## After the fix
- Dashboard loads ✓
- World Intelligence sections work ✓
- Admin panel opens ✓
- Settings open ✓
- All buttons work ✓
- Bonus credits display restored ✓
- "Lag" disappears (the ErrorBoundary won't be re-mounting on every navigation) ✓

## What this does NOT fix
The two real performance/correctness items I noticed while debugging — both are minor and separate:
1. `/user/limits` polls every 60 seconds even when nothing changed (unnecessary network noise)
2. Bonus credits show `0` in the API response — that's a backend data issue (your account literally has `bonus_credits: 0` in `/user/limits`), not a frontend bug

If you want me to also (a) reduce the polling and (b) investigate why bonus credits aren't being credited to your account, say so after the dashboard fix lands and I'll address them as a separate change.

## Files changed
- `package.json` (adds `highlight.js` dependency — done via package install, no manual edit)

That's it. One install, everything comes back.


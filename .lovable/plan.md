
## Status

Claude pushed Phase D from the spine side. You confirmed: zero `@/integrations/supabase/client` imports, zero `adminSupabase.from()` calls, SSE now points to `/sse/admin` on the spine.

But the build is still red because of the broken `checkPin` block in `src/admin-app/AdminApp.tsx` lines 58-101. The push didn't fix the local file — it's the same mangled `fetch()` from before.

## What's broken

`src/admin-app/AdminApp.tsx` lines 63-66:
```ts
const { data, error: fnError } = await (async () => { 
  const r = await fetch('https://spine.aynn.io/admin/verify-pin', { 
    method:'POST', headers:{...}, body: JSON.stringify({
  body: { pin: fullPin },   // ← orphaned, never closes
});
```

11 TS errors all cascade from this one block. Nothing else is wrong.

## Fix

Single edit to `src/admin-app/AdminApp.tsx`, replace the `checkPin` function (lines 58-101) with a clean implementation that calls the new spine endpoint:

```ts
const checkPin = async (fullPin: string) => {
  if (lockedUntil || checking) return;
  setChecking(true);
  try {
    const token = (await adminSupabase.auth.getSession()).data.session?.access_token || '';
    const r = await fetch('https://spine.aynn.io/admin/verify-pin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ pin: fullPin }),
    });
    const data = await r.json().catch(() => ({}));
    const ok = r.ok && data?.success;

    if (!ok) {
      if (data?.locked) {
        const until = Date.now() + (data.lockoutRemaining || 300) * 1000;
        localStorage.setItem(LOCKOUT_KEY, until.toString());
        setLockedUntil(until);
        return;
      }
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      localStorage.setItem(ATTEMPTS_KEY, newAttempts.toString());
      if (newAttempts >= MAX_ATTEMPTS) {
        const until = Date.now() + LOCKOUT_MINUTES * 60 * 1000;
        localStorage.setItem(LOCKOUT_KEY, until.toString());
        localStorage.setItem(ATTEMPTS_KEY, MAX_ATTEMPTS.toString());
        setLockedUntil(until);
        try { await adminSupabase.functions.invoke('admin-pin-alert', { body: {} }); } catch {}
      } else {
        setError(`Incorrect PIN. ${MAX_ATTEMPTS - newAttempts} attempt${MAX_ATTEMPTS - newAttempts === 1 ? '' : 's'} remaining.`);
        setPin(['', '', '', '']);
        setTimeout(() => inputs.current[0]?.focus(), 100);
      }
    } else {
      localStorage.removeItem(LOCKOUT_KEY);
      localStorage.removeItem(ATTEMPTS_KEY);
      sessionStorage.setItem(ADMIN_VERIFIED_KEY, session.user.id);
      onSuccess();
    }
  } catch {
    setError('Unable to verify PIN. Please try again.');
    setPin(['', '', '', '']);
    setTimeout(() => inputs.current[0]?.focus(), 100);
  } finally {
    setChecking(false);
  }
};
```

## After

Build goes green. Phase D is complete on the frontend side. Ready to publish.

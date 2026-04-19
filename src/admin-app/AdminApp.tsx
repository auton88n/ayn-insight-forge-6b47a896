import { useEffect, useState, useCallback } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { adminApi } from '@/lib/adminApi';
import { AdminPanel } from '@/components/AdminPanel';
import AdminCustomOrders from '@/pages/AdminCustomOrders';

const LOCKOUT_MINUTES = 5;
const MAX_ATTEMPTS = 3;
const LOCKOUT_KEY = 'ayn_admin_lockout';
const ATTEMPTS_KEY = 'ayn_admin_attempts';
const ADMIN_VERIFIED_KEY = 'ayn_admin_verified';

const ADMIN_TOKEN_KEY = 'ayn_admin_token';
const ADMIN_REFRESH_KEY = 'ayn_admin_refresh_token';
const ADMIN_USER_KEY = 'ayn_admin_user';
const SPINE_BASE = 'https://spine.aynn.io';

interface AdminUser {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  is_admin: boolean;
}

interface AdminSession {
  access_token: string;
  refresh_token: string;
  user: AdminUser;
}

function readSession(): AdminSession | null {
  try {
    const token = localStorage.getItem(ADMIN_TOKEN_KEY);
    const refresh = localStorage.getItem(ADMIN_REFRESH_KEY);
    const userRaw = localStorage.getItem(ADMIN_USER_KEY);
    if (!token || !userRaw) return null;
    const user = JSON.parse(userRaw) as AdminUser;
    return { access_token: token, refresh_token: refresh ?? '', user };
  } catch {
    return null;
  }
}

function writeSession(s: AdminSession) {
  localStorage.setItem(ADMIN_TOKEN_KEY, s.access_token);
  localStorage.setItem(ADMIN_REFRESH_KEY, s.refresh_token);
  localStorage.setItem(ADMIN_USER_KEY, JSON.stringify(s.user));
}

function clearSession() {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
  localStorage.removeItem(ADMIN_REFRESH_KEY);
  localStorage.removeItem(ADMIN_USER_KEY);
  sessionStorage.removeItem(ADMIN_VERIFIED_KEY);
}

async function adminSignOut() {
  const token = localStorage.getItem(ADMIN_TOKEN_KEY);
  try {
    if (token) {
      await fetch(`${SPINE_BASE}/admin/logout`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });
    }
  } catch { /* ignore */ }
  clearSession();
  window.location.reload();
}

function Loader() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="w-8 h-8 border border-white/20 border-t-white rounded-full animate-spin" />
    </div>
  );
}

// PIN screen — shown AFTER login since verify-admin-pin requires a JWT
function PinScreen({ session, onSuccess }: { session: AdminSession; onSuccess: () => void }) {
  const [pin, setPin] = useState(['', '', '', '']);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [countdown, setCountdown] = useState(0);
  const inputs = useState<(HTMLInputElement | null)[]>([])[0] as any;
  const inputRefs = { current: [] as (HTMLInputElement | null)[] };

  useEffect(() => {
    const lockout = localStorage.getItem(LOCKOUT_KEY);
    const saved = parseInt(localStorage.getItem(ATTEMPTS_KEY) || '0');
    setAttempts(saved);
    if (lockout) {
      const until = parseInt(lockout);
      if (Date.now() < until) setLockedUntil(until);
      else { localStorage.removeItem(LOCKOUT_KEY); localStorage.removeItem(ATTEMPTS_KEY); }
    }
    setTimeout(() => inputRefs.current[0]?.focus(), 100);
  }, []);

  useEffect(() => {
    if (!lockedUntil) return;
    const interval = setInterval(() => {
      const remaining = Math.ceil((lockedUntil - Date.now()) / 1000);
      if (remaining <= 0) {
        setLockedUntil(null); setAttempts(0);
        localStorage.removeItem(LOCKOUT_KEY); localStorage.removeItem(ATTEMPTS_KEY);
      } else { setCountdown(remaining); }
    }, 1000);
    return () => clearInterval(interval);
  }, [lockedUntil]);

  const checkPin = async (fullPin: string) => {
    if (lockedUntil || checking) return;
    setChecking(true);
    try {
      const r = await fetch(`${SPINE_BASE}/admin/verify-pin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ pin: fullPin }),
      });
      const data = await r.json().catch(() => ({} as any));
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
          try { await adminApi.invoke('admin-pin-alert', {}); } catch {}
        } else {
          setError(`Incorrect PIN. ${MAX_ATTEMPTS - newAttempts} attempt${MAX_ATTEMPTS - newAttempts === 1 ? '' : 's'} remaining.`);
          setPin(['', '', '', '']);
          setTimeout(() => inputRefs.current[0]?.focus(), 100);
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
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } finally {
      setChecking(false);
    }
  };

  const handleChange = (i: number, val: string) => {
    if (lockedUntil || !/^\d*$/.test(val) || checking) return;
    const newPin = [...pin]; newPin[i] = val.slice(-1); setPin(newPin); setError('');
    if (val && i < 3) inputRefs.current[i + 1]?.focus();
    if (newPin.every(d => d !== '')) checkPin(newPin.join(''));
  };

  const handleKey = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !pin[i] && i > 0) inputRefs.current[i - 1]?.focus();
  };

  const mins = Math.floor(countdown / 60);
  const secs = countdown % 60;

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="text-center">
        <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-6">
          <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
            <path d="M12 1a5 5 0 0 1 5 5v3h1a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h1V6a5 5 0 0 1 5-5zm0 2a3 3 0 0 0-3 3v3h6V6a3 3 0 0 0-3-3z" fill="white" fillOpacity=".4"/>
          </svg>
        </div>
        {lockedUntil ? (
          <div>
            <div className="text-red-400 text-sm mb-2">Too many failed attempts</div>
            <div className="text-4xl font-mono font-bold text-white mb-2">{mins}:{secs.toString().padStart(2,'0')}</div>
            <div className="text-white/30 text-xs mt-4">Try again later</div>
          </div>
        ) : (
          <>
            <div className="text-white/50 text-sm mb-8">Enter admin PIN</div>
            <div className="flex gap-3 justify-center mb-4">
              {pin.map((digit, i) => (
                <input key={i} ref={el => inputRefs.current[i] = el} type="password" inputMode="numeric"
                  maxLength={1} value={digit} onChange={e => handleChange(i, e.target.value)}
                  onKeyDown={e => handleKey(i, e)}
                  disabled={checking}
                  className={`w-12 h-14 text-center text-xl font-bold bg-white/5 border rounded-xl text-white focus:outline-none transition-all disabled:opacity-50 ${
                    error ? 'border-red-500/60 bg-red-500/5' : digit ? 'border-white/30' : 'border-white/10 focus:border-white/30'}`} />
              ))}
            </div>
            {checking && <p className="text-white/30 text-xs">Verifying...</p>}
            {error && !checking && <p className="text-red-400 text-xs">{error}</p>}
            <button onClick={adminSignOut} className="text-white/20 text-xs mt-6 underline">
              Sign out
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function LoginScreen({ onSuccess }: { onSuccess: (s: AdminSession) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError('');
    try {
      const res = await fetch(`${SPINE_BASE}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        if (res.status === 403) setError('Access denied — admins only');
        else setError(data?.error || data?.detail || 'Invalid credentials');
        setLoading(false);
        return;
      }
      const session: AdminSession = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        user: data.user,
      };
      writeSession(session);
      onSuccess(session);
    } catch (err: any) {
      setError(err?.message || 'Sign-in failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-xl font-bold text-white mb-1">Admin access</div>
          <div className="text-white/30 text-sm">Sign in to continue</div>
        </div>
        <form onSubmit={handleLogin} className="space-y-3">
          <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/25 focus:outline-none focus:border-white/30 text-sm" required />
          <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/25 focus:outline-none focus:border-white/30 text-sm" required />
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full bg-white text-black rounded-xl py-3 text-sm font-medium hover:bg-white/90 disabled:opacity-50">
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}

function AccessDenied() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="text-center">
        <div className="text-white/50 mb-4">Access denied — admins only</div>
        <button onClick={adminSignOut} className="text-white/30 text-sm underline">Sign out</button>
      </div>
    </div>
  );
}

type Step = 'checking' | 'login' | 'pin' | 'ready' | 'denied';

export default function AdminApp() {
  const [step, setStep] = useState<Step>('checking');
  const [session, setSession] = useState<AdminSession | null>(null);

  const proceedFromSession = useCallback((s: AdminSession) => {
    // Spine /admin/login already enforces is_admin. Skip straight to PIN
    // unless this session was already PIN-verified.
    const cached = sessionStorage.getItem(ADMIN_VERIFIED_KEY);
    if (cached === s.user.id) setStep('ready');
    else setStep('pin');
  }, []);

  useEffect(() => {
    const s = readSession();
    if (s) {
      setSession(s);
      proceedFromSession(s);
    } else {
      setStep('login');
    }

    // React to other tabs signing out / in.
    const onStorage = (e: StorageEvent) => {
      if (e.key === ADMIN_TOKEN_KEY) {
        if (!e.newValue) {
          sessionStorage.removeItem(ADMIN_VERIFIED_KEY);
          setSession(null);
          setStep('login');
        } else {
          const fresh = readSession();
          if (fresh) {
            setSession(fresh);
            proceedFromSession(fresh);
          }
        }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [proceedFromSession]);

  const handleLoginSuccess = useCallback((s: AdminSession) => {
    setSession(s);
    proceedFromSession(s);
  }, [proceedFromSession]);

  const handlePinSuccess = useCallback(() => {
    setStep('ready');
  }, []);

  if (step === 'checking') return <Loader />;
  if (step === 'login') return <LoginScreen onSuccess={handleLoginSuccess} />;
  if (step === 'pin') return <PinScreen session={session!} onSuccess={handlePinSuccess} />;
  if (step === 'denied') return <AccessDenied />;

  return (
    <Routes>
      <Route path="/" element={<AdminPanel session={session as any} isAdmin={true} onBackClick={() => {}} />} />
      <Route path="/custom-orders" element={<AdminCustomOrders />} />
      <Route path="*" element={<Navigate to="/manage-bae76e99d97e188b" replace />} />
    </Routes>
  );
}

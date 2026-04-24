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

// Use the SAME token as the main app — no separate admin login needed
const MAIN_TOKEN_KEY = 'ayn_access_token';
const MAIN_USER_KEY  = 'ayn_user';
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
    // Try main app token first
    const token = localStorage.getItem(MAIN_TOKEN_KEY);
    const userRaw = localStorage.getItem(MAIN_USER_KEY);
    if (token && userRaw) {
      const user = JSON.parse(userRaw);
      return {
        access_token: token,
        refresh_token: '',
        user: {
          id: user.id || user.sub || '',
          email: user.email || '',
          first_name: user.first_name || user.user_metadata?.full_name?.split(' ')[0] || '',
          last_name: user.last_name || '',
          is_admin: user.is_admin ?? false,
        }
      };
    }
    return null;
  } catch {
    return null;
  }
}

function clearSession() {
  sessionStorage.removeItem(ADMIN_VERIFIED_KEY);
}

async function adminSignOut() {
  clearSession();
  window.location.href = '/';
}

function Loader() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="w-8 h-8 border border-white/20 border-t-white rounded-full animate-spin" />
    </div>
  );
}

function PinScreen({ session, onSuccess }: { session: AdminSession; onSuccess: () => void }) {
  const [pin, setPin] = useState(['', '', '', '']);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [countdown, setCountdown] = useState(0);
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
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        localStorage.setItem(ATTEMPTS_KEY, newAttempts.toString());
        if (newAttempts >= MAX_ATTEMPTS) {
          const until = Date.now() + LOCKOUT_MINUTES * 60 * 1000;
          localStorage.setItem(LOCKOUT_KEY, until.toString());
          localStorage.setItem(ATTEMPTS_KEY, MAX_ATTEMPTS.toString());
          setLockedUntil(until);
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

function NotLoggedIn() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="text-center">
        <div className="text-white/70 text-lg mb-2">Admin Access</div>
        <div className="text-white/30 text-sm mb-6">You need to be logged in to access the admin panel.</div>
        <a href="/dashboard" className="text-white bg-white/10 hover:bg-white/20 px-6 py-3 rounded-xl text-sm transition-all">
          Go to Dashboard →
        </a>
      </div>
    </div>
  );
}

function AccessDenied() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="text-center">
        <div className="text-white/50 mb-4">Access denied — admins only</div>
        <a href="/dashboard" className="text-white/30 text-sm underline">Go back</a>
      </div>
    </div>
  );
}

type Step = 'checking' | 'not_logged_in' | 'pin' | 'ready' | 'denied';

export default function AdminApp() {
  const [step, setStep] = useState<Step>('checking');
  const [session, setSession] = useState<AdminSession | null>(null);

  useEffect(() => {
    const s = readSession();

    if (!s || !s.access_token) {
      setStep('not_logged_in');
      return;
    }

    // Check PIN cache
    const cached = sessionStorage.getItem(ADMIN_VERIFIED_KEY);
    if (cached === s.user.id) {
      setSession(s);
      setStep('ready');
      return;
    }

    // Verify token is admin via spine
    fetch(`${SPINE_BASE}/admin/session`, {
      headers: { 'Authorization': `Bearer ${s.access_token}` }
    })
      .then(r => r.json().then(d => ({ ok: r.ok, data: d })))
      .then(({ ok, data }) => {
        if (!ok) {
          setStep('not_logged_in');
          return;
        }
        if (!data?.user?.is_admin) {
          setStep('denied');
          return;
        }
        // Merge is_admin into session
        const enriched: AdminSession = {
          ...s,
          user: { ...s.user, ...data.user, is_admin: true }
        };
        // Store as admin token so adminApi works
        localStorage.setItem('ayn_admin_token', s.access_token);
        setSession(enriched);
        setStep('pin');
      })
      .catch(() => setStep('not_logged_in'));
  }, []);

  if (step === 'checking') return <Loader />;
  if (step === 'not_logged_in') return <NotLoggedIn />;
  if (step === 'denied') return <AccessDenied />;

  if (step === 'pin' && session) {
    return (
      <PinScreen
        session={session}
        onSuccess={() => setStep('ready')}
      />
    );
  }

  if (step === 'ready') {
    return (
      <Routes>
        <Route path="/" element={<AdminPanel />} />
        <Route path="/custom-orders" element={<AdminCustomOrders />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  return <Loader />;
}

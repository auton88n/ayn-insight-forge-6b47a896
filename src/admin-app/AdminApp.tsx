import { useEffect, useState, useRef, useCallback } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Session } from '@supabase/supabase-js';
import { adminSupabase } from './adminSupabase';
import aynMark from '/ayn-mark.svg';
import { AdminPanel } from '@/components/AdminPanel';

const LOCKOUT_KEY = 'ayn_admin_lockout';
// Holds the HMAC signed ticket the server mints on a correct PIN, not a user
// id. A hand written value fails the server side check, so the PIN cannot be
// skipped from devtools.
const ADMIN_TICKET_KEY = 'ayn_admin_ticket';


function Loader() {
  return (
    <div className="min-h-screen bg-[#faf7f2] flex items-center justify-center">
      <img src={aynMark} alt="AYN" className="w-10 h-10 animate-pulse" />
    </div>
  );
}

// PIN screen — shown AFTER login since admin-auth-pin requires a JWT.
// Attempts and lockout are decided by the server, the browser only displays them.
function PinScreen({ session, onSuccess }: { session: Session; onSuccess: () => void }) {
  const [pin, setPin] = useState(['', '', '', '']);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [countdown, setCountdown] = useState(0);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    const lockout = localStorage.getItem(LOCKOUT_KEY);
    if (lockout) {
      const until = parseInt(lockout);
      if (Date.now() < until) setLockedUntil(until);
      else localStorage.removeItem(LOCKOUT_KEY);
    }
    // Focus first input
    setTimeout(() => inputs.current[0]?.focus(), 100);
  }, []);

  useEffect(() => {
    if (!lockedUntil) return;
    const interval = setInterval(() => {
      const remaining = Math.ceil((lockedUntil - Date.now()) / 1000);
      if (remaining <= 0) {
        setLockedUntil(null);
        localStorage.removeItem(LOCKOUT_KEY);
      } else { setCountdown(remaining); }
    }, 1000);
    return () => clearInterval(interval);
  }, [lockedUntil]);

  const resetEntry = () => {
    setPin(['', '', '', '']);
    setTimeout(() => inputs.current[0]?.focus(), 100);
  };

  const checkPin = async (fullPin: string) => {
    if (lockedUntil || checking) return;
    setChecking(true);
    try {
      const { data } = await adminSupabase.functions.invoke('admin-auth-pin', {
        body: { action: 'verify', pin: fullPin },
      });

      if (data?.success) {
        localStorage.removeItem(LOCKOUT_KEY);
        sessionStorage.setItem(ADMIN_VERIFIED_KEY, session.user.id);
        onSuccess();
        return;
      }

      if (data?.locked) {
        const until = Date.now() + (data.lockoutRemaining || 900) * 1000;
        localStorage.setItem(LOCKOUT_KEY, until.toString());
        setLockedUntil(until);
        return;
      }

      const left = typeof data?.attemptsRemaining === 'number' ? data.attemptsRemaining : null;
      setError(left === null
        ? (data?.error || 'Incorrect PIN.')
        : `Incorrect PIN. ${left} attempt${left === 1 ? '' : 's'} remaining.`);
      resetEntry();
    } catch {
      setError('Unable to verify PIN. Please try again.');
      resetEntry();
    } finally {
      setChecking(false);
    }
  };


  const handleChange = (i: number, val: string) => {
    if (lockedUntil || !/^\d*$/.test(val) || checking) return;
    const newPin = [...pin]; newPin[i] = val.slice(-1); setPin(newPin); setError('');
    if (val && i < 3) inputs.current[i + 1]?.focus();
    if (newPin.every(d => d !== '')) checkPin(newPin.join(''));
  };

  const handleKey = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !pin[i] && i > 0) inputs.current[i - 1]?.focus();
  };

  const mins = Math.floor(countdown / 60);
  const secs = countdown % 60;

  return (
    <div className="min-h-screen bg-[#faf7f2] flex items-center justify-center p-4">
      <div className="text-center">
        <img src={aynMark} alt="AYN" className="h-10 w-10 mx-auto mb-6" />
        {lockedUntil ? (
          <div>
            <div className="text-destructive text-sm mb-2">Too many failed attempts</div>
            <div className="text-4xl font-mono font-bold text-foreground mb-2">{mins}:{secs.toString().padStart(2,'0')}</div>
            <div className="text-muted-foreground text-xs mt-4">Try again later</div>
          </div>
        ) : (
          <>
            <div className="text-muted-foreground text-sm mb-8">Enter admin PIN</div>
            <div className="flex gap-3 justify-center mb-4">
              {pin.map((digit, i) => (
                <input key={i} ref={el => inputs.current[i] = el} type="password" inputMode="numeric"
                  maxLength={1} value={digit} onChange={e => handleChange(i, e.target.value)}
                  onKeyDown={e => handleKey(i, e)}
                  disabled={checking}
                  className={`w-12 h-14 text-center text-xl font-bold bg-white border rounded-xl text-foreground shadow-sm focus:outline-none transition-all disabled:opacity-50 ${
                    error ? 'border-destructive/60 bg-destructive/5' : digit ? 'border-[#f97316]' : 'border-black/10 focus:border-[#f97316]'}`} />
              ))}
            </div>
            {checking && <p className="text-muted-foreground text-xs">Verifying...</p>}
            {error && !checking && <p className="text-destructive text-xs">{error}</p>}
            <button onClick={() => { adminSupabase.auth.signOut(); }} className="text-muted-foreground text-xs mt-6 underline">
              Sign out
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function LoginScreen({ onSuccess }: { onSuccess: (s: Session) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError('');
    const { data, error } = await adminSupabase.auth.signInWithPassword({ email, password });
    if (error) { setError(error.message); setLoading(false); return; }
    if (data.session) onSuccess(data.session);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#faf7f2] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src={aynMark} alt="AYN" className="h-10 w-10 mx-auto mb-5" />
          <div className="text-xl font-bold text-foreground mb-1">Admin access</div>
          <div className="text-muted-foreground text-sm">Sign in to continue</div>
        </div>
        <form onSubmit={handleLogin} className="space-y-3">
          <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)}
            className="w-full bg-white border border-black/10 rounded-xl px-4 py-3 text-foreground shadow-sm placeholder-muted-foreground focus:outline-none focus:border-[#f97316] text-sm" required />
          <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)}
            className="w-full bg-white border border-black/10 rounded-xl px-4 py-3 text-foreground shadow-sm placeholder-muted-foreground focus:outline-none focus:border-[#f97316] text-sm" required />
          {error && <p className="text-destructive text-xs">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full bg-[#f97316] text-white rounded-xl py-3 text-sm font-medium hover:bg-[#ea580c] disabled:opacity-50">
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}

function AccessDenied() {
  return (
    <div className="min-h-screen bg-[#faf7f2] flex items-center justify-center">
      <div className="text-center">
        <div className="text-foreground mb-4">Access denied, admins only</div>
        <button onClick={() => adminSupabase.auth.signOut()} className="text-muted-foreground text-sm underline">Sign out</button>
      </div>
    </div>
  );
}

type Step = 'checking' | 'login' | 'pin' | 'ready' | 'denied';

export default function AdminApp() {
  const [step, setStep] = useState<Step>('checking');
  const [session, setSession] = useState<Session | null>(null);

  const checkAdmin = useCallback(async (s: Session) => {
    // Role first, always. The cached PIN ticket is only consulted after
    // user_roles says this account is an admin, and the ticket itself is
    // re-checked by the server, so neither half can be faked in the browser.
    try {
      const { data } = await adminSupabase.from('user_roles').select('role').eq('user_id', s.user.id).maybeSingle();
      if (data?.role !== 'admin') { sessionStorage.removeItem(ADMIN_TICKET_KEY); setStep('denied'); return; }
    } catch { setStep('denied'); return; }

    const ticket = sessionStorage.getItem(ADMIN_TICKET_KEY);
    if (ticket) {
      try {
        const { data } = await adminSupabase.functions.invoke('admin-auth-pin', {
          body: { action: 'check', ticket },
        });
        if (data?.success) { setStep('ready'); return; }
      } catch { /* fall through to the PIN screen */ }
      sessionStorage.removeItem(ADMIN_TICKET_KEY);
    }
    setStep('pin');
  }, []);

  useEffect(() => {
    adminSupabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setSession(session);
        checkAdmin(session);
      } else {
        setStep('login');
      }
    });

    const { data: { subscription } } = adminSupabase.auth.onAuthStateChange((_e, s) => {
      if (!s) {
        sessionStorage.removeItem(ADMIN_TICKET_KEY);
        setStep('login'); setSession(null);
      }
    });
    return () => subscription.unsubscribe();
  }, [checkAdmin]);


  const handleLoginSuccess = useCallback((s: Session) => {
    setSession(s);
    checkAdmin(s);
  }, [checkAdmin]);

  const handlePinSuccess = useCallback(() => {
    setStep('ready');
  }, []);

  if (step === 'checking') return <Loader />;
  if (step === 'login') return <LoginScreen onSuccess={handleLoginSuccess} />;
  if (step === 'pin') return <PinScreen session={session!} onSuccess={handlePinSuccess} />;
  if (step === 'denied') return <AccessDenied />;

  return (
    <Routes>
      <Route path="/" element={<AdminPanel session={session!} isAdmin={true} onBackClick={() => {}} />} />
      <Route path="*" element={<Navigate to="/manage-bae76e99d97e188b" replace />} />
    </Routes>
  );
}

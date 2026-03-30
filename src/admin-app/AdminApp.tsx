import { useEffect, useState, useRef } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Session } from '@supabase/supabase-js';
import { adminSupabase } from './adminSupabase';
import { AdminPanel } from '@/components/AdminPanel';
import AdminCustomOrders from '@/pages/AdminCustomOrders';

// Use adminSupabase everywhere — completely isolated from main app

const LOCKOUT_MINUTES = 5;
const MAX_ATTEMPTS = 3;
const LOCKOUT_KEY = 'ayn_admin_lockout';
const ATTEMPTS_KEY = 'ayn_admin_attempts';

function Loader() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="w-8 h-8 border border-white/20 border-t-white rounded-full animate-spin" />
    </div>
  );
}

function PinScreen({ onSuccess }: { onSuccess: () => void }) {
  const [pin, setPin] = useState(['', '', '', '']);
  const [error, setError] = useState('');
  const [shake, setShake] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [countdown, setCountdown] = useState(0);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    const lockout = localStorage.getItem(LOCKOUT_KEY);
    const saved = parseInt(localStorage.getItem(ATTEMPTS_KEY) || '0');
    setAttempts(saved);
    if (lockout) {
      const until = parseInt(lockout);
      if (Date.now() < until) setLockedUntil(until);
      else { localStorage.removeItem(LOCKOUT_KEY); localStorage.removeItem(ATTEMPTS_KEY); }
    }
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

  const sendAlert = async () => {
    try { await adminSupabase.functions.invoke('admin-pin-alert', { body: {} }); } catch {}
  };

  const triggerLockout = async () => {
    const until = Date.now() + LOCKOUT_MINUTES * 60 * 1000;
    localStorage.setItem(LOCKOUT_KEY, until.toString());
    localStorage.setItem(ATTEMPTS_KEY, MAX_ATTEMPTS.toString());
    setLockedUntil(until);
    setAttempts(MAX_ATTEMPTS);
    await sendAlert();
  };

  const checkPin = async (fullPin: string) => {
    if (lockedUntil) return;
    try {
      const msgBuffer = new TextEncoder().encode(fullPin);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
      const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
      const { data } = await adminSupabase.from('app_settings').select('value').eq('key', 'admin_pin_hash').single();
      if (data?.value === hashHex) {
        localStorage.removeItem(LOCKOUT_KEY); localStorage.removeItem(ATTEMPTS_KEY);
        onSuccess();
      } else {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        localStorage.setItem(ATTEMPTS_KEY, newAttempts.toString());
        if (newAttempts >= MAX_ATTEMPTS) { await triggerLockout(); }
        else {
          setShake(true);
          setError(`Incorrect PIN. ${MAX_ATTEMPTS - newAttempts} attempt${MAX_ATTEMPTS - newAttempts === 1 ? '' : 's'} remaining.`);
          setPin(['', '', '', '']);
          setTimeout(() => { setShake(false); inputs.current[0]?.focus(); }, 600);
        }
      }
    } catch { setError('Something went wrong.'); }
  };

  const handleChange = (i: number, val: string) => {
    if (lockedUntil || !/^\d*$/.test(val)) return;
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
            <div className="text-white/30 text-xs mt-4">Warning sent to admin</div>
          </div>
        ) : (
          <>
            <div className="text-white/50 text-sm mb-8">Enter PIN</div>
            <div className={`flex gap-3 justify-center mb-4 ${shake ? 'animate-bounce' : ''}`}>
              {pin.map((digit, i) => (
                <input key={i} ref={el => inputs.current[i] = el} type="password" inputMode="numeric"
                  maxLength={1} value={digit} onChange={e => handleChange(i, e.target.value)}
                  onKeyDown={e => handleKey(i, e)} autoFocus={i === 0}
                  className={`w-12 h-14 text-center text-xl font-bold bg-white/5 border rounded-xl text-white focus:outline-none transition-all ${
                    error ? 'border-red-500/60 bg-red-500/5' : digit ? 'border-white/30' : 'border-white/10 focus:border-white/30'}`} />
              ))}
            </div>
            {error && <p className="text-red-400 text-xs">{error}</p>}
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
        <button onClick={() => adminSupabase.auth.signOut()} className="text-white/30 text-sm underline">Sign out</button>
      </div>
    </div>
  );
}

type Step = 'checking' | 'pin' | 'login' | 'ready' | 'denied';

export default function AdminApp() {
  const [step, setStep] = useState<Step>('checking');
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    // Use admin-specific session only
    adminSupabase.auth.getSession().then(({ data: { session } }) => {
      if (session) { setSession(session); checkAdmin(session); }
      else setStep('pin');
    });
    const { data: { subscription } } = adminSupabase.auth.onAuthStateChange((_e, s) => {
      if (!s) { setStep('pin'); setSession(null); }
    });
    return () => subscription.unsubscribe();
  }, []);

  const checkAdmin = async (s: Session) => {
    const attempt = async () => {
      const { data, error } = await adminSupabase.from('user_roles').select('role').eq('user_id', s.user.id).maybeSingle();
      if (error) throw error;
      return data?.role === 'admin';
    };
    try {
      setStep(await attempt() ? 'ready' : 'denied');
    } catch {
      try {
        await new Promise(r => setTimeout(r, 1000));
        setStep(await attempt() ? 'ready' : 'denied');
      } catch { setStep('denied'); }
    }
  };

  const handlePinSuccess = () => {
    adminSupabase.auth.getSession().then(({ data: { session } }) => {
      if (session) { setSession(session); checkAdmin(session); }
      else setStep('login');
    });
  };

  const handleLoginSuccess = (s: Session) => { setSession(s); checkAdmin(s); };

  if (step === 'checking') return <Loader />;
  if (step === 'pin') return <PinScreen onSuccess={handlePinSuccess} />;
  if (step === 'login') return <LoginScreen onSuccess={handleLoginSuccess} />;
  if (step === 'denied') return <AccessDenied />;

  return (
    <Routes>
      <Route
        path="/"
        element={
          // Pass onBackClick as empty function — no back navigation to main app
          <AdminPanel session={session!} isAdmin={true} onBackClick={() => {}} />
        }
      />
      <Route path="/custom-orders" element={<AdminCustomOrders />} />
      <Route path="*" element={<Navigate to="/manage-bae76e99d97e188b" replace />} />
    </Routes>
  );
}

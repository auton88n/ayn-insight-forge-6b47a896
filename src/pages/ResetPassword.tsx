import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { AYN_BACKEND_URL } from '@/config';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';

const SPINE = AYN_BACKEND_URL || 'https://spine.aynn.io';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [isExpired, setIsExpired] = useState(false);
  const [token, setToken] = useState('');
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    // Get token from URL ?token=xxx
    const params = new URLSearchParams(window.location.search);
    const t = params.get('token');
    if (!t) {
      setIsExpired(true);
    } else {
      setToken(t);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast({ title: "Passwords don't match", variant: 'destructive' });
      return;
    }
    if (password.length < 8) {
      toast({ title: "Password must be at least 8 characters", variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(`${SPINE}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, new_password: password }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 400) setIsExpired(true);
        toast({ title: data.detail || data.error || 'Reset failed', variant: 'destructive' });
        return;
      }

      setIsDone(true);
      toast({ title: '✅ Password reset successfully!', description: 'You can now log in with your new password.' });
      setTimeout(() => navigate('/'), 2000);
    } catch {
      toast({ title: 'Something went wrong', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  if (isExpired) return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="text-center max-w-md">
        <XCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
        <h2 className="text-xl font-bold mb-2">Link Expired</h2>
        <p className="text-muted-foreground mb-6">This password reset link has expired or is invalid. Request a new one.</p>
        <Button onClick={() => navigate('/')}>Back to Login</Button>
      </div>
    </div>
  );

  if (isDone) return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="text-center max-w-md">
        <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold mb-2">Password Reset!</h2>
        <p className="text-muted-foreground">Redirecting you to login...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-black tracking-tighter">AYN</h1>
          <p className="text-muted-foreground mt-2">Set your new password</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 bg-card border border-border rounded-xl p-6">
          <div className="space-y-2">
            <Label htmlFor="password">New Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">Confirm Password</Label>
            <Input
              id="confirm"
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Repeat your new password"
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            Reset Password
          </Button>
        </form>
      </div>
    </div>
  );
}

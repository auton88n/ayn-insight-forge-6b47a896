import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Lock, Loader2, Eye, EyeOff, AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Session } from '@supabase/supabase-js';
import { SEO } from '@/components/shared/SEO';

const ResetPassword = () => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [requestEmail, setRequestEmail] = useState(() => localStorage.getItem('password_reset_email') ?? '');
  const [loading, setLoading] = useState(false);
  const [requestingLink, setRequestingLink] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [isValidating, setIsValidating] = useState(true);
  const [linkExpired, setLinkExpired] = useState(false);
  const [slowValidation, setSlowValidation] = useState(false);
  const navigateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    let isMounted = true;
    let slowTimer: ReturnType<typeof setTimeout> | null = null;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

    localStorage.setItem('password_recovery_in_progress', 'true');

    // Show slow-loading hint after 8s
    slowTimer = setTimeout(() => {
      if (isMounted && isValidating) setSlowValidation(true);
    }, 8000);

    // Check URL for error parameters first
    const urlParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const urlError = urlParams.get('error') || hashParams.get('error');
    const errorDescription = urlParams.get('error_description') || hashParams.get('error_description');

    if (urlError || errorDescription?.includes('expired')) {
      console.log('[ResetPassword] URL contains error, marking as expired');
      setLinkExpired(true);
      setIsValidating(false);
      return;
    }

    // Detect if we have a code or hash tokens (just for logging/fallback timing)
    const hasCode = urlParams.has('code');
    const hasHashToken = hashParams.has('access_token') && hashParams.get('type') === 'recovery';
    console.log('[ResetPassword] hasCode:', hasCode, '| hasHashToken:', hasHashToken);

    // Set up auth state listener FIRST — this catches the PASSWORD_RECOVERY
    // event fired by Supabase's auto detectSessionInUrl (PKCE) or hash detection.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, currentSession) => {
        console.log('[ResetPassword] Auth event:', event);
        if (!isMounted) return;

        if (event === 'PASSWORD_RECOVERY' && currentSession) {
          // This is the primary success path for password reset
          console.log('[ResetPassword] PASSWORD_RECOVERY event received');
          setSession(currentSession);
          setRequestEmail(prev => prev || currentSession.user.email || '');
          setLinkExpired(false);
          setIsValidating(false);
          if (slowTimer) clearTimeout(slowTimer);
          if (fallbackTimer) clearTimeout(fallbackTimer);
          // Clean URL
          if (window.location.hash || window.location.search) {
            window.history.replaceState(null, '', window.location.pathname);
          }
        } else if (event === 'SIGNED_IN' && currentSession) {
          // SIGNED_IN can also fire for recovery — accept it as valid
          console.log('[ResetPassword] SIGNED_IN event received (recovery context)');
          setSession(currentSession);
          setRequestEmail(prev => prev || currentSession.user.email || '');
          setLinkExpired(false);
          setIsValidating(false);
          if (slowTimer) clearTimeout(slowTimer);
          if (fallbackTimer) clearTimeout(fallbackTimer);
          if (window.location.hash || window.location.search) {
            window.history.replaceState(null, '', window.location.pathname);
          }
        }
      }
    );

    // Also check for an existing session (e.g., user refreshed the page after
    // the code was already exchanged by detectSessionInUrl)
    const checkExistingSession = async () => {
      try {
        const { data: { session: existingSession } } = await supabase.auth.getSession();
        if (!isMounted) return;

        if (existingSession) {
          console.log('[ResetPassword] Found existing session');
          setSession(existingSession);
          setRequestEmail(prev => prev || existingSession.user.email || '');
          setIsValidating(false);
          if (slowTimer) clearTimeout(slowTimer);
          if (fallbackTimer) clearTimeout(fallbackTimer);
          return;
        }
      } catch (e) {
        console.error('[ResetPassword] getSession error:', e);
      }

      // If no session yet and we have a code/token, the auto-detection should
      // handle it. Give it time, then fall back to expired state.
      const waitTime = (hasCode || hasHashToken) ? 8000 : 3000;
      fallbackTimer = setTimeout(() => {
        if (isMounted && isValidating) {
          console.log('[ResetPassword] Timeout — no session established');
          setLinkExpired(true);
          setIsValidating(false);
        }
      }, waitTime);
    };

    checkExistingSession();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
      if (slowTimer) clearTimeout(slowTimer);
      if (fallbackTimer) clearTimeout(fallbackTimer);
      if (navigateTimerRef.current) clearTimeout(navigateTimerRef.current);
      if (linkExpired) localStorage.removeItem('password_recovery_in_progress');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      toast({ title: 'Error', description: 'Passwords do not match', variant: 'destructive' });
      return;
    }

    if (newPassword.length < 6) {
      toast({ title: 'Error', description: 'Password must be at least 6 characters', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      toast({ title: 'Success', description: 'Your password has been updated successfully' });
      localStorage.removeItem('password_recovery_in_progress');
      localStorage.removeItem('password_reset_email');
      navigateTimerRef.current = setTimeout(() => {
        navigate('/');
        navigateTimerRef.current = null;
      }, 2000);
    } catch {
      toast({
        title: 'Password Reset Failed',
        description: "We couldn't update your password. Please try again or request a new reset link.",
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRequestNewLink = async () => {
    const normalizedEmail = requestEmail.trim().toLowerCase();
    if (!normalizedEmail) {
      toast({ title: 'Email Required', description: 'Enter your email address to receive a new reset link.', variant: 'destructive' });
      return;
    }

    setRequestingLink(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;

      localStorage.setItem('password_reset_email', normalizedEmail);
      toast({ title: 'Reset Link Sent', description: 'Check your email for a new password reset link.' });
    } catch (error) {
      toast({
        title: 'Unable to Send Link',
        description: error instanceof Error ? error.message : 'Please try again in a moment.',
        variant: 'destructive',
      });
    } finally {
      setRequestingLink(false);
    }
  };

  // Reusable "request new link" form for expired/slow states
  const requestLinkForm = (
    <div className="space-y-4">
      <div className="space-y-2 text-left">
        <Label htmlFor="requestEmail">Email Address</Label>
        <Input
          id="requestEmail"
          type="email"
          autoComplete="email"
          placeholder="Enter your email"
          value={requestEmail}
          onChange={(e) => setRequestEmail(e.target.value)}
          disabled={requestingLink}
        />
      </div>
      <Button onClick={handleRequestNewLink} className="w-full" variant="default" disabled={requestingLink}>
        {requestingLink ? (
          <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending Link...</>
        ) : (
          <><RefreshCw className="mr-2 h-4 w-4" /> Request New Link</>
        )}
      </Button>
    </div>
  );

  // --- RENDER STATES ---

  if (isValidating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted p-4">
        <SEO title="Reset Password - AYN" description="Reset your AYN account password." noIndex={true} />
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1">
            <div className="flex items-center justify-center mb-4">
              <Loader2 className="h-12 w-12 text-primary animate-spin" />
            </div>
            <CardTitle className="text-2xl text-center">Validating Reset Link</CardTitle>
            <CardDescription className="text-center">
              {slowValidation ? 'This is taking longer than expected...' : 'Please wait while we verify your password reset link...'}
            </CardDescription>
          </CardHeader>
          {slowValidation && (
            <CardContent className="space-y-4">
              {requestLinkForm}
              <Button onClick={() => window.location.reload()} className="w-full" variant="outline">
                <RefreshCw className="mr-2 h-4 w-4" /> Reload Page
              </Button>
            </CardContent>
          )}
        </Card>
      </div>
    );
  }

  if (linkExpired || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="space-y-1">
            <div className="flex items-center justify-center mb-4">
              <AlertTriangle className="h-12 w-12 text-destructive" />
            </div>
            <CardTitle className="text-2xl text-center">Reset Link Expired</CardTitle>
            <CardDescription className="text-center">
              This password reset link has expired or is invalid. Reset links are valid for 1 hour after they are sent.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {requestLinkForm}
            <Button onClick={() => navigate('/')} className="w-full" variant="outline" disabled={requestingLink}>
              <Home className="mr-2 h-4 w-4" /> Back to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Valid session — show password reset form
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-center mb-4">
            <Lock className="h-12 w-12 text-primary" />
          </div>
          <CardTitle className="text-2xl text-center">Reset Password</CardTitle>
          <CardDescription className="text-center">Enter your new password below</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter new password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                  disabled={loading}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent opacity-60 hover:opacity-100 transition-opacity"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={loading}
                >
                  {showPassword ? <EyeOff className="h-3.5 w-3.5 text-muted-foreground" /> : <Eye className="h-3.5 w-3.5 text-muted-foreground" />}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                disabled={loading}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Updating Password...</>) : 'Update Password'}
            </Button>
            <div className="text-center text-sm text-muted-foreground">Password must be at least 6 characters</div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default ResetPassword;

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { consentSignupMetadata, attachConsentIp, LEGAL } from '@/lib/legal';
import { Loader2, Building, User, KeyRound, CheckCircle2, ArrowLeft, Mail } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { useLanguage } from '@/contexts/LanguageContext';
import { PasswordStrengthIndicator } from './PasswordStrengthIndicator';
import { MaintenanceNotice } from "@/components/shared/MaintenanceNotice";
import { useFeature } from "@/hooks/useFeatureFlags";

interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Preselects the signup role and opens the signup tab (landing page CTAs). */
  initialRole?: 'job_seeker' | 'employer';
  /** Overrides which tab opens, independent of initialRole -- lets a caller
   * open straight to Sign In even though a role was also given (v3.233.0,
   * the sign-in gate's "already have an account" link). */
  initialTab?: 'signin' | 'signup';
}

// Mask email for privacy (john.doe@gmail.com → j***e@gmail.com)
const maskEmail = (email: string): string => {
  const [local, domain] = email.split('@');
  if (!domain) return email;
  const masked = local.length > 2 
    ? local[0] + '***' + local.slice(-1)
    : local[0] + '***';
  return `${masked}@${domain}`;
};

export const AuthModal = ({ open, onOpenChange, initialRole, initialTab }: AuthModalProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const signups = useFeature('signups');

  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [companyName, setCompanyName] = useState('');
  // v3.163.0 — employer verification fields, requested directly. Checked
  // server side by handle_new_user_profile (email domain vs personal-email
  // providers, email domain vs company website, country vs US/CA) — these
  // are collected here but the trigger is the actual enforcement.
  const [positionTitle, setPositionTitle] = useState('');
  const [phone, setPhone] = useState('');
  const [companyWebsite, setCompanyWebsite] = useState('');
  const [companyAddress, setCompanyAddress] = useState('');
  const [companyCountry, setCompanyCountry] = useState<'US' | 'CA' | ''>('');
  // v2.10.0 — role picker on signup. job_seekers get instant access; employers
  // sit in pending_approval until the AYN team activates them.
  const [signupRole, setSignupRole] = useState<'job_seeker' | 'employer'>(initialRole || 'employer');
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  // Landing CTAs choose the side before the modal opens.
  useEffect(() => {
    if (open && initialRole) setSignupRole(initialRole);
  }, [open, initialRole]);
  
  // New states for reset confirmation view
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [resetSentToEmail, setResetSentToEmail] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  
  // Rate limit state
  const [rateLimitedUntil, setRateLimitedUntil] = useState<number | null>(null);
  const [rateLimitCountdown, setRateLimitCountdown] = useState(0);
  
  const { toast } = useToast();
  const { t } = useLanguage();
  
  // Rate limit countdown effect
  const startRateLimitCountdown = (seconds: number) => {
    setRateLimitedUntil(Date.now() + seconds * 1000);
    setRateLimitCountdown(seconds);
    
    const interval = setInterval(() => {
      setRateLimitCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setRateLimitedUntil(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // Client-side fallback when Supabase returns a 429 without an explicit retry window.
  // Keep this short for testing; in production you can raise it if needed.
  const PASSWORD_RESET_RATE_LIMIT_SECONDS = 60;
  
  // Format countdown for display (e.g., "59:45" or "1:00:00")
  const formatCountdown = (seconds: number): string => {
    if (seconds >= 3600) {
      const hours = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      const secs = seconds % 60;
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleForgotPassword = async () => {
    if (!email) {
      toast({
        title: t('auth.emailRequired'),
        description: t('auth.emailRequiredDesc'),
        variant: "destructive"
      });
      return;
    }
    
    // Check if currently rate limited
    if (rateLimitedUntil && Date.now() < rateLimitedUntil) {
      toast({
        title: t('auth.rateLimitTitle'),
        description: t('auth.rateLimitDesc').replace('{time}', formatCountdown(rateLimitCountdown)),
        variant: "destructive"
      });
      return;
    }

    setIsResettingPassword(true);
    try {
      // Check if email is registered before sending reset
      const { data: checkData } = await supabase.functions.invoke('check-email-exists', {
        body: { email: email.trim().toLowerCase() },
      });

      if (checkData && checkData.exists === false) {
        toast({
          title: t('auth.emailNotRegistered'),
          description: t('auth.emailNotRegisteredDesc'),
          variant: "destructive"
        });
        setIsResettingPassword(false);
        return;
      }

      // Call Supabase's built-in reset (required - contains the actual reset link)
      localStorage.setItem('password_reset_email', email.trim().toLowerCase());
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        // Check for rate limit error
        const errorCode = (error as { code?: string }).code;
        const isRateLimited = 
          errorCode === 'over_email_send_rate_limit' ||
          error.message?.toLowerCase().includes('rate limit') ||
          error.message?.toLowerCase().includes('too many requests') ||
          (error as { status?: number }).status === 429;
        
        if (isRateLimited) {
          // Start a short countdown so testing isn't blocked for an hour.
          // Supabase may still enforce its own server-side limits.
          startRateLimitCountdown(PASSWORD_RESET_RATE_LIMIT_SECONDS);
          toast({
            title: t('auth.rateLimitTitle'),
            description: t('auth.rateLimitDesc').replace('{time}', formatCountdown(PASSWORD_RESET_RATE_LIMIT_SECONDS)),
            variant: "destructive"
          });
        } else {
          toast({
            title: t('common.error'),
            description: error.message,
            variant: "destructive"
          });
        }
      } else {
        // Auth Hook now handles branded email via Resend - no duplicate needed
        // Show confirmation view
        setResetSentToEmail(email);
        setResetEmailSent(true);
        
        // Start cooldown for resend button (10s for testing, can increase to 60s for production)
        setResendCooldown(10);
        const interval = setInterval(() => {
          setResendCooldown((prev) => {
            if (prev <= 1) {
              clearInterval(interval);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      }
    } catch (error) {
      toast({
        title: t('common.error'),
        description: t('error.systemErrorDesc'),
        variant: "destructive"
      });
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleBackToSignIn = () => {
    setResetEmailSent(false);
    setResetSentToEmail('');
  };

  const handleGoogleSignIn = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (error) {
      toast({
        title: t('auth.authError'),
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast({
        title: t('auth.missingInfo'),
        description: t('auth.missingInfoDesc'),
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        // Special handling: email not confirmed
        const code = (error as { code?: string }).code;
        if (code === 'email_not_confirmed' || /email not confirmed/i.test(error.message)) {
          try {
            const { error: resendError } = await supabase.auth.resend({
              type: 'signup',
              email,
              options: { emailRedirectTo: `${window.location.origin}/` }
            });
            
            if (resendError) {
              // Check for rate limit on resend
              const resendCode = (resendError as { code?: string }).code;
              const isRateLimited = 
                resendCode === 'over_email_send_rate_limit' ||
                resendError.message?.toLowerCase().includes('rate limit') ||
                (resendError as { status?: number }).status === 429;
              
              if (isRateLimited) {
                toast({
                  title: t('auth.verifyEmail'),
                  description: 'A verification email was already sent. Please check your inbox and spam folder.',
                });
              } else {
                toast({ 
                  title: t('auth.verificationError'), 
                  description: t('auth.verificationErrorDesc'), 
                  variant: 'destructive'
                });
              }
            } else {
              toast({
                title: t('auth.verifyEmail'),
                description: t('auth.verifyEmailDesc'),
              });
            }
          } catch (e) {
            toast({ 
              title: t('auth.verifyEmail'), 
              description: 'A verification email was already sent. Please check your inbox and spam folder.'
            });
          }
        } else {
          // Parse error for user-friendly message
          const errorMsg = error.message?.toLowerCase() || '';
          const friendlyDesc = errorMsg.includes('invalid login') || errorMsg.includes('invalid credentials')
            ? t('error.invalidCredentialsDesc')
            : error.message;
          toast({
            title: t('auth.authError'),
            description: friendlyDesc,
            variant: 'destructive'
          });
        }
      } else {
        toast({
          title: t('auth.welcomeBack'),
          description: t('auth.welcomeBackDesc')
        });
        onOpenChange(false);
        // Reset form
        setEmail('');
        setPassword('');
      }
    } catch (error) {
      toast({
        title: t('error.systemError'),
        description: t('error.systemErrorDesc'),
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    const employerFieldsMissing = signupRole === 'employer' && (
      !companyName || !positionTitle || !phone || !companyWebsite || !companyAddress || !companyCountry
    );
    if (!email || !password || !fullName || employerFieldsMissing) {
      toast({
        title: t('auth.missingInfo'),
        description: t('auth.missingInfoDesc'),
        variant: "destructive"
      });
      return;
    }

    if (!acceptedTerms) {
      toast({
        title: t('auth.termsRequired'),
        description: t('auth.termsRequiredDesc'),
        variant: "destructive"
      });
      return;
    }

    // v3.33.0 — the consent record is written server side by the account
    // creation trigger, from this metadata, in the same transaction as the
    // account. If we have no version to record, we do not create the account.
    const consent = consentSignupMetadata();
    if (!consent) {
      toast({
        title: t('auth.termsRequired'),
        description: 'We could not read the current document versions. Please reload and try again.',
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: {
            full_name: fullName,
            company_name: companyName,
            role: signupRole,
            ...(signupRole === 'employer' ? {
              position_title: positionTitle,
              phone,
              company_website: companyWebsite,
              company_address: companyAddress,
              company_country: companyCountry,
            } : {}),
            ...consent,
          }
        }
      });

      if (error) {

        toast({
          title: t('auth.registrationError'),
          description: error.message,
          variant: "destructive"
        });
      } else if (data.user?.identities?.length === 0) {
        // User already exists - Supabase doesn't return error for security
        toast({
          title: t('auth.emailAlreadyRegistered'),
          description: t('auth.emailAlreadyRegisteredDesc'),
          variant: "destructive"
        });
      } else {
        // v3.36.0 — role and employer_accounts used to be stamped here, right
        // after signUp() returns. With email confirmation on there is no
        // session at that moment, so this ran unauthenticated, RLS silently
        // filtered it to zero rows, and every employer signup became a job
        // seeker with no company account. handle_new_user_profile now reads
        // role and company_name out of the same signup metadata directly,
        // in the same transaction as the account, so it can never miss.
        if (data.user) {
          // v3.33.0 — the acceptance itself is already recorded by the account
          // creation trigger. This only attaches the IP, which only the server
          // can see, and it is allowed to fail without losing the record.
          void attachConsentIp('signup');
        }

        // Send welcome email (async, don't block signup)
        try {
          await supabase.functions.invoke('send-email', {
            body: {
              to: email,
              userId: data.user?.id,
              emailType: 'welcome',
              data: { userName: fullName || 'there', role: signupRole }
            }
          });
        } catch (emailError) {
          console.warn('[AuthModal] Welcome email failed:', emailError);
        }

        toast({
          title: t('auth.registrationSuccess'),
          description: signupRole === 'employer'
            ? "Account created. Our team will review and reach out shortly."
            : t('auth.registrationSuccessDesc')
        });
        onOpenChange(false);
        // Reset form
        setEmail('');
        setPassword('');
        setFullName('');
        setCompanyName('');
        setPositionTitle('');
        setPhone('');
        setCompanyWebsite('');
        setCompanyAddress('');
        setCompanyCountry('');

        setSignupRole('employer');
        setAcceptedTerms(false);
      }
    } catch (error) {
      toast({
        title: t('error.systemError'),
        description: t('error.systemErrorDesc'),
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Reset confirmation view
  if (resetEmailSent) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent aria-describedby={undefined} className="ayn-auth-surface sm:max-w-md">
          <div className="flex flex-col items-center text-center py-6 space-y-6">
            {/* Success Icon */}
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-green-500" />
            </div>
            
            {/* Title */}
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-foreground">
                {t('auth.resetEmailSentTitle')}
              </h2>
              <p className="text-muted-foreground text-sm">
                {t('auth.resetEmailSentTo').replace('{email}', maskEmail(resetSentToEmail))}
              </p>
            </div>
            
            {/* Email Icon */}
            <div className="flex items-center gap-2 bg-muted/50 border border-border rounded-lg px-4 py-3">
              <Mail className="w-5 h-5 text-primary" />
              <span className="text-sm text-foreground/80">{maskEmail(resetSentToEmail)}</span>
            </div>
            
            {/* Check spam notice */}
            <p className="text-xs text-muted-foreground">
              {t('auth.checkSpamFolder')}
            </p>
            
            {/* Resend Button */}
            <Button
              variant="outline"
              onClick={handleForgotPassword}
              disabled={resendCooldown > 0 || isResettingPassword}
              className="w-full disabled:opacity-50"
            >
              {isResettingPassword && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {resendCooldown > 0 
                ? `${t('auth.sendAgain')} (${resendCooldown}s)`
                : t('auth.sendAgain')
              }
            </Button>
            
            {/* Back to Sign In */}
            <button
              type="button"
              onClick={handleBackToSignIn}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              {t('auth.backToSignIn')}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined} className="ayn-auth-surface sm:max-w-md max-h-[85dvh] p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
          <DialogTitle className="text-center text-2xl font-semibold ayn-auth-title">
            {t('auth.welcomeToAyn')}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue={initialTab || (initialRole ? 'signup' : 'signin')} className="w-full flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 pb-6">

          <TabsList className="ayn-auth-tabs grid w-full grid-cols-2">
            <TabsTrigger value="signin">{t('auth.signIn')}</TabsTrigger>
            <TabsTrigger value="signup">{t('auth.signUp')}</TabsTrigger>
          </TabsList>

          <TabsContent value="signin" className="space-y-4 mt-6">
            <Button
              type="button"
              variant="outline"
              className="ayn-auth-google w-full font-medium"
              onClick={handleGoogleSignIn}
            >
              <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              {t('auth.continueWithGoogle')}
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <Separator className="w-full" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">{t('auth.orDivider')}</span>
              </div>
            </div>

            <form onSubmit={handleSignIn} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="signin-email" className="ayn-auth-label">{t('auth.email')}</Label>
                <Input
                  id="signin-email"
                  type="email"
                  placeholder={t('auth.enterEmail')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  className="ayn-auth-input"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between rtl:flex-row-reverse">
                  <Label htmlFor="signin-password" className="ayn-auth-label">{t('auth.password')}</Label>
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    disabled={isResettingPassword}
                    className="text-sm ayn-auth-link hover:underline transition-colors disabled:opacity-50"
                  >
                    {isResettingPassword ? t('auth.forgotPasswordSending') : t('auth.forgotPassword')}
                  </button>
                </div>
                <Input
                  id="signin-password"
                  type="password"
                  placeholder={t('auth.enterPassword')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  className="ayn-auth-input"
                />
              </div>

              <Button
                type="submit"
                variant="default"
                className="ayn-ember-btn w-full"
                disabled={isLoading}
              >
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('auth.signIn')}
              </Button>
              
            </form>
          </TabsContent>

          <TabsContent value="signup" className="space-y-4 mt-6">
            <MaintenanceNotice feature="signups" />
            <Button
              type="button"
              variant="outline"
              className="ayn-auth-google w-full font-medium"
              onClick={handleGoogleSignIn}
            >
              <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              {t('auth.continueWithGoogle')}
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <Separator className="w-full" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">{t('auth.orDivider')}</span>
              </div>
            </div>

            <div className="text-center text-sm text-muted-foreground mb-4">
              {t('auth.signUpDesc')}
            </div>
            
            <form onSubmit={handleSignUp} className="space-y-4">
              {/* v2.10.0 — Role picker. Determines access model post-signup. */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSignupRole('job_seeker')}
                  className={`rounded-lg border p-3 text-left transition-all ${signupRole === 'job_seeker' ? 'ayn-auth-role-active' : 'border-border bg-muted/40 hover:border-foreground/25'}`}
                >
                  <div className="text-sm font-semibold text-foreground">I am looking for a job</div>
                  <div className="text-[11px] text-muted-foreground leading-tight mt-1">Resume Hub, tailored resumes, free to start</div>
                </button>
                <button
                  type="button"
                  onClick={() => setSignupRole('employer')}
                  className={`rounded-lg border p-3 text-left transition-all ${signupRole === 'employer' ? 'ayn-auth-role-active' : 'border-border bg-muted/40 hover:border-foreground/25'}`}
                >
                  <div className="text-sm font-semibold text-foreground">I am hiring</div>
                  <div className="text-[11px] text-muted-foreground leading-tight mt-1">Answer a short intake about the role, then see matching candidates (approval required)</div>
                </button>
              </div>

              <div className={signupRole === 'employer' ? 'grid grid-cols-1 sm:grid-cols-2 gap-4' : ''}>
                <div className="space-y-2">
                  <Label htmlFor="signup-name" className="ayn-auth-label">{t('auth.fullName')} *</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="signup-name"
                      type="text"
                      placeholder="Your full name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      disabled={isLoading}
                      className="ayn-auth-input pl-10"
                    />
                  </div>
                </div>

                {signupRole === 'employer' && (
                  <div className="space-y-2">
                    <Label htmlFor="signup-company" className="ayn-auth-label">Company name *</Label>
                    <div className="relative">
                      <Building className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="signup-company"
                        type="text"
                        placeholder="Company Name"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        disabled={isLoading}
                        className="ayn-auth-input pl-10"
                      />
                    </div>
                  </div>
                )}
              </div>

              {signupRole === 'employer' && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="signup-position" className="ayn-auth-label">Your position *</Label>
                      <Input
                        id="signup-position"
                        type="text"
                        placeholder="e.g. HR Manager"
                        value={positionTitle}
                        onChange={(e) => setPositionTitle(e.target.value)}
                        disabled={isLoading}
                        className="ayn-auth-input"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-phone" className="ayn-auth-label">Phone number *</Label>
                      <Input
                        id="signup-phone"
                        type="tel"
                        placeholder="+1 555 123 4567"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        disabled={isLoading}
                        className="ayn-auth-input"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-company-website" className="ayn-auth-label">Company website *</Label>
                    <Input
                      id="signup-company-website"
                      type="text"
                      placeholder="company.com"
                      value={companyWebsite}
                      onChange={(e) => setCompanyWebsite(e.target.value)}
                      disabled={isLoading}
                      className="ayn-auth-input"
                    />
                    <p className="text-[11px] text-muted-foreground leading-tight">
                      Your email must match this domain, so we can confirm you're really with this company.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-company-address" className="ayn-auth-label">Company address *</Label>
                    <Input
                      id="signup-company-address"
                      type="text"
                      placeholder="Street, city, state or province"
                      value={companyAddress}
                      onChange={(e) => setCompanyAddress(e.target.value)}
                      disabled={isLoading}
                      className="ayn-auth-input"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="ayn-auth-label">Country *</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setCompanyCountry('US')}
                        className={`rounded-lg border p-2.5 text-sm font-medium transition-all ${companyCountry === 'US' ? 'ayn-auth-role-active' : 'border-border bg-muted/40 hover:border-foreground/25'}`}
                      >
                        United States
                      </button>
                      <button
                        type="button"
                        onClick={() => setCompanyCountry('CA')}
                        className={`rounded-lg border p-2.5 text-sm font-medium transition-all ${companyCountry === 'CA' ? 'ayn-auth-role-active' : 'border-border bg-muted/40 hover:border-foreground/25'}`}
                      >
                        Canada
                      </button>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-tight">
                      AYN currently operates only in the United States and Canada.
                    </p>
                  </div>
                </>
              )}

              <div className="space-y-2">
                <Label htmlFor="signup-email" className="ayn-auth-label">
                  {signupRole === 'employer' ? `${t('auth.businessEmail')} *` : `${t('auth.email')} *`}
                </Label>
                <Input
                  id="signup-email"
                  type="email"
                  placeholder={signupRole === 'employer' ? 'john@company.com' : 'you@example.com'}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  className="ayn-auth-input"
                />
              </div>


              <div className="space-y-2">
                <Label htmlFor="signup-password" className="ayn-auth-label">{t('auth.password')} *</Label>
                <Input
                  id="signup-password"
                  type="password"
                  placeholder={t('auth.createPassword')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  className="ayn-auth-input"
                />
                <PasswordStrengthIndicator password={password} />
              </div>

              <div className="flex items-start gap-3">
                <Checkbox
                  id="terms-checkbox"
                  checked={acceptedTerms}
                  onCheckedChange={(checked) => setAcceptedTerms(checked === true)}
                  disabled={isLoading}
                  className="mt-0.5 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                />
                <label 
                  htmlFor="terms-checkbox" 
                  className="text-xs text-muted-foreground leading-relaxed cursor-pointer select-none"
                >
                  {t('auth.termsCheckboxLabel')}{' '}
                  <a 
                    href="/terms" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="ayn-auth-link hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {t('auth.termsLink')}
                </a>
                {' '}and{' '}
                <a
                  href="/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ayn-auth-link hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  Privacy Policy
                </a>
                {' '}(Terms {LEGAL.termsVersion} and Privacy {LEGAL.privacyVersion}, effective {LEGAL.effectiveDate}). We record the date, time and versions you accept.
                </label>
              </div>

              <Button
                type="submit"
                variant="default"
                className="ayn-ember-btn w-full"
                disabled={isLoading || !signups.enabled}
              >
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('auth.signUp')}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Building, User, KeyRound, CheckCircle2, ArrowLeft, Mail } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { useLanguage } from '@/contexts/LanguageContext';
import { PasswordStrengthIndicator } from './PasswordStrengthIndicator';

interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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

export const AuthModal = ({ open, onOpenChange }: AuthModalProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  
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
    if (!email || !password || !fullName || !companyName) {
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

    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: {
            full_name: fullName,
            company_name: companyName
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
        // Send welcome email (async, don't block signup)
        try {
          await supabase.functions.invoke('send-email', {
            body: {
              to: email,
              emailType: 'welcome',
              data: { userName: fullName || 'there' }
            }
          });
          console.log('[AuthModal] Welcome email sent');
        } catch (emailError) {
          console.warn('[AuthModal] Welcome email failed:', emailError);
          // Don't block signup if email fails
        }

        toast({
          title: t('auth.registrationSuccess'),
          description: t('auth.registrationSuccessDesc')
        });
        onOpenChange(false);
        // Reset form
        setEmail('');
        setPassword('');
        setFullName('');
        setCompanyName('');
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
        <DialogContent className="bg-neutral-950 border border-white/20 backdrop-blur-xl shadow-2xl sm:max-w-md">
          <div className="flex flex-col items-center text-center py-6 space-y-6">
            {/* Success Icon */}
            <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-green-500" />
            </div>
            
            {/* Title */}
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-white">
                {t('auth.resetEmailSentTitle')}
              </h2>
              <p className="text-muted-foreground text-sm">
                {t('auth.resetEmailSentTo').replace('{email}', maskEmail(resetSentToEmail))}
              </p>
            </div>
            
            {/* Email Icon */}
            <div className="flex items-center gap-2 bg-neutral-900/50 border border-white/10 rounded-lg px-4 py-3">
              <Mail className="w-5 h-5 text-primary" />
              <span className="text-sm text-white/80">{maskEmail(resetSentToEmail)}</span>
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
              className="w-full border-white/20 text-white hover:bg-white hover:text-neutral-950 disabled:opacity-50"
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
              className="flex items-center gap-2 text-sm text-white/70 hover:text-white transition-colors"
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
      <DialogContent className="bg-neutral-950 border border-white/20 backdrop-blur-xl shadow-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center gradient-text-hero text-2xl">
            {t('auth.welcomeToAyn')}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="signin" className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-neutral-900/80 border border-white/10">
            <TabsTrigger value="signin">{t('auth.signIn')}</TabsTrigger>
            <TabsTrigger value="signup">{t('auth.signUp')}</TabsTrigger>
          </TabsList>

          <TabsContent value="signin" className="space-y-4 mt-6">
            <Button
              type="button"
              variant="outline"
              className="w-full border-white/20 bg-white text-neutral-900 hover:bg-white/90 font-medium"
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
                <span className="bg-neutral-950 px-2 text-muted-foreground">{t('auth.orDivider')}</span>
              </div>
            </div>

            <form onSubmit={handleSignIn} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="signin-email" className="auth-label">{t('auth.email')}</Label>
                <Input
                  id="signin-email"
                  type="email"
                  placeholder={t('auth.enterEmail')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  className="bg-neutral-900/80 border-white/15 placeholder:text-gray-400 auth-input-text"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between rtl:flex-row-reverse">
                  <Label htmlFor="signin-password" className="auth-label">{t('auth.password')}</Label>
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    disabled={isResettingPassword}
                    className="text-sm text-white/80 hover:text-white hover:underline transition-colors disabled:opacity-50"
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
                  className="bg-neutral-900/80 border-white/15 placeholder:text-gray-400 auth-input-text"
                />
              </div>

              <Button
                type="submit"
                variant="default"
                className="w-full"
                disabled={isLoading}
              >
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('auth.signIn')}
              </Button>
              
            </form>
          </TabsContent>

          <TabsContent value="signup" className="space-y-4 mt-6">
            <Button
              type="button"
              variant="outline"
              className="w-full border-white/20 bg-white text-neutral-900 hover:bg-white/90 font-medium"
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
                <span className="bg-neutral-950 px-2 text-muted-foreground">{t('auth.orDivider')}</span>
              </div>
            </div>

            <div className="text-center text-sm text-muted-foreground mb-4">
              {t('auth.signUpDesc')}
            </div>
            
            <form onSubmit={handleSignUp} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-name" className="auth-label">{t('auth.fullName')} *</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="signup-name"
                      type="text"
                      placeholder="John Doe"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      disabled={isLoading}
                      className="bg-neutral-900/80 border-white/15 placeholder:text-gray-400 pl-10 auth-input-text"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="signup-company" className="auth-label">{t('auth.company')} *</Label>
                  <div className="relative">
                    <Building className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="signup-company"
                      type="text"
                      placeholder="Company Name"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      disabled={isLoading}
                      className="bg-neutral-900/80 border-white/15 placeholder:text-gray-400 pl-10 auth-input-text"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="signup-email" className="auth-label">{t('auth.businessEmail')} *</Label>
                <Input
                  id="signup-email"
                  type="email"
                  placeholder="john@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  className="bg-neutral-900/80 border-white/15 placeholder:text-gray-400 auth-input-text"
                />
              </div>


              <div className="space-y-2">
                <Label htmlFor="signup-password" className="auth-label">{t('auth.password')} *</Label>
                <Input
                  id="signup-password"
                  type="password"
                  placeholder={t('auth.createPassword')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  className="bg-neutral-900/80 border-white/15 placeholder:text-gray-400 auth-input-text"
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
                  className="text-xs text-white/70 leading-relaxed cursor-pointer select-none"
                >
                  {t('auth.termsCheckboxLabel')}{' '}
                  <a 
                    href="/terms" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-cyan-400 hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {t('auth.termsLink')}
                  </a>
                </label>
              </div>

              <Button
                type="submit"
                variant="default"
                className="w-full"
                disabled={isLoading}
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

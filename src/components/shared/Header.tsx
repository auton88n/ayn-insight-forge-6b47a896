import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Brain, Menu, LogIn, LogOut, User } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AuthModal } from '@/components/auth/AuthModal';
import { supabase } from '@/integrations/supabase/client';
import type { User as SupabaseUser } from '@supabase/supabase-js';

const navLinks = [
{ path: '/', en: 'Home', fr: 'Accueil', ar: 'الرئيسية' },
{ path: '/#how', en: 'How it works', fr: 'Comment ça marche', ar: 'كيف يعمل' },
{ path: '/#features', en: 'Features', fr: 'Fonctionnalités', ar: 'المميزات' },
{ path: '/#employers', en: 'For employers', fr: 'Employeurs', ar: 'لأصحاب العمل' },
{ path: '/pricing', en: 'Pricing', fr: 'Tarifs', ar: 'الأسعار' },
{ path: '/contact', en: 'Contact', fr: 'Contact', ar: 'تواصل معنا' }];


export const Header = () => {
  const { language } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [user, setUser] = useState<SupabaseUser | null>(null);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  const handleNavClick = useCallback((e: React.MouseEvent, path: string) => {
    if (path.includes('#')) {
      e.preventDefault();
      const hash = path.split('#')[1];
      if (location.pathname !== '/') {
        navigate('/');
        setTimeout(() => {
          document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      } else {
        document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [location.pathname, navigate]);

  const isActive = (path: string) => {
    if (path.includes('#')) return false;
    return location.pathname === path;
  };

  const getLabel = (link: typeof navLinks[0]) =>
  language === 'ar' ? link.ar : language === 'fr' ? link.fr : link.en;

  // The landing page runs the dark Charcoal and Ember system, other marketing
  // pages stay on the light surface, so the bar flips its palette by route.
  const onLanding = location.pathname === '/';
  const inkStrong = '#0a0a0f';
  const inkSoft = onLanding ? 'rgba(10,10,15,0.55)' : 'rgba(10,10,15,0.50)';
  const pillBg = onLanding ? 'rgba(255,255,255,0.82)' : 'rgba(255,255,255,0.95)';
  const pillBorder = onLanding ? 'rgba(10,10,15,0.08)' : 'rgba(10,10,15,0.10)';
  const pillShadow = onLanding ? '0 2px 14px -6px rgba(10,10,15,0.12)' : '0 1px 8px rgba(0,0,0,0.06)';
  const headFont = onLanding ? "'Outfit', system-ui, sans-serif" : "'Space Grotesk', 'Geist', system-ui, sans-serif";

  return (
    <>
      {/* Fixed top bar — transparent, no border, no background */}
      <nav className="fixed top-0 left-0 right-0 z-50" style={{ padding: 'clamp(12px,2.5vw,20px) clamp(16px,4vw,32px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>

        {/* Mobile brand — left */}
        <Link to="/" className="md:hidden" style={{ position: 'absolute', left: 'clamp(16px,4vw,32px)', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
          <span style={{ fontFamily: headFont, fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', color: inkStrong }}>AYN</span>
        </Link>

        {/* Centered glassmorphism pill — desktop / large tablets only */}
        <div className="hidden md:flex" style={{
          alignItems: 'center', gap: 28,
          padding: '9px 24px',
          borderRadius: 9999,
          background: pillBg,
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: `1px solid ${pillBorder}`,
          boxShadow: pillShadow,
        }}>
          {navLinks.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              onClick={(e) => handleNavClick(e, link.path)}
              style={{
                fontFamily: headFont,
                fontSize: 14,
                fontWeight: isActive(link.path) ? 500 : 400,
                color: isActive(link.path) ? inkStrong : inkSoft,
                textDecoration: 'none',
                transition: 'color 0.15s',
                whiteSpace: 'nowrap',
                letterSpacing: '-0.01em',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = inkStrong)}
              onMouseLeave={e => (e.currentTarget.style.color = isActive(link.path) ? inkStrong : inkSoft)}
            >
              {getLabel(link)}
            </Link>
          ))}
        </div>



        {/* Right side — EN + Get Started Free — absolutely positioned */}
        <div style={{ position: 'absolute', right: 'clamp(12px,4vw,32px)', top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', gap: 'clamp(8px,2vw,20px)' }}>

          {/* Auth — desktop */}
          <div className="hidden md:block">
            {user ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: inkSoft }}>
                  {user.email?.split('@')[0]}
                </span>
                <button onClick={handleSignOut} style={{ background: 'none', border: 'none', cursor: 'pointer', color: inkSoft, padding: 4 }} title="Sign out">
                  <LogOut size={15} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowAuthModal(true)}
                style={{
                  fontFamily: headFont,
                  fontSize: 13, fontWeight: 600,
                  color: '#fff',
                  background: onLanding ? 'linear-gradient(135deg, #e85d3a 0%, #f2833f 100%)' : '#0a0a0f',
                  border: 'none',
                  borderRadius: 999,
                  padding: '9px 20px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  letterSpacing: '-0.01em',
                  boxShadow: onLanding ? '0 10px 26px -14px rgba(232,93,58,0.95)' : 'none',
                  transition: 'filter 0.15s, background 0.15s, transform 0.1s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.filter = 'brightness(1.08)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.filter = 'none'; }}
                onMouseDown={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.98)'; }}
                onMouseUp={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
              >
                Start Free
              </button>
            )}
          </div>

          {/* Mobile hamburger */}
          <div className="md:hidden">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" style={{ color: inkStrong }} aria-label="Open menu">

                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[280px]">
                <div className="flex flex-col gap-6 pt-8">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-foreground flex items-center justify-center">
                      <Brain className="w-6 h-6 text-background" />
                    </div>
                    <span className="text-2xl font-bold">AYN</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    {navLinks.map((link) => (
                      <Link key={link.path} to={link.path} onClick={(e) => handleNavClick(e, link.path)}
                        className={cn('py-2.5 px-3 rounded-lg text-sm font-medium transition-colors',
                          isActive(link.path) ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50')}>
                        {getLabel(link)}
                      </Link>
                    ))}
                  </div>
                  <div className="h-px bg-border" />
                  {user ? (
                    <div className="space-y-2 px-3">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <User className="w-4 h-4" /><span className="truncate">{user.email}</span>
                      </div>
                      <Button variant="outline" className="w-full" onClick={handleSignOut}>
                        <LogOut className="h-4 w-4 mr-2" />
                        {language === 'ar' ? 'تسجيل خروج' : 'Sign Out'}
                      </Button>
                    </div>
                  ) : (
                    <div className="px-3">
                      <Button className="w-full" onClick={() => setShowAuthModal(true)}>
                        <LogIn className="h-4 w-4 mr-2" />
                        {language === 'ar' ? 'ابدأ مجاناً' : 'Start Free'}
                      </Button>
                    </div>
                  )}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </nav>

      <AuthModal open={showAuthModal} onOpenChange={setShowAuthModal} />
    </>);

};
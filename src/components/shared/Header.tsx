import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Brain, Menu, LogIn, LogOut, User } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AuthModal } from '@/components/auth/AuthModal';
import { supabase } from '@/integrations/supabase/client';
import type { User as SupabaseUser } from '@supabase/supabase-js';

const navLinks = [
{ path: '/', en: 'Home', fr: 'Accueil', ar: 'الرئيسية' },
{ path: '/#about', en: 'About', fr: 'À Propos', ar: 'من نحن' },
{ path: '/#features', en: 'Features', fr: 'Fonctionnalités', ar: 'المميزات' },
{ path: '/#solutions', en: 'Solutions', fr: 'Solutions', ar: 'الحلول' },
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

  return (
    <>
      {/* Fixed top bar — transparent, no border, no background */}
      <nav className="fixed top-0 left-0 right-0 z-50" style={{ padding: '20px 32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>

        {/* Centered glassmorphism pill */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 28,
          padding: '9px 24px',
          borderRadius: 9999,
          background: 'rgba(255,255,255,0.95)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid rgba(10,10,15,0.10)',
          boxShadow: '0 1px 8px rgba(0,0,0,0.06)',
        }}>
          {navLinks.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              onClick={(e) => handleNavClick(e, link.path)}
              style={{
                fontFamily: "'Space Grotesk', 'Geist', system-ui, sans-serif",
                fontSize: 14,
                fontWeight: isActive(link.path) ? 500 : 400,
                color: isActive(link.path) ? '#0a0a0f' : 'rgba(10,10,15,0.50)',
                textDecoration: 'none',
                transition: 'color 0.15s',
                whiteSpace: 'nowrap',
                letterSpacing: '-0.01em',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = '#0a0a0f')}
              onMouseLeave={e => (e.currentTarget.style.color = isActive(link.path) ? '#0a0a0f' : 'rgba(10,10,15,0.50)')}
            >
              {getLabel(link)}
            </Link>
          ))}
        </div>

        {/* Right side — EN + Get Started Free — absolutely positioned */}
        <div style={{ position: 'absolute', right: 32, top: '50%', transform: 'translateY(-50%)', display: 'flex', alignItems: 'center', gap: 20 }}>
          <LanguageSwitcher />

          {/* Auth — desktop */}
          <div className="hidden md:block">
            {user ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>
                  {user.email?.split('@')[0]}
                </span>
                <button onClick={handleSignOut} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', padding: 4 }} title="Sign out">
                  <LogOut size={15} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowAuthModal(true)}
                style={{
                  fontFamily: "'Space Grotesk', 'Geist', system-ui, sans-serif",
                  fontSize: 13, fontWeight: 500,
                  color: '#fff',
                  background: '#0a0a0f',
                  border: 'none',
                  borderRadius: 8,
                  padding: '8px 18px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  letterSpacing: '-0.01em',
                  transition: 'background 0.15s, transform 0.1s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#1a1a2e'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#0a0a0f'; }}
                onMouseDown={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.98)'; }}
                onMouseUp={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
              >
                {language === 'ar' ? 'طلب عرض' : language === 'fr' ? 'Demander une démo' : 'Request Demo'}
              </button>
            )}
          </div>

          {/* Mobile hamburger */}
          <div className="md:hidden">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" style={{ color: '#fff' }}>
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
                        {language === 'ar' ? 'طلب عرض' : 'Request Demo'}
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
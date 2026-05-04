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
{ path: '/services', en: 'Services', fr: 'Services', ar: 'الخدمات' },
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

  return (
    <>
      {/* Fixed top bar — transparent, no border, no background */}
      <nav className="fixed top-0 left-0 right-0 z-50" style={{ padding: '20px 32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>

        {/* Centered glassmorphism pill */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 32,
          padding: '10px 28px',
          borderRadius: 9999,
          background: 'rgba(255,255,255,0.85)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(0,0,0,0.08)',
          boxShadow: '0 2px 20px rgba(0,0,0,0.08)',
        }}>
          {navLinks.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              onClick={(e) => handleNavClick(e, link.path)}
              style={{
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 14,
                fontWeight: isActive(link.path) ? 600 : 400,
                color: isActive(link.path) ? '#FB923C' : 'rgba(10,10,10,0.65)',
                textDecoration: 'none',
                transition: 'color 0.2s',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = '#FB923C')}
              onMouseLeave={e => (e.currentTarget.style.color = isActive(link.path) ? '#FB923C' : 'rgba(10,10,10,0.65)')}
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
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 14, fontWeight: 700,
                  color: '#fff',
                  background: '#FB923C',
                  border: 'none',
                  borderRadius: 9999,
                  padding: '9px 22px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'background 0.2s, transform 0.2s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#f97316'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#FB923C'; }}
              >
                {language === 'ar' ? 'ابدأ مجاناً' : language === 'fr' ? 'Commencer' : 'Get Started Free'}
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
                        {language === 'ar' ? 'ابدأ مجاناً' : 'Get Started Free'}
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
import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Brain, Menu, LogIn, LogOut, User } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { LanguageSwitcher } from '@/components/shared/LanguageSwitcher';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button, LiquidButton } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AuthModal } from '@/components/auth/AuthModal';
import { spineAuth, type SpineUser } from '@/lib/spineAuth';

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
  const [user, setUser] = useState<SpineUser | null>(null);

  useEffect(() => {
    const { data: { subscription } } = spineAuth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    spineAuth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    await spineAuth.signOut();
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
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/50">
        <div className="container max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-foreground flex items-center justify-center">
              <Brain className="w-5 h-5 text-background" />
            </div>
            <span className="text-xl font-bold text-orange-500">AYN</span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-6 text-sm font-medium">
            {navLinks.map((link) =>
            <Link
              key={link.path}
              to={link.path}
              onClick={(e) => handleNavClick(e, link.path)}
              className={cn(
                'relative transition-colors py-1',
                isActive(link.path) ?
                'text-foreground after:content-[""] after:absolute after:left-0 after:right-0 after:-bottom-0.5 after:h-[2px] after:bg-orange-500 after:rounded-full' :
                'text-muted-foreground hover:text-foreground'
              )}>
              
                {getLabel(link)}
              </Link>
            )}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2">
            <LanguageSwitcher />

            {/* Auth button - desktop */}
            <div className="hidden md:block">
              {user ?
              <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-muted text-sm">
                    <User className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground max-w-[120px] truncate">
                      {user.email?.split('@')[0]}
                    </span>
                  </div>
                  <Button variant="ghost" size="icon" onClick={handleSignOut} title={language === 'ar' ? 'تسجيل خروج' : language === 'fr' ? 'Déconnexion' : 'Sign out'}>
                    <LogOut className="h-4 w-4" />
                  </Button>
                </div> :

              <LiquidButton size="sm" onClick={() => setShowAuthModal(true)} className="gap-1.5">
                  {language === 'ar' ? 'ابدأ مجاناً' : language === 'fr' ? 'Commencer gratuitement' : 'Get Started Free'}
                </LiquidButton>
              }
            </div>

            {/* Mobile menu */}
            <div className="md:hidden">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-[280px]">
                  <div className="flex flex-col gap-6 pt-8">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-foreground flex items-center justify-center">
                        <Brain className="w-6 h-6 text-background" />
                      </div>
                      <span className="text-2xl font-bold text-orange-500">AYN</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      {navLinks.map((link) =>
                      <Link
                        key={link.path}
                        to={link.path}
                        onClick={(e) => handleNavClick(e, link.path)}
                        className={cn(
                          'py-2.5 px-3 rounded-lg text-sm font-medium transition-colors',
                          isActive(link.path) ?
                          'bg-muted text-foreground' :
                          'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                        )}>
                        
                          {getLabel(link)}
                        </Link>
                      )}
                    </div>

                    <div className="h-px bg-border" />

                    {/* Auth - mobile */}
                    {user ?
                    <div className="space-y-2 px-3">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <User className="w-4 h-4" />
                          <span className="truncate">{user.email}</span>
                        </div>
                        <Button variant="outline" className="w-full" onClick={handleSignOut}>
                          <LogOut className="h-4 w-4 mr-2" />
                          {language === 'ar' ? 'تسجيل خروج' : language === 'fr' ? 'Déconnexion' : 'Sign Out'}
                        </Button>
                      </div> :

                    <div className="px-3">
                        <LiquidButton className="w-full" onClick={() => setShowAuthModal(true)}>
                          <LogIn className="h-4 w-4 mr-2" />
                          {language === 'ar' ? 'ابدأ مجاناً' : language === 'fr' ? 'Commencer gratuitement' : 'Get Started Free'}
                        </LiquidButton>
                      </div>
                    }
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </nav>

      <AuthModal open={showAuthModal} onOpenChange={setShowAuthModal} />
    </>);

};
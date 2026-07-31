import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Brain, Menu, LogOut, User } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { AuthModal } from '@/components/auth/AuthModal';
import { supabase } from '@/integrations/supabase/client';
import type { User as SupabaseUser } from '@supabase/supabase-js';

const navLinks = [
{ path: '/', en: 'Home' },
{ path: '/#how', en: 'How it works' },
{ path: '/#features', en: 'Features' },
{ path: '/#employers', en: 'For employers' },
{ path: '/pricing', en: 'Pricing' },
{ path: '/contact', en: 'Contact' }];

const EMBER = 'linear-gradient(135deg, #e85d3a 0%, #f2833f 100%)';

export const Header = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

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
    setSheetOpen(false);
    if (path.includes('#')) {
      e.preventDefault();
      const hash = path.split('#')[1];
      if (location.pathname !== '/') {
        navigate('/');
        setTimeout(() => {
          document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      } else {
        window.location.hash = hash;
        document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [location.pathname, navigate]);

  const isActive = (path: string) => {
    if (path.includes('#')) return false;
    return location.pathname === path;
  };

  // The landing page runs the warm Ember system, other marketing pages stay on
  // the light surface, so the bar flips its palette by route.
  const onLanding = location.pathname === '/';
  const inkStrong = '#0a0a0f';
  const inkSoft = onLanding ? 'rgba(10,10,15,0.55)' : 'rgba(10,10,15,0.50)';
  const pillBg = onLanding ? 'rgba(255,255,255,0.82)' : 'rgba(255,255,255,0.95)';
  const pillBorder = onLanding ? 'rgba(10,10,15,0.08)' : 'rgba(10,10,15,0.10)';
  const pillShadow = onLanding ? '0 2px 14px -6px rgba(10,10,15,0.12)' : '0 1px 8px rgba(0,0,0,0.06)';
  const headFont = onLanding ? "'Outfit', system-ui, sans-serif" : "'Space Grotesk', 'Geist', system-ui, sans-serif";

  const ctaBackground = onLanding ? EMBER : '#0a0a0f';

  return (
    <>
      {/*
        Fixed top bar. One flex row with three cells (brand, nav pill, CTA) so
        the centered pill can never sit underneath the right hand button at
        tablet widths. The full desktop layout only appears at lg and up.
      */}
      <nav
        className="fixed top-0 left-0 right-0 z-50"
        style={{
          paddingTop: 'calc(clamp(14px,2.5vw,20px) + env(safe-area-inset-top, 0px))',
          paddingBottom: 'clamp(14px,2.5vw,20px)',
          paddingInline: 'clamp(16px,4vw,32px)',
          display: 'flex',
          alignItems: 'center',
          gap: 16,
        }}
      >

        {/* Brand — left cell */}
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', flex: '0 0 auto' }}>
          <span style={{ fontFamily: headFont, fontSize: 19, fontWeight: 700, letterSpacing: '-0.02em', color: inkStrong }}>AYN</span>
        </Link>

        {/* Centered glassmorphism pill — desktop only */}
        <div className="hidden lg:flex" style={{
          flex: '1 1 auto',
          justifyContent: 'center',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 28,
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
                {link.en}
              </Link>
            ))}
          </div>
        </div>

        {/* Right cell — auth on desktop, menu button below lg */}
        <div style={{ flex: '1 1 auto', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12 }}>

          {/* Auth — desktop */}
          <div className="hidden lg:block">
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
                  background: ctaBackground,
                  border: 'none',
                  borderRadius: 999,
                  padding: '10px 22px',
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

          {/* Compact menu — phone and tablet */}
          <div className="lg:hidden">
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild>
                <button
                  aria-label="Open menu"
                  style={{
                    width: 42, height: 42,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: 999,
                    background: pillBg,
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    border: `1px solid ${pillBorder}`,
                    boxShadow: pillShadow,
                    color: inkStrong,
                    cursor: 'pointer',
                  }}
                >
                  <Menu className="h-5 w-5" />
                </button>
              </SheetTrigger>
              <SheetContent
                side="right"
                className="w-[320px] max-w-[86vw] border-l"
                style={{ background: onLanding ? '#fffdfa' : undefined }}
              >
                <div
                  className="flex flex-col gap-7"
                  style={{ paddingTop: 'max(1.5rem, env(safe-area-inset-top, 0px))' }}
                >
                  {/* Ember brand mark */}
                  <div className="flex items-center gap-3">
                    <div
                      className="w-11 h-11 rounded-2xl flex items-center justify-center"
                      style={{ background: EMBER, boxShadow: '0 10px 24px -14px rgba(232,93,58,0.95)' }}
                    >
                      <Brain className="w-6 h-6" style={{ color: '#fff' }} />
                    </div>
                    <span style={{ fontFamily: headFont, fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', color: inkStrong }}>AYN</span>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    {navLinks.map((link) => {
                      const active = isActive(link.path);
                      return (
                        <Link
                          key={link.path}
                          to={link.path}
                          onClick={(e) => handleNavClick(e, link.path)}
                          style={{
                            fontFamily: headFont,
                            fontSize: 16,
                            fontWeight: active ? 600 : 500,
                            padding: '13px 14px',
                            borderRadius: 14,
                            textDecoration: 'none',
                            color: active ? '#c2410c' : 'rgba(10,10,15,0.62)',
                            background: active ? 'rgba(232,93,58,0.10)' : 'transparent',
                          }}
                        >
                          {link.en}
                        </Link>
                      );
                    })}
                  </div>

                  <div className="h-px" style={{ background: 'rgba(10,10,15,0.08)' }} />

                  {user ? (
                    <div className="space-y-3 px-1">
                      <div className="flex items-center gap-2 text-sm" style={{ color: inkSoft }}>
                        <User className="w-4 h-4" /><span className="truncate">{user.email}</span>
                      </div>
                      <button
                        onClick={() => { setSheetOpen(false); handleSignOut(); }}
                        style={{
                          width: '100%', padding: '13px 18px', borderRadius: 999,
                          fontFamily: headFont, fontSize: 15, fontWeight: 600,
                          color: '#c2410c', background: 'transparent',
                          border: '1.5px solid rgba(232,93,58,0.45)', cursor: 'pointer',
                        }}
                      >
                        Sign out
                      </button>
                    </div>
                  ) : (
                    <div className="px-1">
                      <button
                        onClick={() => { setSheetOpen(false); setShowAuthModal(true); }}
                        style={{
                          width: '100%', padding: '14px 20px', borderRadius: 999,
                          fontFamily: headFont, fontSize: 15, fontWeight: 600,
                          color: '#fff', background: EMBER, border: 'none',
                          boxShadow: '0 14px 30px -16px rgba(232,93,58,0.95)',
                          cursor: 'pointer',
                        }}
                      >
                        Start free
                      </button>
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

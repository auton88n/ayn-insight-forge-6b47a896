import { useState, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, LogOut, User, ArrowRight } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { AuthModal } from '@/components/auth/AuthModal';
import { supabase } from '@/integrations/supabase/client';
import aynLogo from '@/assets/ayn-logo.png';
import type { User as SupabaseUser } from '@supabase/supabase-js';

// v3.210.0 -- "/" and "/employers" are now two separate, committed pages,
// not one page toggling between two audiences. Which nav list renders is
// decided by the actual route, not a stored preference: every job-seeker
// route (which is most of the site) gets SEEKER_LINKS, and only "/employers"
// itself gets EMPLOYER_LINKS. Each audience's "How it works"/"Features"
// anchors now live on that audience's own single-identity route, so a
// hash link never has to flip anything else into view first.
const SEEKER_LINKS = [
{ path: '/', en: 'Home' },
{ path: '/jobs', en: 'Browse jobs' },
{ path: '/salary-guide', en: 'Salary guide' },
{ path: '/#proof', en: 'How it works' },
{ path: '/#features', en: 'Features' },
{ path: '/pricing', en: 'Pricing' },
{ path: '/contact', en: 'Contact' }];

const EMPLOYER_LINKS = [
{ path: '/employers', en: 'Home' },
{ path: '/employers#employers-how', en: 'How it works' },
{ path: '/employers#employers-features', en: 'Features' },
{ path: '/pricing', en: 'Pricing' },
{ path: '/contact', en: 'Contact' }];

const EMBER = 'linear-gradient(135deg, #e85d3a 0%, #f2833f 100%)';

export const Header = () => {
  const location = useLocation();
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

  const isEmployerRoute = location.pathname.startsWith('/employers');
  const navLinks = isEmployerRoute ? EMPLOYER_LINKS : SEEKER_LINKS;

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  const closeSheet = useCallback(() => setSheetOpen(false), []);

  // A <Link to="/"> clicked while already on "/" is a no-op for React
  // Router — same location, nothing re-renders, nothing scrolls — which
  // reads as "the Home button doesn't work" the moment the page is scrolled
  // past the hero (e.g. down in the employer section). Force the scroll
  // whenever the click target is the page we're already sitting on.
  const handleNavClick = useCallback((path: string) => {
    closeSheet();
    if (!path.includes('#') && path === location.pathname) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [closeSheet, location.pathname]);

  const isActive = (path: string) => {
    if (path.includes('#')) return false;
    return location.pathname === path;
  };

  // The landing page runs the warm Ember system, other marketing pages stay on
  // the light surface, so the bar flips its palette by route. "/employers" is
  // a landing page too now, not a toggle state on "/", so it gets the same
  // treatment.
  const onLanding = location.pathname === '/' || isEmployerRoute;
  const inkStrong = '#0a0a0f';
  const inkSoft = onLanding ? 'rgba(10,10,15,0.55)' : 'rgba(10,10,15,0.50)';
  const pillBg = onLanding ? 'rgba(255,255,255,0.82)' : 'rgba(255,255,255,0.95)';
  const pillBorder = onLanding ? 'rgba(10,10,15,0.08)' : 'rgba(10,10,15,0.10)';
  const pillShadow = onLanding ? '0 2px 14px -6px rgba(10,10,15,0.12)' : '0 1px 8px rgba(0,0,0,0.06)';
  const headFont = onLanding ? "'Outfit', system-ui, sans-serif" : "'Space Grotesk', 'Geist', system-ui, sans-serif";

  const ctaBackground = EMBER;

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
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none', flex: '1 1 0', minWidth: 0 }}>
          <img src={aynLogo} alt="AYN" style={{ height: 32, width: 'auto', display: 'block' }} />
        </Link>

        {/* Centered glassmorphism pill — desktop only */}
        <div className="hidden lg:flex" style={{
          flex: '0 0 auto',
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
                onClick={() => handleNavClick(link.path)}
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
        <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12 }}>

          {/* The other audience's door — a real, labeled link, not a toggle
              sharing the nav's weight. Only shown signed out, since a
              signed-in visitor already has a real destination via the auth
              block next to it. */}
          {!user && (
            <Link
              to={isEmployerRoute ? '/' : '/employers'}
              className="hidden lg:inline-flex"
              style={{
                alignItems: 'center', gap: 4,
                fontFamily: headFont, fontSize: 13, color: inkSoft,
                textDecoration: 'none', whiteSpace: 'nowrap', letterSpacing: '-0.01em',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = inkStrong)}
              onMouseLeave={e => (e.currentTarget.style.color = inkSoft)}
            >
              {isEmployerRoute ? 'Job seeker?' : 'Hiring?'} <ArrowRight size={12} />
            </Link>
          )}

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
                  boxShadow: '0 10px 26px -14px rgba(232,93,58,0.95)',
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
                  className="flex flex-col gap-5"
                  style={{ paddingTop: 'max(1.25rem, env(safe-area-inset-top, 0px))' }}
                >
                  <div className="flex items-center">
                    <img src={aynLogo} alt="AYN" style={{ height: 32, width: 'auto', display: 'block' }} />
                  </div>

                  {/*
                    Navigation scale, not display scale: 17px medium, 44px tap
                    target, 8px between rows, so all six links plus both
                    actions fit one 360px screen without scrolling.
                  */}
                  <div className="flex flex-col gap-2">
                    {navLinks.map((link) => {
                      const active = isActive(link.path);
                      return (
                        <Link
                          key={link.path}
                          to={link.path}
                          onClick={closeSheet}
                          style={{
                            fontFamily: headFont,
                            fontSize: 17,
                            lineHeight: '22px',
                            fontWeight: 500,
                            minHeight: 44,
                            display: 'flex',
                            alignItems: 'center',
                            padding: '11px 14px',
                            borderRadius: 12,
                            textDecoration: 'none',
                            letterSpacing: '-0.01em',
                            color: active ? '#c2410c' : 'rgba(10,10,15,0.66)',
                            background: active ? 'rgba(232,93,58,0.10)' : 'transparent',
                          }}
                        >
                          {link.en}
                        </Link>
                      );
                    })}
                  </div>

                  {!user && (
                    <Link
                      to={isEmployerRoute ? '/' : '/employers'}
                      onClick={closeSheet}
                      style={{
                        fontFamily: headFont, fontSize: 14, color: inkSoft,
                        textDecoration: 'none', padding: '0 14px',
                        display: 'flex', alignItems: 'center', gap: 4,
                      }}
                    >
                      {isEmployerRoute ? 'Looking for a job instead?' : 'Hiring instead?'} <ArrowRight size={12} />
                    </Link>
                  )}

                  <div className="h-px" style={{ background: 'rgba(10,10,15,0.08)' }} />

                  {user ? (
                    <div className="space-y-3 px-1">
                      <div className="flex items-center gap-2 text-sm" style={{ color: inkSoft }}>
                        <User className="w-4 h-4" /><span className="truncate">{user.email}</span>
                      </div>
                      <button
                        onClick={() => { setSheetOpen(false); handleSignOut(); }}
                        style={{
                          width: '100%', minHeight: 44, padding: '11px 18px', borderRadius: 999,
                          fontFamily: headFont, fontSize: 15, fontWeight: 600,
                          color: '#c2410c', background: 'transparent',
                          border: '1.5px solid rgba(232,93,58,0.45)', cursor: 'pointer',
                        }}
                      >
                        Sign out
                      </button>
                    </div>
                  ) : (
                    <div className="px-1 flex flex-col gap-2.5">
                      <button
                        onClick={() => { setSheetOpen(false); setShowAuthModal(true); }}
                        style={{
                          width: '100%', minHeight: 44, padding: '11px 18px', borderRadius: 999,
                          fontFamily: headFont, fontSize: 15, fontWeight: 600,
                          color: '#c2410c', background: 'transparent',
                          border: '1.5px solid rgba(232,93,58,0.40)', cursor: 'pointer',
                        }}
                      >
                        Sign in
                      </button>
                      <button
                        onClick={() => { setSheetOpen(false); setShowAuthModal(true); }}
                        style={{
                          width: '100%', minHeight: 44, padding: '12px 20px', borderRadius: 999,
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

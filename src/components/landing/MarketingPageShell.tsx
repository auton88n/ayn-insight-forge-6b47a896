/**
 * MarketingPageShell -- the one wrapper every seeker marketing page uses:
 * SEO, the collapsible SeekerSidebar, a closing "Start free" band, and
 * the shared LandingFooter. One shell means every one of the nine pages
 * split out at v3.214.0 reads as the same site, not nine separately
 * hand-built pages that drift apart over time.
 *
 * v3.215.0 -- the fixed top Header + horizontal MarketingSubNav strip is
 * gone, replaced by SeekerSidebar: a collapsible left nav, the same
 * structural shape Resume Hub's own icon rail already uses once someone
 * signs in, so these signed-out pages stop reading as a different kind
 * of site from the one behind sign-in.
 */
import { useState, type ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { SEO } from '@/components/shared/SEO';
import { AuthModal } from '@/components/auth/AuthModal';
import { SeekerSidebar } from './SeekerSidebar';
import { LandingFooter } from './LandingFooter';

type Props = {
  title: string;
  description: string;
  canonical: string;
  jsonLd?: object;
  /** A render function, not a plain node, so a page's own "Start free"
   *  buttons can open the ONE AuthModal this shell owns instead of every
   *  page mounting a second, independent instance of its own. */
  children: (onStartFree: () => void) => ReactNode;
  /** Overrides the default closing band's headline/lead for a page where
   *  the generic one doesn't quite fit. */
  closing?: { headline: string; lead: string };
};

const DEFAULT_CLOSING = {
  headline: 'Stop sending the same resume into the dark.',
  lead: 'Add your background once. Every application after that is written for the job, and every employer searching finds you too.',
};

export const MarketingPageShell = ({ title, description, canonical, jsonLd, children, closing }: Props) => {
  const [authOpen, setAuthOpen] = useState(false);
  const c = closing ?? DEFAULT_CLOSING;

  return (
    <>
      <SEO title={title} description={description} canonical={canonical} jsonLd={jsonLd} />
      <div className="lp lp-shell-with-sidebar">
        <SeekerSidebar />

        <main className="lp-sidebar-main">
          {children(() => setAuthOpen(true))}

          <section className="lp-section" style={{ paddingBlockStart: 0 }}>
            <div className="lp-shell">
              <div className="lp-closing lp-reveal">
                <h2 className="lp-display lp-h2" style={{ maxWidth: 760, marginInline: 'auto' }}>{c.headline}</h2>
                <p className="lp-lead" style={{ color: 'hsl(0 0% 100% / 0.85)' }}>{c.lead}</p>
                <div className="lp-cta-row" style={{ justifyContent: 'center', marginTop: 30 }}>
                  <button type="button" className="lp-btn lp-btn-invert" onClick={() => setAuthOpen(true)}>
                    Start free <ArrowRight size={15} />
                  </button>
                </div>
              </div>
            </div>
          </section>

          <LandingFooter />
        </main>
      </div>
      <AuthModal open={authOpen} onOpenChange={setAuthOpen} initialRole="job_seeker" />
    </>
  );
};

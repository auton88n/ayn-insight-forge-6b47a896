/**
 * LandingFooter -- the .lp-styled footer, extracted out of
 * LandingSections.tsx so every seeker page (Home plus every tab, and now
 * /jobs, /salary-guide and /check-resume too) shares the literal same
 * footer, not a lookalike copy.
 *
 * v3.221.0 -- reported directly, as a design call: the brand block (a
 * second AYN logo, the tagline, social icons) and the Navigate/Company
 * link columns are gone. SeekerSidebar already carries the real AYN mark
 * on every one of these pages, and every link this footer used to repeat
 * (Home, Pricing, Contact, About, Help, Legal) already lives in the
 * sidebar too -- a second copy of the same nav at the bottom of the page
 * was pure repetition, not a second, different use. What's left is the
 * one thing that's genuinely footer-only content: the copyright line and
 * the two legal/consent links nothing else on the page carries.
 */
import { Link } from 'react-router-dom';
import { openCookiePreferences } from '@/components/shared/CookieConsent';
import { COPYRIGHT_LINE } from '@/components/shared/siteLinks';

export const LandingFooter = () => (
  <footer className="lp-footer">
    <div className="lp-shell">
      <div className="lp-footer-bottom">
        <span>{COPYRIGHT_LINE}</span>
        <div className="lp-footer-bottom-links">
          <Link to="/privacy">Privacy Policy</Link>
          <button type="button" onClick={openCookiePreferences}>Cookie choices</button>
        </div>
      </div>
    </div>
  </footer>
);

/**
 * LandingFooter -- the .lp-styled footer, extracted out of
 * LandingSections.tsx so every seeker page (Home plus the nine pages split
 * out at v3.214.0) shares the literal same footer, not a lookalike copy.
 */
import { Link } from 'react-router-dom';
import { openCookiePreferences } from '@/components/shared/CookieConsent';
import { COPYRIGHT_LINE, COMPANY_TAGLINE, NAV_LINKS, COMPANY_LINKS } from '@/components/shared/siteLinks';
import aynLogo from '@/assets/ayn-logo.png';
import { Mail } from 'lucide-react';

const DiscordIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width={18} height={18}>
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.947 2.418-2.157 2.418z" />
  </svg>
);
const XIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width={16} height={16}>
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

export const LandingFooter = () => (
  <footer className="lp-footer">
    <div className="lp-shell">
      <div className="lp-footer-top">
        <div className="lp-footer-brand">
          <img src={aynLogo} alt="AYN" style={{ height: 30, width: 'auto' }} />
          <p className="lp-footer-tagline">{COMPANY_TAGLINE}</p>
          <div className="lp-footer-social">
            <a href="mailto:info@ayn.careers" aria-label="Email"><Mail size={18} /></a>
            <a href="https://discord.gg/y2DcBegbC7" target="_blank" rel="noopener noreferrer" aria-label="Discord"><DiscordIcon /></a>
            <a href="https://x.com/AYNN_AI" target="_blank" rel="noopener noreferrer" aria-label="X (Twitter)"><XIcon /></a>
          </div>
        </div>

        <div className="lp-footer-cols">
          <div className="lp-footer-col">
            <h4>Navigate</h4>
            <ul>
              {NAV_LINKS.map(l => (
                <li key={l.to}><Link to={l.to}>{l.label}</Link></li>
              ))}
            </ul>
          </div>
          <div className="lp-footer-col">
            <h4>Company</h4>
            <ul>
              {COMPANY_LINKS.map(l => (
                <li key={l.to}><Link to={l.to}>{l.label}</Link></li>
              ))}
            </ul>
          </div>
        </div>
      </div>

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

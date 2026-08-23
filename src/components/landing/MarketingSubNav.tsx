/**
 * MarketingSubNav -- one consistent strip of links across every seeker
 * marketing page, so the site reads as ONE connected product instead of a
 * scattering of standalone pages someone has to already know the URL for.
 *
 * v3.214.0 -- "each thing have its own page... think of it like Indeed's
 * design, even if you sign in": Indeed's own site never swaps its whole
 * shell depending on whether you're signed in, sign-in only unlocks
 * specific actions. This strip is the seeker-side equivalent of that
 * consistency: the same nine destinations, in the same order, on every one
 * of them, so moving between Home/Features/How it works/etc. never feels
 * like leaving the site.
 */
import { Link, useLocation } from 'react-router-dom';

export const MARKETING_PAGES = [
  { to: '/', label: 'Home' },
  { to: '/features', label: 'Features' },
  { to: '/how-it-works', label: 'How it works' },
  { to: '/why-ayn', label: 'Why AYN' },
  { to: '/real-ai', label: 'Real AI' },
  { to: '/get-discovered', label: 'Get discovered' },
  { to: '/messaging', label: 'Messaging' },
  { to: '/sourcing', label: 'Where jobs come from' },
  { to: '/proof', label: 'Proof' },
  { to: '/faq', label: 'FAQ' },
];

type Props = {
  /** True (default) when this is the first thing on the page, right under
   *  the fixed Header, and needs its own top padding to clear it. Home
   *  places this after its own hero, which already clears the header, so
   *  it passes false to avoid a doubled-up gap. */
  atPageTop?: boolean;
};

export const MarketingSubNav = ({ atPageTop = true }: Props) => {
  const location = useLocation();
  return (
    <nav className={`lp-subnav ${atPageTop ? 'is-at-top' : ''}`} aria-label="Explore AYN">
      <div className="lp-shell lp-subnav-inner">
        {MARKETING_PAGES.map((p) => (
          <Link
            key={p.to}
            to={p.to}
            className={`lp-subnav-link ${location.pathname === p.to ? 'is-active' : ''}`}
          >
            {p.label}
          </Link>
        ))}
      </div>
    </nav>
  );
};

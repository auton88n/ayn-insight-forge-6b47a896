// v3.34.0 — one place for the company name and the legal links.
//
// Three different names were showing at the same time: "AYN Intelligence" in
// the landing footer, "Advanced AI Solutions" in the shared footer, and
// "AYN AI" in every legal document. AYN AI is the registered name, so it is
// the only one, and it now lives here so it cannot drift again.
export const COMPANY_NAME = 'AYN AI';
export const COMPANY_TAGLINE = 'A resume tailored to every job you apply to.';
export const COPYRIGHT_LINE = `© ${new Date().getFullYear()} ${COMPANY_NAME}. All rights reserved.`;

export type SiteLink = { to: string; label: string };

/** Every published legal document, in the order the footer lists them. */
export const LEGAL_LINKS: SiteLink[] = [
  { to: '/privacy', label: 'Privacy Policy' },
  { to: '/terms', label: 'Terms of Service' },
  { to: '/cookies', label: 'Cookie Policy' },
  { to: '/security', label: 'Security' },
  { to: '/subprocessors', label: 'Subprocessors' },
  { to: '/copyright', label: 'Copyright and content complaints' },
  { to: '/do-not-sell', label: 'Do Not Sell or Share My Personal Information' },
];

export const NAV_LINKS: SiteLink[] = [
  { to: '/', label: 'Home' },
  { to: '/#how', label: 'How it works' },
  { to: '/salary-guide', label: 'Salary guide' },
  { to: '/pricing', label: 'Pricing' },
];

/** The footer's "Company" column: about the business, not the product. */
export const COMPANY_LINKS: SiteLink[] = [
  { to: '/about', label: 'About Us' },
  { to: '/help', label: 'Help Center' },
  { to: '/legal', label: 'Legal' },
  { to: '/contact', label: 'Contact Us' },
];

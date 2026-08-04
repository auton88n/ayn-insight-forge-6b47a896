import type { ReactNode } from 'react';

const EMBER = '#e85d3a';

/**
 * A section h2 with the small ember accent mark used across the marketing
 * pages, so scrolling past the hero doesn't leave the page looking unbranded.
 */
export const SectionHeading = ({ children, className = 'mb-4' }: { children: ReactNode; className?: string }) => (
  <h2 className={`flex items-center gap-2.5 text-2xl font-semibold tracking-tight ${className}`}>
    <span className="inline-block h-5 w-1 rounded-full shrink-0" style={{ background: EMBER }} aria-hidden="true" />
    {children}
  </h2>
);

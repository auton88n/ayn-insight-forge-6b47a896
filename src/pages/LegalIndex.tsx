// v3.32.0 — the index of every legal document.
// v3.230.0 -- reported directly, alongside adding a Legal link to the
// sidebar's Company group: "make it within like the other pages." This
// page ran on the old <Header/>/<Footer/> chrome, no SeekerSidebar at all
// -- the same "different page, sidebar gone" gap /jobs, /salary-guide and
// /check-resume already had fixed at v3.220.0, just not yet reached here.
// Swapped to the identical SeekerSidebar/LandingFooter + .lp shell those
// three routes already use.
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { SEO } from '@/components/shared/SEO';
import { SeekerSidebar } from '@/components/landing/SeekerSidebar';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { LEGAL_DOCS, rawMarkdown, parseDocMeta } from '@/lib/legalDocs';
import { ChevronRight } from 'lucide-react';

export default function LegalIndex() {
  useEffect(() => {
    document.body.classList.add('contact-surface');
    return () => document.body.classList.remove('contact-surface');
  }, []);

  return (
    <div className="lp lp-shell-with-sidebar contact-surface">
      <SEO
        title="Legal | AYN"
        description="Every AYN legal document in one place: terms, privacy, cookies, security, subprocessors, data processing addendum, service level agreement and copyright."
      />
      <SeekerSidebar />
      <main className="lp-sidebar-main">
        {/* v3.234.0 -- reported directly: "you are just keeping using what
            we built... better pages design." This page ran on plain
            shadcn tokens (divide-border, hover:bg-muted/40) despite living
            inside .lp -- the one page on the whole sidebar shell with no
            trace of the site's own Charcoal & Ember identity. Heading now
            matches every other tab's .lp-eyebrow/.lp-display treatment;
            each row is a real .lp-panel-style card with an ember accent on
            hover instead of a flat divided list. */}
        <div className="legal-measure px-6 pt-10 sm:pt-12 pb-24">
          <p className="lp-eyebrow">Legal</p>
          <h1 className="lp-display" style={{ fontSize: 'clamp(30px, 4.4vw, 44px)', lineHeight: 1.05, margin: '0 0 14px' }}>
            Every document, in one place
          </h1>
          <p className="text-[15.5px] leading-relaxed" style={{ color: 'hsl(var(--lp-muted))' }}>
            Every document that governs your use of AYN. Each one carries its version and
            effective date at the top.
          </p>

          <ul className="mt-9 flex flex-col gap-3">
            {LEGAL_DOCS.map((d) => {
              const raw = rawMarkdown(d.slug);
              const meta = raw ? parseDocMeta(raw) : null;
              return (
                <li key={d.slug}>
                  <Link to={d.path} className="lp-legal-row group">
                    <div className="flex-1 min-w-0">
                      <p className="lp-legal-row-title">{d.title}</p>
                      <p className="lp-legal-row-desc">{d.description}</p>
                      {meta?.version && (
                        <p className="lp-legal-row-meta">
                          Version {meta.version}
                          {meta.effective
                            ? `, effective ${meta.effective}`
                            : meta.updated
                              ? `, updated ${meta.updated}`
                              : ''}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="lp-legal-row-chev" />
                  </Link>
                </li>
              );
            })}
            {/* Not markdown backed like the rest of LEGAL_DOCS -- DoNotSell.tsx
                is its own bespoke page -- so it's listed here directly rather
                than folded into that registry. */}
            <li>
              <Link to="/do-not-sell" className="lp-legal-row group">
                <div className="flex-1 min-w-0">
                  <p className="lp-legal-row-title">Do Not Sell or Share My Info</p>
                  <p className="lp-legal-row-desc">Your CCPA rights, and confirmation that AYN does not sell or share personal information.</p>
                </div>
                <ChevronRight className="lp-legal-row-chev" />
              </Link>
            </li>
          </ul>

          <p className="mt-8 text-sm" style={{ color: 'hsl(var(--lp-dim))' }}>
            Questions about any of these, write to{' '}
            <a href="mailto:legal@ayn.careers" className="underline" style={{ color: 'hsl(var(--lp-fg))' }}>legal@ayn.careers</a>.
          </p>
        </div>
        <LandingFooter />
      </main>
    </div>
  );
}

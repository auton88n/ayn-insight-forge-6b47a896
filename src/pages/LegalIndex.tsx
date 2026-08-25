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
        <div className="legal-measure px-6 pt-10 sm:pt-12 pb-24">
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">Legal</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Every document that governs your use of AYN. Each one carries its version and
            effective date at the top.
          </p>

          <ul className="mt-10 divide-y divide-border border-y border-border">
            {LEGAL_DOCS.map((d) => {
              const raw = rawMarkdown(d.slug);
              const meta = raw ? parseDocMeta(raw) : null;
              return (
                <li key={d.slug}>
                  <Link
                    to={d.path}
                    className="group flex items-start gap-4 py-5 hover:bg-muted/40 transition-colors px-2 -mx-2 rounded"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{d.title}</p>
                      <p className="text-sm text-muted-foreground mt-1">{d.description}</p>
                      {meta?.version && (
                        <p className="text-xs text-muted-foreground mt-2">
                          Version {meta.version}
                          {meta.effective
                            ? `, effective ${meta.effective}`
                            : meta.updated
                              ? `, updated ${meta.updated}`
                              : ''}
                        </p>
                      )}

                    </div>
                    <ChevronRight className="w-4 h-4 mt-0.5 text-muted-foreground group-hover:text-foreground shrink-0" />
                  </Link>
                </li>
              );
            })}
            {/* Not markdown backed like the rest of LEGAL_DOCS -- DoNotSell.tsx
                is its own bespoke page -- so it's listed here directly rather
                than folded into that registry. */}
            <li>
              <Link
                to="/do-not-sell"
                className="group flex items-start gap-4 py-5 hover:bg-muted/40 transition-colors px-2 -mx-2 rounded"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">Do Not Sell or Share My Info</p>
                  <p className="text-sm text-muted-foreground mt-1">Your CCPA rights, and confirmation that AYN does not sell or share personal information.</p>
                </div>
                <ChevronRight className="w-4 h-4 mt-0.5 text-muted-foreground group-hover:text-foreground shrink-0" />
              </Link>
            </li>
          </ul>

          <p className="mt-8 text-sm text-muted-foreground">
            Questions about any of these, write to{' '}
            <a href="mailto:legal@ayn.careers" className="underline">legal@ayn.careers</a>.
          </p>
        </div>
        <LandingFooter />
      </main>
    </div>
  );
}

// v3.32.0 — the index of every legal document.
import { Link } from 'react-router-dom';
import { SEO } from '@/components/shared/SEO';
import { Footer } from '@/components/shared/Footer';
import { LEGAL_DOCS, rawMarkdown, parseDocMeta } from '@/lib/legalDocs';
import { ChevronRight } from 'lucide-react';

export default function LegalIndex() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEO
        title="Legal | AYN"
        description="Every AYN legal document in one place: terms, privacy, cookies, security, subprocessors, data processing addendum, service level agreement and copyright."
      />
      <main className="flex-1 w-full px-6 py-12 sm:py-16">
        <div className="legal-measure">
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
          </ul>

          <p className="mt-8 text-sm text-muted-foreground">
            Questions about any of these, write to{' '}
            <a href="mailto:legal@aynn.io" className="underline">legal@aynn.io</a>.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}

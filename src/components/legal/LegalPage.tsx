// v3.32.0 — one renderer for every legal document.
//
// The document text lives in src/content/legal/<slug>.md and is rendered here
// exactly as written. Nothing in this component edits, shortens or reorders a
// sentence. What it adds around the text: a header showing which version you
// are reading, a table of contents for long documents, an anchor on every
// heading, a readable measure, a print stylesheet and working cross links.
import { useMemo, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { SEO } from '@/components/shared/SEO';
import { SeekerSidebar } from '@/components/landing/SeekerSidebar';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { Link2, Printer, ArrowLeft } from 'lucide-react';
import {
  docBySlug,
  rawMarkdown,
  parseDocMeta,
  buildToc,
  linkCrossReferences,
  slugifyHeading,
  stripDocHeader,
} from '@/lib/legalDocs';


interface Props {
  slug: string;
}

/** Long enough that a reader needs a map. Terms has 21 sections, Privacy 14. */
const TOC_THRESHOLD = 10;

function headingText(children: React.ReactNode): string {
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) return children.map(headingText).join('');
  if (children && typeof children === 'object' && 'props' in (children as never)) {
    return headingText((children as { props: { children?: React.ReactNode } }).props.children);
  }
  return '';
}

export default function LegalPage({ slug }: Props) {
  const doc = docBySlug(slug);
  const raw = rawMarkdown(slug);
  const location = useLocation();

  // v3.230.0 -- reported directly: "make it within like the other pages."
  // Swapped the old <Header/>/<Footer/> chrome for the same SeekerSidebar/
  // LandingFooter + .lp shell /jobs, /salary-guide and /check-resume
  // already use, so a legal document no longer drops the sidebar.
  useEffect(() => {
    document.body.classList.add('contact-surface');
    return () => document.body.classList.remove('contact-surface');
  }, []);

  const parsed = useMemo(() => {
    if (!raw) return null;
    const meta = parseDocMeta(raw);
    const body = linkCrossReferences(stripDocHeader(meta.body), slug);
    return { ...meta, body, toc: buildToc(body) };
  }, [raw, slug]);


  // Deep link to a clause: scroll to the anchor once the document is painted.
  useEffect(() => {
    if (!location.hash || !parsed) return;
    const id = decodeURIComponent(location.hash.slice(1));
    const t = window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
    return () => window.clearTimeout(t);
  }, [location.hash, parsed]);

  const title = doc?.title || parsed?.heading || 'Legal';

  if (!parsed) {
    return (
      <div className="lp lp-shell-with-sidebar contact-surface">
        <SEO title={`${title} | AYN`} description={doc?.description || 'AYN legal documents.'} />
        <SeekerSidebar />
        <main className="lp-sidebar-main">
          <div className="legal-measure px-6 pt-10 sm:pt-12 pb-24">
            <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-4 text-sm text-muted-foreground">
              This document is being finalised and will appear here shortly. In the meantime,
              write to <a className="underline" href="mailto:legal@ayn.careers">legal@ayn.careers</a>.
            </p>
            <p className="mt-8">
              <Link to="/legal" className="text-sm underline">All legal documents</Link>
            </p>
          </div>
          <LandingFooter />
        </main>
      </div>
    );
  }

  const showToc = parsed.toc.filter((t) => t.level === 2).length >= TOC_THRESHOLD;

  const heading = (level: 1 | 2 | 3 | 4) =>
    function H({ children }: { children?: React.ReactNode }) {
      const text = headingText(children);
      const id = slugifyHeading(text);
      const Tag = `h${level}` as 'h1' | 'h2' | 'h3' | 'h4';
      if (level === 1) return <Tag className="legal-h1">{children}</Tag>;
      return (
        <Tag id={id} className="legal-anchor group scroll-mt-24">
          {children}
          <a
            href={`#${id}`}
            aria-label={`Link to ${text}`}
            className="legal-anchor-link"
          >
            <Link2 className="w-3.5 h-3.5" aria-hidden="true" />
          </a>
        </Tag>
      );
    };

  return (
    <div className="lp lp-shell-with-sidebar contact-surface">
      <SEO
        title={`${title} | AYN`}
        description={doc?.description || `${title} for AYN.`}
      />

      <SeekerSidebar />

      <main className="lp-sidebar-main">
        <div className="legal-measure px-6 pt-10 sm:pt-12 pb-24">
          <div className="legal-noprint">
            <Link to="/legal" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="w-3.5 h-3.5" /> All legal documents
            </Link>
          </div>

          <header className="mt-6 pb-6 border-b border-border">
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">{title}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {parsed.version && <span>Version {parsed.version}</span>}
              {parsed.effective
                ? <span>Effective {parsed.effective}</span>
                : parsed.updated && <span>Updated {parsed.updated}</span>}

              <button
                type="button"
                onClick={() => window.print()}
                className="legal-noprint inline-flex items-center gap-1.5 hover:text-foreground"
              >
                <Printer className="w-3.5 h-3.5" /> Print
              </button>
            </div>
          </header>

          {showToc && (
            <nav aria-label="Contents" className="legal-toc mt-8">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Contents
              </p>
              <ol className="mt-3 space-y-1.5">
                {parsed.toc.map((t, i) => (
                  <li key={`${t.id}-${i}`} className={t.level === 3 ? 'pl-4' : ''}>
                    <a href={`#${t.id}`} className="text-sm text-muted-foreground hover:text-foreground">
                      {t.text}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          )}

          <article className="legal-doc prose prose-neutral dark:prose-invert max-w-none mt-10">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: heading(1),
                h2: heading(2),
                h3: heading(3),
                h4: heading(4),
                table: ({ children }) => (
                  <div className="legal-table-wrap">
                    <table>{children}</table>
                  </div>
                ),
                a: ({ href, children }) => {
                  const to = href || '';
                  if (to.startsWith('/')) {
                    return <Link to={to}>{children}</Link>;
                  }
                  if (to.startsWith('#')) {
                    return <a href={to}>{children}</a>;
                  }
                  return (
                    <a href={to} target="_blank" rel="noopener noreferrer">
                      {children}
                    </a>
                  );
                },
              }}
            >
              {parsed.body}
            </ReactMarkdown>
          </article>
        </div>
        <LandingFooter />
      </main>
    </div>
  );
}

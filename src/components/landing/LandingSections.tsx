/**
 * LandingSections — AYN marketing page.
 * Charcoal & Ember, Outfit + Figtree, bento grid composition.
 * v3.3.2: tailoring is the promise. Scoring is proof, never a headline.
 */
import { memo, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Target, ShieldCheck, FileText, MessagesSquare, LayoutGrid, Radar } from 'lucide-react';
import { HeroFillMockup } from './HeroFillMockup';
import {
  MatchScoreIllustration,
  ProvenanceIllustration,
  OnePageDocIllustration,
  EmployerMatchIllustration,
} from './ProductIllustrations';

const ATS = ['Greenhouse', 'Ashby', 'Lever', 'Workday', 'iCIMS', 'SmartRecruiters'];

const TILES = [
  {
    span: 'lp-span-4',
    icon: FileText,
    title: 'A resume for every job',
    desc: 'Your real experience, rewritten in the language of the posting. One page, ATS ready.',
    art: OnePageDocIllustration,
  },
  {
    span: 'lp-span-2',
    icon: MessagesSquare,
    title: 'Cover letters that are specific',
    desc: 'It mentions the company and the role, because AYN read both. No templates.',
    art: null,
    meta: ['Named company', 'One page'],
  },
  {
    span: 'lp-span-4',
    icon: Target,
    title: 'It knows what to change',
    desc: 'AYN compares the posting to your resume and shows what is strong, what it surfaced, and what you are genuinely missing.',
    art: MatchScoreIllustration,
  },
  {
    span: 'lp-span-2',
    icon: ShieldCheck,
    title: 'Never invented',
    desc: 'Nothing added that is not in your background. Your numbers, dates, and titles are never altered.',
    art: ProvenanceIllustration,
  },
  {
    span: 'lp-span-3',
    icon: LayoutGrid,
    title: 'Works where you are',
    desc: 'Open a posting, get your tailored version without leaving the page.',
    art: null,
    meta: ['Greenhouse', 'Lever', 'Workday', 'Ashby'],
  },
  {
    span: 'lp-span-3',
    icon: LayoutGrid,
    title: 'Everything in one place',
    desc: 'Your resumes, versions, and jobs live in Resume Hub.',
    art: null,
    meta: ['Resumes', 'Versions', 'Saved jobs', 'Cover letters'],
  },
  {
    span: 'lp-span-6',
    icon: Radar,
    title: 'Be found, not just seen',
    desc: 'Turn on discovery and employers searching AYN can see your full profile. Your email and phone stay private until you approve an intro.',
    art: null,
  },

];


const FAQS = [
  {
    q: 'What is AYN?',
    a: 'AYN reads a job posting, scores how well you match it, and writes you a tailored resume and cover letter for that role.',
  },
  {
    q: 'Which job sites does AYN work on?',
    a: 'Greenhouse, Lever, Workday, Ashby, iCIMS, SmartRecruiters and most company career pages.',
  },
  {
    q: 'Is AYN free to try?',
    a: 'Yes. AYN is free to start and no credit card is required.',
  },
  {
    q: 'Does AYN fill or submit applications for me?',
    a: 'No. AYN only reads the page. It never types into a form and never submits anything on your behalf.',
  },
];


/** Adds .is-in to .lp-reveal elements once they enter the viewport. */
function useReveal() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const nodes = root.current?.querySelectorAll('.lp-reveal');
    if (!nodes?.length) return;
    if (typeof IntersectionObserver === 'undefined') {
      nodes.forEach((n) => n.classList.add('is-in'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('is-in');
            io.unobserve(e.target);
          }
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );
    nodes.forEach((n) => io.observe(n));
    return () => io.disconnect();
  }, []);
  return root;
}

export const LandingSections = memo(({ onStartFree }: { onStartFree?: () => void }) => {
  const root = useReveal();

  return (
    <div className="lp" ref={root}>
      {/* ── HERO ─────────────────────────────────────────────── */}
      <header className="lp-hero">
        <div className="lp-hero-aura" aria-hidden="true" />
        <div className="lp-shell lp-hero-grid">
          <div>
            <span className="lp-pill">
              <b>Free to start</b> no credit card <i />
            </span>
            <h1 className="lp-display lp-h1">
              A resume built for <em>the job you are applying to</em>.
            </h1>
            <p className="lp-lead">
              AYN reads the posting and rewrites your resume and cover letter to fit. In seconds, not an evening.
            </p>

            <div className="lp-cta-row" style={{ marginTop: 30 }}>
              <button type="button" className="lp-btn lp-btn-primary" onClick={() => onStartFree?.()}>
                Start free <ArrowRight size={15} />
              </button>
              <a href="#employers" className="lp-btn lp-btn-ghost">
                For employers
              </a>
            </div>
            <p className="lp-note">Free to start. Works on Greenhouse, Lever, Workday, Ashby and more.</p>
          </div>

          <HeroFillMockup />
        </div>
      </header>

      {/* ── THESIS ───────────────────────────────────────────── */}
      <section className="lp-section" style={{ paddingBlockEnd: 0 }}>
        <div className="lp-shell lp-reveal">
          <h2 className="lp-display lp-h2">The job search is changing sides</h2>
          <p className="lp-lead" style={{ marginTop: 14 }}>
            Employers used to post a job and wait for a thousand resumes.
            <br />
            Now they search for the right person. AYN makes sure you are findable, and worth finding.
          </p>
        </div>
      </section>


      {/* ── PROOF STRIP ──────────────────────────────────────── */}
      <div className="lp-strip">
        <div className="lp-shell lp-strip-inner">
          <span className="lp-strip-label">Reads job posts on</span>
          {ATS.map((n) => (
            <span key={n} className="lp-strip-mark">{n}</span>
          ))}
        </div>
      </div>

      {/* ── HOW IT WORKS ─────────────────────────────────────── */}
      <section id="how" className="lp-section">
        <div className="lp-shell">
          <div className="lp-reveal" style={{ marginBottom: 40 }}>
            <p className="lp-eyebrow">How it works</p>
            <h2 className="lp-display lp-h2">Three steps, then it is muscle memory</h2>
          </div>
          <div className="lp-steps lp-reveal">
            {[
              'Add your resume once.',
              'Open any job posting.',
              'Get a version made for that job.',
            ].map((t, i) => (
              <div className="lp-step" key={t}>

                <span className="lp-step-n">STEP {i + 1}</span>
                <p>{t}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES BENTO ───────────────────────────────────── */}
      <section id="features" className="lp-section">
        <div className="lp-shell">
          <div className="lp-reveal" style={{ marginBottom: 40 }}>
            <p className="lp-eyebrow">What it does</p>
            <h2 className="lp-display lp-h2">Tailored to the role, every time</h2>
            <p className="lp-lead">
              Send something built for the role, not the same file you sent last week.
            </p>


          </div>

          <div className="lp-bento lp-reveal">
            {TILES.map((tile) => {
              const Icon = tile.icon;
              const Art = tile.art;
              return (
                <article key={tile.title} className={`lp-tile ${tile.span}`}>
                  <span className="lp-tile-icon" aria-hidden="true">
                    <Icon size={20} strokeWidth={1.75} />
                  </span>
                  <h3>{tile.title}</h3>
                  <p>{tile.desc}</p>
                  {Art && (
                    <div className="lp-art">
                      <Art />
                    </div>
                  )}
                  {!Art && 'meta' in tile && (
                    <div className="lp-tile-meta">
                      {(tile as { meta: string[] }).meta.map((m) => <span key={m}>{m}</span>)}
                    </div>
                  )}
                  {!Art && !('meta' in tile) && (
                    <div className="lp-art" aria-hidden="true" style={{ minHeight: 96 }} />
                  )}
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── FOR EMPLOYERS ────────────────────────────────────── */}
      <section id="employers" className="lp-section">
        <div className="lp-shell">
          <div className="lp-reveal" style={{ marginBottom: 36 }}>
            <p className="lp-eyebrow">For employers</p>
            <h2 className="lp-display lp-h2">Stop reading a thousand resumes to find three people</h2>
            <p className="lp-lead">
              Describe the role in plain words. AYN searches candidates who chose to be found,
              and returns the three best fits with the evidence for each. No job board. No inbox
              full of maybes.
            </p>
            <div className="lp-chips">
              <span className="lp-chip">Say what the role actually needs.</span>
              <span className="lp-chip">AYN searches only candidates who opted in.</span>
              <span className="lp-chip">Three real fits, with the reason for each.</span>
            </div>
          </div>

          <div className="lp-tile lp-reveal" style={{ marginTop: 8 }}>
            <div className="lp-art" style={{ marginTop: 0 }}>
              <EmployerMatchIllustration />
            </div>
            <div className="lp-cta-row" style={{ marginTop: 8 }}>
              <Link to="/contact" className="lp-btn lp-btn-primary">
                Join the employer waitlist <ArrowRight size={15} />
              </Link>
              <span className="lp-note" style={{ margin: 0 }}>Early access. We onboard employers one at a time.</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── TRUST ────────────────────────────────────────────── */}
      <section id="trust" className="lp-section">
        <div className="lp-shell" style={{ display: 'grid', gap: 'clamp(28px,5vw,56px)', gridTemplateColumns: '1fr' }}>
          <div className="lp-reveal">
            <p className="lp-eyebrow">Built to be honest</p>
            <h2 className="lp-display lp-h2">It tells you what it could not read</h2>
            <p className="lp-lead">
              AYN shows its work. Which posting it read, which resume it used, and what it could not
              verify. It never invents experience you do not have.
            </p>
            <div className="lp-chips">
              <span className="lp-chip">Read only, always</span>
              <span className="lp-chip">Grounded in the posting</span>
              <span className="lp-chip">Contact shared only when you approve</span>
            </div>


          </div>
        </div>
      </section>


      {/* ── FAQ ──────────────────────────────────────────────── */}
      <section id="faq" className="lp-section" style={{ paddingBlockStart: 0 }}>
        <div className="lp-shell">
          <div className="lp-reveal" style={{ marginBottom: 28 }}>
            <p className="lp-eyebrow">Questions</p>
            <h2 className="lp-display lp-h2">Good to know</h2>
          </div>
          <div className="lp-faq lp-reveal">
            {FAQS.map((f) => (
              <div className="lp-faq-item" key={f.q}>
                <h3>{f.q}</h3>
                <p>{f.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CLOSING ──────────────────────────────────────────── */}
      <section className="lp-section" style={{ paddingBlockStart: 0 }}>
        <div className="lp-shell">
          <div className="lp-closing lp-reveal">
            <h2 className="lp-display lp-h2" style={{ maxWidth: 720, marginInline: 'auto' }}>
              Stop sending the same resume.
            </h2>
            <p className="lp-lead" style={{ color: 'hsl(0 0% 100% / 0.85)' }}>
              Add your resume once and get a version made for every job.
            </p>


            <div className="lp-cta-row" style={{ justifyContent: 'center', marginTop: 30 }}>
              <button type="button" className="lp-btn lp-btn-invert" onClick={() => onStartFree?.()}>
                Start free <ArrowRight size={15} />
              </button>
              <Link to="/resume-hub?tab=extension" className="lp-btn lp-btn-ghost" style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.35)' }}>
                Add to Chrome
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────── */}
      <footer className="lp-footer">
        <div className="lp-shell lp-footer-row">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 20px' }}>
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
            <Link to="/contact">Contact</Link>
            <Link to="/pricing">Pricing</Link>
          </div>
          <span style={{ fontSize: 13, color: 'hsl(var(--lp-dim))' }}>© 2026 AYN Intelligence</span>
        </div>
      </footer>
    </div>
  );
});

LandingSections.displayName = 'LandingSections';

/**
 * LandingSections — AYN marketing page.
 * Charcoal & Ember, Outfit + Figtree, bento grid composition.
 * v3.0.0: AYN is a read only job search copilot. Match score first, no autofill.
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
    icon: Target,
    title: 'A match score you can check',
    desc: 'See your real fit before you spend the hour writing an application.',
    art: MatchScoreIllustration,
  },
  {
    span: 'lp-span-2',
    icon: ShieldCheck,
    title: 'Grounded on the real posting',
    desc: 'AYN reads the full job text, not a nav bar and a cookie banner.',
    art: ProvenanceIllustration,
  },
  {
    span: 'lp-span-2',
    icon: FileText,
    title: 'Tailored resumes and cover letters',
    desc: 'Written for that role. One page, ATS ready.',
    art: OnePageDocIllustration,
  },
  {
    span: 'lp-span-2',
    icon: MessagesSquare,
    title: 'Ask AYN about the job',
    desc: 'What does this role really want? Ask, and get an answer from the posting.',
    art: null,
    meta: ['Plain questions', 'Answers from the text'],
  },
  {
    span: 'lp-span-6',
    icon: LayoutGrid,
    title: 'Everything in one place',
    desc: 'Every resume, saved job, and score in one workspace.',
    art: null,
    meta: ['Saved jobs', 'Match scores', 'Resume versions', 'Cover letters'],
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
              Know if a job is worth your hour <em>before you spend it</em>.
            </h1>
            <p className="lp-lead">
              AYN reads the real posting, scores your fit against it, then writes the resume and
              cover letter for that role. And when you are hiring, it finds the three people worth
              talking to.
            </p>
            <div className="lp-cta-row" style={{ marginTop: 30 }}>
              <button type="button" className="lp-btn lp-btn-primary" onClick={() => onStartFree?.()}>
                Start free <ArrowRight size={15} />
              </button>
              <Link to="/resume-hub?tab=extension" className="lp-btn lp-btn-ghost">
                Add to Chrome
              </Link>
            </div>
            <p className="lp-note">Works on Greenhouse, Lever, Workday, Ashby and more.</p>
          </div>

          <HeroFillMockup />
        </div>
      </header>

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
              'See your score, then tailor.',

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
            <h2 className="lp-display lp-h2">Apply to fewer jobs, and to better ones</h2>
            <p className="lp-lead">
              Everything that goes out with your name on it is something you can check.
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
            <h2 className="lp-display lp-h2">You have read a thousand resumes to find three people</h2>
            <p className="lp-lead">
              Tell AYN what the role needs. It searches candidates who chose to be found and brings you
              the three best fits, with the reason for each. No job board. No inbox full of maybes.
            </p>
            <div className="lp-chips">
              <span className="lp-chip">Describe the role in plain words</span>
              <span className="lp-chip">Only opted in candidates</span>
              <span className="lp-chip">Three real fits, with evidence</span>
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
              Every score is grounded in the posting text, and AYN shows you the lines it used. If the
              page hides the description, it says so instead of guessing. AYN only reads. It never
              types into a page and never submits anything for you.
            </p>
            <div className="lp-chips">
              <span className="lp-chip">Read only, always</span>
              <span className="lp-chip">Evidence for every score</span>
              <span className="lp-chip">Your data stays yours</span>
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
              Know before you apply
            </h2>
            <p className="lp-lead" style={{ color: 'hsl(0 0% 100% / 0.85)' }}>
              Add your resume once and let AYN read the job for you.
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

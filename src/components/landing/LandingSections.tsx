/**
 * LandingSections — AYN marketing page.
 *
 * v3.16.0: markets what the product actually does today, both sides of it.
 * Seeker: tailored documents grounded in the real posting.
 * Employer: search people who chose to be found, verify them, invite them.
 * Every mockup on this page is a rendition of a screen that exists.
 */
import { memo, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, FileText, Target, ShieldCheck, MessagesSquare, Radar,
  Search, ClipboardCheck, MailCheck, Building2, Eye,
} from 'lucide-react';
import {
  ExtensionOnPostingMockup,
  TailoredDocsMockup,
  CandidateCardMockup,
  AssessmentMockup,
} from './AppMockups';

const ATS = ['Greenhouse', 'Ashby', 'Lever', 'Workday', 'iCIMS', 'SmartRecruiters'];

const PAINS = [
  {
    who: 'If you are applying',
    lines: [
      'You send the same resume to forty postings and hear nothing back.',
      'Rewriting it properly for one job costs you an evening.',
      'You never find out which line lost you the interview.',
    ],
  },
  {
    who: 'If you are hiring',
    lines: [
      'One posting brings six hundred resumes, most of them wrong.',
      'The good ones are already employed and never see your ad.',
      'A confident resume tells you nothing about whether they did the work.',
    ],
  },
];

const SEEKER_TILES = [
  {
    span: 'lp-span-3',
    icon: FileText,
    title: 'A resume written for that one job',
    desc: 'Your real experience, phrased in the language of the posting, on one page that an ATS can read.',
    meta: ['PDF', 'DOCX', 'One page', 'Kept with the job'],
  },
  {
    span: 'lp-span-3',
    icon: MessagesSquare,
    title: 'A cover letter that names things',
    desc: 'It mentions the company and the role because AYN read both of them. No template sentences.',
    meta: ['Named company', 'Grounded in the posting'],
  },
  {
    span: 'lp-span-2',
    icon: Target,
    title: 'The honest gap list',
    desc: 'Matched, missing and nice to have, worked out from the posting against your background before the model writes a word.',
  },
  {
    span: 'lp-span-2',
    icon: ShieldCheck,
    title: 'Nothing invented',
    desc: 'No skill, number, date or title appears that is not already yours. If AYN cannot verify it, it says so.',
  },
  {
    span: 'lp-span-2',
    icon: Radar,
    title: 'Be found while you sleep',
    desc: 'Turn on discovery and employers searching AYN can reach you. Email and phone stay private until you accept.',
  },
];

const EMPLOYER_STEPS = [
  {
    icon: Building2,
    title: 'Describe the role once',
    desc: 'Title, seniority, must have skills with live counts of who exists, location, eligibility. No free text guessing.',
  },
  {
    icon: Search,
    title: 'AYN reads the pool',
    desc: 'Skill prefilter, then semantic recall, then one grounded rerank. You get the strongest fits with the evidence and the gaps.',
  },
  {
    icon: ClipboardCheck,
    title: 'Verify before you commit',
    desc: 'Send a short assessment written from that person\u2019s own background. You see score, observations and time per answer.',
  },
  {
    icon: MailCheck,
    title: 'Invite the right one',
    desc: 'Send a proposal with the role, location, salary range and a message AYN drafts for you. Contact opens when they accept.',
  },
];

const FAQS = [
  {
    q: 'What is AYN?',
    a: 'Two things that share one profile. For job seekers, AYN reads a posting and writes a resume and cover letter tailored to it. For employers, AYN searches people who chose to be found and returns the strongest fits with evidence.',
  },
  {
    q: 'Which job sites does the extension work on?',
    a: 'Greenhouse, Lever, Workday, Ashby, iCIMS, SmartRecruiters and most company career pages.',
  },
  {
    q: 'Does AYN fill or submit applications for me?',
    a: 'No. AYN only reads the page. It never types into a form and never submits anything on your behalf.',
  },
  {
    q: 'Can employers see my name and email?',
    a: 'Not until you accept their proposal. Before that they see your professional profile and your match evidence, never your email or phone.',
  },
  {
    q: 'What is a verification assessment?',
    a: 'A short set of questions generated from a candidate\u2019s own claimed background. It probes lived experience rather than textbook knowledge. The employer sees the score, the candidate only ever sees growth notes.',
  },
  {
    q: 'Is AYN free to try?',
    a: 'Yes, free to start for job seekers and no credit card is required. Employers are onboarded one at a time.',
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

type Audience = 'job_seeker' | 'employer';
type Props = { onStartFree?: (role?: Audience) => void };

const HERO: Record<Audience, {
  pill: JSX.Element;
  headline: JSX.Element;
  lead: string;
  cta: string;
  note: string;
  art: JSX.Element;
  anchor: string;
}> = {
  job_seeker: {
    pill: <><b>Free to start</b> no credit card <i /></>,
    headline: <>Stop rewriting your resume for <em>every single job.</em></>,
    lead: 'A resume and cover letter written for the exact posting in front of you, from your real history, in the time it takes to read the ad.',
    cta: 'Start free',
    note: 'Read only on every page. AYN never types into a form and never submits anything for you.',
    art: <ExtensionOnPostingMockup />,
    anchor: 'features',
  },
  employer: {
    pill: <><b>Employer access</b> onboarded one at a time <i /></>,
    headline: <>Three people worth talking to, <em>not six hundred maybes.</em></>,
    lead: 'Describe the role once. AYN searches people who chose to be found and returns the strongest fits with the evidence, the gaps and a way to verify them before you commit.',
    cta: 'Request employer access',
    note: 'Contact details stay private until the candidate accepts your proposal.',
    art: <CandidateCardMockup />,
    anchor: 'employers',
  },
};

export const LandingSections = memo(({ onStartFree }: Props) => {
  const root = useReveal();
  const [audience, setAudience] = useState<Audience>(() => {
    if (typeof window === 'undefined') return 'job_seeker';
    return localStorage.getItem('ayn_landing_audience') === 'employer' ? 'employer' : 'job_seeker';
  });

  const pickAudience = (next: Audience) => {
    setAudience(next);
    try { localStorage.setItem('ayn_landing_audience', next); } catch { /* ignore */ }
    document.getElementById(HERO[next].anchor)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const hero = HERO[audience];

  return (
    <div className="lp" ref={root}>
      {/* ── HERO ─────────────────────────────────────────────── */}
      <header className="lp-hero">
        <div className="lp-hero-aura" aria-hidden="true" />
        <div className="lp-shell lp-hero-center">
          <div className="lp-hero-copy">
            <div className="lp-switch" role="tablist" aria-label="Who are you">
              <button
                type="button"
                role="tab"
                aria-selected={audience === 'job_seeker'}
                className={`lp-switch-btn ${audience === 'job_seeker' ? 'is-on' : ''}`}
                onClick={() => pickAudience('job_seeker')}
              >
                I am looking for a job
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={audience === 'employer'}
                className={`lp-switch-btn ${audience === 'employer' ? 'is-on' : ''}`}
                onClick={() => pickAudience('employer')}
              >
                I am hiring
              </button>
            </div>

            <div className="lp-audience" key={audience}>
              <div><span className="lp-pill">{hero.pill}</span></div>
              <h1 className="lp-display lp-h1">{hero.headline}</h1>
              <p className="lp-lead" style={{ maxWidth: 660 }}>{hero.lead}</p>

              <div className="lp-cta-row" style={{ marginTop: 30 }}>
                <button type="button" className="lp-btn lp-btn-primary" onClick={() => onStartFree?.(audience)}>
                  {hero.cta} <ArrowRight size={15} />
                </button>
              </div>
              <p className="lp-note">{hero.note}</p>
            </div>
          </div>

          <div className="lp-hero-art lp-audience" key={`art-${audience}`}>
            {hero.art}
          </div>
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

      {/* ── THE PAIN ─────────────────────────────────────────── */}
      <section className="lp-section">
        <div className="lp-shell">
          <div className="lp-reveal" style={{ marginBottom: 38 }}>
            <p className="lp-eyebrow">The problem</p>
            <h2 className="lp-display lp-h2">Both sides are guessing</h2>
            <p className="lp-lead">
              A resume is a summary of a person written for nobody in particular, and a job post is a
              wish list written for everybody. AYN puts real evidence between them.
            </p>
          </div>
          <div className="lp-duo lp-reveal">
            {PAINS.map((p) => (
              <div className="lp-pain" key={p.who}>
                <h3 className="lp-display">{p.who}</h3>
                <ul>
                  {p.lines.map((l) => <li key={l}>{l}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SEEKER SHOWCASE ──────────────────────────────────── */}
      <section id="features" className="lp-section" style={{ paddingBlockStart: 0 }}>
        <div className="lp-shell">
          <div className="lp-split lp-reveal">
            <div>
              <p className="lp-eyebrow">For job seekers</p>
              <h2 className="lp-display lp-h2">One posting in, one tailored application out</h2>
              <p className="lp-lead">
                Open a job. AYN reads the whole posting off the live page, scores you against it, then
                writes a one page resume and a cover letter from your own history. Both stay attached to
                that job so you can find them again.
              </p>
              <div className="lp-cta-row" style={{ marginTop: 26 }}>
                <button type="button" className="lp-btn lp-btn-primary" onClick={() => onStartFree?.('job_seeker')}>
                  Start free <ArrowRight size={15} />
                </button>
              </div>
            </div>
            <div className="lp-art lp-art-plain">
              <TailoredDocsMockup />
            </div>
          </div>

          <div className="lp-bento lp-reveal" style={{ marginTop: 44 }}>
            {SEEKER_TILES.map((tile) => {
              const Icon = tile.icon;
              return (
                <article key={tile.title} className={`lp-tile ${tile.span}`}>
                  <span className="lp-tile-icon" aria-hidden="true">
                    <Icon size={20} strokeWidth={1.75} />
                  </span>
                  <h3>{tile.title}</h3>
                  <p>{tile.desc}</p>
                  {'meta' in tile && (
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

      {/* ── EMPLOYER SHOWCASE ────────────────────────────────── */}
      <section id="employers" className="lp-section" style={{ paddingBlockStart: 0 }}>
        <div className="lp-shell">
          <div className="lp-reveal" style={{ marginBottom: 34 }}>
            <p className="lp-eyebrow">For employers</p>
            <h2 className="lp-display lp-h2">Three people worth talking to, not six hundred maybes</h2>
            <p className="lp-lead">
              Describe the role in a few taps. AYN searches candidates who chose to be found and returns
              the strongest fits, each one with the evidence, the gaps and where every skill came from.
            </p>
          </div>

          <div className="lp-art lp-art-plain lp-reveal">
            <CandidateCardMockup />
          </div>

          <div className="lp-flow lp-reveal" style={{ marginTop: 36 }}>
            {EMPLOYER_STEPS.map((s, i) => {
              const Icon = s.icon;
              return (
                <div className="lp-flow-step" key={s.title}>
                  <span className="lp-tile-icon" aria-hidden="true"><Icon size={18} strokeWidth={1.75} /></span>
                  <span className="lp-step-n">STEP {i + 1}</span>
                  <h3 className="lp-display">{s.title}</h3>
                  <p>{s.desc}</p>
                </div>
              );
            })}
          </div>

          <div className="lp-split lp-reveal" style={{ marginTop: 52 }}>
            <div className="lp-art lp-art-plain">
              <AssessmentMockup />
            </div>
            <div>
              <p className="lp-eyebrow">Verification assessments</p>
              <h2 className="lp-display lp-h2">Find out who actually did the work</h2>
              <p className="lp-lead">
                Before you spend a proposal, send a short assessment generated from that candidate’s own
                claimed background against your role. The questions probe lived experience, so doing the
                work is the only way to answer well.
              </p>
              <div className="lp-chips">
                <span className="lp-chip">Score and observations, per question</span>
                <span className="lp-chip">Time spent on each answer</span>
                <span className="lp-chip">Server enforced timer</span>
                <span className="lp-chip">The candidate only sees growth notes</span>
              </div>
              <p className="lp-note">
                This checks depth of experience. It cannot prove someone answered unaided.
              </p>
              <div className="lp-cta-row" style={{ marginTop: 22 }}>
                <button type="button" className="lp-btn lp-btn-primary" onClick={() => onStartFree?.('employer')}>
                  Request employer access <ArrowRight size={15} />
                </button>
                <span className="lp-note" style={{ margin: 0 }}>We onboard employers one at a time.</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── TRUST ────────────────────────────────────────────── */}
      <section id="trust" className="lp-section" style={{ paddingBlockStart: 0 }}>
        <div className="lp-shell lp-reveal">
          <p className="lp-eyebrow">Built to be honest</p>
          <h2 className="lp-display lp-h2">It shows its work, including what it could not read</h2>
          <p className="lp-lead">
            AYN tells you which posting it read, which resume it used, which skills came from your own
            words and which it inferred. Guessing is labelled as guessing.
          </p>
          <div className="lp-chips">
            <span className="lp-chip"><Eye size={14} style={{ marginInlineEnd: 6, verticalAlign: -2 }} />Read only, always</span>
            <span className="lp-chip">Grounded in the real posting</span>
            <span className="lp-chip">You approve every introduction</span>
            <span className="lp-chip">Contact details released on accept only</span>
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
            <h2 className="lp-display lp-h2" style={{ maxWidth: 760, marginInline: 'auto' }}>
              Stop sending the same resume. Stop reading the wrong ones.
            </h2>
            <p className="lp-lead" style={{ color: 'hsl(0 0% 100% / 0.85)' }}>
              Add your background once. AYN does the matching, both directions.
            </p>
            <div className="lp-cta-row" style={{ justifyContent: 'center', marginTop: 30 }}>
              <button type="button" className="lp-btn lp-btn-invert" onClick={() => onStartFree?.('job_seeker')}>
                Start free <ArrowRight size={15} />
              </button>
              <button
                type="button"
                className="lp-btn lp-btn-ghost"
                style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.35)' }}
                onClick={() => onStartFree?.('employer')}
              >
                I am hiring
              </button>
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

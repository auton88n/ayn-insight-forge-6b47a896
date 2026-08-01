/**
 * LandingSections — AYN marketing page.
 *
 * v3.17.0: the page has ONE audience at a time. The switch at the top of the
 * hero owns every section below it, so a job seeker never scrolls into
 * employer copy and an employer never scrolls into seeker copy.
 * Every mockup on this page is a rendition of a screen that exists.
 */
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { openCookiePreferences } from '@/components/shared/CookieConsent';
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

type Audience = 'job_seeker' | 'employer';
type Props = { onStartFree?: (role?: Audience) => void };

const ATS = ['Greenhouse', 'Ashby', 'Lever', 'Workday', 'iCIMS', 'SmartRecruiters'];
const POOL_MARKS = ['Opted in candidates', 'Skill provenance', 'Match evidence', 'Verification assessments'];

const STRIP: Record<Audience, { label: string; marks: string[] }> = {
  job_seeker: { label: 'Reads job posts on', marks: ATS },
  employer: { label: 'Every candidate comes with', marks: POOL_MARKS },
};

const PAIN: Record<Audience, { eyebrow: string; title: string; lead: string; who: string; lines: string[] }> = {
  job_seeker: {
    eyebrow: 'The problem',
    title: 'You are guessing what they want',
    lead: 'The posting is written for everybody. Your resume is written for nobody.',
    who: 'If you are applying',
    lines: [
      'Same resume, forty postings, no replies.',
      'Rewriting it properly costs you an evening.',
      'You never learn which line lost you the interview.',
    ],
  },
  employer: {
    eyebrow: 'The problem',
    title: 'You are guessing who can actually do it',
    lead: 'A resume is a claim. You need the evidence behind it.',
    who: 'If you are hiring',
    lines: [
      'Six hundred resumes, most of them wrong.',
      'The good ones never see your ad.',
      'Confidence on paper proves nothing.',
    ],
  },
};

const SEEKER_TILES = [
  {
    span: 'lp-span-6',
    icon: Search,
    title: 'It reads the posting you are looking at',
    desc: 'Open a job, open the side panel, and AYN pulls the real description off the live page, then tells you where you stand out of 10 before you spend an evening on it.',
    meta: ['LinkedIn', 'Indeed', 'Greenhouse', 'Lever', 'Company sites'],
  },
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

const TRUST: Record<Audience, { title: string; lead: string; chips: string[] }> = {
  job_seeker: {
    title: 'It shows its work, including what it could not read',
    lead: 'AYN tells you which posting it read, which resume it used, which skills came from your own words and which it inferred. Guessing is labelled as guessing.',
    chips: [
      'Read only, always',
      'Grounded in the real posting',
      'Nothing invented about you',
      'Your contact details stay yours until you accept',
    ],
  },
  employer: {
    title: 'Every claim comes with where it came from',
    lead: 'Each candidate card separates what the person wrote themselves from what AYN inferred, names the gaps out loud, and never dresses a weak fit up as a strong one.',
    chips: [
      'Skills split by provenance',
      'Gaps stated, not hidden',
      'Assessments timed on the server',
      'Contact details released on accept only',
    ],
  },
};

const FAQS: Record<Audience, { q: string; a: string }[]> = {
  job_seeker: [
    {
      q: 'What does AYN do for me?',
      a: 'It reads the job posting on the page in front of you, scores you against it, then writes a one page resume and a cover letter from your own history. Both stay attached to that job.',
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
      q: 'Will it invent experience to make me look better?',
      a: 'No. Nothing appears in a tailored document that is not already in your profile. Missing requirements are shown to you as gaps instead of being written over.',
    },
    {
      q: 'Is AYN free to try?',
      a: 'Yes, free to start and no credit card is required.',
    },
  ],
  employer: [
    {
      q: 'Where do the candidates come from?',
      a: 'People who built a profile on AYN and explicitly turned on discovery. Nobody is scraped, and nobody is in the pool without saying yes to it.',
    },
    {
      q: 'How does the matching actually work?',
      a: 'A hard prefilter on your must have skills, semantic recall over the pool, then one grounded rerank. You get the strongest fits with the evidence, the gaps, and where every skill came from.',
    },
    {
      q: 'What is a verification assessment?',
      a: 'A short set of questions generated from that candidate\u2019s own claimed background against your role. It probes lived experience rather than textbook knowledge. You see the score, the per question observations and the time spent on each answer.',
    },
    {
      q: 'When do I get their contact details?',
      a: 'Only when the candidate accepts your proposal. Everything before that step is anonymous, enforced on the server rather than in the interface.',
    },
    {
      q: 'Can I message everyone at once?',
      a: 'No. One open proposal per candidate at a time, and no new proposal for thirty days after a decline. The pool is protected on purpose.',
    },
    {
      q: 'How do I get access?',
      a: 'Request employer access and we onboard companies one at a time, starting with a company profile so candidates know who is reaching out.',
    },
  ],
};

const HERO: Record<Audience, {
  headline: JSX.Element;
  lead: string;
  cta: string;
  note: string;
  art: JSX.Element;
}> = {
  job_seeker: {
    headline: <>Stop rewriting your resume for <em>every single job.</em></>,
    lead: 'A resume and cover letter written for the exact posting in front of you, from your real history, in the time it takes to read the ad.',
    cta: 'Start free',
    note: 'Read only on every page. AYN never types into a form and never submits anything for you.',
    art: <ExtensionOnPostingMockup />,
  },
  employer: {
    headline: <>Three people worth talking to, <em>not six hundred maybes.</em></>,
    lead: 'Describe the role once. AYN searches people who chose to be found and returns the strongest fits with the evidence, the gaps and a way to verify them before you commit.',
    cta: 'Request employer access',
    note: 'Contact details stay private until the candidate accepts your proposal.',
    art: <CandidateCardMockup />,
  },
};


export const LandingSections = memo(({ onStartFree }: Props) => {
  const root = useRef<HTMLDivElement>(null);
  const [audience, setAudience] = useState<Audience>(() => {
    if (typeof window === 'undefined') return 'job_seeker';
    return localStorage.getItem('ayn_landing_audience') === 'employer' ? 'employer' : 'job_seeker';
  });

  /**
   * Reveal on scroll. Re-runs whenever the audience changes, because the
   * sections below the hero are unmounted and remounted on a switch and would
   * otherwise stay invisible.
   */
  useEffect(() => {
    const nodes = root.current?.querySelectorAll('.lp-reveal:not(.is-in)');
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
  }, [audience]);

  const pickAudience = useCallback((next: Audience) => {
    setAudience((cur) => {
      if (cur === next) return cur;
      try { localStorage.setItem('ayn_landing_audience', next); } catch { /* ignore */ }
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return next;
    });
  }, []);

  /**
   * The header nav links to #features and #employers. Those ids only exist in
   * one mode, so a click on the other side flips the page first.
   */
  useEffect(() => {
    const onHash = () => {
      const id = window.location.hash.replace('#', '');
      if (id === 'employers') pickAudience('employer');
      if (id === 'features') pickAudience('job_seeker');
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [pickAudience]);

  const hero = HERO[audience];
  const strip = STRIP[audience];
  const pain = PAIN[audience];
  const trust = TRUST[audience];
  const seeker = audience === 'job_seeker';

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
              <h1 className="lp-display lp-h1" style={{ marginTop: 22 }}>{hero.headline}</h1>
              
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

      {/* Everything below belongs to the chosen audience only. */}
      <div className="lp-audience" key={`body-${audience}`}>
        {/* ── PROOF STRIP ────────────────────────────────────── */}
        <div className="lp-strip">
          <div className="lp-shell lp-strip-inner">
            <span className="lp-strip-label">{strip.label}</span>
            {strip.marks.map((n) => (
              <span key={n} className="lp-strip-mark">{n}</span>
            ))}
          </div>
        </div>

        {/* ── THE PAIN ───────────────────────────────────────── */}
        <section className="lp-section">
          <div className="lp-shell">
            <div className="lp-reveal" style={{ marginBottom: 38 }}>
              <p className="lp-eyebrow">{pain.eyebrow}</p>
              <h2 className="lp-display lp-h2">{pain.title}</h2>
              <p className="lp-lead">{pain.lead}</p>
            </div>
            <div className="lp-reveal">
              <div className="lp-pain lp-pain-solo">
                <h3 className="lp-display">{pain.who}</h3>
                <ul>
                  {pain.lines.map((l) => <li key={l}>{l}</li>)}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* ── SEEKER SHOWCASE ────────────────────────────────── */}
        {seeker && (
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
        )}

        {/* ── EMPLOYER SHOWCASE ──────────────────────────────── */}
        {!seeker && (
          <section id="employers" className="lp-section" style={{ paddingBlockStart: 0 }}>
            <div className="lp-shell">
              <div className="lp-reveal" style={{ marginBottom: 34 }}>
                <p className="lp-eyebrow">For employers</p>
                <h2 className="lp-display lp-h2">Read three people properly instead of skimming six hundred</h2>
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
                  {/* v3.19.0 — employer pricing lives here, the single public
                      source. The higher tiers stay unpublished on purpose. */}
                  <div className="lp-reveal" style={{ marginTop: 26 }}>
                    <p className="lp-display" style={{ fontSize: 'clamp(1.25rem, 2.4vw, 1.6rem)', fontWeight: 600, margin: 0 }}>
                      Free for your first month.
                    </p>
                    <p className="lp-note" style={{ marginTop: 8 }}>
                      Then from $199 a month. Every plan carries a monthly allowance: 100 searches and 10 proposals on Starter, 400 and 40 on Growth, 1200 and 120 on Scale. The free month gives you 25 searches and 5 proposals.
                    </p>
                  </div>
                  <div className="lp-cta-row" style={{ marginTop: 22 }}>
                    <button type="button" className="lp-btn lp-btn-primary" onClick={() => onStartFree?.('employer')}>
                      Request employer access <ArrowRight size={15} />
                    </button>
                    <span className="lp-note" style={{ margin: 0 }}>We approve employers one at a time.</span>
                  </div>

                </div>
              </div>
            </div>
          </section>
        )}

        {/* ── TRUST ──────────────────────────────────────────── */}
        <section id="trust" className="lp-section" style={{ paddingBlockStart: 0 }}>
          <div className="lp-shell lp-reveal">
            <p className="lp-eyebrow">Built to be honest</p>
            <h2 className="lp-display lp-h2">{trust.title}</h2>
            <p className="lp-lead">{trust.lead}</p>
            <div className="lp-chips">
              {trust.chips.map((c, i) => (
                <span className="lp-chip" key={c}>
                  {i === 0 && <Eye size={14} style={{ marginInlineEnd: 6, verticalAlign: -2 }} />}
                  {c}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ── FAQ ────────────────────────────────────────────── */}
        <section id="faq" className="lp-section" style={{ paddingBlockStart: 0 }}>
          <div className="lp-shell">
            <div className="lp-reveal" style={{ marginBottom: 28 }}>
              <p className="lp-eyebrow">Questions</p>
              <h2 className="lp-display lp-h2">Good to know</h2>
            </div>
            <div className="lp-faq lp-reveal">
              {FAQS[audience].map((f) => (
                <div className="lp-faq-item" key={f.q}>
                  <h3>{f.q}</h3>
                  <p>{f.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CLOSING ────────────────────────────────────────── */}
        <section className="lp-section" style={{ paddingBlockStart: 0 }}>
          <div className="lp-shell">
            <div className="lp-closing lp-reveal">
              <h2 className="lp-display lp-h2" style={{ maxWidth: 760, marginInline: 'auto' }}>
                {seeker
                  ? 'Stop sending the same resume into the dark.'
                  : 'Stop reading six hundred resumes to find three people.'}
              </h2>
              <p className="lp-lead" style={{ color: 'hsl(0 0% 100% / 0.85)' }}>
                {seeker
                  ? 'Add your background once. Every application after that is written for the job in front of you.'
                  : 'Describe the role once. AYN brings you the evidence, and a way to verify it.'}
              </p>
              <div className="lp-cta-row" style={{ justifyContent: 'center', marginTop: 30 }}>
                <button type="button" className="lp-btn lp-btn-invert" onClick={() => onStartFree?.(audience)}>
                  {hero.cta} <ArrowRight size={15} />
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* ── FOOTER ───────────────────────────────────────────── */}
      <footer className="lp-footer">
        <div className="lp-shell lp-footer-row">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 20px', alignItems: 'center' }}>
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
            <Link to="/do-not-sell">Do Not Sell or Share My Personal Information</Link>
            <button
              type="button"
              onClick={openCookiePreferences}
              style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'inherit', font: 'inherit' }}
            >
              Cookie choices
            </button>
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

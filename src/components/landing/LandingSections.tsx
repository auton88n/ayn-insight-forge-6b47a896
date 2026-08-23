/**
 * LandingSections — AYN marketing page.
 *
 * v3.17.0: the page has ONE audience at a time. The switch at the top of the
 * hero owns every section below it, so a job seeker never scrolls into
 * employer copy and an employer never scrolls into seeker copy.
 * Every mockup on this page is a rendition of a screen that exists.
 */
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { openCookiePreferences } from '@/components/shared/CookieConsent';
import { COPYRIGHT_LINE, COMPANY_TAGLINE, NAV_LINKS, COMPANY_LINKS } from '@/components/shared/siteLinks';
import { readAudience, writeAudience, type Audience } from '@/lib/landingAudience';
import aynLogo from '@/assets/ayn-logo.png';
import {
  ArrowRight, FileText, Target, ShieldCheck, MessagesSquare, Radar,
  Search, ClipboardCheck, MailCheck, Building2, Eye, Mail, Ban, Clock, Users,
} from 'lucide-react';
import {
  TailoredDocsMockup,
  CandidateCardMockup,
  AssessmentMockup,
  ShortlistMockup,
  InboxMockup,
} from './AppMockups';
import { BeforeAfterProof } from './BeforeAfterProof';
import { KineticHeadline } from './KineticHeadline';
import { TrustBento } from './TrustBento';
import { LiveJobsPreview } from './LiveJobsPreview';

type Props = { onStartFree?: (role?: Audience) => void };

// v3.48.0 — same social icons as src/components/shared/Footer.tsx, so the
// footer here matches instead of just showing bare legal links.
const DiscordIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width={18} height={18}>
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.947 2.418-2.157 2.418z" />
  </svg>
);
const XIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" width={16} height={16}>
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const SOURCING_MARKS = ['Real company career pages', 'Never LinkedIn or Indeed', 'Refreshed every 2 hours', 'Or paste any posting yourself'];
const POOL_MARKS = ['Opted in candidates', 'Skill provenance', 'Match evidence', 'Verification assessments'];

const STRIP: Record<Audience, { label: string; marks: string[] }> = {
  job_seeker: { label: 'Where jobs come from', marks: SOURCING_MARKS },
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
      'The company that would want you does not know you exist.',
    ],
  },
  employer: {
    eyebrow: 'The problem',
    title: 'You are guessing who can actually do it',
    lead: 'A resume is a claim. Hiring needs the evidence behind it.',
    who: 'If you are hiring',
    lines: [
      'A flooded inbox of resumes, most of them wrong.',
      'The right people never see your ad.',
      'Confidence on paper proves nothing.',
      'Or you hand it to an agency and pay a cut of the salary to skip the pile.',
    ],
  },
};

// The seeker-side contrast is against mass-apply/auto-apply bots (LazyApply,
// Sonara and the like). The employer-side contrast is the flip side of that
// same problem: those bots are exactly what's filling employer inboxes with
// generic, AI-written resumes, which is why the answer here is verification,
// not just matching. Two different competitor shapes, kept as two lists.
const AI_CONTRAST = [
  'Reads the actual job description, not a keyword list',
  'Writes from your real experience. Nothing invented, nothing generic',
  'You submit every application yourself. It never auto-applies for you',
];

const EMPLOYER_AI_CONTRAST = [
  'Skills labeled proven or inferred, never blended together',
  'Semantic matching on real evidence, not keyword stuffing',
  'Assessments built from their own claims. A generic AI cannot fake them',
];

// The seeker product is two things, not one: applying (a tailored resume for
// a job they found) and discovery (a profile employers can find them
// through). The tailoring side had all the marketing weight; this carries
// the other half, reusing the exact same card an employer sees, so the
// promise is not abstract, it is the literal screen.
const DISCOVER_CHIPS = [
  { icon: Radar, text: 'One toggle, in your profile' },
  { icon: Eye, text: 'Employers see evidence, never a resume pile' },
  { icon: ShieldCheck, text: 'Your name and contact stay private until you accept' },
];

// The employer-side reframe: lead with what changes for them (no agency
// fee, no resume pile, minutes not weeks), not a feature list. Real numbers
// stay out of it deliberately, agency pricing varies; the comparison is the
// honest, well known shape of it, not an invented figure.
const EASY_HIRING_CHIPS = [
  { icon: Ban, text: 'No recruiter fee, ever' },
  { icon: Clock, text: 'Minutes to a shortlist, not weeks' },
  { icon: Users, text: 'Three people to read, not a pile of resumes' },
];

const SEEKER_TILES = [
  {
    span: 'lp-span-6',
    icon: Search,
    title: 'The posting, read in full',
    desc: 'Browse real postings or add your own. See where you stand out of 10.',
    meta: ['Browse jobs', 'Add a link', 'Paste the text'],
  },
  {
    span: 'lp-span-3',
    icon: FileText,
    title: 'A resume for that one job',
    desc: 'Your real experience, in the language of the posting.',
    meta: ['PDF', 'DOCX', 'One page', 'Kept with the job'],
  },
  {
    span: 'lp-span-3',
    icon: MessagesSquare,
    title: 'A cover letter that names things',
    desc: 'The company, the role, the reason. No template sentences.',
    meta: ['Named company', 'Grounded in the posting'],
  },
  {
    span: 'lp-span-2',
    icon: Radar,
    title: 'Found while you sleep',
    desc: 'Turn on discovery. Employers see the evidence first, you decide who gets your contact.',
  },
  {
    span: 'lp-span-2',
    icon: Target,
    title: 'The honest gap list',
    desc: 'Matched, missing and nice to have, before a word is written.',
  },
  {
    span: 'lp-span-2',
    icon: ShieldCheck,
    title: 'Nothing invented',
    desc: 'No skill, number or title that is not already yours.',
  },
];

// The employer side already had a step-by-step "how it works" flow
// (EMPLOYER_STEPS below); the seeker side never did, only scattered tiles.
// This is the direct answer to "why should I apply through this instead of
// anywhere else": what the AI actually does, in the order it does it.
const SEEKER_STEPS = [
  {
    icon: Search,
    title: 'Reads the posting for you',
    desc: 'The real listing, in full, not a summary or a keyword scrape.',
  },
  {
    icon: Target,
    title: 'Scores your real fit',
    desc: 'What matches, what is missing, before a word is written.',
  },
  {
    icon: FileText,
    title: 'Writes for that one job',
    desc: 'A resume and cover letter from your real experience, in the posting\u2019s own language.',
  },
  {
    icon: Radar,
    title: 'Keeps working after you apply',
    desc: 'Turn on discovery and employers searching for your background find you too.',
  },
];

const EMPLOYER_STEPS = [
  {
    icon: Building2,
    title: 'Describe the role once',
    desc: 'Title, seniority, must have skills, location.',
  },
  {
    icon: Search,
    title: 'Read the strongest fits',
    desc: 'A short list, each name with its evidence and its gaps.',
  },
  {
    icon: ClipboardCheck,
    title: 'Verify before you commit',
    desc: 'A short assessment built from that person\u2019s own background.',
  },
  {
    icon: MailCheck,
    title: 'Invite the right one',
    desc: 'Send a proposal. Contact opens when they accept.',
  },
];

const TRUST: Record<Audience, { title: string; lead: string; chips: string[] }> = {
  job_seeker: {
    title: 'It shows its work',
    lead: 'You see the posting it read, the resume it used and what it inferred.',
    chips: [
      'Never auto-applies',
      'Grounded in the posting',
      'Nothing invented',
      'Your details stay yours',
    ],
  },
  employer: {
    title: 'Every claim has a source',
    lead: 'Claimed and inferred stay apart, and the gaps are named out loud.',
    chips: [
      'Skills by provenance',
      'Gaps stated plainly',
      'Server timed assessments',
      'Contact on accept',
    ],
  },
};

const FAQS: Record<Audience, { q: string; a: string }[]> = {
  job_seeker: [
    {
      q: 'What does AYN do for me?',
      a: 'It reads the job description in full and scores you against it. Then it writes a one page resume and a cover letter from your own history.',
    },
    {
      q: 'Where do the jobs come from?',
      a: 'Real company career pages, sourced automatically and refreshed every two hours, never LinkedIn or Indeed. You can also add any posting yourself, by link or by pasting the text.',
    },
    {
      q: 'Does it apply for me?',
      a: 'No. It writes the resume and the cover letter. You review them and submit the application yourself, on the company’s own site.',
    },
    {
      q: 'How do employers find me?',
      a: 'Turn on discovery in your Profile. Employers searching for people with your background can then see your evidence based profile and reach out with a proposal. Nothing about you opens until you accept.',
    },
    {
      q: 'Can employers see my name and email?',
      a: 'Not until you accept their proposal. Before that they see your profile and your match evidence only.',
    },
    {
      q: 'Is it really a real employer messaging me?',
      a: 'Yes. Every employer account is checked at signup: their email has to match their company’s own website domain, and personal email addresses are refused outright. You can message back and forth right in AYN, never through your personal email or phone, and every message is screened before it reaches you.',
    },
    {
      q: 'Will it invent experience?',
      a: 'No. Anything missing is shown to you as a gap instead.',
    },
    {
      q: 'Is it free to try?',
      a: 'Yes, free to start and no credit card needed.',
    },
  ],
  employer: [
    {
      q: 'Where do the candidates come from?',
      a: 'People who built a profile here and turned on discovery. Nobody is scraped.',
    },
    {
      q: 'How does this compare to a recruiter?',
      a: 'There is no placement fee. You pay a flat monthly rate no matter how many people you hire, where a staffing agency typically takes a cut of the new hire\u2019s first year pay just for the introduction.',
    },
    {
      q: 'How does the matching work?',
      a: 'A hard filter on your must have skills, then semantic recall, then one grounded rerank. You see the evidence and the gaps behind every name.',
    },
    {
      q: 'What is a verification assessment?',
      a: 'A short set of questions built from that candidate\u2019s background and your role. You see the score, the observations and the time spent per answer.',
    },
    {
      q: 'When do I get contact details?',
      a: 'Only when the candidate accepts. Everything before that is anonymous, enforced on the server.',
    },
    {
      q: 'Can I message everyone at once?',
      a: 'No. One open proposal per candidate, and none for thirty days after a decline.',
    },
    {
      q: 'How do I actually talk to a candidate?',
      a: 'Once you send a proposal, a real inbox opens on it right inside AYN. It stays one way until you choose to open it up, and every message either side sends is screened before it’s delivered, no links, no phone numbers, nothing routed off the platform.',
    },
    {
      q: 'How do I get access?',
      a: 'Request employer access. We onboard companies one at a time, starting with your company profile.',
    },
  ],
};

const HERO: Record<Audience, {
  headline: string;
  emphasis?: string;
  lead: string;
  cta: string;
  note: string;
  art?: JSX.Element;
}> = {
  job_seeker: {
    headline: 'Every real job, scored against you.',
    emphasis: 'Before you write a word.',
    // v3.204.0 -- SEO/positioning research, Aug 2026: "ghost jobs" is now
    // a named, widely-recognized term (47-67% of seekers report hitting
    // one), not just a mechanism to describe. Naming it directly matches
    // what people are actually searching for and already frustrated by.
    lead: "No ghost jobs. Company career pages only, refreshed continuously, never LinkedIn or Indeed.",
    cta: 'Start free',
    note: 'You review and send every application yourself. AYN never auto-applies for you.',
    art: <LiveJobsPreview />,
  },
  employer: {
    headline: 'AI-powered hiring built by engineers,',
    emphasis: 'for modern employers.',
    lead: "The smartest way to hunt, screen, and hire top engineering talent.",
    cta: 'Request employer access',
    note: 'Contact stays private until the candidate accepts.',
    art: <CandidateCardMockup />,
  },
};


export const LandingSections = memo(({ onStartFree }: Props) => {
  const root = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const [audience, setAudience] = useState<Audience>(readAudience);

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
      writeAudience(next);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      // A manual toggle click means "go to the top", full stop. Without this,
      // a hash left over from an earlier click (e.g. "See the difference" ->
      // #proof, or arriving from a header nav link) makes the hash-scroll
      // effect below re-fire on this same audience change and drag the page
      // back down to that old target, undoing the scroll to top above.
      if (window.location.hash) {
        navigate(window.location.pathname + window.location.search, { replace: true });
      }
      return next;
    });
  }, [navigate]);

  // Same as pickAudience but without the scroll-to-top: used when a hash
  // link is driving the switch, since the effect below scrolls to the
  // actual target section once it has mounted, not the top of the page.
  const setAudienceForHash = useCallback((next: Audience) => {
    setAudience((cur) => {
      if (cur === next) return cur;
      writeAudience(next);
      return next;
    });
  }, []);

  /**
   * The header nav links to #proof, #features and #employers. All three only
   * exist in one audience mode (#proof and #features are seeker-only,
   * #employers is employer-only), so arriving at one — a fresh load, a
   * same-page click, or a router navigation from another page, none of
   * which fire a native hashchange event — flips the page to match first.
   */
  useEffect(() => {
    const id = location.hash.replace('#', '');
    if (id === 'employers' || id === 'employers-how' || id === 'employers-features') setAudienceForHash('employer');
    else if (id === 'features' || id === 'proof') setAudienceForHash('job_seeker');
  }, [location.hash, setAudienceForHash]);

  // Scrolls to the hash target once it exists. Runs after every audience
  // change too, since #features/#employers only mount on the matching side.
  useEffect(() => {
    const id = location.hash.replace('#', '');
    if (!id) return;
    const t = window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    }, 60);
    return () => window.clearTimeout(t);
  }, [location.hash, audience]);

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
              <KineticHeadline text={hero.headline} emphasis={hero.emphasis} />

              <p className="lp-lead" style={{ maxWidth: 660 }}>{hero.lead}</p>

              <div className="lp-cta-row" style={{ marginTop: 30 }}>
                <button type="button" className="lp-btn lp-btn-primary" onClick={() => onStartFree?.(audience)}>
                  {hero.cta} <ArrowRight size={15} />
                </button>
                {seeker && (
                  <a href="#proof" className="lp-quiet-link">See the difference</a>
                )}
              </div>
              <p className="lp-note">{hero.note}</p>
            </div>
          </div>

          {hero.art && (
            <div className="lp-hero-art lp-audience" key={`art-${audience}`}>
              {hero.art}
            </div>
          )}
        </div>
      </header>

      {/* Everything below belongs to the chosen audience only. */}
      <div className="lp-audience" key={`body-${audience}`}>
        {/* ── PROOF STRIP ────────────────────────────────────── */}
        {seeker ? (
          // v3.204.0 -- design-audit finding, Aug 2026: the same freshness/
          // sourcing numbers this flat strip used to state as faint text
          // were repeated as low-weight cards on two other pages too, none
          // of them given real visual weight. One bento module, sized by
          // what actually matters, replaces all three for the seeker side.
          <div className="lp-shell">
            <TrustBento />
          </div>
        ) : (
          <div className="lp-strip">
            <div className="lp-shell lp-strip-inner">
              <span className="lp-strip-label">{strip.label}</span>
              {strip.marks.map((n) => (
                <span key={n} className="lp-strip-mark">{n}</span>
              ))}
            </div>
          </div>
        )}

        {/* ── BEFORE AND AFTER ───────────────────────────────── */}
        {seeker && (
          <div id="proof"><BeforeAfterProof /></div>
        )}


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

        {/* ── WHERE JOBS COME FROM ────────────────────────────── */}
        {seeker && (
          <section id="browse" className="lp-section" style={{ paddingBlockStart: 0 }}>
            <div className="lp-shell">
              <div className="lp-split lp-reveal">
                <div className="lp-art lp-art-plain">
                  <LiveJobsPreview />
                </div>
                <div>
                  <p className="lp-eyebrow">Where the jobs come from</p>
                  <h2 className="lp-display lp-h2">Real postings, pulled straight from the company. <em>Never scraped from a job board.</em></h2>
                  <p className="lp-lead">
                    Company career pages only, sourced automatically and refreshed every two hours. Never LinkedIn,
                    never Indeed. Do not see the role you are after? Add any posting yourself, by link or by pasting the text.
                  </p>
                  <div className="lp-cta-row" style={{ marginTop: 26 }}>
                    <button type="button" className="lp-btn lp-btn-primary" onClick={() => onStartFree?.('job_seeker')}>
                      Start free <ArrowRight size={15} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ── GET DISCOVERED ──────────────────────────────────── */}
        {seeker && (
          <section id="discover" className="lp-section" style={{ paddingBlockStart: 0 }}>
            <div className="lp-shell">
              <div className="lp-split lp-reveal">
                <div>
                  <p className="lp-eyebrow">The other half of AYN</p>
                  <h2 className="lp-display lp-h2">You do not have to find every job. <em>Some of them can find you.</em></h2>
                  <p className="lp-lead">
                    Applying is one job at a time, the one you found. Discovery works the other way: turn it on once,
                    and employers searching for people with your background find you first, evidence and all,
                    before they ever see your name.
                  </p>
                  <div className="lp-chips" style={{ marginTop: 22 }}>
                    {DISCOVER_CHIPS.map((c) => (
                      <span className="lp-chip" key={c.text}>
                        <c.icon size={14} />
                        {c.text}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="lp-art lp-art-plain">
                  <CandidateCardMockup />
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ── THE INBOX ────────────────────────────────────────── */}
        {seeker && (
          <section id="inbox" className="lp-section" style={{ paddingBlockStart: 0 }}>
            <div className="lp-shell">
              <div className="lp-split lp-reveal">
                <div>
                  <p className="lp-eyebrow">When an employer reaches out</p>
                  <h2 className="lp-display lp-h2">A real inbox, not your personal email. <em>Screened both ways.</em></h2>
                  <p className="lp-lead">
                    Every employer is checked before they can search or message anyone: their email has to match
                    their own company's website, personal email addresses are refused. Once they reach out, you talk
                    right inside AYN, one way until you choose to open it up, and every message either side sends is
                    screened before it arrives, no links, no phone numbers, nothing routed off the platform.
                  </p>
                  <div className="lp-chips" style={{ marginTop: 22 }}>
                    <span className="lp-chip"><ShieldCheck size={14} />Employer identity verified</span>
                    <span className="lp-chip"><Eye size={14} />You control two-way replies</span>
                    <span className="lp-chip"><Ban size={14} />No links or contact info, ever</span>
                  </div>
                </div>
                <div className="lp-art lp-art-plain">
                  <InboxMockup />
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ── REAL AI, NOT MASS-APPLY SPAM ───────────────────── */}
        {seeker && (
          <section className="lp-section" style={{ paddingBlockStart: 0 }}>
            <div className="lp-shell lp-reveal">
              <p className="lp-eyebrow">The AI, and what it refuses to do</p>
              <h2 className="lp-display lp-h2">Real AI, aimed at <em>the one job in front of you.</em></h2>
              <p className="lp-lead" style={{ maxWidth: 680 }}>
                Some tools use AI to auto-apply to hundreds of postings a day and hope volume gets you an interview.
                Low quality, unread by anyone, and it is not even looking for the right job, just applying to all of them.
                AYN's AI does the opposite: it reads the specific posting you have open, writes your resume and
                cover letter from your real experience for that job, and stops there.
              </p>
              <div className="lp-chips" style={{ marginTop: 22 }}>
                {AI_CONTRAST.map((c) => (
                  <span className="lp-chip" key={c}>
                    <ShieldCheck size={14} />
                    {c}
                  </span>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── SEEKER SHOWCASE ────────────────────────────────── */}
        {seeker && (
          <section id="features" className="lp-section" style={{ paddingBlockStart: 0 }}>
            <div className="lp-shell">
              <div className="lp-split lp-reveal">
                <div>
                  <p className="lp-eyebrow">For job seekers</p>
                  <h2 className="lp-display lp-h2">One posting in, one application out</h2>
                  <p className="lp-lead">
                    Open a job. Get a score, a resume and a cover letter for it.
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

              <div className="lp-reveal" style={{ marginTop: 48, marginBottom: 4 }}>
                <p className="lp-eyebrow">How AYN's AI helps you</p>
              </div>
              <div className="lp-flow lp-reveal">
                {SEEKER_STEPS.map((s, i) => {
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

        {/* ── EASY HIRING, NOT AN INDUSTRY ────────────────────── */}
        {!seeker && (
          <section className="lp-section" style={{ paddingBlockStart: 0 }}>
            <div className="lp-shell lp-reveal">
              <p className="lp-eyebrow">What changes for you</p>
              <h2 className="lp-display lp-h2">No recruiter retainer. <em>No pile of resumes.</em></h2>
              <p className="lp-lead" style={{ maxWidth: 680 }}>
                A staffing agency takes a cut of the salary just for the introduction. Doing it yourself costs an
                afternoon buried in resumes that all start to blur together. AYN skips both: describe the role once,
                and read three people worth an actual conversation, evidence already checked.
              </p>
              <div className="lp-chips" style={{ marginTop: 22 }}>
                {EASY_HIRING_CHIPS.map((c) => (
                  <span className="lp-chip" key={c.text}>
                    <c.icon size={14} />
                    {c.text}
                  </span>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── REAL AI, BUILT TO VERIFY ────────────────────────── */}
        {!seeker && (
          <section className="lp-section" style={{ paddingBlockStart: 0 }}>
            <div className="lp-shell lp-reveal">
              <p className="lp-eyebrow">The AI, and what it actually checks</p>
              <h2 className="lp-display lp-h2">Real AI, built to find out <em>who actually did the work.</em></h2>
              <p className="lp-lead" style={{ maxWidth: 680 }}>
                Anyone can generate a polished, tailored-sounding resume in seconds now, so a resume alone proves
                less than it used to. AYN's AI reads real evidence instead: it separates what a candidate has
                proven from what it only inferred, ranks fit on that evidence, and builds a short verification
                assessment from their own specific claims, the kind of thing a generic AI cannot fake its way through.
              </p>
              <div className="lp-chips" style={{ marginTop: 22 }}>
                {EMPLOYER_AI_CONTRAST.map((c) => (
                  <span className="lp-chip" key={c}>
                    <ShieldCheck size={14} />
                    {c}
                  </span>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ── EMPLOYER SHOWCASE ──────────────────────────────── */}
        {!seeker && (
          <section id="employers" className="lp-section" style={{ paddingBlockStart: 0 }}>
            <div className="lp-shell">
              <div id="employers-how" className="lp-reveal" style={{ marginBottom: 34 }}>
                <p className="lp-eyebrow">For employers</p>
                <h2 className="lp-display lp-h2">Read three people properly instead of skimming a pile of resumes</h2>
                <p className="lp-lead">
                  Describe the role in a few taps. Read the strongest fits, with the evidence.
                </p>
              </div>

              <div className="lp-art lp-art-plain lp-reveal">
                <ShortlistMockup />
              </div>

              <div className="lp-reveal" style={{ marginTop: 36, marginBottom: 4 }}>
                <p className="lp-eyebrow">How AYN's AI helps you</p>
              </div>
              <div className="lp-flow lp-reveal">
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

              <div id="employers-features" className="lp-split lp-reveal" style={{ marginTop: 52 }}>
                <div className="lp-art lp-art-plain">
                  <AssessmentMockup />
                </div>
                <div>
                  <p className="lp-eyebrow">Verification assessments</p>
                  <h2 className="lp-display lp-h2">Find out who actually did the work</h2>
                  <p className="lp-lead">
                    Send a short assessment built from their own background and your role.
                  </p>
                  <div className="lp-chips">
                    <span className="lp-chip">Score and observations</span>
                    <span className="lp-chip">Time spent per answer</span>
                    <span className="lp-chip">Server enforced timer</span>
                    <span className="lp-chip">Candidate sees growth notes only</span>
                  </div>
                  <p className="lp-note">
                    It checks depth of experience, not who was in the room.
                  </p>
                  {/* v3.19.0 — employer pricing lives here, the single public
                      source. The higher tiers stay unpublished on purpose. */}
                  <div className="lp-reveal" style={{ marginTop: 26 }}>
                    <p className="lp-display" style={{ fontSize: 'clamp(1.25rem, 2.4vw, 1.6rem)', fontWeight: 600, margin: 0 }}>
                      Free for your first month.
                    </p>
                    <p className="lp-note" style={{ marginTop: 8 }}>
                      Then from $199 a month. Starter gives you 100 searches and 10 proposals, Growth 400 and 40, Scale 1200 and 120. The free month gives you 25 and 5.
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

        {/* ── EMPLOYER INBOX ──────────────────────────────────── */}
        {!seeker && (
          <section id="employer-inbox" className="lp-section" style={{ paddingBlockStart: 0 }}>
            <div className="lp-shell">
              <div className="lp-split lp-reveal">
                <div>
                  <p className="lp-eyebrow">Once they say yes</p>
                  <h2 className="lp-display lp-h2">Talk to them without leaving AYN. <em>Screened both ways.</em></h2>
                  <p className="lp-lead">
                    A real inbox opens on every proposal, no personal email or phone number ever exchanged. It stays
                    one way until you choose to open it up, and every message either side sends, yours and theirs,
                    is screened before it's delivered: no links, no phone numbers, nothing routed off the platform.
                  </p>
                  <div className="lp-chips" style={{ marginTop: 22 }}>
                    <span className="lp-chip"><Eye size={14} />You control two-way replies</span>
                    <span className="lp-chip"><ShieldCheck size={14} />Every message screened</span>
                    <span className="lp-chip"><Ban size={14} />No links or contact info, ever</span>
                  </div>
                </div>
                <div className="lp-art lp-art-plain">
                  <InboxMockup />
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
              {trust.chips.map((c) => (
                <span className="lp-chip" key={c}>
                  <Eye size={14} />
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
                  : 'Stop digging through a pile of resumes to find three people.'}
              </h2>
              <p className="lp-lead" style={{ color: 'hsl(0 0% 100% / 0.85)' }}>
                {seeker
                  ? 'Add your background once. Every application after that is written for the job, and every employer searching finds you too.'
                  : 'Describe the role once. No agency fee, just the evidence.'}
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
        <div className="lp-shell">
          <div className="lp-footer-top">
            <div className="lp-footer-brand">
              <img src={aynLogo} alt="AYN" style={{ height: 30, width: 'auto' }} />
              <p className="lp-footer-tagline">{COMPANY_TAGLINE}</p>
              <div className="lp-footer-social">
                <a href="mailto:info@ayn.careers" aria-label="Email"><Mail size={18} /></a>
                <a href="https://discord.gg/y2DcBegbC7" target="_blank" rel="noopener noreferrer" aria-label="Discord"><DiscordIcon /></a>
                <a href="https://x.com/AYNN_AI" target="_blank" rel="noopener noreferrer" aria-label="X (Twitter)"><XIcon /></a>
              </div>
            </div>

            <div className="lp-footer-cols">
              <div className="lp-footer-col">
                <h4>Navigate</h4>
                <ul>
                  {NAV_LINKS.map(l => (
                    <li key={l.to}><Link to={l.to}>{l.label}</Link></li>
                  ))}
                </ul>
              </div>
              <div className="lp-footer-col">
                <h4>Company</h4>
                <ul>
                  {COMPANY_LINKS.map(l => (
                    <li key={l.to}><Link to={l.to}>{l.label}</Link></li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="lp-footer-bottom">
            <span>{COPYRIGHT_LINE}</span>
            <div className="lp-footer-bottom-links">
              <Link to="/privacy">Privacy Policy</Link>
              <button type="button" onClick={openCookiePreferences}>Cookie choices</button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
});

LandingSections.displayName = 'LandingSections';

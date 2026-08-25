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
import { readAudience, writeAudience, type Audience } from '@/lib/landingAudience';
import {
  ArrowRight, ShieldCheck, Eye, Ban, Clock, Users,
  Search, ClipboardCheck, MailCheck, Building2,
} from 'lucide-react';
import { CandidateCardMockup, AssessmentMockup, ShortlistMockup, InboxMockup } from './AppMockups';
import { KineticHeadline } from './KineticHeadline';
import { HeadToHead } from './HeadToHead';
import { JobsBrowser } from './JobsBrowser';
import { LandingFooter } from './LandingFooter';
import { PAIN, HEAD_TO_HEAD, TRUST, FAQS } from './landingContent';
import { HOME_TAB_CONTENT, type HomeTabId } from './HomeTabs';

// v3.210.0 -- the structural rework: AYN is no longer one page trying to be
// legible to two different buyers via an in-place toggle. "/" commits to
// the job seeker identity (the side with no cold-start problem, since jobs
// are sourced independently of any employer using AYN); "/employers" is
// its own real route with its own door in from the seeker experience,
// not a switch fighting for the same hero. forcedAudience locks this
// component to whichever identity its route owns -- the toggle only
// renders when it's left unset, which no real route does any more.
type Props = {
  // v3.233.0 -- the optional second argument (which auth tab to open on)
  // was missing here, silently stripped by the one-argument wrapper below
  // on its way to TabContent -- the sign-in gate's own "Sign in" link
  // called this correctly, but it always got 'signup' regardless.
  onStartFree?: (role?: Audience, tab?: 'signin' | 'signup') => void;
  forcedAudience?: Audience;
  activeTab?: HomeTabId;
  onSelectTab?: (id: HomeTabId) => void;
};

const SOURCING_MARKS = ['Real company career pages', 'Never LinkedIn or Indeed', 'Refreshed every 2 hours', 'Or paste any posting yourself'];
const POOL_MARKS = ['Opted in candidates', 'Skill provenance', 'Match evidence', 'Verification assessments'];

const STRIP: Record<Audience, { label: string; marks: string[] }> = {
  job_seeker: { label: 'Where jobs come from', marks: SOURCING_MARKS },
  employer: { label: 'Every candidate comes with', marks: POOL_MARKS },
};

// v3.214.0 -- PAIN/HEAD_TO_HEAD/TRUST/FAQS moved to landingContent.ts (see
// the import above) so the nine seeker pages this section content split
// into can share the exact same copy this file still uses for the
// employer route, rather than each holding its own drifting copy.

const EMPLOYER_AI_CONTRAST = [
  'Skills labeled proven or inferred, never blended together',
  'Semantic matching on real evidence, not keyword stuffing',
  'Assessments built from their own claims. A generic AI cannot fake them',
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

// v3.214.0 -- SEEKER_TILES and SEEKER_STEPS moved to landingContent.ts.
// v3.216.0 -- read by HomeTabs.tsx's FeaturesTab/HowItWorksTab now, not
// rendered directly on this page any more.

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

// v3.214.0 -- TRUST and FAQS moved to landingContent.ts.
// v3.216.0 -- seeker's own copies now render inside HomeTabs.tsx's
// ProofTab/FaqTab, a tab on Home, not a separate route.

const HERO: Record<Audience, {
  headline: string;
  emphasis?: string;
  lead: string;
  cta: string;
  note: string;
  art?: JSX.Element;
}> = {
  job_seeker: {
    // v3.207.0 -- reported directly: the landing page should work like a
    // better version of Indeed, a real search a visitor can use right
    // there, not a page selling a picture of one. "Scored against you"
    // promised a signed-in feature (a match score needs a resume) as the
    // very first thing a search returns -- rewritten to say only what a
    // search actually gives back the instant someone runs it: real
    // postings, never a ghost listing.
    headline: 'Search real jobs.',
    emphasis: 'Never a ghost listing.',
    lead: "Every posting is pulled straight from the company's own career page, refreshed continuously. Never scraped from LinkedIn or Indeed.",
    cta: 'Start free',
    note: 'You review and send every application yourself. AYN never auto-applies for you.',
  },
  employer: {
    // v3.210.0 -- honest, concierge framing instead of generic
    // "smartest way to hire" SaaS copy. AYN's employer side is genuinely
    // early: every company is reviewed by hand before it can search, real
    // volume is still small. That is not a weakness to paper over with a
    // bigger-sounding headline, it is why a company that joins now gets
    // real attention instead of getting lost in an already-crowded
    // self-serve product.
    headline: 'We review every company ourselves.',
    emphasis: 'Then you get three real people to read, not a resume pile.',
    lead: 'Describe the role once. AYN matches it against real candidates who chose to be found, verifies them before you ever see a name, and every company is approved by hand before it can search.',
    cta: 'Request employer access',
    note: 'Contact stays private until the candidate accepts.',
    art: <CandidateCardMockup />,
  },
};


export const LandingSections = memo(({ onStartFree, forcedAudience, activeTab = 'search', onSelectTab }: Props) => {
  const root = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const [audience, setAudience] = useState<Audience>(forcedAudience ?? readAudience);

  /**
   * Reveal on scroll. Re-runs whenever the audience OR the active tab
   * changes, because the sections below the hero (and every HomeTabs tab's
   * own content) are unmounted and remounted on either kind of switch and
   * would otherwise stay invisible -- a real, live bug found while
   * verifying v3.219.0's new tabs: this effect only depended on audience,
   * which for both real routes (forcedAudience always set) never changes
   * after mount, so the observer that started running here ran exactly
   * once, for whatever .lp-reveal nodes existed at that first render (the
   * "search" tab). Every other tab's own .lp-reveal blocks were newly
   * mounted DOM nodes the observer never knew to watch, so they sat at
   * opacity: 0 forever -- confirmed live (0 of 3 revealed on Features),
   * not previously caught because verification checked .innerText, which
   * reads text regardless of the element's actual opacity.
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
  }, [audience, activeTab]);

  const pickAudience = useCallback((next: Audience) => {
    if (forcedAudience) return; // locked by the route; no toggle to switch
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
  }, [navigate, forcedAudience]);

  // Same as pickAudience but without the scroll-to-top: used when a hash
  // link is driving the switch, since the effect below scrolls to the
  // actual target section once it has mounted, not the top of the page.
  const setAudienceForHash = useCallback((next: Audience) => {
    if (forcedAudience) return; // this route only ever has one audience's ids to scroll to
    setAudience((cur) => {
      if (cur === next) return cur;
      writeAudience(next);
      return next;
    });
  }, [forcedAudience]);

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
    else if (id === 'features' || id === 'proof' || id === 'how-it-works') setAudienceForHash('job_seeker');
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

  // v3.216.0 -- "keep within the same page, all sections should open
  // within it": Features through FAQ are no longer routes, they're a tab
  // selection SeekerSidebar drives. A non-search tab replaces the hero and
  // browser entirely, the same full-swap Resume Hub's own tabs already do,
  // rather than stacking a second page's worth of content below the hero.
  // The employer route never passes activeTab, so this is always 'search'
  // there and this whole branch is a no-op for it.
  const showTabContent = seeker && activeTab !== 'search';
  const TabContent = showTabContent ? HOME_TAB_CONTENT[activeTab as Exclude<HomeTabId, 'search'>] : null;

  // v3.213.0 -- rendered in a different position per audience (employer
  // keeps its original spot right after the hero; seeker's own copy of
  // this same section moved to sit after Features/How it works, per the
  // requested home -> features -> how it works -> the rest order), so it's
  // one element referenced twice rather than duplicated JSX.
  const painSection = (
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

        <div className="lp-reveal" style={{ marginTop: 40 }}>
          <HeadToHead themLabel={HEAD_TO_HEAD[audience].themLabel} rows={HEAD_TO_HEAD[audience].rows} />
        </div>
      </div>
    </section>
  );

  return (
    <div className="lp" ref={root}>
      {/* v3.226.0 -- reported directly: every tab's content started well
          below the top of the page, not at it. This wrapper's own
          paddingBlockStart (up to 72px) was stacking on top of the FIRST
          thing every real tab renders, its own <section className="lp-
          section">, which already carries a padding-block up to 132px --
          204px of pure padding before any real content, close to three
          times Home's own 72px max. Removed here; .lp-section's own top
          padding is already the real spacing every tab needs, the same
          amount Home itself uses for its own first block. */}
      {showTabContent && TabContent && (
        <div className="lp-audience" key={`tab-${activeTab}`}>
          <TabContent
            onSelectTab={(id) => onSelectTab?.(id)}
            onStartFree={(role, tab) => onStartFree?.(role, tab)}
          />
        </div>
      )}

      {!showTabContent && (
      <>
      {/* ── HERO (employer only) ────────────────────────────────
          v3.218.0 -- "remove the hero from job seekers": this is our
          real dashboard now, not a landing page selling the seeker on
          using it, so a marketing headline above the actual search tool
          no longer earns its place. Employer's own hero is untouched --
          this instruction was scoped to seekers, and /employers still
          needs a real pitch for a visitor who hasn't signed up yet. */}
      {!seeker && (
      <header className="lp-hero">
        <div className="lp-hero-aura" aria-hidden="true" />
        <div className="lp-shell lp-hero-center">
          <div className="lp-hero-copy">
            {forcedAudience ? (
              // v3.210.0 -- a real, labeled door to the other identity
              // instead of a toggle sharing the same hero. This route has
              // already committed to one audience; the other one gets a
              // quiet way out, not equal billing.
              <Link to={forcedAudience === 'job_seeker' ? '/employers' : '/'} className="lp-quiet-link lp-audience-door">
                {forcedAudience === 'job_seeker' ? 'Hiring instead? See AYN for employers' : 'Looking for a job instead? See AYN for job seekers'}
              </Link>
            ) : (
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
            )}

            <div className="lp-audience" key={audience}>
              <KineticHeadline text={hero.headline} emphasis={hero.emphasis} />

              <p className="lp-lead" style={{ maxWidth: 660 }}>{hero.lead}</p>

              <div className="lp-cta-row" style={{ marginTop: 30 }}>
                <button type="button" className="lp-btn lp-btn-primary lp-btn-lg" onClick={() => onStartFree?.(audience)}>
                  {hero.cta} <ArrowRight size={16} />
                </button>
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
      )}

      {/* v3.213.0 -- "make home the browser page": the real search/browse
          experience is the seeker home page's own primary content, not a
          preview of it elsewhere. Full .lp-shell width, not a narrower
          hero column, since a real list-plus-detail layout needs the
          room. v3.218.0 -- with the hero gone, this is now the very first
          thing on the page, so it carries the real page heading itself
          (showHeading + asH1) instead of sitting under one.
          v3.240.0 -- reported directly: "diffrent hight like the old
          problem." Measured live: this view's own `paddingBlockStart:
          clamp(40px, 6vw, 72px)` topped out 32px shorter than
          `.lp-section`'s `padding-block: clamp(72px, 11vw, 132px)`,
          the shared top spacing v3.226.0 and v3.237.0 already gave
          every other tab and standalone page -- this one early-return
          seeker branch sat between both fixes' scope and never picked
          it up. Same `.lp-section`/`.lp-shell` pair now, no bespoke
          padding of its own. */}
      {seeker && (
        <section className="lp-section" style={{ paddingBlockEnd: 0 }}>
        <div className="lp-shell">
          <JobsBrowser showHeading asH1 />
          <p className="lp-note" style={{ marginTop: 22, textAlign: 'center' }}>
            {hero.note} Want AYN to score every job against your resume automatically?{' '}
            <button
              type="button"
              className="lp-quiet-link"
              style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer' }}
              onClick={() => onStartFree?.(audience)}
            >
              Start free
            </button>.
          </p>
        </div>
        </section>
      )}

      {/* Everything below belongs to the chosen audience only. */}
      <div className="lp-audience" key={`body-${audience}`}>
        {/* ── PROOF STRIP (employer only here -- seeker's TrustBento moves
             into the seeker "rest of things" block further down) ─────── */}
        {!seeker && (
          <div className="lp-strip">
            <div className="lp-shell lp-strip-inner">
              <span className="lp-strip-label">{strip.label}</span>
              {strip.marks.map((n) => (
                <span key={n} className="lp-strip-mark">{n}</span>
              ))}
            </div>
          </div>
        )}

        {/* ── THE PAIN (employer position -- unchanged. Seeker's own copy
             of this same section renders again further down, in its new,
             requested position, using the same painSection element). ── */}
        {!seeker && painSection}

        {/* v3.222.0 -- the seeker TrustBento stat strip that used to sit
             here moved into HomeTabs.tsx's FeaturesTab, alongside its own
             closing CTA (see below) -- direct instruction: this block was
             showing up on Home and it needed to live on Features only. */}

        {/* v3.215.0 -- the "Keep exploring" tile grid that used to live
             here is gone: SeekerSidebar is now the one place these nine
             pages are linked from, not repeated again in the page body. */}

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

        {/* ── TRUST (employer only -- seeker's own copy of this content
             now lives on /proof) ──────────────────────────────────────── */}
        {!seeker && (
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
        )}

        {/* ── FAQ (employer only -- seeker's own copy now lives on /faq) ── */}
        {!seeker && (
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
        )}

      </div>
      </>
      )}

      {/* ── CLOSING (employer only) ─────────────────────────────
          v3.222.0 -- the seeker version of this closer moved into
          HomeTabs.tsx's FeaturesTab, the one tab it's now scoped to, per a
          direct instruction that it was repeating on Home and on every
          other tab. Employer's own single-page /employers route still ends
          on it unconditionally -- there's no tab system there to scope it
          to, and this route genuinely needs its own real closer. */}
      {!seeker && (
      <section className="lp-section" style={{ paddingBlockStart: 0 }}>
        <div className="lp-shell">
          <div className="lp-closing lp-reveal">
            <h2 className="lp-display lp-h2" style={{ maxWidth: 760, marginInline: 'auto' }}>
              Stop digging through a pile of resumes to find three people.
            </h2>
            <p className="lp-lead" style={{ color: 'hsl(0 0% 100% / 0.85)' }}>
              Describe the role once. No agency fee, just the evidence.
            </p>
            <div className="lp-cta-row" style={{ justifyContent: 'center', marginTop: 30 }}>
              <button type="button" className="lp-btn lp-btn-invert lp-btn-lg" onClick={() => onStartFree?.(audience)}>
                {hero.cta} <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </section>
      )}

      <LandingFooter />
    </div>
  );
});

LandingSections.displayName = 'LandingSections';

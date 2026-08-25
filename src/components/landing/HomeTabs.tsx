/**
 * HomeTabs -- the seven explanation sections, each a real tab within Home,
 * not a separate route. v3.216.0, direct instruction: "when you make a
 * page open dont take me to new page keep within the same page all
 * sections should open within it" -- the same architecture Resume Hub's
 * own tabs already use (local state, never a route change). Clicking a
 * tab in SeekerSidebar swaps which of these renders in the main pane;
 * the URL and the sidebar itself never move.
 *
 * Two of the nine pages from v3.214.0 are folded into a sibling here
 * rather than kept as their own tab: Real AI (three chips and one
 * paragraph) reads thin on its own and restates a claim Why AYN already
 * makes, and Where jobs come from is largely the same sourcing claim
 * Home's own hero and TrustBento already lead with. Merged, not deleted:
 * every real fact from both survives, just placed where it earns its
 * spot rather than padded into a page of its own.
 */
import { useEffect, useMemo, useState } from 'react';
import { Search as SearchIcon, ChevronDown, Check, Loader2, ShieldCheck, Eye, Ban, ArrowRight, Sparkles, Building2, Lock, Gift, FileCheck2 } from 'lucide-react';
import { HeadToHead } from './HeadToHead';
import { BeforeAfterProof } from './BeforeAfterProof';
import { LiveJobsPreview } from './LiveJobsPreview';
import { TrustBento } from './TrustBento';
import { CandidateCardMockup, InboxMockup, SameResumeMockup, TailoredDocsMockup } from './AppMockups';
import { PAIN, HEAD_TO_HEAD, AI_CONTRAST, DISCOVER_CHIPS, TRUST, FAQS, SEEKER_TILES, SEEKER_STEPS } from './landingContent';
import {
  ProfileAccountTab, MatchedJobsAccountTab, SavedJobsAccountTab, ProposalsAccountTab,
  AssessmentsAccountTab, SettingsAccountTab,
} from './AccountTabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SectionHeading } from '@/components/shared/SectionHeading';
import TicketForm from '@/components/support/TicketForm';
import { supabase } from '@/integrations/supabase/client';
import { billingApi, priceLabel, type SeekerBilling } from '@/lib/billing';
import { toast } from 'sonner';
import type { Audience } from '@/lib/landingAudience';

export type HomeTabId =
  | 'search' | 'features' | 'how-it-works' | 'why-ayn'
  | 'get-discovered' | 'proof' | 'faq'
  | 'pricing' | 'contact' | 'about' | 'help'
  | 'profile' | 'matched-jobs' | 'saved-jobs' | 'proposals' | 'assessments' | 'account-settings';

// v3.219.0 -- every tab now takes the same two callbacks, whether it needs
// them or not (a plain () => JSX.Element is still a valid value here --
// TypeScript allows a function that takes fewer parameters wherever one
// taking more is expected). onSelectTab lets a tab link to another tab
// without ever leaving the page (Help -> Contact); onStartFree opens the
// one AuthModal the shell owns, instead of a tab mounting a second one.
export type TabProps = {
  onSelectTab: (id: HomeTabId) => void;
  // v3.233.0 -- the optional second argument lets a caller open straight
  // to Sign In instead of the default Sign Up tab, without a second
  // callback threaded through every tab component. Omitted, it behaves
  // exactly as before.
  onStartFree: (role?: Audience, tab?: 'signin' | 'signup') => void;
};

// v3.229.0 -- Messaging removed as its own entry, folded into Get
// discovered (one continuous story: turn on discovery, then here's what
// happens once someone reaches out), part of the same sidebar reorg pass.
export const TAB_META: { id: HomeTabId; label: string }[] = [
  { id: 'features', label: 'Features' },
  { id: 'how-it-works', label: 'How it works' },
  { id: 'why-ayn', label: 'Why AYN' },
  { id: 'get-discovered', label: 'Get discovered' },
  { id: 'proof', label: 'Proof' },
  // v3.233.0 -- renamed from "FAQ" so the nav label matches the page's own
  // heading ("Good to know"), the friendlier of the two, rather than the
  // reader landing on a heading that never echoes the word they clicked.
  { id: 'faq', label: 'Good to know' },
];

export const MORE_TAB_META: { id: HomeTabId; label: string }[] = [
  { id: 'pricing', label: 'Pricing' },
  { id: 'contact', label: 'Contact' },
  { id: 'about', label: 'About' },
  { id: 'help', label: 'Help' },
];

// v3.228.0 -- the five tabs that used to only exist behind the separate
// /resume-hub shell (see AccountTabs.tsx). Real content, gated on being
// signed in; the nav item itself is always visible, signed in or not.
export const ACCOUNT_TAB_META: { id: HomeTabId; label: string }[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'matched-jobs', label: 'Job matches' },
  { id: 'saved-jobs', label: 'Saved jobs' },
  { id: 'proposals', label: 'Proposals' },
  { id: 'assessments', label: 'Assessments' },
  { id: 'account-settings', label: 'Settings' },
];

// v3.219.0 -- the sessionStorage key LandingPage.tsx reads on mount to land
// on a specific tab, used by HomeTabRedirect (old /pricing etc. links) and,
// as of v3.220.0, by SeekerSidebar itself when it's rendered on a real,
// separate route (like /jobs) rather than on Home -- clicking a tab button
// there has to navigate to "/" first, so it stashes the target the same way.
export const HOME_TAB_HANDOFF_KEY = 'ayn_home_tab';

// v3.222.0 -- the seeker TrustBento stat strip and the "Stop sending the
// same resume into the dark" closer both used to sit on Home and repeat on
// every tab. Direct instruction: move both here, Features only, nowhere
// else. onStartFree is destructured, not the whole TabProps object, since
// this is the one tab that actually needs a button of its own.
export const FeaturesTab = ({ onStartFree }: TabProps) => (
  <>
    <section className="lp-section">
      <div className="lp-shell">
        <div className="lp-reveal" style={{ marginBottom: 38 }}>
          <p className="lp-eyebrow">Features</p>
          <h2 className="lp-display lp-h2">Everything AYN actually does for you</h2>
          <p className="lp-lead">One posting in, one real application out. Nothing here is a preview, it is what you get.</p>
        </div>
        <div className="lp-bento lp-reveal">
          {SEEKER_TILES.map((tile) => {
            const Icon = tile.icon;
            return (
              <article key={tile.title} className={`lp-tile ${tile.span}`}>
                <span className="lp-tile-icon" aria-hidden="true"><Icon size={20} strokeWidth={1.75} /></span>
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

    <div className="lp-shell" style={{ paddingBlockStart: 'clamp(56px, 8vw, 96px)' }}>
      <TrustBento />
    </div>

    <section className="lp-section" style={{ paddingBlockStart: 0 }}>
      <div className="lp-shell">
        <div className="lp-closing lp-reveal">
          <h2 className="lp-display lp-h2" style={{ maxWidth: 760, marginInline: 'auto' }}>
            Stop sending the same resume into the dark.
          </h2>
          <p className="lp-lead" style={{ color: 'hsl(0 0% 100% / 0.85)' }}>
            Add your background once. Every application after that is written for the job, and every employer searching finds you too.
          </p>
          <div className="lp-cta-row" style={{ justifyContent: 'center', marginTop: 30 }}>
            <button type="button" className="lp-btn lp-btn-invert lp-btn-lg" onClick={() => onStartFree?.('job_seeker')}>
              Start free <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </section>
  </>
);

export const HowItWorksTab = () => (
  <section className="lp-section">
    <div className="lp-shell">
      <div className="lp-split lp-reveal" style={{ marginBottom: 48 }}>
        <div>
          <p className="lp-eyebrow">How it works</p>
          <h2 className="lp-display lp-h2">One posting in, one application out</h2>
          <p className="lp-lead">Open a job from the search tab. Get a score, a resume and a cover letter for it.</p>
        </div>
        <div className="lp-art lp-art-plain"><TailoredDocsMockup /></div>
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
    </div>
  </section>
);

const pain = PAIN.job_seeker;
const headToHead = HEAD_TO_HEAD.job_seeker;

export const WhyAynTab = () => (
  <section className="lp-section">
    <div className="lp-shell">
      <div className="lp-split lp-reveal" style={{ marginBottom: 44 }}>
        <div>
          <p className="lp-eyebrow">{pain.eyebrow}</p>
          <h2 className="lp-display lp-h2">{pain.title}</h2>
          <p className="lp-lead">{pain.lead}</p>
          <div className="lp-pain lp-pain-solo" style={{ marginTop: 26 }}>
            <h3 className="lp-display">{pain.who}</h3>
            <ul>{pain.lines.map((l) => <li key={l}>{l}</li>)}</ul>
          </div>
        </div>
        <div className="lp-art lp-art-plain"><SameResumeMockup /></div>
      </div>
      <div className="lp-reveal" style={{ marginTop: 40 }}>
        <HeadToHead themLabel={headToHead.themLabel} rows={headToHead.rows} />
      </div>

      {/* v3.216.0 -- Real AI, folded in here rather than its own thin page:
          the same "why choose AYN" positioning, one section down.
          v3.229.0 -- reported directly: this section still read like it was
          describing the retired Chrome extension ("the posting you have
          open," "the job in front of you" -- language for a tool that
          watched a live browser tab). AYN has no such mechanism any more;
          a job is something you add to AYN (browse it, paste a link, or
          paste the text), not something "open" elsewhere. Reworded to
          describe the real, current flow. */}
      <div className="lp-reveal" style={{ marginTop: 56 }}>
        <p className="lp-eyebrow">The AI, and what it refuses to do</p>
        <h2 className="lp-display lp-h2">Real AI, aimed at <em>one job at a time.</em></h2>
        <p className="lp-lead" style={{ maxWidth: 680 }}>
          Some tools use AI to auto-apply to hundreds of postings a day and hope volume gets you an interview.
          Low quality, unread by anyone, and it is not even looking for the right job, just applying to all of them.
          AYN's AI does the opposite: it reads the specific posting you added, writes your resume and
          cover letter from your real experience for that job, and stops there.
        </p>
        <div className="lp-chips" style={{ marginTop: 22 }}>
          {AI_CONTRAST.map((c) => (
            <span className="lp-chip" key={c}><ShieldCheck size={14} />{c}</span>
          ))}
        </div>
      </div>
    </div>
  </section>
);

// v3.229.0 -- Messaging folded in here, not its own tab any more. Reported
// directly: reorganize the sidebar for a better experience, and the two
// were always one real story told in two parts -- turn on discovery, then
// here's what happens once someone actually reaches out. Splitting them
// meant reading two separate tabs to get the whole picture; one tab now
// tells it start to finish, discovery first, the inbox as its direct
// continuation ("once someone reaches out" picks up exactly where
// discovery's own copy leaves off).
export const GetDiscoveredTab = () => (
  <>
    <section className="lp-section" style={{ paddingBlockEnd: 0 }}>
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
                <span className="lp-chip" key={c.text}><c.icon size={14} />{c.text}</span>
              ))}
            </div>
          </div>
          <div className="lp-art lp-art-plain"><CandidateCardMockup /></div>
        </div>
      </div>
    </section>

    <section className="lp-section">
      <div className="lp-shell">
        <div className="lp-split lp-reveal">
          <div>
            <p className="lp-eyebrow">Once someone reaches out</p>
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
          <div className="lp-art lp-art-plain"><InboxMockup /></div>
        </div>
      </div>
    </section>
  </>
);

const trust = TRUST.job_seeker;

export const ProofTab = () => (
  <>
    <section className="lp-section" style={{ paddingBlockEnd: 0 }}>
      <div className="lp-shell lp-reveal">
        <p className="lp-eyebrow">Proof</p>
        <h2 className="lp-display lp-h2">A real resume, rewritten for one job</h2>
        <p className="lp-lead">Not a demo. The same difference every real tailoring run makes.</p>
      </div>
    </section>
    <BeforeAfterProof />
    <section className="lp-section" style={{ paddingBlockStart: 0 }}>
      <div className="lp-shell lp-reveal">
        <p className="lp-eyebrow">Built to be honest</p>
        <h2 className="lp-display lp-h2">{trust.title}</h2>
        <p className="lp-lead">{trust.lead}</p>
        <div className="lp-chips">
          {trust.chips.map((c) => (
            <span className="lp-chip" key={c}><Eye size={14} />{c}</span>
          ))}
        </div>
      </div>
    </section>

    {/* v3.216.0 -- Where jobs come from, folded in here: this is the same
        sourcing claim Home's own hero and TrustBento already lead with,
        so it belongs next to the OTHER evidence for trusting AYN, not a
        near-duplicate page of its own. */}
    <section className="lp-section" style={{ paddingBlockStart: 0 }}>
      <div className="lp-shell">
        <div className="lp-split lp-reveal">
          <div className="lp-art lp-art-plain"><LiveJobsPreview /></div>
          <div>
            <p className="lp-eyebrow">Where the jobs come from</p>
            <h2 className="lp-display lp-h2">Real postings, pulled straight from the company. <em>Never scraped from a job board.</em></h2>
            <p className="lp-lead">
              Company career pages only, sourced automatically and refreshed every two hours. Never LinkedIn,
              never Indeed. Do not see the role you are after? Add any posting yourself, by link or by pasting the text.
            </p>
          </div>
        </div>
      </div>
    </section>
  </>
);

// v3.235.0 -- reported directly, alongside the standalone-page and
// resume-hub polish: this tab was eight identical white blocks stacked
// in one column, no visual differentiation, reading as a plain wall of
// text next to every other tab's mockup or bento grid. Each question now
// carries a real icon badge (matching its own actual topic, not a
// decorative repeat of the same mark eight times) using the identical
// .lp-tile-icon language Features' own tile grid already established,
// and the list itself is a real two-column grid at desktop width instead
// of one long column.
const FAQ_ICONS = [Sparkles, Building2, Ban, Eye, Lock, ShieldCheck, FileCheck2, Gift];

export const FaqTab = () => {
  const faqs = FAQS.job_seeker;
  return (
    <section className="lp-section">
      <div className="lp-shell">
        <div className="lp-reveal" style={{ marginBottom: 28 }}>
          <p className="lp-eyebrow">Questions</p>
          <h2 className="lp-display lp-h2">Good to know</h2>
        </div>
        <div className="lp-faq lp-faq-grid lp-reveal">
          {faqs.map((f, i) => {
            const Icon = FAQ_ICONS[i % FAQ_ICONS.length];
            return (
              <div className="lp-faq-item" key={f.q}>
                <div className="lp-tile-icon lp-faq-item-icon"><Icon size={18} strokeWidth={1.9} /></div>
                <h3>{f.q}</h3>
                <p>{f.a}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

// v3.219.0 -- Pricing, Contact, About and Help all used to be real routes
// with their own <Header/>/<Footer/> chrome -- exactly the thing reported
// directly: "i click pricing... i dont see the sidebar anymore." Same
// content, same real logic (Pricing's billing state, Help's search),
// just rendered as a tab instead of a page. /pricing, /contact, /about
// and /help still exist as real URLs (old links/bookmarks keep working)
// but now redirect into this same tab, never their own separate chrome.

const PLANS: { key: string; name: string; cents: number; interval: string; credits: number; line: string; tag?: string }[] = [
  { key: 'seeker_free', name: 'Free', cents: 0, interval: 'month', credits: 6, line: 'Three tailored resumes a month, or six cover letters.' },
  { key: 'seeker_week', name: 'Week pass', cents: 499, interval: 'week', credits: 30, line: 'For the week you are applying hard.' },
  { key: 'seeker_starter', name: 'Starter', cents: 1200, interval: 'month', credits: 80, line: 'A steady search, around forty tailored resumes.', tag: 'Most chosen' },
  { key: 'seeker_pro', name: 'Pro', cents: 2400, interval: 'month', credits: 200, line: 'A full time search with room to spare.' },
];

const FREE_FOREVER = [
  'Match scoring on any job you add',
  'Your profile and your resume',
  'Being discovered by employers',
  'Receiving and answering proposals',
  'Taking assessments',
  'Downloading every document you make',
];

export const PricingTab = ({ onStartFree }: TabProps) => {
  const [signedIn, setSignedIn] = useState(false);
  const [billing, setBilling] = useState<SeekerBilling | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { setSignedIn(false); return; }
      setSignedIn(true);
      try { setBilling(await billingApi.seeker()); } catch { /* silent */ }
    })();
  }, []);

  const choose = async (key: string) => {
    if (!signedIn) { onStartFree(); return; }
    if (key === 'seeker_free') return;
    setBusy(key);
    try {
      const url = await billingApi.checkout(key);
      window.location.href = url;
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(null);
    }
  };

  return (
    <section className="lp-section">
      {/* v3.234.0 -- reported directly: "layout sizes... you are just
          keeping using what we built." 1080px across four cards at a
          220px floor left each card around 256px wide, tight for a price,
          a credit line, a description and a full-width button. Widened
          the shell and the column floor so a card actually has room to
          breathe; the price itself now reads as the card's own headline
          (Outfit, larger, tighter) instead of matching the body font at
          barely more than paragraph size. */}
      <div className="lp-shell" style={{ maxWidth: 1160 }}>
        <div className="lp-reveal" style={{ marginBottom: 34, textAlign: 'center' }}>
          <Badge className="ayn-ember-badge">Pricing for job seekers</Badge>
          <h2 className="lp-display lp-h2" style={{ marginTop: 14 }}>Less time formatting. More time applying.</h2>
          <p className="lp-lead" style={{ maxWidth: 620, marginInline: 'auto' }}>
            A tailored resume costs 2 credits. A cover letter costs 1. Everything else is free.
          </p>
        </div>

        {billing && (
          <div className="lp-reveal" style={{ marginBottom: 34, marginInline: 'auto', maxWidth: 480, textAlign: 'center' }}>
            <p className="lp-note">
              You are on {billing.plan?.name || 'Free'} with{' '}
              <strong>{billing.balance} credits</strong> left.
              {billing.current_period_end
                ? ` Credits reset on ${new Date(billing.current_period_end).toLocaleDateString()}.`
                : ''}
            </p>
          </div>
        )}

        <div className="lp-reveal" style={{ display: 'grid', gap: 20, gridTemplateColumns: 'repeat(auto-fit, minmax(248px, 1fr))' }}>
          {PLANS.map((p) => {
            const current = billing?.plan?.key === p.key;
            const featured = p.key === 'seeker_starter';
            return (
              <div
                key={p.key}
                className="lp-tile"
                style={featured ? {
                  borderColor: 'hsl(var(--lp-ember))',
                  background: 'linear-gradient(160deg, hsl(var(--lp-ember) / 0.05) 0%, hsl(var(--lp-card)) 55%)',
                } : undefined}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <h3 style={{ margin: 0 }}>{p.name}</h3>
                  {current ? (
                    <span className="lp-chip">Your plan</span>
                  ) : p.tag ? (
                    <Badge className="ayn-ember-badge" style={{ fontSize: 11, padding: '3px 10px' }}>{p.tag}</Badge>
                  ) : null}
                </div>
                <p className="lp-display" style={{ fontSize: 32, margin: '14px 0 0', lineHeight: 1 }}>{priceLabel(p.cents, p.interval)}</p>
                <p style={{ color: 'hsl(var(--lp-ember))', fontWeight: 600, fontSize: 14, margin: '8px 0 0' }}>{p.credits} credits</p>
                <p style={{ flex: 1, margin: '12px 0 0' }}>{p.line}</p>
                <button
                  type="button"
                  className={`lp-btn ${p.key === 'seeker_starter' ? 'lp-btn-primary' : 'lp-btn-ghost'}`}
                  style={{ width: '100%', justifyContent: 'center', marginTop: 16 }}
                  disabled={current || busy === p.key}
                  onClick={() => choose(p.key)}
                >
                  {busy === p.key ? <Loader2 size={15} className="animate-spin" /> : current ? 'Current plan' : p.cents === 0 ? 'Start free' : `Choose ${p.name}`}
                </button>
              </div>
            );
          })}
        </div>

        <div className="lp-reveal" style={{ marginTop: 40 }}>
          <h3 className="lp-display" style={{ fontSize: 18 }}>Free on every plan, including Free</h3>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginTop: 16 }}>
            {FREE_FOREVER.map((f) => (
              <div key={f} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <Check size={16} style={{ color: 'hsl(var(--lp-ember))', flexShrink: 0, marginTop: 2 }} />
                <span className="lp-note" style={{ margin: 0 }}>{f}</span>
              </div>
            ))}
          </div>
          <p className="lp-note" style={{ marginTop: 18 }}>
            Regenerating the same document is free. Failed generations are not charged. Credits reset each period and do not roll over.
          </p>
        </div>
      </div>
    </section>
  );
};

export const ContactTab = () => {
  useEffect(() => {
    document.body.classList.add('contact-surface');
    return () => document.body.classList.remove('contact-surface');
  }, []);

  return (
    <section className="lp-section">
      {/* v3.226.0 -- reported directly: "make the contact us bigger."
          maxWidth: 720 was a leftover from when this was its own standalone
          route at a narrower, page-of-its-own scale; every other tab now
          reaches the full 1360px .lp-shell. Widened to 960 -- still a
          sensible, readable width for a form (this isn't prose that needs
          a narrow measure), just no longer artificially squeezed to less
          than a third of what the rest of the page uses. */}
      <div className="lp-shell" style={{ maxWidth: 960 }}>
        <div className="lp-reveal" style={{ marginBottom: 32 }}>
          <p className="lp-eyebrow">Contact</p>
          <h2 className="lp-display lp-h2">Contact us</h2>
          <p className="lp-lead">Send a message. A real person reads it.</p>
        </div>
        <div className="lp-reveal">
          <SectionHeading>Send us a message</SectionHeading>
          {/* v3.234.0 -- was a bare rounded-2xl/border/p-3 wrapper (12px of
              padding around a form sitting inside a 960px-wide shell), the
              generic shadcn card look rather than this page's own design
              language. .lp-panel gives it the same considered depth as
              every other content block on the page. */}
          <div className="lp-panel">
            <TicketForm onSuccess={() => undefined} />
          </div>
        </div>
      </div>
    </section>
  );
};

export const AboutTab = () => (
  <section className="lp-section">
    <div className="lp-shell" style={{ maxWidth: 720 }}>
      <div className="lp-reveal" style={{ marginBottom: 8 }}>
        <p className="lp-eyebrow">About AYN</p>
        <h2 className="lp-display lp-h2">Hiring runs on volume. We think it should run on evidence.</h2>
        <p className="lp-lead">AYN is built by a team in Canada.</p>
      </div>
      <div className="lp-reveal" style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p className="lp-note" style={{ fontSize: 15 }}>
          AI made it effortless to apply everywhere, so everyone did. Hiring drowned in noise, and a hiring
          manager who used to read forty applications started opening six hundred and reading none of them
          properly. Somewhere in that pile was the one person who could actually do the job. Nobody had time
          to find them.
        </p>
        <p className="lp-pullquote">
          We built AYN because that person should not have to out-send a machine to be seen.
        </p>
        <div>
          <h3 className="lp-display" style={{ fontSize: 17, marginBottom: 8 }}>Mission and vision</h3>
          <p className="lp-note" style={{ fontSize: 15 }}>
            Replace volume with evidence. Build a hiring market where being seen depends on what you have
            done, not on how many places you applied.
          </p>
        </div>
        <p className="lp-note" style={{ fontSize: 15 }}>
          For job seekers, AYN reads a job posting, shows how you line up against it, and writes a resume
          and cover letter from your real experience for that specific role. For employers, describe a role
          once and AYN finds the people worth talking to, with the evidence behind each match and what they
          are missing, instead of six hundred resumes and a guess.
        </p>
        <p className="lp-note" style={{ fontSize: 15 }}>
          Switch discoverability on and employers see your background, not your name, email, or phone, until
          you accept an offer.
        </p>
      </div>
    </div>
  </section>
);

export const HelpTab = ({ onSelectTab }: TabProps) => {
  const [query, setQuery] = useState('');
  const hasQuery = query.trim().length > 0;

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SECTIONS;
    return SECTIONS
      .map((s) => ({ ...s, entries: s.entries.filter((e) => (e.q + ' ' + e.a).toLowerCase().includes(q)) }))
      .filter((s) => s.entries.length > 0);
  }, [query]);

  return (
    <section className="lp-section">
      <div className="lp-shell" style={{ maxWidth: 720 }}>
        <div className="lp-reveal" style={{ marginBottom: 28 }}>
          <p className="lp-eyebrow">Help Center</p>
          <h2 className="lp-display lp-h2">Help Center</h2>
          <p className="lp-lead">Search for an answer, or open a question below. Anything else goes to a real person on the team.</p>
        </div>

        <div className="lp-reveal" style={{ position: 'relative', marginBottom: 32 }}>
          <SearchIcon size={16} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: 'hsl(var(--lp-dim))' }} aria-hidden="true" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for an answer"
            aria-label="Search for an answer"
            className="pl-11 h-12 rounded-full"
          />
        </div>

        <div className="lp-reveal" style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          {results.map((section) => (
            <div key={section.title}>
              <SectionHeading className="mb-3">{section.title}</SectionHeading>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {section.entries.map((e) => (
                  <details key={e.q} open={hasQuery || undefined} className="group rounded-2xl border border-border bg-card p-5">
                    <summary className="flex items-center justify-between gap-4 cursor-pointer list-none font-semibold marker:content-none">
                      {e.q}
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
                    </summary>
                    <p className="mt-2.5 text-muted-foreground leading-relaxed">{e.a}</p>
                  </details>
                ))}
              </div>
            </div>
          ))}

          {results.length === 0 && (
            <p className="lp-note">
              Nothing matched that.{' '}
              <button type="button" className="lp-quiet-link" style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer' }} onClick={() => onSelectTab('contact')}>
                Contact us
              </button>{' '}
              and a real person will read it.
            </p>
          )}
        </div>

        <div className="lp-reveal" style={{ marginTop: 40 }}>
          <SectionHeading className="mb-3">Still stuck</SectionHeading>
          <div className="rounded-2xl border border-border bg-card p-6">
            <p className="lp-note" style={{ margin: 0 }}>
              A real person reads every message. Include what you were doing and what happened, and a
              screenshot if you have one.
            </p>
            <p className="lp-note" style={{ marginTop: 10, fontSize: 13 }}>
              {/* v3.233.0 -- this line used to quote the Service Level
                  Agreement's employer-only support table ("Growth 2, Scale
                  1"), plan names that never appear anywhere on this page or
                  on seeker Pricing, and the SLA itself says plainly it does
                  not apply to job seeker plans. This is the seeker Help
                  page, so it now states the real, honest seeker-scoped
                  aim instead of borrowing an employer commitment. */}
              Response aim: best effort on Free, faster on a paid plan. This is an aim, not a
              commitment.
            </p>
            <button type="button" className="lp-btn lp-btn-primary" style={{ marginTop: 16 }} onClick={() => onSelectTab('contact')}>
              Contact us
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

type HelpEntry = { q: string; a: string };
type HelpSection = { title: string; entries: HelpEntry[] };

const SECTIONS: HelpSection[] = [
  {
    title: 'Getting started',
    entries: [
      { q: 'How do I start?', a: 'Create a free account, add your resume, and either browse real postings or add one yourself by link or by pasting the text.' },
      { q: 'Do I need a card?', a: 'No, and the free plan does not expire.' },
      { q: 'Where do the postings come from?', a: 'Real company career pages, sourced automatically and refreshed every two hours. Never LinkedIn or Indeed. You can also add any posting yourself.' },
      { q: 'Does it apply for me?', a: 'No. It writes the resume and the cover letter. You review them and submit the application yourself, on the company’s own site.' },
    ],
  },
  {
    title: 'Credits and billing',
    entries: [
      { q: 'What do credits pay for?', a: 'AI writing. A tailored resume is 2 credits, a cover letter is 1.' },
      { q: 'What is free?', a: 'Scoring, gaps, reading postings, discoverability, offers, and assessments. Every plan.' },
      { q: 'Do credits roll over?', a: 'No, they reset each billing period.' },
      { q: 'Charged if generation fails?', a: 'No. Regenerating the same document is also free.' },
      { q: 'Can I cancel or downgrade?', a: 'Yes, from Billing. Both take effect at the end of your paid period, no refund for the remainder.' },
      { q: 'Refunds?', a: 'Not unless your local law requires one. Cancel instead and keep access until the period ends.' },
    ],
  },
  {
    title: 'Being found by employers',
    entries: [
      { q: 'How do employers find me?', a: 'Only if you switch discovery on. Off by default.' },
      { q: 'What can they see?', a: 'Your background: work history, skills, education, what you want. Not your contact details.' },
      { q: 'When do they get my contact details?', a: 'Only when you accept their offer.' },
      { q: 'Can I turn it off?', a: 'Any time.' },
      { q: 'What is an assessment?', a: 'Optional questions an employer can send before making an offer. You get growth notes, not the score.' },
    ],
  },
  {
    title: 'Your data',
    entries: [
      { q: 'Can I download my data?', a: 'Yes, from Settings.' },
      { q: 'Can I delete my account?', a: 'Yes, from Settings. You will see what is removed before you confirm.' },
      { q: 'Something lighter than deleting?', a: 'Yes, pause your account. Turns off discovery and emails without deleting anything.' },
      { q: 'Where is my data stored?', a: 'United Kingdom. Details on our Subprocessors page.' },
      { q: 'Do you train AI on my resume?', a: 'No. See our Privacy Policy for how that works.' },
    ],
  },
  {
    title: 'For employers',
    entries: [
      { q: 'How do I get access?', a: 'Request it. Accounts are approved individually.' },
      { q: 'What do I get?', a: 'Describe a role and see candidates who chose to be discoverable, with the evidence behind each match.' },
      { q: 'Does AYN decide who I hire?', a: 'No. You do.' },
    ],
  },
];

export const HOME_TAB_CONTENT: Record<Exclude<HomeTabId, 'search'>, (props: TabProps) => JSX.Element> = {
  features: FeaturesTab,
  'how-it-works': HowItWorksTab,
  'why-ayn': WhyAynTab,
  'get-discovered': GetDiscoveredTab,
  proof: ProofTab,
  faq: FaqTab,
  pricing: PricingTab,
  contact: ContactTab,
  about: AboutTab,
  help: HelpTab,
  profile: ProfileAccountTab,
  'matched-jobs': MatchedJobsAccountTab,
  'saved-jobs': SavedJobsAccountTab,
  proposals: ProposalsAccountTab,
  assessments: AssessmentsAccountTab,
  'account-settings': SettingsAccountTab,
};

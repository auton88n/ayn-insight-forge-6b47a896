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
import { Search as SearchIcon, ChevronDown, Check, Loader2, ShieldCheck, Eye, Ban } from 'lucide-react';
import { HeadToHead } from './HeadToHead';
import { BeforeAfterProof } from './BeforeAfterProof';
import { LiveJobsPreview } from './LiveJobsPreview';
import { CandidateCardMockup, InboxMockup } from './AppMockups';
import { PAIN, HEAD_TO_HEAD, AI_CONTRAST, DISCOVER_CHIPS, TRUST, FAQS, SEEKER_TILES, SEEKER_STEPS } from './landingContent';
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
  | 'get-discovered' | 'messaging' | 'proof' | 'faq'
  | 'pricing' | 'contact' | 'about' | 'help';

// v3.219.0 -- every tab now takes the same two callbacks, whether it needs
// them or not (a plain () => JSX.Element is still a valid value here --
// TypeScript allows a function that takes fewer parameters wherever one
// taking more is expected). onSelectTab lets a tab link to another tab
// without ever leaving the page (Help -> Contact); onStartFree opens the
// one AuthModal the shell owns, instead of a tab mounting a second one.
export type TabProps = { onSelectTab: (id: HomeTabId) => void; onStartFree: (role?: Audience) => void };

export const TAB_META: { id: HomeTabId; label: string }[] = [
  { id: 'features', label: 'Features' },
  { id: 'how-it-works', label: 'How it works' },
  { id: 'why-ayn', label: 'Why AYN' },
  { id: 'get-discovered', label: 'Get discovered' },
  { id: 'messaging', label: 'Messaging' },
  { id: 'proof', label: 'Proof' },
  { id: 'faq', label: 'FAQ' },
];

export const MORE_TAB_META: { id: HomeTabId; label: string }[] = [
  { id: 'pricing', label: 'Pricing' },
  { id: 'contact', label: 'Contact' },
  { id: 'about', label: 'About' },
  { id: 'help', label: 'Help' },
];

export const FeaturesTab = () => (
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
);

export const HowItWorksTab = () => (
  <section className="lp-section">
    <div className="lp-shell">
      <div className="lp-reveal" style={{ marginBottom: 34 }}>
        <p className="lp-eyebrow">How it works</p>
        <h2 className="lp-display lp-h2">One posting in, one application out</h2>
        <p className="lp-lead">Open a job from the search tab. Get a score, a resume and a cover letter for it.</p>
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
      <div className="lp-reveal" style={{ marginBottom: 38 }}>
        <p className="lp-eyebrow">{pain.eyebrow}</p>
        <h2 className="lp-display lp-h2">{pain.title}</h2>
        <p className="lp-lead">{pain.lead}</p>
      </div>
      <div className="lp-reveal">
        <div className="lp-pain lp-pain-solo">
          <h3 className="lp-display">{pain.who}</h3>
          <ul>{pain.lines.map((l) => <li key={l}>{l}</li>)}</ul>
        </div>
      </div>
      <div className="lp-reveal" style={{ marginTop: 40 }}>
        <HeadToHead themLabel={headToHead.themLabel} rows={headToHead.rows} />
      </div>

      {/* v3.216.0 -- Real AI, folded in here rather than its own thin page:
          the same "why choose AYN" positioning, one section down. */}
      <div className="lp-reveal" style={{ marginTop: 56 }}>
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
            <span className="lp-chip" key={c}><ShieldCheck size={14} />{c}</span>
          ))}
        </div>
      </div>
    </div>
  </section>
);

export const GetDiscoveredTab = () => (
  <section className="lp-section">
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
);

export const MessagingTab = () => (
  <section className="lp-section">
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
        <div className="lp-art lp-art-plain"><InboxMockup /></div>
      </div>
    </div>
  </section>
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

export const FaqTab = () => {
  const faqs = FAQS.job_seeker;
  return (
    <section className="lp-section">
      <div className="lp-shell">
        <div className="lp-reveal" style={{ marginBottom: 28 }}>
          <p className="lp-eyebrow">Questions</p>
          <h2 className="lp-display lp-h2">Good to know</h2>
        </div>
        <div className="lp-faq lp-reveal">
          {faqs.map((f) => (
            <div className="lp-faq-item" key={f.q}>
              <h3>{f.q}</h3>
              <p>{f.a}</p>
            </div>
          ))}
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

const PLANS = [
  { key: 'seeker_free', name: 'Free', cents: 0, interval: 'month', credits: 6, line: 'Three tailored resumes a month, or six cover letters.' },
  { key: 'seeker_week', name: 'Week pass', cents: 499, interval: 'week', credits: 30, line: 'For the week you are applying hard.' },
  { key: 'seeker_starter', name: 'Starter', cents: 1200, interval: 'month', credits: 80, line: 'A steady search, around forty tailored resumes.' },
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
      <div className="lp-shell" style={{ maxWidth: 1080 }}>
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

        <div className="lp-reveal" style={{ display: 'grid', gap: 18, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          {PLANS.map((p) => {
            const current = billing?.plan?.key === p.key;
            return (
              <div key={p.key} className="lp-tile" style={p.key === 'seeker_starter' ? { borderColor: 'hsl(var(--lp-ember))' } : undefined}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h3 style={{ margin: 0 }}>{p.name}</h3>
                  {current && <span className="lp-chip">Your plan</span>}
                </div>
                <p style={{ fontSize: 24, fontWeight: 700, margin: '10px 0 0' }}>{priceLabel(p.cents, p.interval)}</p>
                <p style={{ color: 'hsl(var(--lp-ember))', fontWeight: 600, fontSize: 14, margin: '6px 0 0' }}>{p.credits} credits</p>
                <p style={{ flex: 1, margin: '10px 0 0' }}>{p.line}</p>
                <button
                  type="button"
                  className={`lp-btn ${p.key === 'seeker_starter' ? 'lp-btn-primary' : 'lp-btn-ghost'}`}
                  style={{ width: '100%', justifyContent: 'center', marginTop: 16 }}
                  disabled={current || busy === p.key}
                  onClick={() => choose(p.key)}
                >
                  {busy === p.key ? <Loader2 size={15} className="animate-spin" /> : current ? 'Current plan' : p.cents === 0 ? 'Start free' : 'Choose plan'}
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
      <div className="lp-shell" style={{ maxWidth: 720 }}>
        <div className="lp-reveal" style={{ marginBottom: 28 }}>
          <p className="lp-eyebrow">Contact</p>
          <h2 className="lp-display lp-h2">Contact us</h2>
          <p className="lp-lead">Send a message. A real person reads it.</p>
        </div>
        <div className="lp-reveal">
          <SectionHeading>Send us a message</SectionHeading>
          <div className="rounded-2xl border border-border bg-card p-2">
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
        <p className="lp-note" style={{ fontSize: 15 }}>
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
              Response aims: free plan best effort, Starter 3 business days, Growth 2, Scale 1. These are
              aims and not commitments.
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
  messaging: MessagingTab,
  proof: ProofTab,
  faq: FaqTab,
  pricing: PricingTab,
  contact: ContactTab,
  about: AboutTab,
  help: HelpTab,
};

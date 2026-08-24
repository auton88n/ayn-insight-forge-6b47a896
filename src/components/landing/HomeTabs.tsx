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
import { ShieldCheck, Eye, Ban } from 'lucide-react';
import { HeadToHead } from './HeadToHead';
import { BeforeAfterProof } from './BeforeAfterProof';
import { LiveJobsPreview } from './LiveJobsPreview';
import { CandidateCardMockup, InboxMockup } from './AppMockups';
import { PAIN, HEAD_TO_HEAD, AI_CONTRAST, DISCOVER_CHIPS, TRUST, FAQS, SEEKER_TILES, SEEKER_STEPS } from './landingContent';

export type HomeTabId =
  | 'search' | 'features' | 'how-it-works' | 'why-ayn'
  | 'get-discovered' | 'messaging' | 'proof' | 'faq';

export const TAB_META: { id: HomeTabId; label: string }[] = [
  { id: 'features', label: 'Features' },
  { id: 'how-it-works', label: 'How it works' },
  { id: 'why-ayn', label: 'Why AYN' },
  { id: 'get-discovered', label: 'Get discovered' },
  { id: 'messaging', label: 'Messaging' },
  { id: 'proof', label: 'Proof' },
  { id: 'faq', label: 'FAQ' },
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

export const HOME_TAB_CONTENT: Record<Exclude<HomeTabId, 'search'>, () => JSX.Element> = {
  features: FeaturesTab,
  'how-it-works': HowItWorksTab,
  'why-ayn': WhyAynTab,
  'get-discovered': GetDiscoveredTab,
  messaging: MessagingTab,
  proof: ProofTab,
  faq: FaqTab,
};

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
import { useMemo, useState } from "react";
import { Search as SearchIcon, ChevronDown, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import type { TabProps } from "../homeTabMeta";

export const HelpTab = ({ onSelectTab }: TabProps) => {
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState('Getting started');
  const hasQuery = query.trim().length > 0;

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SECTIONS.filter(section => section.title === topic);
    return SECTIONS
      .map((s) => ({ ...s, entries: s.entries.filter((e) => (e.q + ' ' + e.a).toLowerCase().includes(q)) }))
      .filter((s) => s.entries.length > 0);
  }, [query, topic]);

  return (
    <section className="lp-section">
      {/* v3.237.0 -- reported directly: every tab needs to match in width
          and positioning. This shell's own 720px cap centered its content
          268px further right than Features' left-aligned equivalent at
          the same viewport, measured live on this exact class of bug on
          About's own heading. This content is a search box and an
          accordion list, not prose needing a narrow reading measure --
          the same shape as FAQ, already at the full 1360px shell -- so
          the cap is dropped outright rather than moved to an inner wrap. */}
      <div className="lp-shell">
        <div className="lp-reveal" style={{ marginBottom: 28, maxWidth: 720 }}>
          <p className="lp-eyebrow">Help Center</p>
          <h2 className="lp-display lp-h2">Help Center</h2>
          <p className="lp-lead">Search for an answer, or open a question below. Anything else goes to a real person on the team.</p>
        </div>

        <div className="lp-reveal" style={{ position: 'relative', marginBottom: 32, maxWidth: 480 }}>
          <SearchIcon size={16} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: 'hsl(var(--lp-dim))' }} aria-hidden="true" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for an answer"
            aria-label="Search for an answer"
            className="pl-11 h-12 rounded-lg"
          />
        </div>

        <div className="ayn-help-layout">
        <nav className="ayn-help-topics" aria-label="Help topics">
          {SECTIONS.map(section => (
            <button
              key={section.title}
              type="button"
              aria-pressed={!hasQuery && topic === section.title}
              onClick={() => { setQuery(''); setTopic(section.title); }}
            >
              {section.title}<ArrowRight size={14} aria-hidden="true" />
            </button>
          ))}
        </nav>
        <div className="ayn-help-answers">
          {hasQuery && <p className="lp-note" role="status">{results.reduce((count, section) => count + section.entries.length, 0)} answers found</p>}
          {results.map((section) => (
            <div key={section.title}>
              <h3 className="ayn-topic-heading">{section.title}</h3>
              <div className="ayn-question-list">
                {section.entries.map((e) => (
                  <details key={`${section.title}-${e.q}-${hasQuery}`} open={hasQuery || undefined} className="group">
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
        </div>

        <div className="lp-reveal" style={{ marginTop: 40 }}>
          <div className="ayn-support-footer">
            <h3 className="ayn-topic-heading">Still need help?</h3>
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

export default HelpTab;

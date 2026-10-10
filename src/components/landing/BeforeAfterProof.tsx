/**
 * BeforeAfterProof — the quiet proof panel under the hero.
 *
 * Two panels: the resume line as it is written today, and the same line
 * rewritten against one posting. Static markup, no data, no backend. The
 * highlighted phrases are the only ember on the section, on purpose.
 */
import { memo } from 'react';

const BEFORE = [
  'Responsible for email campaigns to 40,000 subscribers.',
  'Worked with product and design teams on three launches.',
  'Helped reduce onboarding time from nine days to four.',
];

type Line = { pre: string; mark: string; post: string };

const AFTER: Line[] = [
  { pre: 'Ran ', mark: 'email campaigns', post: ' for 40,000 subscribers.' },
  { pre: 'Partnered with ', mark: 'product and design', post: ' on three launches.' },
  { pre: 'Helped reduce onboarding time ', mark: 'from nine days to four', post: '.' },
];

export const BeforeAfterProof = memo(() => (
  <section className="lp-section lp-proof-section" style={{ paddingBlockEnd: 'clamp(24px, 4vw, 48px)' }}>
    <div className="lp-shell">
      <div className="lp-reveal" style={{ marginBottom: 26 }}>
        <p className="lp-eyebrow">The difference</p>
        <h2 className="lp-display lp-h2">Same experience, read properly</h2>
      </div>

      <div className="lp-proof lp-reveal">
        <article className="lp-proof-card is-before">
          <span className="lp-proof-tag">Example original</span>
          <ul>
            {BEFORE.map((l) => <li key={l}>{l}</li>)}
          </ul>
        </article>

        <article className="lp-proof-card is-after">
          <span className="lp-proof-tag is-on">Example rewrite</span>
          <ul>
            {AFTER.map((l) => (
              <li key={l.mark}>
                {l.pre}<mark>{l.mark}</mark>{l.post}
              </li>
            ))}
          </ul>
        </article>
      </div>

      <p className="lp-note lp-proof-note">
        Illustrative wording example, not a customer result. Every number and team name above was supplied in the original. Missing evidence should stay a gap.
      </p>
    </div>
  </section>
));

BeforeAfterProof.displayName = 'BeforeAfterProof';

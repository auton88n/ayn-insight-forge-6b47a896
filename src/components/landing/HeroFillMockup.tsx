/**
 * HeroFillMockup — pure CSS + SVG animated product mockup that replaces the
 * old scroll scrubbed 3D canvas. No canvas, no image sequence, no dependency.
 *
 * A browser chrome card shows a job application form. Fields fill in sequence,
 * a verified tick lands on each, and the AYN side panel reports the run.
 * Motion is CSS keyframes only and is disabled under prefers-reduced-motion.
 */
import { memo } from 'react';

type Row = { label: string; value: string; delay: number; kind?: 'select' | 'skip' };

const ROWS: Row[] = [
  { label: 'First name', value: 'Ghazi', delay: 0.2 },
  { label: 'Email', value: 'ghazi@aynn.io', delay: 1.0 },
  { label: 'Phone', value: '+1 604 555 0142', delay: 1.8 },
  { label: 'Years of experience', value: '5 to 7 years', delay: 2.6, kind: 'select' },
  { label: 'Work authorization', value: 'You answer this one', delay: 3.4, kind: 'skip' },
];

export const HeroFillMockup = memo(() => {
  return (
    <div className="lp-mockup" aria-label="AYN filling a job application form" role="img">
      <div className="lp-mockup-glow" aria-hidden="true" />

      <div className="lp-window">
        {/* browser chrome */}
        <div className="lp-chrome">
          <span className="lp-dot" /><span className="lp-dot" /><span className="lp-dot" />
          <div className="lp-url">job-boards.greenhouse.io/apply</div>
          <div className="lp-badge">AYN</div>
        </div>

        <div className="lp-window-body">
          {/* form */}
          <div className="lp-form">
            <div className="lp-form-title">Application</div>
            {ROWS.map((r) => (
              <div className="lp-field" key={r.label} style={{ animationDelay: `${r.delay}s` }}>
                <div className="lp-field-label">{r.label}</div>
                <div className={`lp-input${r.kind === 'skip' ? ' is-skip' : ''}`} style={{ animationDelay: `${r.delay}s` }}>
                  <span className="lp-value" style={{ animationDelay: `${r.delay + 0.1}s` }}>{r.value}</span>
                  {r.kind !== 'skip' && (
                    <svg className="lp-tick" viewBox="0 0 20 20" style={{ animationDelay: `${r.delay + 0.55}s` }} aria-hidden="true">
                      <path d="M4 10.5l4 4 8-9" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                  {r.kind === 'skip' && <span className="lp-skip-mark">skipped</span>}
                </div>
              </div>
            ))}
          </div>

          {/* AYN side panel */}
          <aside className="lp-panel">
            <div className="lp-panel-head">
              <span className="lp-panel-eye" aria-hidden="true" />
              <span>AYN</span>
            </div>

            <div className="lp-score">
              <div className="lp-score-num">88<span>%</span></div>
              <div className="lp-score-label">match for this role</div>
              <div className="lp-score-bar"><i /></div>
            </div>

            <ul className="lp-panel-list">
              <li style={{ animationDelay: '0.9s' }}>Resume attached</li>
              <li style={{ animationDelay: '1.7s' }}>Answers verified</li>
              <li style={{ animationDelay: '2.5s' }}>Cover letter written</li>
            </ul>

            <div className="lp-panel-foot" style={{ animationDelay: '4.0s' }}>
              4 filled, 1 left for you
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
});

HeroFillMockup.displayName = 'HeroFillMockup';

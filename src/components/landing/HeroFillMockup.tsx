/**
 * HeroFillMockup — pure CSS + SVG animated product mockup.
 *
 * A browser chrome card shows a job posting being read line by line, while the
 * AYN side panel counts a grounded match score. Motion is CSS keyframes only
 * and is disabled under prefers-reduced-motion.
 */
import { memo } from 'react';

type Row = { label: string; value: string; delay: number; kind?: 'select' | 'skip' };

const ROWS: Row[] = [
  { label: 'Role', value: 'Senior Frontend Engineer', delay: 0.2 },
  { label: 'Must have', value: 'React, TypeScript, testing', delay: 1.0 },
  { label: 'Your evidence', value: '6 years, 4 shipped products', delay: 1.8 },
  { label: 'Gap found', value: 'No Kubernetes on your resume', delay: 2.6, kind: 'skip' },
  { label: 'Posting read', value: '1,240 words, full text', delay: 3.4, kind: 'select' },
];

export const HeroFillMockup = memo(() => {
  return (
    <div className="lp-mockup" aria-label="AYN scoring a job posting against your resume" role="img">
      <div className="lp-mockup-glow" aria-hidden="true" />

      <div className="lp-window">
        {/* browser chrome */}
        <div className="lp-chrome">
          <span className="lp-dot" /><span className="lp-dot" /><span className="lp-dot" />
          <div className="lp-url">job-boards.greenhouse.io/jobs</div>
          <div className="lp-badge">AYN</div>
        </div>

        <div className="lp-window-body">
          {/* what AYN read */}
          <div className="lp-form">
            <div className="lp-form-title">Job posting</div>
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
                  {r.kind === 'skip' && <span className="lp-skip-mark">gap</span>}
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
              <li style={{ animationDelay: '0.9s' }}>Skills line up</li>
              <li style={{ animationDelay: '1.7s' }}>Seniority matches</li>
              <li style={{ animationDelay: '2.5s' }}>One gap to address</li>
            </ul>

            <div className="lp-panel-foot" style={{ animationDelay: '4.0s' }}>
              Grounded on the real posting
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
});

HeroFillMockup.displayName = 'HeroFillMockup';

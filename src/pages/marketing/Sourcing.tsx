import { ArrowRight } from 'lucide-react';
import { MarketingPageShell } from '@/components/landing/MarketingPageShell';
import { LiveJobsPreview } from '@/components/landing/LiveJobsPreview';

const Sourcing = () => (
  <MarketingPageShell
    title="Where the jobs come from, sourced directly from companies"
    description="Company career pages only, sourced automatically and refreshed every two hours. Never LinkedIn, never Indeed, never a ghost listing."
    canonical="/sourcing"
  >
    {(onStartFree) => (
      <section className="lp-section">
        <div className="lp-shell">
          <div className="lp-split lp-reveal">
            <div className="lp-art lp-art-plain">
              <LiveJobsPreview />
            </div>
            <div>
              <p className="lp-eyebrow">Where the jobs come from</p>
              <h1 className="lp-display lp-h2">Real postings, pulled straight from the company. <em>Never scraped from a job board.</em></h1>
              <p className="lp-lead">
                Company career pages only, sourced automatically and refreshed every two hours. Never LinkedIn,
                never Indeed. Do not see the role you are after? Add any posting yourself, by link or by pasting the text.
              </p>
              <div className="lp-cta-row" style={{ marginTop: 26 }}>
                <button type="button" className="lp-btn lp-btn-primary" onClick={onStartFree}>
                  Start free <ArrowRight size={15} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    )}
  </MarketingPageShell>
);

export default Sourcing;

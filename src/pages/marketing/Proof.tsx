import { Eye } from 'lucide-react';
import { MarketingPageShell } from '@/components/landing/MarketingPageShell';
import { BeforeAfterProof } from '@/components/landing/BeforeAfterProof';
import { TRUST } from '@/components/landing/landingContent';

const trust = TRUST.job_seeker;

const Proof = () => (
  <MarketingPageShell
    title="Proof, a real before and after, and what AYN never invents"
    description="See a real resume rewritten for one job, and every promise AYN holds itself to: never auto-applies, grounded in the posting, nothing invented."
    canonical="/proof"
  >
    {() => (
      <>
        <section className="lp-section" style={{ paddingBlockEnd: 0 }}>
          <div className="lp-shell lp-reveal">
            <p className="lp-eyebrow">Proof</p>
            <h1 className="lp-display lp-h2">A real resume, rewritten for one job</h1>
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
                <span className="lp-chip" key={c}>
                  <Eye size={14} />
                  {c}
                </span>
              ))}
            </div>
          </div>
        </section>
      </>
    )}
  </MarketingPageShell>
);

export default Proof;

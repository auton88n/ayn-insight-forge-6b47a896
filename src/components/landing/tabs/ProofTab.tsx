import { Eye } from "lucide-react";
import { BeforeAfterProof } from "../BeforeAfterProof";
import { LiveJobsPreview } from "../LiveJobsPreview";
import { TRUST } from "../landingContent";

const trust = TRUST.job_seeker;

export const ProofTab = () => (
  <>
    <section className="lp-section" style={{ paddingBlockEnd: 0 }}>
      <div className="lp-shell lp-reveal">
        <p className="lp-eyebrow">Proof</p>
        <h2 className="lp-display lp-h2">How clearer resume wording works</h2>
        <p className="lp-lead">An illustrative example, not a customer result. The facts stay the same; the wording becomes more specific.</p>
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

export default ProofTab;

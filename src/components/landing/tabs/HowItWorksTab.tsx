import { TailoredDocsMockup } from "../AppMockups";
import { SEEKER_STEPS } from "../landingContent";

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
      <div className="lp-flow lp-reveal ayn-directory-grid">
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

export default HowItWorksTab;

import { ArrowRight } from 'lucide-react';
import { MarketingPageShell } from '@/components/landing/MarketingPageShell';
import { TailoredDocsMockup } from '@/components/landing/AppMockups';
import { SEEKER_STEPS } from '@/components/landing/landingContent';

const HowItWorks = () => (
  <MarketingPageShell
    title="How AYN works, from a posting to a real application"
    description="Open a job, get a score, and a resume and cover letter written from your real experience in the posting's own language. Here is the process, step by step."
    canonical="/how-it-works"
  >
    {(onStartFree) => (
      <section className="lp-section">
        <div className="lp-shell">
          <div className="lp-split lp-reveal">
            <div>
              <p className="lp-eyebrow">How it works</p>
              <h1 className="lp-display lp-h2">One posting in, one application out</h1>
              <p className="lp-lead">
                Open a job from the browser. Get a score, a resume and a cover letter for it.
              </p>
              <div className="lp-cta-row" style={{ marginTop: 26 }}>
                <button type="button" className="lp-btn lp-btn-primary" onClick={onStartFree}>
                  Start free <ArrowRight size={15} />
                </button>
              </div>
            </div>
            <div className="lp-art lp-art-plain">
              <TailoredDocsMockup />
            </div>
          </div>

          <div className="lp-flow lp-reveal" style={{ marginTop: 44 }}>
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
    )}
  </MarketingPageShell>
);

export default HowItWorks;

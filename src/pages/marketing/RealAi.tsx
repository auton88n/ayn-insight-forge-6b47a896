import { ShieldCheck } from 'lucide-react';
import { MarketingPageShell } from '@/components/landing/MarketingPageShell';
import { AI_CONTRAST } from '@/components/landing/landingContent';

const RealAi = () => (
  <MarketingPageShell
    title="Real AI, aimed at the one job in front of you"
    description="AYN's AI does not auto-apply to hundreds of postings a day. It reads the specific posting you have open and writes from your real experience for that job, and stops there."
    canonical="/real-ai"
  >
    {() => (
      <section className="lp-section">
        <div className="lp-shell lp-reveal">
          <p className="lp-eyebrow">The AI, and what it refuses to do</p>
          <h1 className="lp-display lp-h2">Real AI, aimed at <em>the one job in front of you.</em></h1>
          <p className="lp-lead" style={{ maxWidth: 680 }}>
            Some tools use AI to auto-apply to hundreds of postings a day and hope volume gets you an interview.
            Low quality, unread by anyone, and it is not even looking for the right job, just applying to all of them.
            AYN's AI does the opposite: it reads the specific posting you have open, writes your resume and
            cover letter from your real experience for that job, and stops there.
          </p>
          <div className="lp-chips" style={{ marginTop: 22 }}>
            {AI_CONTRAST.map((c) => (
              <span className="lp-chip" key={c}>
                <ShieldCheck size={14} />
                {c}
              </span>
            ))}
          </div>
        </div>
      </section>
    )}
  </MarketingPageShell>
);

export default RealAi;

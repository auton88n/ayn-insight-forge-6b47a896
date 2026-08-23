import { MarketingPageShell } from '@/components/landing/MarketingPageShell';
import { CandidateCardMockup } from '@/components/landing/AppMockups';
import { DISCOVER_CHIPS } from '@/components/landing/landingContent';

const GetDiscovered = () => (
  <MarketingPageShell
    title="Get discovered, let employers find you"
    description="Turn on discovery once and employers searching for people with your background find you first, evidence and all, before they ever see your name."
    canonical="/get-discovered"
  >
    {() => (
      <section className="lp-section">
        <div className="lp-shell">
          <div className="lp-split lp-reveal">
            <div>
              <p className="lp-eyebrow">The other half of AYN</p>
              <h1 className="lp-display lp-h2">You do not have to find every job. <em>Some of them can find you.</em></h1>
              <p className="lp-lead">
                Applying is one job at a time, the one you found. Discovery works the other way: turn it on once,
                and employers searching for people with your background find you first, evidence and all,
                before they ever see your name.
              </p>
              <div className="lp-chips" style={{ marginTop: 22 }}>
                {DISCOVER_CHIPS.map((c) => (
                  <span className="lp-chip" key={c.text}>
                    <c.icon size={14} />
                    {c.text}
                  </span>
                ))}
              </div>
            </div>
            <div className="lp-art lp-art-plain">
              <CandidateCardMockup />
            </div>
          </div>
        </div>
      </section>
    )}
  </MarketingPageShell>
);

export default GetDiscovered;

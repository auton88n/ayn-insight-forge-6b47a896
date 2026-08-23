import { ShieldCheck, Eye, Ban } from 'lucide-react';
import { MarketingPageShell } from '@/components/landing/MarketingPageShell';
import { InboxMockup } from '@/components/landing/AppMockups';

const Messaging = () => (
  <MarketingPageShell
    title="Messaging, a real inbox when an employer reaches out"
    description="Every employer is checked before they can search or message anyone. Once they reach out, you talk right inside AYN, never your personal email, and every message is screened before it arrives."
    canonical="/messaging"
  >
    {() => (
      <section className="lp-section">
        <div className="lp-shell">
          <div className="lp-split lp-reveal">
            <div>
              <p className="lp-eyebrow">When an employer reaches out</p>
              <h1 className="lp-display lp-h2">A real inbox, not your personal email. <em>Screened both ways.</em></h1>
              <p className="lp-lead">
                Every employer is checked before they can search or message anyone: their email has to match
                their own company's website, personal email addresses are refused. Once they reach out, you talk
                right inside AYN, one way until you choose to open it up, and every message either side sends is
                screened before it arrives, no links, no phone numbers, nothing routed off the platform.
              </p>
              <div className="lp-chips" style={{ marginTop: 22 }}>
                <span className="lp-chip"><ShieldCheck size={14} />Employer identity verified</span>
                <span className="lp-chip"><Eye size={14} />You control two-way replies</span>
                <span className="lp-chip"><Ban size={14} />No links or contact info, ever</span>
              </div>
            </div>
            <div className="lp-art lp-art-plain">
              <InboxMockup />
            </div>
          </div>
        </div>
      </section>
    )}
  </MarketingPageShell>
);

export default Messaging;

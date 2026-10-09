import { ShieldCheck, Eye, Ban } from "lucide-react";
import { CandidateCardMockup, InboxMockup } from "../AppMockups";
import { DISCOVER_CHIPS } from "../landingContent";

// v3.229.0 -- Messaging folded in here, not its own tab any more. Reported
// directly: reorganize the sidebar for a better experience, and the two
// were always one real story told in two parts -- turn on discovery, then
// here's what happens once someone actually reaches out. Splitting them
// meant reading two separate tabs to get the whole picture; one tab now
// tells it start to finish, discovery first, the inbox as its direct
// continuation ("once someone reaches out" picks up exactly where
// discovery's own copy leaves off).
export const GetDiscoveredTab = () => (
  <>
    <section className="lp-section" style={{ paddingBlockEnd: 0 }}>
      <div className="lp-shell">
        <div className="lp-split lp-reveal">
          <div>
            <p className="lp-eyebrow">The other half of AYN</p>
            <h2 className="lp-display lp-h2">You do not have to find every job. <em>Some of them can find you.</em></h2>
            <p className="lp-lead">
              Applying is one job at a time, the one you found. Discovery works the other way: turn it on once,
              and employers searching for people with your background find you first, evidence and all,
              before they ever see your name.
            </p>
            <div className="lp-chips" style={{ marginTop: 22 }}>
              {DISCOVER_CHIPS.map((c) => (
                <span className="lp-chip" key={c.text}><c.icon size={14} />{c.text}</span>
              ))}
            </div>
          </div>
          <div className="lp-art lp-art-plain"><CandidateCardMockup /></div>
        </div>
      </div>
    </section>

    <section className="lp-section">
      <div className="lp-shell">
        <div className="lp-split lp-reveal">
          <div>
            <p className="lp-eyebrow">Once someone reaches out</p>
            <h2 className="lp-display lp-h2">A real inbox, not your personal email. <em>Screened both ways.</em></h2>
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
          <div className="lp-art lp-art-plain"><InboxMockup /></div>
        </div>
      </div>
    </section>
  </>
);

export default GetDiscoveredTab;

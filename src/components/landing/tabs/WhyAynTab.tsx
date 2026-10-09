import { ShieldCheck } from "lucide-react";
import { HeadToHead } from "../HeadToHead";
import { SameResumeMockup } from "../AppMockups";
import { PAIN, HEAD_TO_HEAD, AI_CONTRAST } from "../landingContent";

const pain = PAIN.job_seeker;

const headToHead = HEAD_TO_HEAD.job_seeker;

export const WhyAynTab = () => (
  <section className="lp-section">
    <div className="lp-shell">
      <div className="lp-split lp-reveal" style={{ marginBottom: 44 }}>
        <div>
          <p className="lp-eyebrow">{pain.eyebrow}</p>
          <h2 className="lp-display lp-h2">{pain.title}</h2>
          <p className="lp-lead">{pain.lead}</p>
          <div className="lp-pain lp-pain-solo" style={{ marginTop: 26 }}>
            <h3 className="lp-display">{pain.who}</h3>
            <ul>{pain.lines.map((l) => <li key={l}>{l}</li>)}</ul>
          </div>
        </div>
        <div className="lp-art lp-art-plain"><SameResumeMockup /></div>
      </div>
      <div className="lp-reveal" style={{ marginTop: 40 }}>
        <HeadToHead themLabel={headToHead.themLabel} rows={headToHead.rows} />
      </div>

      {/* v3.216.0 -- Real AI, folded in here rather than its own thin page:
          the same "why choose AYN" positioning, one section down.
          v3.229.0 -- reported directly: this section still read like it was
          describing a posting outside AYN ("the posting you have open,"
          "the job in front of you"). AYN has no such mechanism;
          a job is something you add to AYN (browse it, paste a link, or
          paste the text), not something "open" elsewhere. Reworded to
          describe the real, current flow. */}
      <div className="lp-reveal" style={{ marginTop: 56 }}>
        <p className="lp-eyebrow">The AI, and what it refuses to do</p>
        <h2 className="lp-display lp-h2">Real AI, aimed at <em>one job at a time.</em></h2>
        <p className="lp-lead" style={{ maxWidth: 680 }}>
          Some tools optimize for sending large volumes of applications and hope one gets an interview.
          That approach is not focused on whether a role actually fits you.
          AYN's AI does the opposite: it reads the specific posting you added, writes your resume and
          cover letter from your real experience for that job, and stops there.
        </p>
        <div className="lp-chips" style={{ marginTop: 22 }}>
          {AI_CONTRAST.map((c) => (
            <span className="lp-chip" key={c}><ShieldCheck size={14} />{c}</span>
          ))}
        </div>
      </div>
    </div>
  </section>
);

export default WhyAynTab;

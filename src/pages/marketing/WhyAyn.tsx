import { MarketingPageShell } from '@/components/landing/MarketingPageShell';
import { HeadToHead } from '@/components/landing/HeadToHead';
import { PAIN, HEAD_TO_HEAD } from '@/components/landing/landingContent';

const pain = PAIN.job_seeker;
const headToHead = HEAD_TO_HEAD.job_seeker;

const WhyAyn = () => (
  <MarketingPageShell
    title="Why AYN, not another job board"
    description="Other job boards pull listings from anywhere, some already filled. AYN sources directly from the company's own career page, and writes your resume for the one job in front of you."
    canonical="/why-ayn"
  >
    {() => (
      <section className="lp-section">
        <div className="lp-shell">
          <div className="lp-reveal" style={{ marginBottom: 38 }}>
            <p className="lp-eyebrow">{pain.eyebrow}</p>
            <h1 className="lp-display lp-h2">{pain.title}</h1>
            <p className="lp-lead">{pain.lead}</p>
          </div>
          <div className="lp-reveal">
            <div className="lp-pain lp-pain-solo">
              <h3 className="lp-display">{pain.who}</h3>
              <ul>
                {pain.lines.map((l) => <li key={l}>{l}</li>)}
              </ul>
            </div>
          </div>

          <div className="lp-reveal" style={{ marginTop: 40 }}>
            <HeadToHead themLabel={headToHead.themLabel} rows={headToHead.rows} />
          </div>
        </div>
      </section>
    )}
  </MarketingPageShell>
);

export default WhyAyn;

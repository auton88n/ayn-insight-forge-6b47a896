import { ArrowRight } from "lucide-react";
import { TrustBento } from "../TrustBento";
import { SEEKER_TILES } from "../landingContent";
import type { TabProps } from "../homeTabMeta";

// v3.222.0 -- the seeker TrustBento stat strip and the "Stop sending the
// same resume into the dark" closer both used to sit on Home and repeat on
// every tab. Direct instruction: move both here, Features only, nowhere
// else. onStartFree is destructured, not the whole TabProps object, since
// this is the one tab that actually needs a button of its own.
export const FeaturesTab = ({ onStartFree }: TabProps) => (
  <>
    <section className="lp-section">
      <div className="lp-shell">
        <div className="lp-reveal" style={{ marginBottom: 38 }}>
          <p className="lp-eyebrow">Features</p>
          <h2 className="lp-display lp-h2">Everything AYN actually does for you</h2>
          <p className="lp-lead">One posting in, one real application out. Nothing here is a preview, it is what you get.</p>
        </div>
        <div className="lp-bento lp-reveal ayn-feature-directory">
          {SEEKER_TILES.map((tile) => {
            const Icon = tile.icon;
            return (
              <article key={tile.title} className={`lp-tile ${tile.span}`}>
                <span className="lp-tile-icon" aria-hidden="true"><Icon size={20} strokeWidth={1.75} /></span>
                <h3>{tile.title}</h3>
                <p>{tile.desc}</p>
                {'meta' in tile && (
                  <div className="lp-tile-meta">
                    {(tile as { meta: string[] }).meta.map((m) => <span key={m}>{m}</span>)}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </section>

    <div className="lp-shell" style={{ paddingBlockStart: 'clamp(56px, 8vw, 96px)' }}>
      <TrustBento />
    </div>

    <section className="lp-section" style={{ paddingBlockStart: 0 }}>
      <div className="lp-shell">
        <div className="lp-closing lp-reveal">
          <h2 className="lp-display lp-h2" style={{ maxWidth: 760, marginInline: 'auto' }}>
            Stop sending the same resume into the dark.
          </h2>
          <p className="lp-lead" style={{ color: 'hsl(0 0% 100% / 0.85)' }}>
            Add your background once. Every application after that is written for the job, and every employer searching finds you too.
          </p>
          <div className="lp-cta-row" style={{ justifyContent: 'center', marginTop: 30 }}>
            <button type="button" className="lp-btn lp-btn-invert lp-btn-lg" onClick={() => onStartFree?.('job_seeker')}>
              Start free <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </section>
  </>
);

export default FeaturesTab;

import { MarketingPageShell } from '@/components/landing/MarketingPageShell';
import { SEEKER_TILES } from '@/components/landing/landingContent';

const Features = () => (
  <MarketingPageShell
    title="Features, what AYN actually does for job seekers"
    description="Browse real postings, get a score, a tailored resume and cover letter, an honest gap list, and discovery so employers can find you. See exactly what AYN does, free to try."
    canonical="/features"
  >
    {() => (
    <section className="lp-section">
      <div className="lp-shell">
        <div className="lp-reveal" style={{ marginBottom: 38 }}>
          <p className="lp-eyebrow">Features</p>
          <h1 className="lp-display lp-h2">Everything AYN actually does for you</h1>
          <p className="lp-lead">
            One posting in, one real application out. Nothing here is a preview, it is what you get.
          </p>
        </div>
        <div className="lp-bento lp-reveal">
          {SEEKER_TILES.map((tile) => {
            const Icon = tile.icon;
            return (
              <article key={tile.title} className={`lp-tile ${tile.span}`}>
                <span className="lp-tile-icon" aria-hidden="true">
                  <Icon size={20} strokeWidth={1.75} />
                </span>
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
    )}
  </MarketingPageShell>
);

export default Features;

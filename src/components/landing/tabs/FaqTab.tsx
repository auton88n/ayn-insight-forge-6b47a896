import { ShieldCheck, Eye, Ban, Sparkles, Building2, Lock, Gift, FileCheck2 } from "lucide-react";
import { FAQS } from "../landingContent";

// v3.235.0 -- reported directly, alongside the standalone-page and
// resume-hub polish: this tab was eight identical white blocks stacked
// in one column, no visual differentiation, reading as a plain wall of
// text next to every other tab's mockup or bento grid. Each question now
// carries a real icon badge (matching its own actual topic, not a
// decorative repeat of the same mark eight times) using the identical
// .lp-tile-icon language Features' own tile grid already established,
// and the list itself is a real two-column grid at desktop width instead
// of one long column.
const FAQ_ICONS = [Sparkles, Building2, Ban, Eye, Lock, ShieldCheck, FileCheck2, Gift];

export const FaqTab = () => {
  const faqs = FAQS.job_seeker;
  return (
    <section className="lp-section">
      <div className="lp-shell">
        <div className="lp-reveal" style={{ marginBottom: 28 }}>
          <p className="lp-eyebrow">Questions</p>
          <h2 className="lp-display lp-h2">Good to know</h2>
        </div>
        <div className="lp-faq lp-faq-grid lp-reveal">
          {faqs.map((f, i) => {
            const Icon = FAQ_ICONS[i % FAQ_ICONS.length];
            return (
              <div className="lp-faq-item" key={f.q}>
                <div className="lp-tile-icon lp-faq-item-icon"><Icon size={18} strokeWidth={1.9} /></div>
                <h3>{f.q}</h3>
                <p>{f.a}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default FaqTab;

import { MarketingPageShell } from '@/components/landing/MarketingPageShell';
import { FAQS } from '@/components/landing/landingContent';
import { createFAQSchema } from '@/components/shared/SEO';

const faqs = FAQS.job_seeker;
const jsonLd = createFAQSchema(faqs.map((f) => ({ question: f.q, answer: f.a })));

const Faq = () => (
  <MarketingPageShell
    title="Frequently asked questions"
    description="What AYN does, where the jobs come from, whether it applies for you, how discovery works, and whether it is really free to try."
    canonical="/faq"
    jsonLd={jsonLd}
  >
    {() => (
      <section className="lp-section">
        <div className="lp-shell">
          <div className="lp-reveal" style={{ marginBottom: 28 }}>
            <p className="lp-eyebrow">Questions</p>
            <h1 className="lp-display lp-h2">Good to know</h1>
          </div>
          <div className="lp-faq lp-reveal">
            {faqs.map((f) => (
              <div className="lp-faq-item" key={f.q}>
                <h3>{f.q}</h3>
                <p>{f.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    )}
  </MarketingPageShell>
);

export default Faq;

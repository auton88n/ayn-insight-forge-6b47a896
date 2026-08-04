import { Link } from 'react-router-dom';
import { SEO, createBreadcrumbSchema } from '@/components/shared/SEO';
import { Header } from '@/components/shared/Header';
import { Footer } from '@/components/shared/Footer';
import { Button } from '@/components/ui/button';
import { SectionHeading } from '@/components/shared/SectionHeading';

const EMBER = 'linear-gradient(135deg, #e85d3a 0%, #f2833f 100%)';

const About = () => {
  const jsonLd = createBreadcrumbSchema([
    { name: 'Home', url: 'https://aynn.io/' },
    { name: 'About', url: 'https://aynn.io/about' },
  ]);

  return (
    <>
      <SEO
        title="About AYN"
        description="AYN reads the job posting in front of you and writes one application worth sending."
        canonical="/about"
        jsonLd={jsonLd}
      />
      <div className="min-h-screen bg-background">
        <Header />

        <main className="container mx-auto max-w-3xl px-6 pt-32 pb-24">
          {/* Company overview, set apart from the body */}
          <section
            className="rounded-3xl border border-border bg-card p-8 md:p-10 mb-14"
            style={{ boxShadow: '0 24px 56px -32px rgba(20,16,14,0.22)' }}
          >
            <span
              className="inline-block h-1 w-14 rounded-full mb-6"
              style={{ background: EMBER }}
              aria-hidden="true"
            />
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight leading-tight">
              Hiring runs on volume. We think it should run on evidence.
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">
              AYN is built by a team in Canada.
            </p>
          </section>

          <div className="space-y-12">
            <section>
              <SectionHeading className="mb-3">The problem</SectionHeading>
              <p className="text-muted-foreground leading-relaxed">
                Applying for a job stopped being about whether you can do it, and became about
                whether you can out-send everyone else applying for the same one. AYN exists to put
                that back the right way round.
              </p>
            </section>

            <section>
              <SectionHeading className="mb-3">How we got here</SectionHeading>
              <p className="text-muted-foreground leading-relaxed">
                AI made it effortless to apply to everything, so everyone did, and hiring drowned in
                noise built by other AI tools. Real people with real experience got buried under
                volume they could not compete with.
              </p>
              <p className="text-muted-foreground leading-relaxed mt-4">
                We built AYN to cut through that. Not another way to apply faster. A way to be seen
                for what you have actually done, and a way for employers to find the people worth
                talking to underneath the noise.
              </p>
            </section>

            <section>
              <SectionHeading className="mb-3">What it does</SectionHeading>
              <p className="text-muted-foreground leading-relaxed">
                Describe the role once. AYN finds the people worth talking to, with the evidence
                behind each match and what they are missing, instead of six hundred resumes and a
                guess.
              </p>
              <p className="text-muted-foreground leading-relaxed mt-4">
                You can hunt too. Open a posting and AYN reads it, shows how you line up, and writes
                a resume and cover letter from your real experience for that job.
              </p>
              <p className="text-muted-foreground leading-relaxed mt-4">
                Or be hunted back. Switch discoverability on and employers see your background, not
                your name, email, or phone, until you accept an offer.
              </p>
            </section>
          </div>

          <div className="mt-14">
            <Button asChild size="lg" className="rounded-full px-8 text-white border-0" style={{ background: EMBER }}>
              <Link to="/">Start free</Link>
            </Button>
          </div>
        </main>

        <Footer />
      </div>
    </>
  );
};

export default About;

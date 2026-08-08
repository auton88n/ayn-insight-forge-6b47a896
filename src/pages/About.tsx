import { Link } from 'react-router-dom';
import { SEO, createBreadcrumbSchema } from '@/components/shared/SEO';
import { Header } from '@/components/shared/Header';
import { Footer } from '@/components/shared/Footer';
import { Button } from '@/components/ui/button';
import { SectionHeading } from '@/components/shared/SectionHeading';

const EMBER = 'linear-gradient(135deg, #e85d3a 0%, #f2833f 100%)';

const About = () => {
  const jsonLd = createBreadcrumbSchema([
    { name: 'Home', url: 'https://ayn.careers/' },
    { name: 'About', url: 'https://ayn.careers/about' },
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

          <div className="space-y-5">
            <p className="text-muted-foreground leading-relaxed">
              AI made it effortless to apply everywhere, so everyone did. Hiring drowned in noise,
              and a hiring manager who used to read forty applications started opening six hundred
              and reading none of them properly. Somewhere in that pile was the one person who
              could actually do the job. Nobody had time to find them.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              We built AYN because that person should not have to out-send a machine to be seen.
            </p>

            <div className="pt-3">
              <SectionHeading className="mb-3">Mission and vision</SectionHeading>
              <p className="text-muted-foreground leading-relaxed">
                Replace volume with evidence. Build a hiring market where being seen depends on
                what you have done, not on how many places you applied.
              </p>
            </div>

            <p className="text-muted-foreground leading-relaxed pt-3">
              For job seekers, AYN reads a job posting, shows how you line up against it, and
              writes a resume and cover letter from your real experience for that specific role.
              For employers, describe a role once and AYN finds the people worth talking to, with
              the evidence behind each match and what they are missing, instead of six hundred
              resumes and a guess.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Switch discoverability on and employers see your background, not your name, email,
              or phone, until you accept an offer.
            </p>
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

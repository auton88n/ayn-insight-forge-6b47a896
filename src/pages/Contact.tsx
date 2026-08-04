import { Link } from 'react-router-dom';
import { SEO, createBreadcrumbSchema } from '@/components/shared/SEO';
import { Header } from '@/components/shared/Header';
import { Footer } from '@/components/shared/Footer';
import { SectionHeading } from '@/components/shared/SectionHeading';

const EMBER = 'linear-gradient(135deg, #e85d3a 0%, #f2833f 100%)';

const Contact = () => {
  const jsonLd = createBreadcrumbSchema([
    { name: 'Home', url: 'https://aynn.io/' },
    { name: 'Contact', url: 'https://aynn.io/contact' },
  ]);

  return (
    <>
      <SEO
        title="Contact AYN"
        description="How to reach AYN. One inbox, read by the team."
        canonical="/contact"
        jsonLd={jsonLd}
      />
      <div className="min-h-screen bg-background">
        <Header />

        <main className="container mx-auto max-w-3xl px-6 pt-32 pb-24">
          <span className="inline-block h-1 w-14 rounded-full mb-6" style={{ background: EMBER }} aria-hidden="true" />
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Contact us</h1>
          <p className="mt-3 text-lg text-muted-foreground">
            One inbox, read by the team. No ticket queue, no bot.
          </p>

          <section className="mt-12">
            <SectionHeading>Email</SectionHeading>
            <div className="rounded-2xl border border-border bg-card p-6">
              <a
                href="mailto:support@aynn.io"
                className="text-lg font-semibold underline underline-offset-4"
                style={{ color: '#e85d3a' }}
              >
                support@aynn.io
              </a>
              <p className="mt-3 text-muted-foreground leading-relaxed">
                Everything goes here: support, billing, privacy and data requests, copyright
                reports, employer access, press, and anything else.
              </p>
              <p className="mt-3 text-muted-foreground leading-relaxed">
                We aim to reply within a few business days. Paid plans get faster aims, listed in
                the <Link to="/help" className="underline underline-offset-4">Help Center</Link>.
              </p>
            </div>
          </section>

          <section className="mt-12">
            <SectionHeading>Before you write</SectionHeading>
            <p className="text-muted-foreground leading-relaxed">
              Checking the <Link to="/help" className="underline underline-offset-4">Help Center</Link>{' '}
              first will usually be faster than waiting for a reply.
            </p>
            <p className="mt-3 text-muted-foreground leading-relaxed">
              If you are reporting a problem, tell us what you were doing, what you expected, and
              what happened instead. A screenshot helps more than a description.
            </p>
          </section>

          <section className="mt-12">
            <SectionHeading>Specific requests</SectionHeading>
            <div className="space-y-4">
              <div className="rounded-2xl border border-border bg-card p-5">
                <p className="text-muted-foreground leading-relaxed">
                  <span className="font-semibold text-foreground">Privacy or data requests</span>,
                  including access, correction, deletion and export. Put "Privacy" in the subject
                  line so it does not sit behind billing questions. We respond within thirty days,
                  usually much sooner. You can also export and delete your own data from Settings
                  without asking us.
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-card p-5">
                <p className="text-muted-foreground leading-relaxed">
                  <span className="font-semibold text-foreground">Copyright reports.</span> Put
                  "Copyright Notice" in the subject line. Our{' '}
                  <Link to="/copyright" className="underline underline-offset-4">Copyright Policy</Link>{' '}
                  sets out what to include.
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-card p-5">
                <p className="text-muted-foreground leading-relaxed">
                  <span className="font-semibold text-foreground">Security.</span> If you have found
                  a vulnerability, put "Security" in the subject line. We will not pursue anyone who
                  reports one in good faith, does not go further into data than needed to show it,
                  and gives us reasonable time to fix it.
                </p>
              </div>
              <div className="rounded-2xl border border-border bg-card p-5">
                <p className="text-muted-foreground leading-relaxed">
                  <span className="font-semibold text-foreground">Employer access.</span> Request it
                  from the employer page rather than by email, since that route collects what we
                  need to review the account.
                </p>
              </div>
            </div>
          </section>

          <section className="mt-12">
            <SectionHeading>Postal</SectionHeading>
            <address className="not-italic text-muted-foreground leading-relaxed">
              AYN AI<br />
              145 Cresthaven Drive<br />
              Nova Scotia B3M 2E4<br />
              Canada
            </address>
            <p className="mt-3 text-muted-foreground leading-relaxed">
              Registered with the Nova Scotia Registry of Joint Stock Companies. Postal mail is much
              slower than email.
            </p>
          </section>

          <section className="mt-12">
            <SectionHeading>What we do not have</SectionHeading>
            <p className="text-muted-foreground leading-relaxed">
              No phone line, no live chat, no sales team yet. Email is the channel that gets a real
              answer.
            </p>
          </section>
        </main>

        <Footer />
      </div>
    </>
  );
};

export default Contact;

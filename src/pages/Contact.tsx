import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { SEO, createBreadcrumbSchema } from '@/components/shared/SEO';
import { Header } from '@/components/shared/Header';
import { Footer } from '@/components/shared/Footer';
import { SectionHeading } from '@/components/shared/SectionHeading';
import TicketForm from '@/components/support/TicketForm';

const EMBER = 'linear-gradient(135deg, #e85d3a 0%, #f2833f 100%)';

const Contact = () => {
  const jsonLd = createBreadcrumbSchema([
    { name: 'Home', url: 'https://ayn.careers/' },
    { name: 'Contact', url: 'https://ayn.careers/contact' },
  ]);

  // On <body> too, not just the wrapper div below, so Radix's portaled
  // Select dropdown and the sonner toast (both render outside this
  // component's own DOM subtree) still pick up the ember re-tint.
  useEffect(() => {
    document.body.classList.add('contact-surface');
    return () => document.body.classList.remove('contact-surface');
  }, []);

  return (
    <>
      <SEO
        title="Contact AYN"
        description="How to reach AYN. Send a message and a real person reads it."
        canonical="/contact"
        jsonLd={jsonLd}
      />
      <div className="contact-surface min-h-screen bg-background">
        <Header />

        <main className="container mx-auto max-w-3xl px-6 pt-32 pb-24">
          <span className="inline-block h-1 w-14 rounded-full mb-6" style={{ background: EMBER }} aria-hidden="true" />
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Contact us</h1>
          <p className="mt-3 text-lg text-muted-foreground">
            Send a message. A real person reads it.
          </p>

          <section className="mt-12">
            <SectionHeading>Send us a message</SectionHeading>
            <div className="rounded-2xl border border-border bg-card p-2">
              <TicketForm onSuccess={() => undefined} />
            </div>
            <p className="mt-4 text-muted-foreground leading-relaxed">
              We usually reply within a few business days, faster on paid plans. Check the{' '}
              <Link to="/help" className="underline underline-offset-4">Help Center</Link> first,
              it's often quicker.
            </p>
          </section>
        </main>

        <Footer />
      </div>
    </>
  );
};

export default Contact;

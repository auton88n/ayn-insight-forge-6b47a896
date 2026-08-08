import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, ChevronDown } from 'lucide-react';
import { SEO, createBreadcrumbSchema, createFAQSchema } from '@/components/shared/SEO';
import { Header } from '@/components/shared/Header';
import { Footer } from '@/components/shared/Footer';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { SectionHeading } from '@/components/shared/SectionHeading';

const EMBER = 'linear-gradient(135deg, #e85d3a 0%, #f2833f 100%)';

type Entry = { q: string; a: string };
type Section = { title: string; entries: Entry[] };

const SECTIONS: Section[] = [
  {
    title: 'Getting started',
    entries: [
      { q: 'How do I start?', a: 'Create a free account, add your resume, and install the extension.' },
      { q: 'Do I need a card?', a: 'No, and the free plan does not expire.' },
      { q: 'What does the extension do?', a: 'Reads the job posting you are on, shows your match and gaps, and can write a resume and cover letter for it.' },
      { q: 'What does it not do?', a: 'It never fills forms, clicks, or submits. Read only, by design.' },
      { q: 'Which sites work?', a: 'Greenhouse, Lever, Workday, Ashby, iCIMS, and most company career pages. It stays out of the way on anything else.' },
    ],
  },
  {
    title: 'Credits and billing',
    entries: [
      { q: 'What do credits pay for?', a: 'AI writing. A tailored resume is 2 credits, a cover letter is 1.' },
      { q: 'What is free?', a: 'Scoring, gaps, reading postings, discoverability, offers, and assessments. Every plan.' },
      { q: 'Do credits roll over?', a: 'No, they reset each billing period.' },
      { q: 'Charged if generation fails?', a: 'No. Regenerating the same document is also free.' },
      { q: 'Can I cancel or downgrade?', a: 'Yes, from Billing. Both take effect at the end of your paid period, no refund for the remainder.' },
      { q: 'Refunds?', a: 'Not unless your local law requires one. Cancel instead and keep access until the period ends.' },
    ],
  },
  {
    title: 'Being found by employers',
    entries: [
      { q: 'How do employers find me?', a: 'Only if you switch discovery on. Off by default.' },
      { q: 'What can they see?', a: 'Your background: work history, skills, education, what you want. Not your contact details.' },
      { q: 'When do they get my contact details?', a: 'Only when you accept their offer.' },
      { q: 'Can I turn it off?', a: 'Any time.' },
      { q: 'What is an assessment?', a: 'Optional questions an employer can send before making an offer. You get growth notes, not the score.' },
    ],
  },
  {
    title: 'Your data',
    entries: [
      { q: 'Can I download my data?', a: 'Yes, from Settings.' },
      { q: 'Can I delete my account?', a: 'Yes, from Settings. You will see what is removed before you confirm.' },
      { q: 'Something lighter than deleting?', a: 'Yes, pause your account. Turns off discovery and emails without deleting anything.' },
      { q: 'Where is my data stored?', a: 'United Kingdom. Details on our Subprocessors page.' },
      { q: 'Do you train AI on my resume?', a: 'No. See our Privacy Policy for how that works.' },
    ],
  },
  {
    title: 'For employers',
    entries: [
      { q: 'How do I get access?', a: 'Request it. Accounts are approved individually.' },
      { q: 'What do I get?', a: 'Describe a role and see candidates who chose to be discoverable, with the evidence behind each match.' },
      { q: 'Does AYN decide who I hire?', a: 'No. You do.' },
    ],
  },
];

const Help = () => {
  const [query, setQuery] = useState('');
  const hasQuery = query.trim().length > 0;

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SECTIONS;
    return SECTIONS
      .map(s => ({ ...s, entries: s.entries.filter(e => (e.q + ' ' + e.a).toLowerCase().includes(q)) }))
      .filter(s => s.entries.length > 0);
  }, [query]);

  const jsonLd = {
    '@graph': [
      createBreadcrumbSchema([
        { name: 'Home', url: 'https://ayn.careers/' },
        { name: 'Help Center', url: 'https://ayn.careers/help' },
      ]),
      createFAQSchema(SECTIONS.flatMap(s => s.entries).map(e => ({ question: e.q, answer: e.a }))),
    ],
  };

  return (
    <>
      <SEO
        title="Help Center"
        description="Answers about how AYN works, plus a way to reach a human."
        canonical="/help"
        jsonLd={jsonLd}
      />
      <div className="min-h-screen bg-background">
        <Header />

        <main className="container mx-auto max-w-3xl px-6 pt-32 pb-24">
          <span className="inline-block h-1 w-14 rounded-full mb-6" style={{ background: EMBER }} aria-hidden="true" />
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Help Center</h1>
          <p className="mt-3 text-lg text-muted-foreground">
            Search for an answer, or open a question below. Anything else goes to a real person on
            the team.
          </p>

          <div className="relative mt-8">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search for an answer"
              aria-label="Search for an answer"
              className="pl-11 h-12 rounded-full"
            />
          </div>

          <div className="mt-12 space-y-12">
            {results.map(section => (
              <section key={section.title}>
                <SectionHeading className="mb-5">{section.title}</SectionHeading>
                <div className="space-y-3">
                  {section.entries.map(e => (
                    <details
                      key={e.q}
                      open={hasQuery || undefined}
                      className="group rounded-2xl border border-border bg-card p-5"
                    >
                      <summary className="flex items-center justify-between gap-4 cursor-pointer list-none font-semibold marker:content-none">
                        {e.q}
                        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
                      </summary>
                      <p className="mt-2.5 text-muted-foreground leading-relaxed">{e.a}</p>
                    </details>
                  ))}
                </div>
              </section>
            ))}

            {results.length === 0 && (
              <p className="text-muted-foreground">
                Nothing matched that. <Link to="/contact" className="underline underline-offset-4">Contact us</Link> and a real person will read it.
              </p>
            )}
          </div>

          <section className="mt-14">
            <SectionHeading className="mb-5">Still stuck</SectionHeading>
            <div className="rounded-2xl border border-border bg-card p-6">
              <p className="text-muted-foreground leading-relaxed">
                A real person reads every message. Include what you were doing and what happened,
                and a screenshot if you have one.
              </p>
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                Response aims: free plan best effort, Starter 3 business days, Growth 2, Scale 1.
                These are aims and not commitments.
              </p>
              <Button asChild className="mt-4 rounded-full">
                <Link to="/contact">Contact us</Link>
              </Button>
            </div>
          </section>
        </main>

        <Footer />
      </div>
    </>
  );
};

export default Help;

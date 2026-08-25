// v3.30.0 — the page our Privacy Policy promises. AYN does not sell personal
// information and does not share it for cross context behavioural
// advertising, so this states that plainly instead of pretending to be a form
// that does nothing.
// v3.230.0 -- reported directly, alongside the same fix for /legal and its
// document pages: linked straight off the Legal hub, so leaving this one
// on the old Footer-only chrome would have recreated the exact "different
// page, sidebar gone" gap one click after the page that had just been
// fixed. Same SeekerSidebar/LandingFooter + .lp shell swap.
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { SEO } from '@/components/shared/SEO';
import { SeekerSidebar } from '@/components/landing/SeekerSidebar';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { LEGAL } from '@/lib/legal';
import { openCookiePreferences } from '@/components/shared/CookieConsent';

export default function DoNotSell() {
  useEffect(() => {
    document.body.classList.add('contact-surface');
    return () => document.body.classList.remove('contact-surface');
  }, []);

  return (
    <div className="lp lp-shell-with-sidebar contact-surface">
      <SEO
        title="Do Not Sell or Share My Personal Information | AYN"
        description="AYN does not sell personal information and does not share it for cross context behavioural advertising. How a California resident can exercise their privacy rights."
      />
      <SeekerSidebar />
      <main className="lp-sidebar-main">
      <div className="max-w-3xl w-full mx-auto px-6 pt-10 sm:pt-12 pb-24">
        {/* v3.231.0 -- reported directly: "this page needs to have a way
            back." LegalPage.tsx already has this exact link above every
            document's own heading; this page never got the same treatment
            since it's its own bespoke component, not rendered through that
            shared renderer. */}
        <Link to="/legal" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-3.5 h-3.5" /> All legal documents
        </Link>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight">
          Do Not Sell or Share My Personal Information
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Privacy Policy version {LEGAL.privacyVersion}, effective {LEGAL.effectiveDate}.
        </p>

        <div className="mt-8 space-y-6 text-[15px] leading-relaxed text-muted-foreground">
          <p className="text-foreground font-medium">
            AYN does not sell your personal information, and never has.
          </p>
          <p>
            We also do not share it for cross context behavioural advertising. We run no
            advertising network, we do not place advertising pixels, and we do not hand your
            resume, your profile or your job activity to data brokers. There is nothing here
            for you to opt out of, because the thing you would be opting out of does not
            happen.
          </p>
          <p>
            What we do use is a single analytics measurement, and only if you accept it. You
            can change that choice at any time.{' '}
            <button
              type="button"
              onClick={openCookiePreferences}
              className="underline underline-offset-2 text-foreground hover:opacity-80"
            >
              Change your cookie choice
            </button>
            .
          </p>

          <h2 className="text-lg font-semibold text-foreground pt-2">
            If you are a California resident
          </h2>
          <p>
            Under the California Consumer Privacy Act you can ask us what personal information
            we hold about you, ask for a copy of it, ask us to correct it, and ask us to delete
            it. You can also ask us to limit how we use sensitive personal information. We will
            not treat you differently for asking.
          </p>
          <p>
            Email <a className="text-foreground underline underline-offset-2" href="mailto:privacy@ayn.careers">privacy@ayn.careers</a>{' '}
            from the address on your account, or open a request through{' '}
            <Link className="text-foreground underline underline-offset-2" to="/help">Help Center</Link>.
            Tell us which right you are exercising. We verify the request against your account
            email and answer within 45 days. An authorised agent may act for you with written
            permission we can verify.
          </p>
          <p>
            Deletion is real. Once verified, we remove your resume, profile, saved jobs and
            generated documents, and we keep only what accounting law requires, with your
            identity stripped from it.
          </p>
          <p>
            The full picture is in our{' '}
            <Link className="text-foreground underline underline-offset-2" to="/privacy">Privacy Policy</Link>{' '}
            and{' '}
            <Link className="text-foreground underline underline-offset-2" to="/terms">Terms of Service</Link>.
          </p>
        </div>
      </div>
      <LandingFooter />
      </main>
    </div>
  );
}

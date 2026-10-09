/**
 * HomeTabs -- the seven explanation sections, each a real tab within Home,
 * not a separate route. v3.216.0, direct instruction: "when you make a
 * page open dont take me to new page keep within the same page all
 * sections should open within it" -- the same architecture Resume Hub's
 * own tabs already use (local state, never a route change). Clicking a
 * tab in SeekerSidebar swaps which of these renders in the main pane;
 * the URL and the sidebar itself never move.
 *
 * Two of the nine pages from v3.214.0 are folded into a sibling here
 * rather than kept as their own tab: Real AI (three chips and one
 * paragraph) reads thin on its own and restates a claim Why AYN already
 * makes, and Where jobs come from is largely the same sourcing claim
 * Home's own hero and TrustBento already lead with. Merged, not deleted:
 * every real fact from both survives, just placed where it earns its
 * spot rather than padded into a page of its own.
 */
import { useEffect } from "react";
import { SectionHeading } from "@/components/shared/SectionHeading";
import TicketForm from "@/components/support/TicketForm";

export const ContactTab = () => {
  useEffect(() => {
    document.body.classList.add('contact-surface');
    return () => document.body.classList.remove('contact-surface');
  }, []);

  return (
    <section className="lp-section">
      {/* v3.226.0 gave this shell its own 960px cap so the form wasn't
          squeezed to a third of the page. v3.237.0 -- reported directly
          that every tab needs to match in width and positioning: a
          narrower shell still gets centered by .lp-shell's own `margin: 0
          auto`, which measured live as a real 268px rightward shift on
          About's own heading versus Features' identical left-aligned one
          at the same viewport -- the same shift was happening here. The
          shell itself is now the same 1360px default every left-aligned
          tab uses (same starting x position everywhere); the actual form
          keeps a sensible, non-stretched width via maxWidth on .lp-panel
          directly instead of the whole shell, still left-aligned, not
          centered, so it starts at that same shared x position too. */}
      <div className="lp-shell">
        <div className="lp-reveal" style={{ marginBottom: 32 }}>
          <p className="lp-eyebrow">Contact</p>
          <h2 className="lp-display lp-h2">Contact us</h2>
          <p className="lp-lead">Send a message. A real person reads it.</p>
        </div>
        <div className="lp-reveal">
          <SectionHeading>Send us a message</SectionHeading>
          <div className="lp-panel" style={{ maxWidth: 640 }}>
            <TicketForm onSuccess={() => undefined} />
          </div>
        </div>
      </div>
    </section>
  );
};

export default ContactTab;

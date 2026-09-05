// v3.277.0 -- asked directly for a real page in the site, not a link
// buried inside one job's own detail view: "just have a page for in ayn
// so i can download it just call it autofill." Same SeekerSidebar/
// LandingFooter + .lp shell every other standalone page (Pricing,
// Do Not Sell, the legal documents) already uses, so it reads as a real
// page on the site, not a one-off. Public -- no sign-in needed to read
// what it is or download it, matching every other public page here.
//
// v3.334.0 -- brought current with what the extension actually does now,
// not what it did when this page was written. Two real capabilities the
// v3.330.0/v3.331.0 panel redesign shipped were never mentioned here: the
// free fit/score check that loads the moment the panel opens, and Tailor
// resume / Write cover letter as real, explicit per-job actions with a
// real before-and-after, not a button that just flips to a checkmark.
// Also swept and fixed six real em/en dash violations of this app's own
// standing house style, one of them a leftover &mdash; entity.
//
// v3.336.0 -- the "shows you anything it couldn't fill" line stopped
// being true the moment content.js gained real inline answer-and-save
// rows for a not-on-file question (a real fixed-choice one included, not
// just free text). Updated to describe what that button pair actually
// does now, not just that a gap is named.
//
// v3.340.0 -- "close it once on a page and it stays closed" stopped
// being the whole story once minimizePanel() shipped: closing no longer
// makes the panel disappear, it collapses to a small tab on the edge of
// the page that reopens it exactly where you left off. Rewrote the
// first "what it does" bullet to describe that, instead of only the
// auto-open suppression, which is still real and still true.
//
// v3.341.0 -- reported directly: answering a not-on-file question
// inside the panel read as a second form, confusing rather than
// helpful. content.js's own inline text box and choice buttons are
// gone; a question like this is now answered the one ordinary way,
// directly on the real page. Rewrote the "not on file yet" bullet to
// describe that instead of the removed in-panel answer box.
//
// v3.347.0 -- reported directly against a screenshot of a competitor's
// own extension panel: "easy to understand clean cards ayn extantion
// needs to be the same." The panel's Ready screen was rebuilt around
// one dominant Fill button, a plain credits-left line under it, and
// Tailor resume / Write cover letter as a calm, chevron-led list
// instead of two same-weight buttons. Rewrote the "Fills the page"
// bullet to describe the real screen you land on, not just the click.
//
// v3.348.0 -- asked directly to research 2026 extension design and make
// the whole panel easier to understand and navigate. Three real,
// user-visible changes shipped that this page never described: the
// Ready screen now names the exact page it detected before you click
// anything, tailoring a resume now offers to also write the cover
// letter right there afterward (and the reverse) instead of forcing a
// trip back to the start, and the panel now shows which AYN account
// it's signed into with a one-click way to sign out, reachable from
// every screen -- previously the only way out of a wrong account was
// clearing the extension's storage by hand.
import { useEffect } from 'react';
import { Download, CheckCircle2 } from 'lucide-react';
import { SEO } from '@/components/shared/SEO';
import { SeekerSidebar } from '@/components/landing/SeekerSidebar';
import { LandingFooter } from '@/components/landing/LandingFooter';

const STEPS = [
  { n: 1, text: 'Download the extension below, then unzip it.' },
  { n: 2, text: 'Open chrome://extensions and turn on "Developer mode" (top right).' },
  { n: 3, text: 'Click "Load unpacked" and select the unzipped folder.' },
  { n: 4, text: 'That’s it. On a real application page on a site AYN recognizes, it opens on its own. Anywhere else, click the AYN icon in your toolbar (or press Ctrl+Shift+Y, Cmd+Shift+Y on Mac). No need to save the job in AYN first.' },
];

const WHAT_IT_DOES = [
  'Recognizes a real application page on its own, on sites AYN already knows, and opens there without you clicking anything. Close it and it never auto-reopens on that same page, and it does not actually disappear either: a small tab stays on the edge of the page, click it and the panel comes right back, exactly where you left it.',
  'Scores how well you fit the role the moment it opens, free, no click needed. A real match percentage, broken down by skills, experience, and education, plus the specific things you are missing, computed the same way as the rest of AYN, not just described.',
  'Opens on a clean Ready screen: the exact page it detected, so you can confirm it is reading the right posting before anything happens, one clear Fill button, your real credits left shown right under it, and Tailor resume / Write cover letter as a simple list below, not a wall of same-weight buttons.',
  'Fills the page from your real, visible fields once you click Fill, including a real resume upload from your primary AYN resume, matched against your own AYN profile, name, email, phone, and the same answer-matching AYN already uses elsewhere.',
  'Can tailor your resume or write a cover letter for this specific job, right there, as its own real action. You see a before-and-after of what actually changed, not just a checkmark next to a file you would have to download to read. Do one and it offers to do the other right there too, no trip back to the start.',
  'Always shows which AYN account it is signed into, right in the panel, with a one-click Sign out if it is ever the wrong one.',
  'Anything not on file yet, you just fill in on the real page, the same way you always would. One click on "Save what I typed, for next time" and AYN remembers it, so it is genuinely on file the next application, not asked again.',
  'For an open-ended question it writes an honest answer for, you can tell it how to make that one answer better (shorter, mention a specific skill) and it rewrites just that field.',
  'Can submit the application for you too, but only once you’ve explicitly turned that on. Off by default, and it still won’t submit an honestly incomplete application even when it’s on.',
];

const WHAT_IT_NEVER_DOES = [
  'Never invents a value. Every field it fills traces back to something real on your AYN profile.',
  'Never submits without your explicit, separate agreement. By default it fills and stops, same as any other autofill tool, and you review and submit yourself.',
  'Never tries to look more "human" to get past a site’s own bot detection. It runs in your real browser, as you, so there’s nothing to get past.',
];

export default function Autofill() {
  useEffect(() => {
    document.body.classList.add('contact-surface');
    return () => document.body.classList.remove('contact-surface');
  }, []);

  return (
    <div className="lp lp-shell-with-sidebar contact-surface">
      <SEO
        title="Autofill | AYN"
        description="AYN Autofill is a real browser extension that fills a job application from your own AYN profile, in your own browser. You always review and submit it yourself."
      />
      <SeekerSidebar />
      <main className="lp-sidebar-main">
        <section className="lp-section">
          <div className="lp-shell">
            <div style={{ maxWidth: 720 }}>
              <p className="lp-eyebrow">Autofill</p>
              <h1 className="lp-display lp-h2">Fill job applications from your own AYN profile</h1>
              <p className="lp-lead" style={{ marginInline: 0 }}>
                A real browser extension, not a bot on a server. It reads the application page in
                front of you and fills what it can from your real profile. You always review the
                page and hit Submit yourself.
              </p>

              <a
                href="/ayn-auto-apply-extension.zip"
                download
                className="lp-btn lp-btn-primary lp-btn-lg"
                style={{ marginTop: 24, marginBottom: 8 }}
              >
                <Download size={16} /> Download AYN Autofill
              </a>
              <p className="text-xs" style={{ color: 'hsl(var(--lp-dim))' }}>
                A .zip file. Not on the Chrome Web Store yet, installed the same way any
                developer extension is, in a few clicks below.
              </p>

              <h2 className="lp-display" style={{ fontSize: 20, marginTop: 40, marginBottom: 14 }}>
                Install it
              </h2>
              <ol style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingLeft: 0, listStyle: 'none' }}>
                {STEPS.map((s) => (
                  <li key={s.n} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <span
                      aria-hidden="true"
                      style={{
                        flexShrink: 0, width: 22, height: 22, borderRadius: '50%',
                        background: 'var(--lp-gradient-ember)', color: '#fff',
                        fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      {s.n}
                    </span>
                    <span style={{ color: 'hsl(var(--lp-muted))', fontSize: 15, lineHeight: 1.6 }}>{s.text}</span>
                  </li>
                ))}
              </ol>

              <h2 className="lp-display" style={{ fontSize: 20, marginTop: 40, marginBottom: 12 }}>
                What it does
              </h2>
              <ul style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 0, listStyle: 'none' }}>
                {WHAT_IT_DOES.map((t) => (
                  <li key={t} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <CheckCircle2 size={16} style={{ color: 'hsl(var(--lp-ember))', flexShrink: 0, marginTop: 3 }} />
                    <span style={{ color: 'hsl(var(--lp-muted))', fontSize: 15, lineHeight: 1.6 }}>{t}</span>
                  </li>
                ))}
              </ul>

              <h2 className="lp-display" style={{ fontSize: 20, marginTop: 32, marginBottom: 12 }}>
                What it never does
              </h2>
              <ul style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 0, listStyle: 'none', marginBottom: 8 }}>
                {WHAT_IT_NEVER_DOES.map((t) => (
                  <li key={t} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <CheckCircle2 size={16} style={{ color: 'hsl(var(--lp-ember))', flexShrink: 0, marginTop: 3 }} />
                    <span style={{ color: 'hsl(var(--lp-muted))', fontSize: 15, lineHeight: 1.6 }}>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
        <LandingFooter />
      </main>
    </div>
  );
}

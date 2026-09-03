// v3.277.0 -- asked directly for a real page in the site, not a link
// buried inside one job's own detail view: "just have a page for in ayn
// so i can download it just call it autofill." Same SeekerSidebar/
// LandingFooter + .lp shell every other standalone page (Pricing,
// Do Not Sell, the legal documents) already uses, so it reads as a real
// page on the site, not a one-off. Public -- no sign-in needed to read
// what it is or download it, matching every other public page here.
import { useEffect } from 'react';
import { Download, CheckCircle2 } from 'lucide-react';
import { SEO } from '@/components/shared/SEO';
import { SeekerSidebar } from '@/components/landing/SeekerSidebar';
import { LandingFooter } from '@/components/landing/LandingFooter';

const STEPS = [
  { n: 1, text: 'Download the extension below, then unzip it.' },
  { n: 2, text: 'Open chrome://extensions and turn on "Developer mode" (top right).' },
  { n: 3, text: 'Click "Load unpacked" and select the unzipped folder.' },
  { n: 4, text: 'That’s it — on a real application page on a site AYN recognizes, it opens on its own. Anywhere else, click the AYN icon in your toolbar (or press Ctrl+Shift+Y — Cmd+Shift+Y on Mac). No need to save the job in AYN first.' },
];

const WHAT_IT_DOES = [
  'Recognizes a real application page on its own, on sites AYN already knows, and opens there without you clicking anything. Close it once on a page and it stays closed there, so it never fights you.',
  'Reads the real, visible fields on the application page in front of you — including a real resume upload, filled from your primary AYN resume.',
  'Matches them against your own AYN profile — name, email, phone, and the same answer-matching AYN already uses elsewhere.',
  'Fills what it finds, and shows you anything it couldn’t.',
  'For an open-ended question it writes an honest answer for, you can tell it how to make that one answer better (shorter, mention a specific skill) and it rewrites just that field.',
  'Can submit the application for you too, but only once you’ve explicitly turned that on. Off by default, and it still won’t submit an honestly incomplete application even when it’s on.',
];

const WHAT_IT_NEVER_DOES = [
  'Never invents a value — every field it fills traces back to something real on your AYN profile.',
  'Never submits without your explicit, separate agreement — by default it fills and stops, same as any other autofill tool, and you review and submit yourself.',
  'Never tries to look more "human" to get past a site’s own bot detection — it runs in your real browser, as you, so there’s nothing to get past.',
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
                A .zip file. Not on the Chrome Web Store yet &mdash; installed the same way any
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

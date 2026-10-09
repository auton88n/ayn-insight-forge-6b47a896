

// v3.237.0 -- reported directly: every tab needs to match in layout
// height, width and positioning. This shell's own 720px cap, centered by
// .lp-shell's `margin: 0 auto`, measured live at a real 268px rightward
// shift on this exact heading versus Features' left-aligned one at the
// same viewport -- not a difference in copy, a difference in where the
// title actually starts on screen. The shell is now the same 1360px
// default every left-aligned tab uses; the narrow reading measure this
// prose still genuinely benefits from moved onto the two content blocks
// directly, left-aligned (no auto-centering), so they start at that same
// shared x position instead of floating further right.
export const AboutTab = () => (
  <section className="lp-section">
    <div className="lp-shell">
      <div className="lp-reveal" style={{ marginBottom: 8, maxWidth: 720 }}>
        <p className="lp-eyebrow">About AYN</p>
        <h2 className="lp-display lp-h2">Hiring runs on volume. We think it should run on evidence.</h2>
        <p className="lp-lead">AYN is built by a team in Canada.</p>
      </div>
      {/* Sept 2026 -- "in about us add a nice card i dont like to see the
          text on the web cream page." This prose sat directly on the
          page's own warm-paper background with nothing behind it; wrapped
          in .lp-panel, the same real white card ContactTab right below
          this one already uses, instead of inventing a second card style. */}
      <div className="lp-panel lp-reveal" style={{ marginTop: 24, maxWidth: 720 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p className="lp-note" style={{ fontSize: 15 }}>
            AI made it effortless to apply everywhere, so everyone did. Hiring drowned in noise, and a hiring
            manager who used to read forty applications started opening six hundred and reading none of them
            properly. Somewhere in that pile was the one person who could actually do the job. Nobody had time
            to find them.
          </p>
          <p className="lp-pullquote">
            We built AYN because that person should not have to out-send a machine to be seen.
          </p>
          <div>
            <h3 className="lp-display" style={{ fontSize: 17, marginBottom: 8 }}>Mission and vision</h3>
            <p className="lp-note" style={{ fontSize: 15 }}>
              Replace volume with evidence. Build a hiring market where being seen depends on what you have
              done, not on how many places you applied.
            </p>
          </div>
          <p className="lp-note" style={{ fontSize: 15 }}>
            For job seekers, AYN reads a job posting, shows how you line up against it, and writes a resume
            and cover letter from your real experience for that specific role. For employers, describe a role
            once and AYN finds the people worth talking to, with the evidence behind each match and what they
            are missing, instead of six hundred resumes and a guess.
          </p>
          <p className="lp-note" style={{ fontSize: 15 }}>
            Switch discoverability on and employers see your background, not your name, email, or phone, until
            you accept an offer.
          </p>
        </div>
      </div>
    </div>
  </section>
);

export default AboutTab;

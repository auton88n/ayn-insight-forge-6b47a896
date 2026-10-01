// v3.330.0 — extracted from BrowseJobs.tsx as part of splitting that
// 2,282-line file into focused pieces. Pure presentational component,
// used by both the list/detail views and SwipeDeck.
//
// job_board_score is deliberately keyword-only (no AI call — see that
// function's own header, and CLAUDE.md's disclosed accuracy gap versus the
// full semantic pipeline), so a low number on a mismatched role is a
// correct, honest answer, not a failure. Styled as a neutral tier rather
// than a red/failed one so it never reads as "AYN broke."
// v3.149.0 — bottom tier relabeled from "Quick match" to "Rough estimate":
// that name was already doing double duty as this whole feature's own
// section heading, which made the lowest, least-trustworthy tier read as
// if it shared a name with the feature itself rather than flagging
// itself as the one to be most skeptical of.
export function scoreTier(score: number) {
  if (score >= 50) return { label: "Strong match", ring: "#10b981", text: "#047857" };
  if (score >= 20) return { label: "Some overlap", ring: "#f59e0b", text: "#b45309" };
  return { label: "Rough estimate", ring: "#9ca3af", text: "#6b7280" };
}

// v3.147.0 — asked directly for the auto-computed quick-match score to
// read as a circular gauge instead of a flat text pill. Same tiering
// scoreTier already used (emerald/amber/neutral), just drawn as a ring
// instead of a background fill, with the number in the center. Used at
// two sizes: small and unlabeled inline in the list row (25 of these on
// a page, no room for a label), larger with its tier label in the detail
// pane, where it is the one score on screen.
// v3.149.0 — asked directly to never show a bare low percentage without
// making the "this is an estimate, click through for the real one"
// framing more prominent. A tooltip alone doesn't count as prominent —
// nothing to hover on a touch device, and a hover target is easy to miss
// even on desktop. showLabel's caller (the detail pane, the one place
// with room) now gets a real, always-visible line under the gauge
// whenever the score is below the top tier, since that's exactly the
// range where a keyword-only number is most likely to undersell someone.
export function ScoreGauge({ score, size = 28, showLabel = false }: { score: number; size?: number; showLabel?: boolean }) {
  const stroke = Math.max(3, Math.round(size * 0.12));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score));
  const offset = c * (1 - pct / 100);
  const tier = scoreTier(pct);
  const showHint = showLabel && pct < 50;
  const ring = (
    <span style={{ width: size, height: size, position: "relative" }} className="inline-block shrink-0">
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--rh-hair, #ececec)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={tier.ring} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <span style={{ position: "absolute", inset: 0 }} className="flex items-center justify-center">
        <span style={{ fontFamily: "JetBrains Mono, monospace", fontWeight: 700, fontSize: Math.max(9, size * 0.32), color: tier.text, lineHeight: 1 }}>
          {Math.round(pct)}
        </span>
      </span>
    </span>
  );
  const title = "A quick keyword estimate, computed automatically from your title, skills and years of experience. Score and tailor for AYN's full match analysis.";
  if (!showHint) {
    return (
      <span className="inline-flex items-center gap-2" title={title}>
        {ring}
        {showLabel && <span className="text-xs font-medium" style={{ color: tier.text }}>{tier.label}</span>}
      </span>
    );
  }
  return (
    <span className="inline-flex flex-col gap-1" title={title}>
      <span className="inline-flex items-center gap-2">
        {ring}
        <span className="text-xs font-medium" style={{ color: tier.text }}>{tier.label}</span>
      </span>
      <span className="text-[11px] text-muted-foreground">
        Rough estimate. Click Score and tailor for the real match.
      </span>
    </span>
  );
}

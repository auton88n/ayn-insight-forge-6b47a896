// The per-job match indicator: a gauge once a score exists, a pulsing
// "Scoring…" pill while the score call is pending, and "No resume yet" when
// the call came back with nothing to score against. Shared by the list row
// and the detail pane.
import { ScoreGauge } from "./ScoreGauge";

export function ScorePill({ score, hasScored, size = 28 }: { score: number | null | undefined; hasScored: boolean; size?: number }) {
  if (score != null) return <ScoreGauge score={score} size={size} showLabel={size >= 40} />;
  if (!hasScored) {
    return <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-muted text-muted-foreground animate-pulse">Scoring…</span>;
  }
  return <span className="text-xs text-muted-foreground">No resume yet</span>;
}

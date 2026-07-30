/**
 * CandidateResultCard.tsx — v3.14.0 "readable candidates".
 *
 * The result card used to be an unlabelled stack: a headline, a grey meta
 * line, a mixed row of matched and missing chips, then three lines of 12px
 * muted text. This splits it into named zones so nothing on the card is
 * unexplained, and lifts the body text to a size a person can actually read.
 *
 * Presentation only. No identity is rendered here, same as before.
 */
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X, MapPin, ClipboardCheck, ArrowRight } from "lucide-react";
import CandidateAskCards from "@/components/employer/CandidateAskCards";
import type { CandidateCard } from "@/lib/employer";

function scoreBand(score: number) {
  if (score >= 80) return "Strong match";
  if (score >= 60) return "Good match";
  if (score >= 40) return "Partial match";
  return "Weak match";
}

export function ScoreDial({ score, size = 56 }: { score: number; size?: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(score)));
  const inner = size - 14;
  return (
    <div
      className="relative shrink-0 rounded-full grid place-items-center"
      style={{
        width: size, height: size,
        background: `conic-gradient(hsl(var(--primary)) ${pct * 3.6}deg, hsl(var(--muted)) 0deg)`,
      }}
      aria-label={`Match score ${pct} out of 100`}
    >
      <div
        className="rounded-full bg-card grid place-items-center font-semibold"
        style={{ width: inner, height: inner, fontSize: size > 48 ? 15 : 12 }}
      >
        {pct}
      </div>
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground mb-2">
      {children}
    </p>
  );
}

export default function CandidateResultCard({
  candidate, index, total, searchId, alreadySent,
  onOpen, onProposal, onAssess,
}: {
  candidate: CandidateCard;
  index: number;
  total: number;
  searchId: string | null;
  alreadySent: boolean;
  onOpen: () => void;
  onProposal: () => void;
  onAssess: () => void;
}) {
  const c = candidate;
  const [showAllWhy, setShowAllWhy] = useState(false);
  const why = c.why || [];
  const shownWhy = showAllWhy ? why : why.slice(0, 3);
  const meta = [
    c.seniority,
    c.years_experience != null ? `${c.years_experience} years` : "",
  ].filter(Boolean).join(" · ");

  return (
    <Card className="overflow-hidden">
      {/* Header */}
      <div className="flex items-start gap-4 p-5">
        <div className="flex flex-col items-center gap-1.5">
          <ScoreDial score={c.score} />
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Match</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-medium text-muted-foreground">
              {index + 1} of {total}
            </span>
            <Badge variant="secondary" className="font-normal text-[11px]">{scoreBand(c.score)}</Badge>
          </div>
          <h3 className="text-base font-semibold leading-snug mt-1">
            {c.first_name || "Candidate"}
          </h3>
          <p className="text-sm mt-0.5">{c.headline || "No headline given"}</p>

          <p className="text-sm text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
            {meta}
            {c.location && (
              <span className="inline-flex items-center gap-1">
                {meta ? <span aria-hidden>·</span> : null}
                <MapPin className="w-3.5 h-3.5" />{c.location}
              </span>
            )}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onOpen} className="shrink-0">
          Full profile <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
        </Button>
      </div>

      {/* What they have, what they are missing */}
      <div className="border-t border-border/60 grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border/60">
        <div className="p-5">
          <Eyebrow>Has what you asked for</Eyebrow>
          {c.matched_must_haves.length === 0 ? (
            <p className="text-sm text-muted-foreground">None of your must haves are evidenced.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {c.matched_must_haves.map(m => (
                <Badge key={m} variant="secondary" className="font-normal gap-1 py-1">
                  <Check className="w-3 h-3" />{m}
                </Badge>
              ))}
            </div>
          )}
        </div>
        <div className="p-5">
          <Eyebrow>Missing</Eyebrow>
          {c.gaps.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing missing that you named.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {c.gaps.map(g => (
                <Badge key={g} variant="outline" className="font-normal gap-1 py-1 text-muted-foreground">
                  <X className="w-3 h-3" />{g}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Why */}
      {why.length > 0 && (
        <div className="border-t border-border/60 p-5">
          <Eyebrow>Why AYN picked them</Eyebrow>
          <ul className="space-y-2">
            {shownWhy.map((w, i) => (
              <li key={i} className="text-sm leading-relaxed flex gap-2.5">
                <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-primary shrink-0" aria-hidden />
                <span>{w}</span>
              </li>
            ))}
          </ul>
          {why.length > 3 && (
            <button
              type="button"
              onClick={() => setShowAllWhy(v => !v)}
              className="text-xs text-primary hover:underline mt-2.5"
            >
              {showAllWhy ? "Show less" : `Show ${why.length - 3} more`}
            </button>
          )}
        </div>
      )}

      {/* Ask AYN */}
      {searchId && (
        <div className="border-t border-border/60 p-5">
          <Eyebrow>Ask AYN about them</Eyebrow>
          <CandidateAskCards searchId={searchId} candidateRef={c.ref} total={total} />
        </div>
      )}

      {/* Actions */}
      <div className="border-t border-border/60 bg-muted/30 px-5 py-4 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" disabled={!searchId} onClick={onAssess}>
          <ClipboardCheck className="w-4 h-4 mr-2" /> Send an assessment
        </Button>
        {alreadySent ? (
          <Button size="sm" variant="secondary" disabled>Proposal sent, waiting for a reply</Button>
        ) : (
          <Button size="sm" onClick={onProposal}>Send a job proposal</Button>
        )}
        <span className="text-xs text-muted-foreground ml-auto hidden sm:block">
          Contact details arrive only if they accept.
        </span>
      </div>
    </Card>
  );
}

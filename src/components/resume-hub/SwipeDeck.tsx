// v3.330.0 — extracted from BrowseJobs.tsx as part of splitting that
// 2,282-line file into focused pieces. The "swipe to decide" mobile
// browsing mode: SwipeCardPeek (the small non-interactive preview of the
// next couple of cards in the deck) and SwipeDeck itself. Pure code
// movement, zero logic changes.
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Flame, Heart, Layers, Loader2, X } from "lucide-react";
import { type JobPosting } from "@/lib/resumeHub";
import { SENIORITY_LABELS, humanizeSlug, resolveSalary, companyAvatar, resolveLogoUrl, formatLocation } from "@/lib/jobPostingFormat";
import { HOT_WINDOW_MS } from "./browseJobsHelpers";
import { ScoreGauge } from "./ScoreGauge";

/** A small, non-interactive preview of a card sitting behind the active one
 * in the deck -- just enough to read as "there's more," never real content
 * someone could mistake for the actual next card (title/company only, no
 * score, no buttons). */
function SwipeCardPeek({ job, style }: { job: JobPosting; style: React.CSSProperties }) {
  const avatar = companyAvatar(job.company);
  const logoUrl = resolveLogoUrl(job);
  return (
    <div
      className="absolute inset-0 rounded-2xl p-5 flex flex-col"
      style={{ background: "var(--rh-surface)", border: "1px solid var(--rh-hair)", ...style }}
    >
      {logoUrl ? (
        <img src={logoUrl} alt="" className="w-12 h-12 rounded-xl object-contain bg-white p-1.5 border mb-3" style={{ borderColor: "var(--rh-hair)" }} />
      ) : (
        <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold shrink-0 ${avatar.className}`}>{avatar.initial}</div>
      )}
      <p className="rh-display text-[15px] leading-snug truncate">{job.title}</p>
      <p className="text-[12px] truncate" style={{ color: "var(--rh-muted)" }}>{job.company}</p>
    </div>
  );
}

// v3.171.0 — "swipe to decide," built for the approved Ember Discovery
// mockup. One card at a time, drag or tap to move through the same
// filtered/scored jobs the list already shows -- pass never writes
// anything (session-local, resets on a fresh filter or a reload, the same
// "not a permanent decision" framing the mockup itself disclosed), save
// calls the exact same saveJob the list's own bookmark uses so the two
// surfaces can never disagree about what's actually saved.
export function SwipeDeck({
  jobs, index, onIndexChange, scores, scored, logoFailed, setLogoFailed, onSave, onSeen, onOpenDetail, hasMore,
}: {
  jobs: JobPosting[];
  index: number;
  onIndexChange: (i: number) => void;
  scores: Record<string, number | null>;
  scored: Set<string>;
  logoFailed: Set<string>;
  setLogoFailed: React.Dispatch<React.SetStateAction<Set<string>>>;
  onSave: (job: JobPosting) => void;
  onSeen: (jobId: string) => void;
  onOpenDetail: (job: JobPosting) => void;
  hasMore: boolean;
}) {
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [flying, setFlying] = useState<1 | -1 | null>(null);
  const startXRef = useRef(0);

  const current = jobs[index];
  const upNext = jobs[index + 1];
  const onDeck = jobs[index + 2];

  // v3.183.0 — reaching the front of the deck is "seen" for swipe mode's
  // own purposes: the full card is shown, read, and swiped on, unlike a
  // list row that needs an actual click to open. Marks the whole session's
  // worth of cards as seen as the person swipes through, without touching
  // the array being swiped (see swipeJobs' own comment in the parent).
  // Deliberately keyed on current?.id alone: onSeen is a stable useCallback
  // from the parent, and including it (or the whole current object) would
  // refire on every unrelated re-render, not just when the front card
  // actually changes.
  useEffect(() => {
    if (current) onSeen(current.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  const advance = (dir: 1 | -1) => {
    if (!current || flying) return;
    setFlying(dir);
    setDragX(dir * 520);
    setTimeout(() => {
      setFlying(null);
      setDragX(0);
      onIndexChange(index + 1);
    }, 260);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (flying) return;
    setDragging(true);
    startXRef.current = e.clientX;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    setDragX(e.clientX - startXRef.current);
  };
  const onPointerUp = () => {
    if (!dragging) return;
    setDragging(false);
    if (dragX > 100) { onSave(current); advance(1); }
    else if (dragX < -100) advance(-1);
    else setDragX(0);
  };

  if (!current) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-1" style={{ background: "var(--rh-gradient)", boxShadow: "var(--rh-glow)" }}>
          <Layers className="w-6 h-6 text-white" />
        </div>
        <p className="rh-display text-lg">
          {hasMore ? "Loading more…" : "That's every fresh posting for now."}
        </p>
        {!hasMore && (
          <p className="text-sm max-w-xs" style={{ color: "var(--rh-muted)" }}>
            Check back soon, or switch back to the list to see everything again.
          </p>
        )}
        {hasMore && <Loader2 className="w-5 h-5 animate-spin" style={{ color: "var(--rh-accent)" }} />}
      </div>
    );
  }

  const salary = resolveSalary(current);
  const logoUrl = resolveLogoUrl(current);
  const showLogo = !!logoUrl && !logoFailed.has(current.id);
  const avatar = companyAvatar(current.company);
  const score = scores[current.id];
  const rot = dragX / 18;
  const passOpacity = dragX < 0 ? Math.min(Math.abs(dragX) / 90, 1) : 0;
  const saveOpacity = dragX > 0 ? Math.min(dragX / 90, 1) : 0;
  const desc = (current.description || "").trim();
  // v3.183.0 — reported directly: the swipe deck never showed the New
  // badge at all, even though the same 24h logic already works correctly
  // in list view. Same HOT_WINDOW_MS, just never wired into this card.
  const isHot = Date.now() - new Date(current.posted_at).getTime() < HOT_WINDOW_MS;

  return (
    <div className="flex flex-col items-center gap-5 py-2">
      <div className="relative" style={{ width: "min(360px, 92vw)", height: 440 }}>
        {onDeck && <SwipeCardPeek job={onDeck} style={{ transform: "translateY(16px) scale(0.94)", opacity: 0.5, zIndex: 1 }} />}
        {upNext && <SwipeCardPeek job={upNext} style={{ transform: "translateY(8px) scale(0.97)", opacity: 0.8, zIndex: 2 }} />}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          className="absolute inset-0 rounded-2xl p-5 flex flex-col"
          style={{
            zIndex: 3,
            background: "var(--rh-surface)",
            border: "1px solid var(--rh-hair)",
            boxShadow: "var(--rh-shadow-lift)",
            transform: `translateX(${dragX}px) rotate(${rot}deg)`,
            opacity: flying ? 0.3 : 1,
            transition: dragging ? "none" : "transform .28s ease, opacity .28s ease",
            touchAction: "none",
            cursor: dragging ? "grabbing" : "grab",
          }}
        >
          <span
            className="absolute top-6 left-5 text-sm font-extrabold uppercase tracking-wide px-3 py-1.5 rounded-lg pointer-events-none"
            style={{ color: "#b23b3b", border: "3px solid #b23b3b", opacity: passOpacity, transform: "rotate(-14deg)" }}
          >
            Pass
          </span>
          <span
            className="absolute top-6 right-5 text-sm font-extrabold uppercase tracking-wide px-3 py-1.5 rounded-lg pointer-events-none"
            style={{ color: "var(--rh-trust)", border: "3px solid var(--rh-trust)", opacity: saveOpacity, transform: "rotate(14deg)" }}
          >
            Save
          </span>

          <div className="flex items-start justify-between mb-3">
            {showLogo ? (
              <img
                src={logoUrl!}
                alt=""
                className="w-14 h-14 rounded-xl object-contain bg-white p-1.5 border"
                style={{ borderColor: "var(--rh-hair)" }}
                onError={() => setLogoFailed((prev) => new Set(prev).add(current.id))}
              />
            ) : (
              <div className={`w-14 h-14 rounded-full flex items-center justify-center font-bold text-lg ${avatar.className}`} style={{ boxShadow: "0 6px 16px -6px rgba(28,23,18,0.35)" }}>
                {avatar.initial}
              </div>
            )}
            {isHot && (
              <Badge
                variant="outline"
                className="shrink-0 gap-1 border-0"
                style={{ background: "var(--rh-gradient)", color: "#fff", boxShadow: "var(--rh-glow)" }}
              >
                <Flame className="w-3 h-3" /> New
              </Badge>
            )}
          </div>
          <p className="rh-display text-[18px] leading-snug mb-1">{current.title}</p>
          <p className="text-[13px] mb-3" style={{ color: "var(--rh-muted)" }}>
            {current.company}{current.location ? ` · ${formatLocation(current.location)}` : ""}
          </p>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {salary && (
              <span className="text-[11px] font-bold rounded-full px-2.5 py-1" style={{ background: "var(--rh-gold-tint)", color: "var(--rh-gold)" }}>
                {salary.text}
              </span>
            )}
            {current.work_mode && (
              <span className="text-[11px] font-semibold rounded-full px-2.5 py-1 capitalize" style={{ background: "var(--rh-trust-tint)", color: "var(--rh-trust)" }}>
                {current.work_mode}
              </span>
            )}
            {current.seniority && (
              <span className="text-[11px] font-semibold rounded-full px-2.5 py-1" style={{ background: "var(--rh-raised)", color: "var(--rh-muted)" }}>
                {SENIORITY_LABELS[current.seniority] || humanizeSlug(current.seniority)}
              </span>
            )}
          </div>
          <p className="text-[13px] leading-relaxed flex-1 overflow-hidden" style={{ color: "var(--rh-muted)" }}>
            {desc ? `${desc.slice(0, 200)}${desc.length > 200 ? "…" : ""}` : "No description on file for this one. Open it to see more on the company's own site."}
          </p>
          <div className="flex items-center justify-between pt-3 mt-2 border-t" style={{ borderColor: "var(--rh-hair)" }}>
            {score != null
              ? <ScoreGauge score={score} size={30} />
              : scored.has(current.id)
                ? <span className="text-[11px]" style={{ color: "var(--rh-faint)" }}>No resume yet</span>
                : <span className="text-[11px] animate-pulse" style={{ color: "var(--rh-faint)" }}>Scoring…</span>}
            <button
              type="button"
              onClick={() => onOpenDetail(current)}
              className="text-[11px] font-bold underline"
              style={{ color: "var(--rh-accent-2)" }}
            >
              Read full posting
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-5">
        <button
          type="button"
          onClick={() => advance(-1)}
          aria-label="Pass"
          className="w-14 h-14 rounded-full flex items-center justify-center transition hover:scale-105"
          style={{ background: "var(--rh-surface)", border: "1.5px solid #e8c9c9", color: "#b23b3b", boxShadow: "var(--rh-shadow-card)" }}
        >
          <X className="w-6 h-6" />
        </button>
        <button
          type="button"
          onClick={() => { onSave(current); advance(1); }}
          aria-label="Save"
          className="w-14 h-14 rounded-full flex items-center justify-center transition hover:scale-105 text-white"
          style={{ background: "var(--rh-gradient)", boxShadow: "var(--rh-glow)" }}
        >
          <Heart className="w-6 h-6" fill="currentColor" />
        </button>
      </div>
      <p className="text-xs" style={{ color: "var(--rh-faint)" }}>
        Drag the card, or use the buttons · {Math.max(0, jobs.length - index - 1)}{hasMore ? "+" : ""} more
      </p>
    </div>
  );
}

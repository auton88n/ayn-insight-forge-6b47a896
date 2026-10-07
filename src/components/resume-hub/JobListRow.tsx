// Performance pass: one row of the Browse Jobs list, extracted from
// BrowseJobs.tsx and wrapped in React.memo. BrowseJobs holds 60+ pieces of
// state, so typing in the search box or toggling a filter re-rendered every
// row even though a row only depends on its own job plus a handful of
// per-row flags. Everything a row reads is passed as a primitive (or a
// stable callback), so a row re-renders only when one of *its* inputs
// changes. Markup and behaviour are otherwise identical to the old inline
// row.
import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Flame, Bookmark } from "lucide-react";
import { type JobPosting } from "@/lib/resumeHub";
import { EMPLOYMENT_TYPE_LABELS, SENIORITY_LABELS, humanizeSlug, resolveSalary, companyAvatar, resolveLogoUrl, postedAge, postedDate, formatLocation, tidyTitle, tidyCompany } from "@/lib/jobPostingFormat";
import { HOT_WINDOW_MS } from "./browseJobsHelpers";
import { ScorePill } from "./ScorePill";
import { cleanApplyUrl } from "@/lib/applyUrl";

interface JobListRowProps {
  job: JobPosting;
  active: boolean;
  isSaved: boolean;
  isSeen: boolean;
  /** True while this specific job's save/unsave request is in flight. */
  isSaving: boolean;
  /** True once this job's logo failed to load (fall back to the avatar). */
  logoFailed: boolean;
  /** undefined/null = no numeric score; see `hasScored`. */
  score: number | null | undefined;
  /** Whether the scoring call has come back for this job at all. */
  hasScored: boolean;
  onOpen: (job: JobPosting) => void;
  onToggleBookmark: (job: JobPosting, isSaved: boolean) => void;
  onLogoError: (jobId: string) => void;
}

function JobListRowImpl({
  job: j, active, isSaved, isSeen, isSaving, logoFailed, score, hasScored,
  onOpen, onToggleBookmark, onLogoError,
}: JobListRowProps) {
  const isHot = Date.now() - new Date(j.posted_at).getTime() < HOT_WINDOW_MS;
  const avatar = companyAvatar(j.company);
  const logoUrl = resolveLogoUrl(j);
  const showLogo = !!logoUrl && !logoFailed;
  const salary = resolveSalary(j);
  return (
    // The clickable area (avatar + text) is its own inner button, with the
    // bookmark as a sibling, since an interactive element can't nest inside
    // another one.
    <div
      className={"ayn-match-row w-full flex items-start gap-2 p-4 relative" + (active ? " is-active" : "")}
      style={{ background: active ? undefined : "var(--rh-surface)" }}
    >
      <button type="button" onClick={() => onOpen(j)} className="flex items-start gap-3 flex-1 min-w-0 text-left">
        {showLogo ? (
          <img
            src={logoUrl!}
            alt=""
            className="w-12 h-12 rounded-xl shrink-0 object-contain bg-white p-1.5 border"
            style={{ borderColor: "var(--rh-hair)" }}
            onError={() => onLogoError(j.id)}
          />
        ) : (
          <div
            className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-base shrink-0 ${avatar.className}`}
            style={{ boxShadow: "0 6px 16px -6px rgba(28,23,18,0.35)" }}
          >
            {avatar.initial}
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <p className="rh-display text-[15.5px] leading-snug">{tidyTitle(j.title)}</p>
          <p className="text-[13px] truncate" style={{ color: "var(--rh-muted)" }}>
            {tidyCompany(j.company, j.company_slug)}{j.location ? ` • ${formatLocation(j.location)}` : ""}
          </p>
          <div className="flex items-center gap-2 flex-wrap pt-0.5">
            <ScorePill score={score} hasScored={hasScored} />
            <span className="text-[11px]" style={{ color: "var(--rh-faint)" }}>{postedAge(j.posted_at)} · {postedDate(j.posted_at)}</span>
            {salary && (
              <span
                className="text-[11px] font-bold"
                style={{ color: "var(--rh-gold)" }}
                title={salary.fromListingText ? "Read directly from this posting's own text." : undefined}
              >
                {salary.text}
              </span>
            )}
          </div>
          {/* Type, seniority and work mode right on the row: real basics
              otherwise only visible after opening the detail pane. */}
          {(j.employment_type || j.seniority || j.work_mode) && (
            <div className="flex items-center gap-1.5 flex-wrap pt-1">
              {j.employment_type && (
                <span
                  className="text-[10.5px] font-medium rounded-full px-2 py-0.5"
                  style={{ background: "var(--rh-raised)", color: "var(--rh-muted)", border: "1px solid var(--rh-hair)" }}
                >
                  {EMPLOYMENT_TYPE_LABELS[j.employment_type] || humanizeSlug(j.employment_type)}
                </span>
              )}
              {j.seniority && (
                <span
                  className="text-[10.5px] font-medium rounded-full px-2 py-0.5"
                  style={{ background: "var(--rh-raised)", color: "var(--rh-muted)", border: "1px solid var(--rh-hair)" }}
                >
                  {SENIORITY_LABELS[j.seniority] || humanizeSlug(j.seniority)}
                </span>
              )}
              {j.work_mode && (
                <span
                  className="text-[10.5px] font-medium rounded-full px-2 py-0.5"
                  style={{ background: "var(--rh-trust-tint)", color: "var(--rh-trust)" }}
                >
                  {humanizeSlug(j.work_mode)}
                </span>
              )}
            </div>
          )}
        </div>
      </button>
      <div className="flex flex-col items-end gap-2 shrink-0">
        {/* The New badge lives in its own end column so it lands in the same
            place on every card regardless of title length. */}
        {isHot && (
          <Badge
            variant="outline"
            className="shrink-0 gap-1 border-0"
            style={{ background: "var(--rh-gradient)", color: "#fff", boxShadow: "var(--rh-glow)" }}
          >
            <Flame className="w-3 h-3" /> New
          </Badge>
        )}
        {isSeen && (
          <Badge variant="outline" className="shrink-0 border-0" style={{ background: "var(--rh-raised)", color: "var(--rh-faint)" }}>
            Seen
          </Badge>
        )}
        {/* Direct link to the real apply_url, reachable without opening the job. */}
        <a
          href={cleanApplyUrl(j.apply_url)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          aria-label="Apply on the company's site"
          title="Apply on the company's site"
          className="p-1 rounded hover:bg-muted transition"
        >
          <ExternalLink className="w-4 h-4" style={{ color: "var(--rh-faint, #9ca3af)" }} />
        </a>
        {/* A real save/unsave toggle. */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onToggleBookmark(j, isSaved); }}
          disabled={isSaving}
          aria-label={isSaved ? "Remove from saved" : "Save job"}
          title={isSaved ? "Remove from saved" : "Save job"}
          className="p-1 rounded hover:bg-muted transition"
        >
          <Bookmark
            className="w-4 h-4"
            style={isSaved ? { fill: "var(--rh-accent)", color: "var(--rh-accent)" } : { color: "var(--rh-faint, #9ca3af)" }}
          />
        </button>
      </div>
    </div>
  );
}

export const JobListRow = memo(JobListRowImpl);

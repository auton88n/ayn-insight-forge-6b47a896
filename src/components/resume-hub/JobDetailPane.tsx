// The full-posting pane shown beside the Browse Jobs list (desktop) and in the
// narrow-screen sheet. Extracted from BrowseJobs.tsx; markup and behaviour are
// unchanged. Everything it needs comes in as props, so it re-renders only
// when the open job or one of its own flags changes, not on every keystroke
// in the search box.
import { memo, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Building2, ExternalLink, Loader2, MapPin, Plus, ShieldCheck, TrendingUp } from "lucide-react";
import { type JobPosting } from "@/lib/resumeHub";
import { CompanyInsightsNote } from "@/components/shared/CompanyInsightsNote";
import { JobPayComparison } from "@/components/shared/JobPayComparison";
import { JobApplicationFacts } from '@/components/shared/JobApplicationFacts';
import { additionalWorkMode } from '@/lib/jobPostingFormat';
import { EMPLOYMENT_TYPE_LABELS, SENIORITY_LABELS, humanizeSlug, resolveSalary, companyAvatar, resolveLogoUrl, postedAge, postedDate, JobDescriptionBody, formatLocation, jobAgeNotes, jobFactChips } from "@/lib/jobPostingFormat";
import { extractCultureSnippet } from "./browseJobsHelpers";
import { ScorePill } from "./ScorePill";
import { cleanApplyUrl } from "@/lib/applyUrl";

interface JobDetailPaneProps {
  job: JobPosting;
  score: number | null | undefined;
  hasScored: boolean;
  logoFailed: boolean;
  isAdding: boolean;
  /** Real turnover observed for this company (company_hiring_status = active). */
  activelyHiring: boolean;
  companyActivity: { count: number; mostRecent: string } | null;
  onAdd: (job: JobPosting) => void;
  onLogoError: (jobId: string) => void;
}

function JobDetailPaneImpl({ job, score, hasScored, logoFailed, isAdding, activelyHiring, companyActivity, onAdd, onLogoError }: JobDetailPaneProps) {
  const selectedSalary = resolveSalary(job);
  const cultureSnippet = useMemo(() => extractCultureSnippet(job.description ?? ""), [job]);

  // v3.171.0 — "read it in 5 seconds," the highlights strip from the
  // approved Ember Discovery mockup. Recruiters skim a resume in 6-10
  // seconds; the same courtesy was never extended back to a JD here, which
  // meant opening the full formatted body was the only way to learn the
  // basics. Every fact in this strip already lived in job_postings (real,
  // freehire-tagged enrichment) or resolveSalary's own extraction — this
  // only changes where it's shown, not what's shown. Skills shown here are
  // the posting's own tagged requirements (job.skills), not a match/gap
  // comparison against the candidate's profile -- that comparison already
  // has a real, authoritative home (the deterministic gap analysis behind
  // Score and tailor), and reimplementing a second version of it here
  // client-side risked disagreeing with it, which would be worse than not
  // showing one at all.
  const highlightCells = [
        selectedSalary && { key: "salary", label: "Salary", value: selectedSalary.text, tone: "gold" as const },
        job.seniority && { key: "seniority", label: "Seniority", value: SENIORITY_LABELS[job.seniority] || humanizeSlug(job.seniority) },
        // v3.344.0 — real, live bug caught while verifying the list
        // card's own new work-mode chip below: a raw value like
        // "not_remote" only ever got its first letter capitalized here,
        // rendering as the literal "Not_remote" with the underscore
        // still showing. humanizeSlug already exists for exactly this
        // shape of value (used for employment_type/seniority already) —
        // reused here instead of the narrower, wrong capitalize-only fix.
        additionalWorkMode(job.location, job.work_mode || job.work_mode_text) && { key: "mode", label: "Work mode", value: additionalWorkMode(job.location, job.work_mode || job.work_mode_text)!, tone: "trust" as const },
        job.employment_type && { key: "type", label: "Type", value: EMPLOYMENT_TYPE_LABELS[job.employment_type] || humanizeSlug(job.employment_type) },
        // Facts the posting states in its own text (read once, never guessed).
        ...jobFactChips(job).filter(c => c.key !== 'region' && c.key !== 'deadline').map((c) => ({
          key: c.key, label: c.text, value: c.text, title: c.title, tone: c.tone,
        })),
      ].filter((c): c is NonNullable<typeof c> & object => !!c);

  // Sept 2026 -- "why still small card not like the other one full and
  // scroll in... i want you to copy exactly how the cards in job search
  // and mimic the cards layout and the movements." This used to be a
  // fixed-height header (border-b) plus a SEPARATE inner flex-1
  // overflow-y-auto div for the job description alone -- two scroll
  // regions stacked inside one outer Card, itself pinned to a hard
  // h-[calc(100vh-8rem)]. Job search's own equivalent (.lp-browser-detail)
  // is one plain flowing block -- header, pills, buttons, description,
  // all together -- inside a single sticky/max-height/overflow-y:auto
  // wrapper, so the whole card scrolls (and pins) as one piece, the same
  // "movement" a real Indeed-style detail pane has. Restructured to
  // match exactly: no more inner split, one continuous block: the
  // sticky/max-height/scroll treatment now lives on the outer Card
  // itself (below, at this component's return), matching Job search's
  // own top:20px / max-height:calc(100vh-40px) numbers precisely rather
  // than the old, unrelated 16px/8rem values.
  return (
    <div className="p-5 space-y-3">
        <div className="flex items-start gap-3">
          {resolveLogoUrl(job) && !logoFailed ? (
            <img
              src={resolveLogoUrl(job)!}
              alt=""
              className="w-14 h-14 rounded-xl shrink-0 object-contain bg-white p-1.5 border"
              style={{ borderColor: "var(--rh-hair)" }}
              onError={() => onLogoError(job.id)}
            />
          ) : (
            <div
              className={`w-14 h-14 rounded-full flex items-center justify-center font-bold text-lg shrink-0 ${companyAvatar(job.company).className}`}
              style={{ boxShadow: "0 6px 16px -6px rgba(28,23,18,0.35)" }}
            >
              {companyAvatar(job.company).initial}
            </div>
          )}
          <div className="min-w-0">
            <h2 className="rh-display text-[24px] leading-snug">{job.title}</h2>
            <p className="text-sm flex items-center gap-1.5 mt-0.5" style={{ color: "var(--rh-muted)" }}>
              <Building2 className="w-3.5 h-3.5 shrink-0" />{job.company}
            </p>
            {job.location && (
              <p className="text-sm flex items-center gap-1.5" style={{ color: "var(--rh-muted)" }}>
                <MapPin className="w-3.5 h-3.5 shrink-0" />{formatLocation(job.location)}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <ScorePill score={score} hasScored={hasScored} size={44} />
          <span className="text-xs" style={{ color: "var(--rh-faint)" }}>Posted {postedAge(job.posted_at)} · {postedDate(job.posted_at)}</span>
          {jobAgeNotes(job).map((n) => (
            <span key={n.text} className="text-xs font-semibold" style={{ color: "var(--rh-gold)" }} title={n.title}>{n.text}</span>
          ))}
        </div>

        {/* v3.169.0 — asked directly to research what job seekers actually
            complain about on LinkedIn/Indeed, then use it as an advantage.
            The single most-repeated complaint, across every source checked:
            fake and ghost listings, and no way to tell a real posting from
            one that's already been filled or was never real. AYN's real,
            structural answer to that (never a third-party aggregator like
            LinkedIn/Indeed, sourced straight from the company's own hiring
            system, pruned the moment it's 3 days old, v3.194.0, was 7) was
            already true and already stated once in this page's own
            subtitle, but never
            surfaced as its own trust signal where someone deciding whether
            to trust THIS posting actually is.
            v3.171.0 — recolored to the new trust teal, its own accent
            reserved only for this class of signal, distinct from the
            decorative ember used everywhere else on the page. */}
        <p className="text-xs font-semibold flex items-center gap-1.5" style={{ color: "var(--rh-trust)" }} title="Never a third-party aggregator, never LinkedIn or Indeed. Pulled straight from the company's own hiring system. When the company takes a posting down, it leaves AYN within about 3 days.">
          <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
          Sourced directly from {job.company}'s own hiring system
        </p>

        {activelyHiring && (
          <p className="text-xs font-semibold flex items-center gap-1.5" style={{ color: "var(--rh-trust)" }} title="Based on real turnover AYN has actually observed over time for this company, not a guess from one listing.">
            <TrendingUp className="w-3.5 h-3.5 shrink-0" />
            {job.company} is actively hiring
          </p>
        )}

        {/* Sept 2026 -- reported directly, comparing this detail header
            against Job search's own: "two is better." Job search's own
            equivalent line (.lp-browser-pill-row) is plain inline text,
            no boxed background, no uppercase label -- this used to be a
            grid of separately-boxed "SALARY"/"WORK MODE" mini-cards, the
            single biggest visual difference between the two. Flattened to
            match: one plain inline row, values only (a job's own salary
            string or "Remote" already reads as what it is without a label
            over it), keeping the same gold/trust color cues the list row
            right next to this pane already uses for salary and work mode. */}
        {highlightCells.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap text-[13px] font-semibold">
            {highlightCells.map((c, i) => (
              <span key={c.key} className="inline-flex items-center gap-2">
                {i > 0 && <span aria-hidden="true" style={{ color: "var(--rh-hair)" }}>·</span>}
                <span title={'title' in c ? c.title : undefined} style={{ color: c.tone === "gold" ? "var(--rh-gold)" : c.tone === "trust" ? "var(--rh-trust)" : "var(--rh-muted)" }}>
                  {c.value}
                </span>
              </span>
            ))}
          </div>
        )}

        <CompanyInsightsNote slug={job.company_slug} company={job.company} className="text-xs" />
        <JobApplicationFacts job={job} />
        <JobPayComparison jobId={job.id} />

        {job.benefits && job.benefits.length > 0 && (
          <p className="text-xs" style={{ color: "var(--rh-muted)" }} title="Standard benefits this posting names in its own text.">
            <span className="font-semibold">Benefits named:</span> {job.benefits.join(" · ")}
          </p>
        )}

        <div className="flex items-center gap-2 flex-wrap pt-1">
          <Button onClick={() => onAdd(job)} disabled={isAdding} style={{ background: "var(--rh-gradient)", borderColor: "transparent", color: "#fff", boxShadow: "var(--rh-glow)" }} className="hover:opacity-90">
            {isAdding
              ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              : <Plus className="w-4 h-4 mr-2" />}
            Save and check my fit
          </Button>
          {/* v3.148.0 — reported directly against a live screenshot: this
              rendered half-fixed — a plain white/black-bordered button at
              rest that flipped to a solid black fill on hover, since it's
              a Button with asChild wrapping a real <a> tag, and the
              resume-hub.css ember retint below only ever targeted actual
              <button> elements (button.border-foreground), never an
              anchor carrying the same class. Rather than widen that CSS
              to catch every possible tag, this one's asked to be solid
              black outright — a secondary "leave AYN" action reads fine
              as a plain dark button next to the ember "Score and tailor"
              primary action, not fighting it for the same accent color. */}
          <Button asChild style={{ background: "#1c1712", borderColor: "#1c1712", color: "#fff" }} className="hover:opacity-90">
            <a href={cleanApplyUrl(job.apply_url)} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-4 h-4 mr-2" />Apply on company site
            </a>
          </Button>
        </div>

      {/* Sept 2026 -- "the job search is better than the job match in
          terms of showing full card JD," compared directly against a
          live screenshot of each. Job search's own detail pane reaches
          the actual job description almost immediately (title, a pill
          row, two buttons, one note, then the JD); this pane made you
          scroll past a score pill, two trust lines, a four-cell
          highlight grid, a skills list, a quote box and an activity note
          first -- real, valuable information, just enough of it stacked
          ahead of the JD that the description itself barely fit on
          screen. Nothing here was deleted: skills, the company's own
          words, and its hiring activity all still show, just after the
          job description instead of pushing it down, matching Job
          search's own "the description is the main content" ordering.
          Sept 2026 -- no longer its own separate scroll region either
          (see this block's own opening comment): a plain divider before
          the description, matching Job search's .lp-browser-jd border-top,
          not a second flex-1/overflow-y-auto area competing with the
          outer Card's own scroll. */}
      <div className="pt-4 mt-1 border-t space-y-4" style={{ borderColor: "var(--rh-hair)" }}>
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "var(--rh-faint)" }}>Job description</h3>
          <JobDescriptionBody text={job.description ?? ""} />
        </div>

        {job.skills && job.skills.length > 0 && (
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: "var(--rh-faint)" }}>Skills for this role</div>
            <div className="flex flex-wrap gap-1.5">
              {job.skills.slice(0, 10).map((s) => (
                <span key={s} className="text-xs font-semibold rounded-full px-2.5 py-1" style={{ background: "var(--rh-trust-tint)", color: "var(--rh-trust)" }}>
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        {cultureSnippet && (
          <div className="rounded-lg px-3 py-2.5" style={{ background: "var(--rh-tint)", border: "1px solid #e85d3a33" }}>
            <div className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: "var(--rh-faint)" }}>
              In {job.company}'s own words
            </div>
            <p className="text-[13px] leading-relaxed" style={{ color: "var(--rh-ink)" }}>{cultureSnippet}</p>
          </div>
        )}

        {companyActivity && (
          <p className="text-xs" style={{ color: "var(--rh-faint)" }} title="How many roles this company has open right now, and how recently the newest one landed. Not how fast they reply to an application.">
            {companyActivity.count === 1
              ? `${job.company}'s only open role right now`
              : `${companyActivity.count} open roles at ${job.company} right now`}
            {" · newest posted "}{postedAge(companyActivity.mostRecent)}
          </p>
        )}
      </div>
    </div>
  );
}

export const JobDetailPane = memo(JobDetailPaneImpl);

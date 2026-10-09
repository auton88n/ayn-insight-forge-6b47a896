// v3.330.0 — extracted from BrowseJobs.tsx as part of splitting that
// 2,282-line file into focused pieces. Small constants and pure helper
// functions shared by BrowseJobs.tsx itself and the SwipeDeck component
// split out alongside it (HOT_WINDOW_MS is the one value both need).
import { parseJobDescription } from "@/lib/jobPostingFormat";

export const PAGE_SIZE = 25;
export const HOT_WINDOW_MS = 24 * 60 * 60 * 1000;
// v3.145.0 — whatever's open in the detail pane, restored once on a
// refresh via its own one-shot effect below.
export const BROWSE_LAST_OPEN_KEY = "ayn_browse_last_open";
export const POSTED_WITHIN_OPTIONS = [
  { key: "1", label: "24 hours" },
  { key: "3", label: "3 days" },
  { key: "7", label: "This week" },
  { key: "30", label: "Past month" },
] as const;

// v3.166.0 — the enrichment columns job-board-sync now captures, so filters
// and ranking can read them without a second round trip per row.
export const COLS = "id, source, company, company_slug, company_logo_url, title, description, location, apply_url, posted_at, "
  + "employment_type, seniority, salary_min, salary_max, salary_currency, category, work_mode, city, skills, first_seen_at, last_seen_at, closure_status, closure_checked_at, closure_last_open_at, repost_count, years_required, sponsorship, salary_text_min, salary_text_max, salary_text_currency, salary_text_period, work_mode_text, benefits, remote_region, apply_by";

// v3.167.0 — asked directly not to expose the raw catalog size. A precise
// count is genuinely useful feedback when it's small (a filtered search
// telling you "3 jobs match" is actionable), but a bare five-digit number
// on the unfiltered view reads as a scale figure, not a feature. Capped at
// the same "1,000+" convention real job boards already use for this exact
// reason -- honest (never claims a smaller number than what's real,
// per this app's own "never say less than true" rule) without stating
// the real figure once it's past the point where the exact count adds
// anything.
export function displayCount(n: number): string {
  return n > 999 ? "1,000+" : String(n);
}

// v3.182.0 — 89% of job seekers say a company's values weigh on whether
// they apply (real, cited research), and the highlights strip above had
// salary/seniority/mode/type but nothing about the company itself. Zero new
// data and zero AI call: JD_HEADER_KEYWORDS already recognizes "about us" /
// "why join" / "who we are" style headings for the structural parser
// (parseJobDescription, shared via jobPostingFormat.tsx), so this
// just asks that same parser for the paragraph sitting right under one of
// those specific headings and shows it verbatim, truncated. Never
// summarized, never scored, never invented for a JD that doesn't have one --
// exactly the "surface what the company already said" version, not a new
// AYN opinion about the company.
const ABOUT_COMPANY_HEADINGS = new Set([
  "about us", "about the company", "who we are", "our culture",
  "our values", "our mission", "why join", "why join us",
]);
const CULTURE_SNIPPET_MAX = 220;
export function extractCultureSnippet(text: string): string | null {
  if (!text.trim()) return null;
  const blocks = parseJobDescription(text);
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.kind !== "heading") continue;
    if (!ABOUT_COMPANY_HEADINGS.has(b.text.trim().toLowerCase())) continue;
    const next = blocks[i + 1];
    if (!next) continue;
    const raw = next.kind === "para" ? next.text : next.kind === "bullets" ? next.items.join(" ") : null;
    if (!raw) continue;
    const trimmed = raw.trim();
    if (trimmed.length < 20) continue; // too short to be a real statement, likely noise
    return trimmed.length > CULTURE_SNIPPET_MAX ? `${trimmed.slice(0, CULTURE_SNIPPET_MAX).trim()}…` : trimmed;
  }
  return null;
}

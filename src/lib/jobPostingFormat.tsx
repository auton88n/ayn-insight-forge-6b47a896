/**
 * jobPostingFormat.tsx — pure, theme-neutral formatting for a real job
 * posting: label maps, salary/logo/date resolution, and the deterministic
 * JD-structure renderer. No account state, no Supabase calls, no hooks
 * besides useMemo.
 *
 * Extracted from src/components/resume-hub/BrowseJobs.tsx (the account,
 * sign-in-gated job board), where these functions were originally written
 * and still lived. Four separate public, no-login surfaces --
 * JobsBrowser.tsx (the home-page-embedded browser), LiveJobsPreview.tsx,
 * PublicJobs.tsx (the standalone /jobs route) and SalaryGuide.tsx -- all
 * imported a handful of these directly from that file for reuse, which
 * meant every anonymous visitor to any of those pages was pulling in the
 * account module's own ~2,600-line, 52KB (15KB gzipped) built chunk just
 * to reuse a formatter function. Confirmed at the built-output level, not
 * assumed: the public JobsBrowser chunk had a hard runtime import edge to
 * the account BrowseJobs chunk. This file is the real, neutral home these
 * functions always should have had -- BrowseJobs.tsx now imports them back
 * from here too, so there is exactly one copy, not a fork.
 *
 * Also fixed here, found live against production data while moving this:
 * EMPLOYMENT_TYPE_LABELS and SENIORITY_LABELS only ever covered a curated
 * subset of freehire's real vocabulary, with a bare `value || rawValue`
 * fallback on the public job card specifically -- so an unmapped real
 * value rendered as the literal database slug. Checked the real distinct
 * values in job_postings live: employment_type had 6 of 10 real values
 * outside the map (employee_full_time, full_time_salary, intern,
 * contractor, contract_salary, full_time_hybrid -- 16 real postings right
 * now), and seniority had a dead entry (`mid`, which matches zero real
 * rows -- the real value is `middle`) plus intern/c_level entirely
 * unmapped (90 real postings). Every lookup here now falls back through
 * humanizeSlug instead of the raw value, so a future unmapped value
 * degrades to a readable label ("Employee Full Time") instead of a raw
 * database slug, on every surface that reads it -- not just the one place
 * that happened to already call humanizeSlug as a second-tier fallback.
 */
import { useMemo } from "react";
import type { JobPosting } from "@/lib/resumeHub";

export const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  full_time: "Full-time", part_time: "Part-time", contract: "Contract", internship: "Internship",
  employee_full_time: "Full-time", full_time_salary: "Full-time", full_time_hybrid: "Full-time",
  intern: "Internship", contractor: "Contract", contract_salary: "Contract",
};
export const SENIORITY_LABELS: Record<string, string> = {
  junior: "Junior", mid: "Mid", middle: "Mid", senior: "Senior", staff: "Staff", lead: "Lead",
  principal: "Principal", intern: "Intern", c_level: "Executive",
};

// Freehire's own vocabulary for these fields is broader than any curated
// label map can stay ahead of (c_level, middle, fellowship all showed up
// live, none of them hardcoded at the time) -- fall back to a humanized
// slug instead of the raw underscore-joined value so an unmapped one
// still reads like a real label, not a database column value.
export function humanizeSlug(s: string) {
  return s.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

/** The one place a caller should read an employment_type value from --
 * never `job.employment_type` directly, which can be an unmapped slug. */
export function employmentTypeLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return EMPLOYMENT_TYPE_LABELS[value] || humanizeSlug(value);
}

/** The one place a caller should read a seniority value from -- same
 * reasoning as employmentTypeLabel. */
export function seniorityLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return SENIORITY_LABELS[value] || humanizeSlug(value);
}

// v3.167.0 — category values (job_postings.category) come from two
// different sources that don't share a formatting convention: freehire's
// own enrichment field (sometimes carries raw punctuation, confirmed live
// -- "starlink_enterprise_sales&account_management") and ats-direct-
// sync's own toSlug() of a company's free-text department name.
// humanizeSlug alone left "&" glued to the next word ("Sales&Account").
// This normalizes any stray punctuation to a space first, not just
// underscores. One real, disclosed limit that stays unfixed: a department
// name with no separator at all between two real words in the source data
// ("AIInfrastructure" with no space) can't be split back apart without
// knowing "AI" is an acronym -- confirmed live as "Aiinfrastructure
// Operations," a genuine quirk of one company's own internal naming, not
// something guessable from the slug alone.
export function humanizeCategory(s: string) {
  return s
    .replace(/_/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function formatSalary(min: number | null | undefined, max: number | null | undefined, currency: string | null | undefined) {
  if (min == null && max == null) return null;
  const cur = currency || "USD";
  const fmt = (n: number) => n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
  if (min != null && max != null) return `${cur} ${fmt(min)} to ${fmt(max)}`;
  return `${cur} ${fmt((min ?? max)!)}+`;
}

// v3.170.0 — asked directly to look into salary coverage after the earlier
// LinkedIn/Indeed research: 67-98% of job seekers across every survey
// checked call salary the single most important thing on a listing, and
// 44-60% say they won't even apply without one. Checked AYN's real
// coverage first (34%, per this file's own header note) and then checked
// WHY it's that low rather than assuming employers just don't disclose --
// 18 US states plus DC now legally require a salary range on job postings
// (California, Colorado, New York, Illinois and Massachusetts among the
// strictest), so a real, employer-stated range is very often sitting
// right in the description text even when freehire's own structured
// enrichment field didn't capture it. Confirmed live against a 150-row
// random sample of postings with no structured salary: a clean, sane
// range was extractable from 90 of them (60%) after two rounds of
// tightening the regex against real false positives found in that same
// sample (a $5.8B company valuation, a $600B market-size projection, a
// $400 sign-on bonus, a $100M funding round -- none of these are a real
// two-number RANGE, which is exactly why this only ever matches an actual
// "$X - $Y" or "$X to $Y" pattern, never a single bare dollar figure).
//
// Deliberately NOT Indeed's own approach here, checked directly against
// real critique of it: Indeed shows an ALGORITHM-ESTIMATED salary when an
// employer doesn't disclose one, and that's flagged by real complaints as
// actively misleading -- a candidate can see an estimated range, apply
// expecting it, and receive a real offer well below it. This never
// estimates or invents a number; it only reads a real range the employer
// already wrote themselves, the same "code decides facts, never invents
// one" rule every other deterministic check in this app already follows.
const SALARY_RANGE_RE = /\$\s?(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s?([Kk])?\s?(?:-|–|—|&mdash;|&ndash;|to)\s?\$?\s?(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s?([Kk])?/;
const HOURLY_CONTEXT_RE = /(per\s*hour|\/\s*hr\b|\/\s*hour|hourly|per\s*hr\b)/i;

function parseSalaryToken(raw: string, kSuffix: string | undefined): { value: number; scaled: boolean } {
  const value = parseFloat(raw.replace(/,/g, "")) * (kSuffix ? 1000 : 1);
  return { value, scaled: raw.includes(",") || !!kSuffix };
}

function extractSalaryFromText(text: string): { min: number; max: number; period: "annual" | "hourly" } | null {
  const m = text.match(SALARY_RANGE_RE);
  if (!m || m.index == null) return null;
  const [, loRaw, loK, hiRaw, hiK] = m;
  const lo = parseSalaryToken(loRaw, loK);
  const hi = parseSalaryToken(hiRaw, hiK);
  if (!(lo.value > 0) || !(hi.value > 0) || hi.value < lo.value || hi.value > 2_000_000) return null;
  const start = Math.max(0, m.index - 60);
  const end = Math.min(text.length, m.index + m[0].length + 60);
  const isHourly = HOURLY_CONTEXT_RE.test(text.slice(start, end));
  const small = lo.value < 1000 && !lo.scaled && hi.value < 1000 && !hi.scaled;
  // A small pair with no nearby "per hour"/"hourly" text is ambiguous
  // (could be years of experience, a headcount, anything) -- rejected
  // rather than guessed, same "when unsure, leave it out" rule this app
  // already applies to location scoping and everything else deterministic.
  if (small && !isHourly) return null;
  if (small) {
    if (!(lo.value >= 5 && lo.value <= 500 && hi.value >= 5 && hi.value <= 500)) return null;
    return { min: lo.value, max: hi.value, period: "hourly" };
  }
  if (!(lo.value >= 15_000 && lo.value <= 1_500_000 && hi.value >= 15_000)) return null;
  return { min: lo.value, max: hi.value, period: "annual" };
}

/** Structured salary (freehire's own enrichment field) when present,
 * otherwise a real employer-stated range read straight out of the
 * description text. Both are equally real numbers from the same
 * employer's own posting -- the second is just a different, deterministic
 * way of finding the same fact, disclosed via fromListingText so a caller
 * can note where it came from if it wants to. */
export function resolveSalary(job: JobPosting): { text: string; fromListingText: boolean } | null {
  const structured = formatSalary(job.salary_min, job.salary_max, job.salary_currency);
  if (structured) return { text: structured, fromListingText: false };
  const extracted = extractSalaryFromText(job.description || "");
  if (!extracted) return null;
  const fmt = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n)));
  const suffix = extracted.period === "hourly" ? "/hr" : "";
  return { text: `USD ${fmt(extracted.min)} to ${fmt(extracted.max)}${suffix}`, fromListingText: true };
}

// v3.171.0 — was a flat pastel fill (bg-blue-100/text-blue-700, etc.), the
// exact "safe, offends no one" default the AI-slop research flagged. Each
// company still gets one deterministically, so the same company always
// lands on the same color across a session — just a real two-stop
// gradient with white text now, matching the weight the real ember logo
// mark already carries, instead of reading like a placeholder next to it.
export const AVATAR_PALETTE = [
  "bg-gradient-to-br from-blue-500 to-indigo-600 text-white",
  "bg-gradient-to-br from-violet-500 to-purple-600 text-white",
  "bg-gradient-to-br from-rose-500 to-pink-600 text-white",
  "bg-gradient-to-br from-emerald-500 to-teal-600 text-white",
  "bg-gradient-to-br from-cyan-500 to-sky-600 text-white",
  "bg-gradient-to-br from-amber-500 to-yellow-600 text-white",
  "bg-gradient-to-br from-fuchsia-500 to-pink-600 text-white",
  "bg-gradient-to-br from-slate-500 to-slate-700 text-white",
];

// v3.233.0 -- every render site now uses rounded-full for this fallback,
// not rounded-xl (still used by the real <img> logo it sits beside). A
// letter in a circle reads unmistakably as an avatar; a bordered square at
// list density was easy to mistake for an unchecked checkbox.
export function companyAvatar(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  const initial = (name.trim()[0] || "?").toUpperCase();
  return { initial, className: AVATAR_PALETTE[hash % AVATAR_PALETTE.length] };
}

// v3.169.0/v3.263.0 — see this file's own header for the full history of
// why this is a plain field read and never a client-side favicon guess.
/** company_logo_url when freehire's own server-side lookup found a real
 * one, otherwise null -- never a client-side guess. */
export function resolveLogoUrl(job: JobPosting): string | null {
  return job.company_logo_url || null;
}

export function postedAge(iso: string) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

// v3.141.0 — asked directly to also show the actual posting date, not just
// a relative "3 hours ago". Short form for the compact list row (no year —
// job_postings is pruned past a 3-day freshness window (v3.194.0, was 7),
// so a stored date is always within the current year in practice); the
// detail pane gets the same short date, room there doesn't call for
// anything longer either.
export function postedDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Escapes the characters PostgREST treats as special inside an ilike filter. */
export function safeLike(s: string) {
  return s.replace(/[%,()]/g, " ").trim();
}

// v3.168.0 — asked directly for "better formatting for JD". The detail pane
// rendered the raw description as one whitespace-pre-wrap block, so a real
// JD with distinct sections (Responsibilities / Requirements / Benefits)
// and bulleted lists read as a wall of text with no visual structure. This
// is a deterministic, code-only parser -- it never rewrites, summarizes or
// invents a single word of the source text, only groups the SAME lines
// into headings / bullet lists / paragraphs so the existing structure most
// JDs already carry (a "- " bullet, an ALL CAPS section label, a line
// ending in ":") actually renders as one. A JD with no such structure at
// all (rare -- most freehire/ATS-direct-sourced descriptions have at least
// bullets) still renders correctly, just as plain paragraphs, same as
// before this change.
const JD_HEADER_KEYWORDS = new Set([
  "responsibilities", "requirements", "qualifications", "about the role", "about the team",
  "about us", "about the company", "who you are", "what you'll do", "what you will do",
  "what we offer", "why join", "benefits", "perks", "compensation", "duties", "overview",
  "summary", "role summary", "job summary", "skills", "experience", "education",
  "nice to have", "preferred qualifications", "must have", "minimum qualifications",
  "equal opportunity", "eeo statement", "how to apply", "the role", "the team",
  "key responsibilities", "essential functions", "physical requirements",
]);

function isJdHeading(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < 3 || trimmed.length > 70) return false;
  if (/[.;,]$/.test(trimmed)) return false; // a real sentence ends in punctuation, a header doesn't
  const bare = trimmed.replace(/:$/, "").trim().toLowerCase();
  if (JD_HEADER_KEYWORDS.has(bare)) return true;
  if (trimmed.endsWith(":") && trimmed.length <= 50 && !/[.!?]/.test(trimmed)) return true;
  const hasLower = /[a-z]/.test(trimmed);
  const hasUpper = /[A-Z]/.test(trimmed);
  return !hasLower && hasUpper && trimmed.split(/\s+/).length >= 2;
}

function jdBulletText(line: string): string | null {
  const m = line.match(/^\s*(?:[-•*●▪◦‣]|\d+[.)])\s+(.*)$/);
  return m ? m[1].trim() : null;
}

export type JdBlock =
  | { kind: "heading"; text: string }
  | { kind: "bullets"; items: string[] }
  | { kind: "para"; text: string };

/** Drops a blank line sitting between two bullet lines -- found live: many
 * real postings (e.g. state-of-Ohio, NCSS listings) put one blank line
 * between every "- " item, which without this would flush and restart a
 * one-item bullet list per line instead of one real list. */
function collapseBulletGaps(lines: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      const prevWasBullet = out.length > 0 && jdBulletText(out[out.length - 1].trim()) !== null;
      let j = i + 1;
      while (j < lines.length && !lines[j].trim()) j++;
      const nextIsBullet = j < lines.length && jdBulletText(lines[j].trim()) !== null;
      if (prevWasBullet && nextIsBullet) continue;
    }
    out.push(lines[i]);
  }
  return out;
}

/** Exported (not just used by JobDescriptionBody below) -- BrowseJobs.tsx's
 * own extractCultureSnippet() needs the same structural parse and stays in
 * that file, since it's account-only and never imported publicly. */
export function parseJobDescription(text: string): JdBlock[] {
  const lines = collapseBulletGaps(text.replace(/\r\n/g, "\n").split("\n"));
  const blocks: JdBlock[] = [];
  let paraBuf: string[] = [];
  let bulletBuf: string[] = [];
  const flushPara = () => {
    if (paraBuf.length) blocks.push({ kind: "para", text: paraBuf.join(" ") });
    paraBuf = [];
  };
  const flushBullets = () => {
    if (bulletBuf.length) blocks.push({ kind: "bullets", items: bulletBuf });
    bulletBuf = [];
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      flushPara();
      flushBullets();
      continue;
    }
    const bulletText = jdBulletText(line);
    if (bulletText !== null) {
      flushPara();
      bulletBuf.push(bulletText);
      continue;
    }
    if (isJdHeading(line)) {
      flushPara();
      flushBullets();
      blocks.push({ kind: "heading", text: line.replace(/:$/, "") });
      continue;
    }
    flushBullets();
    paraBuf.push(line);
  }
  flushPara();
  flushBullets();
  return blocks;
}

export function JobDescriptionBody({ text }: { text: string }) {
  const blocks = useMemo(() => parseJobDescription(text.trim()), [text]);
  if (!blocks.length) {
    return (
      <p className="text-sm leading-relaxed text-foreground/90">
        This posting did not include a description. Open it on the company site to read the full details.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {blocks.map((b, i) => {
        if (b.kind === "heading") {
          return (
            <h4 key={i} className="text-sm font-semibold text-foreground mt-4 mb-1 first:mt-0">
              {b.text}
            </h4>
          );
        }
        if (b.kind === "bullets") {
          return (
            <ul key={i} className="list-disc pl-5 space-y-1 text-sm leading-relaxed text-foreground/90">
              {b.items.map((item, j) => (
                <li key={j}>{item}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="text-sm leading-relaxed text-foreground/90">
            {b.text}
          </p>
        );
      })}
    </div>
  );
}

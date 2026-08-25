/**
 * BrowseJobs.tsx — v3.138.0
 *
 * Real job postings sourced from company career pages (never LinkedIn or
 * Indeed — job-board-sync's own header comment covers how that's enforced
 * and what got filtered out when it wasn't true in practice), refreshed
 * continuously, dropped after 3 days (v3.194.0, was 7) so Apply always
 * points at something still likely open.
 *
 * v3.137.0 — reported directly against a live screenshot: this needs to be
 * its own page rather than a mode that takes over the saved-jobs tracker,
 * the description was never shown at all even though every row stores one
 * (about 5,400 characters on average), and the location filter only ever
 * listed the locations of the 24 rows that happened to be loaded, out of
 * 1,095 real distinct locations in the table. Rebuilt as a real job board:
 *
 *   - A split view. The result list on the left, the full posting on the
 *     right (desktop) or in a full-height sheet (narrow screens), so the
 *     description is always one click away and never truncates the list.
 *   - Search, location and remote all filter server side, against the
 *     whole table, not against whatever page is already in memory.
 *   - Pagination, 25 at a time, with a real total count so the board
 *     never looks like it holds two dozen postings.
 *
 * Picking a job still just adds it to the user's own jobs list (same
 * table, same shape as "Add job manually") and hands off to the exact same
 * score/tailor/cover-letter flow already built — this page's only job is
 * discovery, not a parallel pipeline.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Loader2, ExternalLink, Plus, Flame, Search, MapPin, Home, ChevronDown, X, Building2, Bookmark, Wand2, Compass,
  DollarSign, Clock, TrendingUp, SlidersHorizontal, ShieldCheck, List, Layers, Heart,
} from "lucide-react";
import { resumeHubApi, type JobPosting } from "@/lib/resumeHub";
import { useToast } from "@/hooks/use-toast";

interface Props {
  userId: string;
  /** Opens the posting on the caller's own Saved jobs page, where scoring, tailoring and the cover letter actually live. */
  onAdded: (jobId: string) => void;
  onOpenProfile: () => void;
}

const PAGE_SIZE = 25;
const HOT_WINDOW_MS = 24 * 60 * 60 * 1000;
// v3.166.0 — the enrichment columns job-board-sync now captures, so filters
// and ranking can read them without a second round trip per row.
const COLS = "id, source, company, company_slug, company_logo_url, title, description, location, apply_url, posted_at, "
  + "employment_type, seniority, salary_min, salary_max, salary_currency, category, work_mode, city, skills";

export const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  full_time: "Full-time", part_time: "Part-time", contract: "Contract", internship: "Internship",
};
export const SENIORITY_LABELS: Record<string, string> = {
  junior: "Junior", mid: "Mid", senior: "Senior", staff: "Staff", lead: "Lead", principal: "Principal",
};
const POSTED_WITHIN_OPTIONS = [
  { key: "1", label: "24 hours" },
  { key: "3", label: "3 days" },
  { key: "7", label: "This week" },
] as const;

// Freehire's own vocabulary for these two fields is broader than the curated
// label maps above (c_level, middle, fellowship all showed up live, none of
// them hardcoded) -- fall back to a humanized slug instead of the raw
// underscore-joined value so an unmapped one still reads like a real label.
function humanizeSlug(s: string) {
  return s.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
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

// v3.167.0 — asked directly not to expose the raw catalog size. A precise
// count is genuinely useful feedback when it's small (a filtered search
// telling you "3 jobs match" is actionable), but a bare five-digit number
// on the unfiltered view reads as a scale figure, not a feature. Capped at
// the same "1,000+" convention real job boards already use for this exact
// reason -- honest (never claims a smaller number than what's real,
// per this app's own "never say less than true" rule) without stating
// the real figure once it's past the point where the exact count adds
// anything.
function displayCount(n: number): string {
  return n > 999 ? "1,000+" : String(n);
}

function formatSalary(min: number | null | undefined, max: number | null | undefined, currency: string | null | undefined) {
  if (min == null && max == null) return null;
  const cur = currency || "USD";
  const fmt = (n: number) => n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
  if (min != null && max != null) return `${cur} ${fmt(min)}–${fmt(max)}`;
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
  return { text: `USD ${fmt(extracted.min)}–${fmt(extracted.max)}${suffix}`, fromListingText: true };
}
// v3.145.0 — whatever's open in the detail pane, restored once on a
// refresh via its own one-shot effect below.
const BROWSE_LAST_OPEN_KEY = "ayn_browse_last_open";

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

// v3.169.0 — asked directly for a deep look at what people want from
// LinkedIn/Indeed, then to use it as an advantage. Checked one of the
// specific complaints ("logos are missing") against real data first:
// confirmed live, only 49% of job_postings rows have a logo at all, and
// it's far worse for the three direct-ATS sources (26% Greenhouse, 8%
// Lever, 54% Ashby) than freehire (62%). Root cause, also confirmed live
// against each vendor's real API response: Greenhouse, Lever, and Ashby's
// own public job-board APIs never return a logo field, full stop — a
// company only ever had one here because it also happened to already be
// in the freehire feed, whose own server-side favicon-by-domain lookup
// (done at ingestion) still only covers 62% of ITS OWN rows.
//
// Fixed as a client-side fallback under all of that, using a free,
// no-signup icon service — no re-ingest needed, applies to the ~23,000
// rows already on file immediately. The one real subtlety: apply_url's
// own domain is only the COMPANY's real site for freehire-sourced rows
// (jobs.apple.com, careers.airbnb.com); for a Greenhouse/Lever/Ashby row
// it's the ATS VENDOR's own multi-tenant domain (job-boards.greenhouse.io)
// — using that directly would show every company on that vendor the
// identical generic vendor icon, worse than no logo. Detected and routed
// around: a vendor host falls back to guessing "{company_slug}.com"
// instead, the same technique this app already uses elsewhere
// (fetchCompanyContext's own "https://www.{company-slug}.com" guess for
// a cover letter's company lookup) rather than inventing a second one.
const ATS_VENDOR_HOSTS = [
  "greenhouse.io", "lever.co", "ashbyhq.com", "myworkdayjobs.com",
  "smartrecruiters.com", "breezy.hr", "freshteam.com", "zohorecruit.com",
  "rippling.com", "oraclecloud.com",
];
function isAtsVendorHost(host: string): boolean {
  return ATS_VENDOR_HOSTS.some((v) => host === v || host.endsWith(`.${v}`));
}
function faviconFallbackUrl(job: JobPosting): string | null {
  let host = "";
  try {
    host = new URL(job.apply_url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
  const slug = job.company_slug ? job.company_slug.replace(/[^a-z0-9-]/gi, "") : "";
  const lookupDomain = isAtsVendorHost(host) && slug ? `${slug}.com` : host;
  if (!lookupDomain || lookupDomain.length < 4) return null;
  return `https://icons.duckduckgo.com/ip3/${lookupDomain}.ico`;
}
/** company_logo_url when present (freehire's own server-side lookup),
 * otherwise a client-side favicon guess — never invented, just a second,
 * looser attempt at the same real thing: an icon for this real company. */
export function resolveLogoUrl(job: JobPosting): string | null {
  return job.company_logo_url || faviconFallbackUrl(job);
}

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
function scoreTier(score: number) {
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
function ScoreGauge({ score, size = 28, showLabel = false }: { score: number; size?: number; showLabel?: boolean }) {
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

type JdBlock =
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

function parseJobDescription(text: string): JdBlock[] {
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

// v3.182.0 — 89% of job seekers say a company's values weigh on whether
// they apply (real, cited research), and the highlights strip above had
// salary/seniority/mode/type but nothing about the company itself. Zero new
// data and zero AI call: JD_HEADER_KEYWORDS already recognizes "about us" /
// "why join" / "who we are" style headings for the structural parser above,
// so this just asks that same parser for the paragraph sitting right under
// one of those specific headings and shows it verbatim, truncated. Never
// summarized, never scored, never invented for a JD that doesn't have one --
// exactly the "surface what the company already said" version, not a new
// AYN opinion about the company.
const ABOUT_COMPANY_HEADINGS = new Set([
  "about us", "about the company", "who we are", "our culture",
  "our values", "our mission", "why join", "why join us",
]);
const CULTURE_SNIPPET_MAX = 220;
function extractCultureSnippet(text: string): string | null {
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

// v3.142.0 — asked directly for "a better way to organize locations": the
// filter held 1,000+ distinct raw strings (job-board-sync pulls location
// text as-is from each company's own ATS, so granularity varies wildly —
// "Germany", "Kyle, TX", "Dearborn, MI, United States" all coexist) in one
// flat alphabetical list. There's no reliable geocoder here to turn that
// into real city/country structure, so this groups by the last
// comma-separated segment instead — usually a state, province or country —
// which is honest about what the data actually is rather than pretending
// to a precision it doesn't have. Search still works as a flat filter
// across everything; grouping is only for browsing with no query typed.
// v3.167.0 — asked directly for a better city/country filter. The old
// grouping (by whatever the last comma-separated segment happened to be)
// produced inconsistent, sometimes meaningless buckets since job-board-
// sync's own location text varies wildly by source. AYN is scoped to US/
// Canada only (a standing product policy, enforced at ingestion) — so a
// real two-level Country > City structure is both more useful and just
// two buckets to build, not an open-ended geocoding problem.
const CA_PROVINCE_ABBR_SET = new Set(["ON", "QC", "BC", "AB", "MB", "SK", "NS", "NB", "NL", "PE", "NT", "YT", "NU"]);
const CA_CITY_HINTS = [
  "toronto", "montreal", "vancouver", "ottawa", "calgary", "edmonton", "winnipeg", "quebec city",
  "halifax", "victoria", "regina", "waterloo", "kitchener", "mississauga", "burnaby", "richmond",
  "surrey", "canada",
];
function classifyCountry(loc: string): "Canada" | "United States" {
  const l = loc.toLowerCase();
  // An explicit "United States" beats a city-name guess -- found live: a
  // multi-location string ("...Vancouver, Washington, United States...")
  // matched the Vancouver hint below and got misfiled as Canada even
  // though it names the US outright. City names alone are ambiguous
  // (Vancouver, WA is real); an explicit country name isn't.
  if (/\bunited states\b/.test(l)) return "United States";
  if (/\bcanada\b/.test(l)) return "Canada";
  for (const hint of CA_CITY_HINTS) if (l.includes(hint)) return "Canada";
  const abbrevMatch = loc.match(/,\s*([A-Z]{2})\b/);
  if (abbrevMatch && CA_PROVINCE_ABBR_SET.has(abbrevMatch[1])) return "Canada";
  return "United States";
}
function groupByCountry(locs: string[]) {
  const buckets: { country: "United States" | "Canada"; items: string[] }[] = [
    { country: "United States", items: [] },
    { country: "Canada", items: [] },
  ];
  for (const loc of locs) {
    const bucket = buckets.find((b) => b.country === classifyCountry(loc))!;
    bucket.items.push(loc);
  }
  for (const b of buckets) b.items.sort((a, b2) => a.localeCompare(b2));
  return buckets.filter((b) => b.items.length > 0);
}

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
function SwipeDeck({
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
            {current.company}{current.location ? ` · ${current.location}` : ""}
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
            {desc ? `${desc.slice(0, 200)}${desc.length > 200 ? "…" : ""}` : "No description on file for this one — open it to see more on the company's own site."}
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

export default function BrowseJobs({ userId, onAdded, onOpenProfile }: Props) {
  const { toast } = useToast();

  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  // v3.171.0 — "swipe to decide," the second half of the approved Ember
  // Discovery mockup. Real, growing pattern (one competitor alone reports
  // 850K+ users and 30M+ swipes) built on the same real insight the
  // research kept surfacing: applying is fundamentally a yes/no gut call,
  // and swipe matches that decision speed better than reading down a
  // list. Deliberately a second way to browse, not a replacement for the
  // list -- reuses the exact same filtered/scored `jobs` this page
  // already loads, so switching modes never changes what's actually being
  // shown, only how.
  const [viewMode, setViewMode] = useState<"list" | "swipe">("list");
  const [swipeIndex, setSwipeIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [scores, setScores] = useState<Record<string, number | null>>({});

  // v3.199.0 — a confirmed "showcase" company (real, observed low turnover
  // over real time, from company_hiring_status) ranks a little lower in
  // Best match, never hidden outright, never anything less than "showcase"
  // itself (insufficient_data/uncertain get no penalty at all -- most
  // companies sit there for weeks, and treating "no verdict yet" the same
  // as a real negative one would quietly bury most of the catalog for no
  // real reason). Fetched once per distinct company already on the page,
  // not per row.
  const [hiringStatusByCompany, setHiringStatusByCompany] = useState<Record<string, string>>({});
  const SHOWCASE_RANK_PENALTY = 20;
  // job_board_score legitimately returns match_pct: null for every job when
  // the caller has no resume/profile text to score against yet — a real,
  // honest "can't score this" answer, not a pending fetch. This tracks which
  // ids have already come back so a null reads as "no resume yet" instead of
  // spinning on "Scoring…" forever.
  const [scored, setScored] = useState<Set<string>>(new Set());
  const [logoFailed, setLogoFailed] = useState<Set<string>>(new Set());

  // v3.183.0 — real, persistent "have I seen this job before" tracking
  // (job_postings_seen), reported directly: swipe mode repeated cards on
  // every reload, with no memory at all. `seenIds` is the live, growing set
  // used for the list view's "Seen" badge; `seenSnapshotRef` is frozen the
  // moment the initial fetch lands and is what the swipe deck filters
  // against — deliberately NOT the live `seenIds`, so a card marked seen
  // mid-session (the moment it becomes the active swipe card) doesn't
  // retroactively vanish from the array and shift indices out from under
  // an in-progress drag. The next reload's fresh fetch is what actually
  // excludes it, which is the real thing being asked for: no repeats
  // across a reload, not real-time removal mid-swipe.
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set());
  const seenSnapshotRef = useRef<Set<string> | null>(null);
  // Flips exactly once, when the initial fetch resolves — used only to
  // trigger swipeJobs' memo below the first time the snapshot is ready
  // (the fetch can resolve after or before the jobs fetch, a real race).
  // Deliberately not touched again by markSeen, unlike seenIds itself, so
  // it can't retrigger that memo mid-session the way depending on seenIds
  // directly would.
  const [seenSnapshotReady, setSeenSnapshotReady] = useState(false);
  useEffect(() => {
    supabase.from("job_postings_seen").select("job_posting_id").eq("user_id", userId)
      .then(({ data }) => {
        const ids = new Set((data ?? []).map((r) => r.job_posting_id as string));
        setSeenIds(ids);
        seenSnapshotRef.current = ids;
        setSeenSnapshotReady(true);
      });
  }, [userId]);
  const markSeen = useCallback((jobId: string) => {
    setSeenIds((prev) => {
      if (prev.has(jobId)) return prev; // already known seen — skip the redundant write
      supabase.from("job_postings_seen")
        .upsert({ user_id: userId, job_posting_id: jobId }, { onConflict: "user_id,job_posting_id" })
        .then(() => {});
      return new Set(prev).add(jobId);
    });
  }, [userId]);

  const [rawQuery, setRawQuery] = useState("");
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState<string | null>(null);
  const [remoteOnly, setRemoteOnly] = useState(false);

  // v3.166.0 — real filters, backed by the enrichment columns job-board-sync
  // now captures. employmentType/seniority are chip toggles (a small,
  // bounded value set); category is a dropdown (freehire tags ~20 distinct
  // values); postedWithin is a chip too. All plain .eq()/.gte() additions to
  // buildQuery, same shape as the existing location/remoteOnly filters.
  const [employmentType, setEmploymentType] = useState<string | null>(null);
  const [seniority, setSeniority] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [postedWithin, setPostedWithin] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [employmentTypes, setEmploymentTypes] = useState<string[]>([]);
  const [seniorities, setSeniorities] = useState<string[]>([]);
  const [structuredCities, setStructuredCities] = useState<string[]>([]);

  // v3.166.0 — "Trending": real posting volume, nationally and (optionally)
  // scoped to a chosen city, over the last 3 days. Fetched lazily the first
  // time the dialog opens, same pattern openRoleFinder already uses; a city
  // change re-fetches since that's a real, different query server side, not
  // something to slice out of an already-loaded national result.
  const [trendingOpen, setTrendingOpen] = useState(false);
  const [trendingLoading, setTrendingLoading] = useState(false);
  const [trendingCity, setTrendingCity] = useState<string | null>(null);
  const [trendingData, setTrendingData] = useState<Awaited<ReturnType<typeof resumeHubApi.jobBoardTrending>> | null>(null);
  const [trendingError, setTrendingError] = useState(false);

  const loadTrending = useCallback((city: string | null) => {
    setTrendingLoading(true);
    setTrendingError(false);
    resumeHubApi.jobBoardTrending(city)
      .then((res) => setTrendingData(res))
      .catch(() => setTrendingError(true))
      .finally(() => setTrendingLoading(false));
  }, []);

  const openTrending = () => {
    setTrendingOpen(true);
    if (trendingData === null && !trendingLoading) loadTrending(trendingCity);
  };

  const pickTrendingCity = (city: string | null) => {
    setTrendingCity(city);
    loadTrending(city);
  };

  // v3.166.0 — "real relevance ranking" is now the default, not opt-in.
  // Independent of matchMode (which additionally narrows to Profile's
  // desired_locations, a real, deliberate filter that stays its own
  // choice) — this only controls whether the list re-sorts by quick score
  // once scores come back. A caller with no profile yet gets match_pct:
  // null for every job, which the re-sort effect below already treats as a
  // no-op stable sort, so the honest fallback is exactly today's recency
  // order — no new "no profile" branch needed.
  const [newestFirst, setNewestFirst] = useState(false);

  const [locations, setLocations] = useState<string[]>([]);
  const [locOpen, setLocOpen] = useState(false);
  // v3.171.0 — moved up from where the Filters panel's own JSX lives,
  // since the lazy-load effect below now needs it declared before that
  // point in the function body -- referencing a const before its own
  // declaration is a real temporal-dead-zone error in plain JS, not
  // something TypeScript's own checker happened to catch here.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [locFilter, setLocFilter] = useState("");
  const locBoxRef = useRef<HTMLDivElement | null>(null);

  const [selected, setSelected] = useState<JobPosting | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);

  // v3.166.0 — "posting freshness" as the honest, measurable stand-in for
  // "how responsive is this company": job_postings prunes anything past 3
  // days regardless of source (v3.194.0, was 7), so every row already on
  // file is a currently open posting — how many of them a company has
  // right now, and how recently the newest one landed, is a real signal
  // AYN already has data for. Never framed as "reply speed" (Browse Jobs
  // applications happen on the company's own site, outside anything AYN
  // can observe).
  const [companyActivity, setCompanyActivity] = useState<{ count: number; mostRecent: string } | null>(null);

  // v3.197.0 — "actively hiring" only ever shown when AYN is actually sure:
  // company_hiring_status() requires real observed turnover over real time
  // (company_hiring_stats, maintained by triggers on job_postings), not a
  // guess from a single listing. Deliberately one-directional — showcase/
  // uncertain/insufficient_data all render nothing at all, since a
  // negative-leaning label on a real, named company is a much bigger trust
  // call than a positive one, and most companies won't have a confident
  // verdict for weeks regardless.
  const [activelyHiring, setActivelyHiring] = useState(false);

  // v3.142.0 — a bookmark on each row saves without leaving the list or
  // opening detail, separate from "Score and tailor" in the detail pane
  // (which deliberately still jumps to the Jobs page — that's someone
  // saying "I want to work on this now", not "keep this for later").
  const [savedUrls, setSavedUrls] = useState<Set<string>>(new Set());

  // v3.142.0 — "Match me": AYN filters to the locations already declared in
  // Profile (preferences.desired_locations) and sorts by the same quick
  // keyword score every card already shows, instead of the person having
  // to hand-pick a location and read down the list themselves.
  const [matchMode, setMatchMode] = useState(false);
  const [desiredLocations, setDesiredLocations] = useState<string[] | null>(null);

  // v3.151.0 — "Explore roles": real job titles from the live catalog that
  // already score well against this resume, instead of asking an LLM to
  // invent a list. Fetched once, lazily, the first time the dialog opens;
  // cached in state so reopening it doesn't re-run the sweep.
  const [rolesOpen, setRolesOpen] = useState(false);
  const [rolesLoading, setRolesLoading] = useState(false);
  const [roles, setRoles] = useState<Array<{ title: string; match_pct: number; openings: number; companies: string[]; sample_job_id: string }> | null>(null);
  // Distinguishes "you have no profile data yet" from "you have a real
  // profile, nothing in today's postings scored well" -- these are
  // different, both honest, and read very differently to the person.
  const [rolesHasProfile, setRolesHasProfile] = useState(true);
  const [rolesError, setRolesError] = useState(false);

  const openRoleFinder = () => {
    setRolesOpen(true);
    if (roles !== null || rolesLoading) return;
    setRolesLoading(true);
    setRolesError(false);
    resumeHubApi.roleFinder()
      .then((res) => { setRoles(res.roles); setRolesHasProfile(res.has_profile); })
      .catch(() => setRolesError(true))
      .finally(() => setRolesLoading(false));
  };

  const pickRole = (title: string) => {
    setRolesOpen(false);
    setMatchMode(false);
    setLocation(null);
    setRemoteOnly(false);
    setRawQuery(title);
    setQuery(title);
  };

  const hasFilters = !!query || !!location || remoteOnly || !!employmentType || !!seniority || !!category || !!postedWithin;

  /* Debounce the search box so typing doesn't fire a query per keystroke. */
  useEffect(() => {
    const t = setTimeout(() => setQuery(rawQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [rawQuery]);

  // v3.171.0 — found live while looking into why the page "feels slow":
  // these four dataset fetches (location, category/employmentType/
  // seniority/city, title/company) each pull up to 5,000 raw text rows,
  // and all four used to fire unconditionally the instant the page
  // mounted -- before a person ever touched a filter, a search box, or
  // the Trending dialog. That's a real, measurable amount of unnecessary
  // data movement on first load, not a feeling. Each is now lazy: it
  // fetches once, the first time the UI that actually needs it opens, and
  // is cached afterward (the loaded ref guards against a duplicate fetch
  // on every reopen). The location dropdown's own real distinct count is
  // shown in its search placeholder ("Search N locations") whether or not
  // it has loaded yet -- 0 while pending is honest and momentary, the
  // real count replaces it within one round trip.
  const locationsLoadedRef = useRef(false);
  useEffect(() => {
    if (!locOpen || locationsLoadedRef.current) return;
    locationsLoadedRef.current = true;
    let cancelled = false;
    supabase.from("job_postings").select("location").limit(5000).then(({ data }) => {
      if (cancelled || !data) return;
      const set = new Set<string>();
      for (const r of data as { location: string | null }[]) if (r.location) set.add(r.location);
      setLocations(Array.from(set).sort((a, b) => a.localeCompare(b)));
    });
    return () => { cancelled = true; };
  }, [locOpen]);

  /* Job type / seniority / category — real distinct values on file, never
     a hardcoded guess at freehire's own vocabulary. Lazy: loads the first
     time the Filters panel opens, not on mount. */
  const filterOptionsLoadedRef = useRef(false);
  useEffect(() => {
    if (!filtersOpen || filterOptionsLoadedRef.current) return;
    filterOptionsLoadedRef.current = true;
    let cancelled = false;
    Promise.all([
      supabase.from("job_postings").select("category").not("category", "is", null).limit(5000),
      supabase.from("job_postings").select("employment_type").not("employment_type", "is", null).limit(5000),
      supabase.from("job_postings").select("seniority").not("seniority", "is", null).limit(5000),
    ]).then(([cat, et, sen]) => {
      if (cancelled) return;
      const dedupe = (rows: { [k: string]: string | null }[] | null, key: string) => {
        const set = new Set<string>();
        for (const r of rows || []) if (r[key]) set.add(r[key] as string);
        return Array.from(set).sort((a, b) => a.localeCompare(b));
      };
      setCategories(dedupe(cat.data as { category: string | null }[], "category"));
      setEmploymentTypes(dedupe(et.data as { employment_type: string | null }[], "employment_type"));
      setSeniorities(dedupe(sen.data as { seniority: string | null }[], "seniority"));
    });
    return () => { cancelled = true; };
  }, [filtersOpen]);

  /* job_postings.city — freehire's own parsed city, a different, cleaner
     field than the raw `location` text the location filter groups by.
     Only the Trending dialog's city picker needs it, so it loads there,
     not on mount. */
  const citiesLoadedRef = useRef(false);
  useEffect(() => {
    if (!trendingOpen || citiesLoadedRef.current) return;
    citiesLoadedRef.current = true;
    let cancelled = false;
    supabase.from("job_postings").select("city").not("city", "is", null).limit(5000).then(({ data }) => {
      if (cancelled || !data) return;
      const set = new Set<string>();
      for (const r of data as { city: string | null }[]) if (r.city) set.add(r.city);
      setStructuredCities(Array.from(set).sort((a, b) => a.localeCompare(b)));
    });
    return () => { cancelled = true; };
  }, [trendingOpen]);

  /* v3.166.0 — search autocomplete. Real distinct titles/companies already
     on file, same lightweight single-column-read pattern as locations
     above, filtered client side as the person types — no per-keystroke
     query. Lazy: loads on the search box's first focus, not on mount. */
  const [titleOptions, setTitleOptions] = useState<string[]>([]);
  const [companyOptions, setCompanyOptions] = useState<string[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchBoxRef = useRef<HTMLDivElement | null>(null);
  const searchOptionsLoadedRef = useRef(false);

  useEffect(() => {
    if (!searchOpen || searchOptionsLoadedRef.current) return;
    searchOptionsLoadedRef.current = true;
    let cancelled = false;
    Promise.all([
      supabase.from("job_postings").select("title").limit(5000),
      supabase.from("job_postings").select("company").limit(5000),
    ]).then(([t, c]) => {
      if (cancelled) return;
      const dedupe = (rows: { [k: string]: string | null }[] | null, key: string) => {
        const set = new Set<string>();
        for (const r of rows || []) if (r[key]) set.add(r[key] as string);
        return Array.from(set);
      };
      setTitleOptions(dedupe(t.data as { title: string | null }[], "title"));
      setCompanyOptions(dedupe(c.data as { company: string | null }[], "company"));
    });
    return () => { cancelled = true; };
  }, [searchOpen]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) setSearchOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const searchSuggestions = useMemo(() => {
    const q = rawQuery.trim().toLowerCase();
    if (!q) return [];
    const titles = titleOptions.filter((t) => t.toLowerCase().includes(q)).slice(0, 5).map((v) => ({ v, kind: "title" as const }));
    const companies = companyOptions.filter((c) => c.toLowerCase().includes(q)).slice(0, 3).map((v) => ({ v, kind: "company" as const }));
    return [...titles, ...companies];
  }, [rawQuery, titleOptions, companyOptions]);

  // v3.167.0 — asked directly for a cleaner, more modern feel closer to
  // LinkedIn/Indeed: the ~20 job type/seniority/category/posted-within
  // chips used to sit permanently on screen as one wrapping wall, which
  // read as cluttered rather than clean. Collapsed into a single
  // "Filters" button with an active-count badge that opens a panel — same
  // hand-rolled dropdown pattern as the location box right next to it,
  // not a new primitive. (filtersOpen itself now declared up near locOpen
  // -- see that declaration's own v3.171.0 comment.)
  const filtersBoxRef = useRef<HTMLDivElement | null>(null);
  const activeFilterCount = [employmentType, seniority, category, postedWithin].filter(Boolean).length;

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (filtersBoxRef.current && !filtersBoxRef.current.contains(e.target as Node)) setFiltersOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (locBoxRef.current && !locBoxRef.current.contains(e.target as Node)) setLocOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  /* Every job URL already saved, so the bookmark can show its filled state
     without a round trip per row. */
  useEffect(() => {
    let cancelled = false;
    supabase.from("jobs").select("source_url").eq("user_id", userId).not("source_url", "is", null).then(({ data }) => {
      if (cancelled || !data) return;
      setSavedUrls(new Set((data as { source_url: string | null }[]).map((r) => r.source_url).filter((u): u is string => !!u)));
    });
    return () => { cancelled = true; };
  }, [userId]);

  /* Profile's own desired-locations list, read once for Match me. */
  useEffect(() => {
    let cancelled = false;
    supabase.from("user_profile_canonical").select("preferences").eq("user_id", userId).maybeSingle().then(({ data }) => {
      if (cancelled) return;
      const prefs = data?.preferences as { desired_locations?: string[] } | null | undefined;
      setDesiredLocations(prefs?.desired_locations?.filter(Boolean) ?? []);
    });
    return () => { cancelled = true; };
  }, [userId]);

  // v3.199.0 — batched, and only for companies not already known, so
  // paging through a long list never re-fetches a company it already has
  // an answer for.
  useEffect(() => {
    const slugs = Array.from(new Set(jobs.map((j) => j.company_slug).filter((s): s is string => !!s)))
      .filter((s) => !(s in hiringStatusByCompany));
    if (!slugs.length) return;
    let cancelled = false;
    supabase.rpc("company_hiring_status_batch", { p_company_slugs: slugs }).then(({ data }) => {
      if (cancelled || !data) return;
      setHiringStatusByCompany((prev) => {
        const next = { ...prev };
        for (const row of data as Array<{ company_slug: string; status: string | null }>) {
          next[row.company_slug] = row.status ?? "";
        }
        return next;
      });
    });
    return () => { cancelled = true; };
  }, [jobs, hiringStatusByCompany]);

  const scorePage = useCallback((rows: JobPosting[]) => {
    if (!rows.length) return;
    resumeHubApi.jobBoardScore(rows.map((r) => ({ id: r.id, title: r.title, description: r.description, skills: r.skills })))
      .then((res) => {
        setScores((prev) => {
          const next = { ...prev };
          for (const s of res.scores) next[s.id] = s.match_pct;
          return next;
        });
        setScored((prev) => {
          const next = new Set(prev);
          for (const r of rows) next.add(r.id);
          return next;
        });
      })
      .catch(() => {
        setScored((prev) => {
          const next = new Set(prev);
          for (const r of rows) next.add(r.id);
          return next;
        });
      });
  }, []);

  const buildQuery = useCallback((withCount: boolean) => {
    let q = supabase
      .from("job_postings")
      .select(COLS, withCount ? { count: "exact" } : undefined)
      .order("posted_at", { ascending: false })
      // v3.196.0 — the closure checker (job-checker/) flags real scam
      // patterns on the small subset of listings it actually visits;
      // never shown to a seeker once confirmed. Most rows are still
      // unchecked (scam_suspected is null), so this must explicitly keep
      // null alongside false — a bare `.not(...,"eq",true)` would silently
      // drop every unchecked row too, since SQL's three-valued logic
      // treats NOT(NULL = true) as NULL, not TRUE.
      .or("scam_suspected.is.null,scam_suspected.eq.false");
    const term = safeLike(query);
    if (term) q = q.or(`title.ilike.%${term}%,company.ilike.%${term}%`);
    if (matchMode && desiredLocations && desiredLocations.length > 0) {
      q = q.or(desiredLocations.map((l) => `location.ilike.%${safeLike(l)}%`).join(","));
    } else {
      if (location) q = q.eq("location", location);
      if (remoteOnly) q = q.ilike("location", "%remote%");
    }
    if (employmentType) q = q.eq("employment_type", employmentType);
    if (seniority) q = q.eq("seniority", seniority);
    if (category) q = q.eq("category", category);
    if (postedWithin) {
      const cutoff = new Date(Date.now() - Number(postedWithin) * 24 * 60 * 60 * 1000).toISOString();
      q = q.gte("posted_at", cutoff);
    }
    return q;
  }, [query, location, remoteOnly, matchMode, desiredLocations, employmentType, seniority, category, postedWithin]);

  // v3.142.0 — the underlying query still sorts by recency (that's what
  // keeps pagination and the total count honest); once a page's quick
  // scores come back, this re-sorts what's already loaded so the strongest
  // overlap with the resume surfaces first. Guarded against a no-op reorder
  // so this can never loop against the score update below.
  // v3.166.0 — no longer gated on matchMode (which only ever meant "also
  // narrow to Profile's desired_locations"). Match-based ranking is now the
  // default state; "Newest" is the explicit opt-out for someone who wants
  // pure recency instead.
  // v3.199.0 — a confirmed "showcase" company's jobs rank a little lower
  // here, never hidden, never anything less than a real "showcase" verdict
  // (see hiringStatusByCompany above).
  const rankScore = useCallback((j: JobPosting) => {
    const base = scores[j.id] ?? -1;
    const showcase = j.company_slug && hiringStatusByCompany[j.company_slug] === "showcase";
    return showcase ? base - SHOWCASE_RANK_PENALTY : base;
  }, [scores, hiringStatusByCompany]);

  useEffect(() => {
    if (newestFirst) return;
    setJobs((prev) => {
      const sorted = [...prev].sort((a, b) => rankScore(b) - rankScore(a));
      const same = sorted.every((j, i) => j.id === prev[i]?.id);
      return same ? prev : sorted;
    });
  }, [scores, newestFirst, rankScore]);

  /* First page, and every filter change. */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    buildQuery(true).range(0, PAGE_SIZE - 1).then(({ data, error, count }) => {
      if (cancelled) return;
      setLoading(false);
      if (error) {
        toast({ title: "Couldn't load jobs", description: error.message, variant: "destructive" });
        return;
      }
      const rows = (data as unknown as JobPosting[]) ?? [];
      setJobs(rows);
      setTotal(count ?? rows.length);
      setSelected((prev) => (prev && rows.some((r) => r.id === prev.id) ? prev : rows[0] ?? null));
      setSwipeIndex(0);
      scorePage(rows);
    });
    return () => { cancelled = true; };
  }, [buildQuery, scorePage, toast]);

  // v3.183.0 — the deck now excludes anything already seen (frozen at the
  // fetch that just landed, see seenSnapshotRef above), so what the deck
  // actually has left to show can run short of what was fetched — a fully
  // already-seen page would otherwise silently starve the deck without
  // ever tripping the old raw-fetch-count trigger below.
  // seenSnapshotReady is read only to force this one recompute once the ref
  // is actually populated (a plain ref mutation doesn't trigger useMemo on
  // its own); the lint rule can't see it's used indirectly via the ref.
  const swipeJobs = useMemo(
    () => (seenSnapshotRef.current ? jobs.filter((j) => !seenSnapshotRef.current!.has(j.id)) : jobs),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [jobs, seenSnapshotReady],
  );

  // v3.171.0 — keeps the swipe deck feeling like a continuous stream
  // instead of hitting a wall every 25 cards: loads the next page a few
  // cards before the deck actually runs out, same loadMore the list's own
  // "Load more jobs" button already calls.
  // v3.183.0 — checks how many UNSEEN cards are actually left (swipeJobs),
  // not the raw fetched count — a page that came back mostly already-seen
  // needs another load sooner, not later.
  useEffect(() => {
    if (viewMode !== "swipe" || total === null || loadingMore) return;
    if (jobs.length < total && swipeIndex >= swipeJobs.length - 3) loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, swipeIndex, jobs.length, swipeJobs.length, total, loadingMore]);

  // v3.145.0 — reported directly: refreshing dropped whatever was open in
  // the detail pane back to the page's first result. Deliberately its own
  // one-shot effect (deps: []) rather than folded into the query effect
  // above: that effect re-runs whenever buildQuery's identity changes
  // (e.g. once desiredLocations finishes loading right after mount for
  // Match me), and a first attempt at merging the two lost this restore to
  // exactly that race — whichever run resolved first "won" and looked
  // like a valid prev selection, discarding the real restore. This runs
  // once, and always wins when it resolves, no merge to race against.
  useEffect(() => {
    const lastId = sessionStorage.getItem(BROWSE_LAST_OPEN_KEY);
    if (!lastId) return;
    let cancelled = false;
    supabase.from("job_postings").select(COLS).eq("id", lastId).maybeSingle().then(({ data }) => {
      if (cancelled || !data) return;
      setSelected(data as unknown as JobPosting);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (selected) sessionStorage.setItem(BROWSE_LAST_OPEN_KEY, selected.id);
    else sessionStorage.removeItem(BROWSE_LAST_OPEN_KEY);
  }, [selected]);

  /* v3.166.0 — posting freshness for the currently open job's company.
     job_postings prunes past 3 days regardless of source (v3.194.0, was 7),
     so every row already on file is a currently open posting -- this is a
     real count of how many that company has right now, not an estimate. */
  useEffect(() => {
    if (!selected) { setCompanyActivity(null); return; }
    let cancelled = false;
    supabase
      .from("job_postings")
      .select("posted_at", { count: "exact" })
      .eq("company", selected.company)
      .order("posted_at", { ascending: false })
      .limit(1)
      .then(({ data, count }) => {
        if (cancelled) return;
        const mostRecent = (data as { posted_at: string }[] | null)?.[0]?.posted_at;
        if (count && mostRecent) setCompanyActivity({ count, mostRecent });
        else setCompanyActivity(null);
      });
    return () => { cancelled = true; };
  }, [selected]);

  useEffect(() => {
    if (!selected?.company_slug) { setActivelyHiring(false); return; }
    let cancelled = false;
    supabase
      .rpc("company_hiring_status", { p_company_slug: selected.company_slug })
      .then(({ data }) => {
        if (!cancelled) setActivelyHiring(data === "active");
      });
    return () => { cancelled = true; };
  }, [selected]);

  const loadMore = async () => {
    setLoadingMore(true);
    const { data, error } = await buildQuery(false).range(jobs.length, jobs.length + PAGE_SIZE - 1);
    setLoadingMore(false);
    if (error) {
      toast({ title: "Couldn't load more", description: error.message, variant: "destructive" });
      return;
    }
    const rows = (data as unknown as JobPosting[]) ?? [];
    setJobs((prev) => [...prev, ...rows]);
    scorePage(rows);
  };

  // v3.139.0 — reported directly: clicking a job on desktop turned the
  // whole screen gray, and a second click was needed to clear it. Real
  // cause: SheetContent's className="... lg:hidden" only hides the sheet
  // PANEL at the lg breakpoint — the Sheet primitive always renders its
  // own full-screen overlay regardless of that class (confirmed directly
  // in ui/sheet.tsx: SheetOverlay has no responsive class of its own), so
  // opening the sheet on desktop mounted an invisible-but-real dark
  // backdrop on top of the already-correct split-view pane. The second
  // click wasn't "clearing" anything on purpose — it was landing on that
  // overlay, which closes on any outside click. Fixed at the actual
  // trigger instead of the shared sheet.tsx primitive (used elsewhere in
  // the app; narrowing it here is safer than changing its behavior
  // everywhere): the sheet is a narrow-screen-only affordance to begin
  // with (the detail already shows in the split-view right pane on
  // desktop), so it now simply never opens above the same lg breakpoint
  // SheetContent already hides its panel at.
  const openJob = (j: JobPosting) => {
    setSelected(j);
    markSeen(j.id);
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) return;
    setSheetOpen(true);
  };

  // v3.138.0 — reported directly against a live screenshot: the same
  // posting listed twice on the Jobs page. This had no dedup check at
  // all — clicking Add a second time on a posting already saved (a
  // double click, or coming back to Browse and clicking it again) just
  // inserted a second row for the identical apply_url. Now checks for an
  // existing row on that exact URL first and opens it instead of
  // inserting a duplicate.
  // v3.142.0 — a bookmark on each row saves without leaving the list.
  // v3.143.0 — "Score and tailor" was navigating even on an already-saved
  // job with nothing new to do — fixed to stay put in that one case.
  // v3.144.0 — that fix overshot: reported directly that clicking "Score
  // and tailor" now saves the job but never takes the person to the one
  // place scoring, tailoring and the cover letter actually happen (this
  // page's own detail pane has neither). Landed on two distinct, honest
  // affordances instead of one shared save path: the row bookmark saves
  // or unsaves and never leaves the list, since that's the point of a
  // bookmark; "Score and tailor" is a real navigation action and always
  // takes the person to the Saved jobs page with this job open, whether
  // it was already saved or just added — that's what the button says it
  // does. `navigate` picks which behavior a given call gets.
  const saveJob = async (job: JobPosting, navigate = false) => {
    setAddingId(job.id);
    try {
      const { data: existing } = await supabase.from("jobs")
        .select("id").eq("user_id", userId).eq("source_url", job.apply_url).maybeSingle();
      if (existing) {
        setSavedUrls((prev) => new Set(prev).add(job.apply_url));
        if (navigate) onAdded((existing as { id: string }).id);
        else toast({ title: "Already saved", description: "Find it on the Saved jobs page whenever you're ready." });
        return;
      }
      const { data, error } = await supabase.from("jobs").insert({
        user_id: userId,
        source: "job_board",
        source_url: job.apply_url,
        jd_text: job.description,
        company: job.company,
        title: job.title,
        location: job.location,
      }).select("id").single();
      if (error) throw error;
      setSavedUrls((prev) => new Set(prev).add(job.apply_url));
      if (navigate) {
        toast({ title: "Job added", description: "Scoring and tailoring are ready on the Jobs page." });
        onAdded((data as { id: string }).id);
      } else {
        toast({ title: "Saved", description: "Find it anytime on the Saved jobs page." });
      }
    } catch (e) {
      toast({ title: "Couldn't add that job", description: e instanceof Error ? e.message : "Error", variant: "destructive" });
    } finally {
      setAddingId(null);
    }
  };

  // v3.144.0 — asked directly: the bookmark only ever saved, clicking it
  // again on an already-saved job just said "already saved" instead of
  // actually undoing it. It's a real toggle now — unsaving here deletes
  // the same row "Remove" on the Saved jobs page deletes, not a separate
  // soft state, so the two surfaces can never disagree about whether a job
  // is saved.
  const unsaveJob = async (job: JobPosting) => {
    setAddingId(job.id);
    try {
      const { error } = await supabase.from("jobs")
        .delete().eq("user_id", userId).eq("source_url", job.apply_url);
      if (error) throw error;
      setSavedUrls((prev) => { const next = new Set(prev); next.delete(job.apply_url); return next; });
      toast({ title: "Removed", description: "Taken off your saved jobs." });
    } catch (e) {
      toast({ title: "Couldn't remove that job", description: e instanceof Error ? e.message : "Error", variant: "destructive" });
    } finally {
      setAddingId(null);
    }
  };

  const handleAdd = (job: JobPosting) => saveJob(job, true);
  const toggleBookmark = (e: React.MouseEvent, job: JobPosting) => {
    e.stopPropagation();
    if (savedUrls.has(job.apply_url)) unsaveJob(job);
    else saveJob(job);
  };

  // v3.142.0 — flat while searching (a typed filter beats a category
  // browse every time), grouped by region while just browsing so 1,000+
  // raw strings aren't one undifferentiated alphabetical wall.
  const visibleLocations = useMemo(() => {
    const f = locFilter.trim().toLowerCase();
    if (f) return { flat: locations.filter((l) => l.toLowerCase().includes(f)).slice(0, 120), byCountry: null as ReturnType<typeof groupByCountry> | null };
    return { flat: null as string[] | null, byCountry: groupByCountry(locations) };
  }, [locations, locFilter]);

  const clearFilters = () => {
    setRawQuery("");
    setQuery("");
    setLocation(null);
    setRemoteOnly(false);
    setMatchMode(false);
    setEmploymentType(null);
    setSeniority(null);
    setCategory(null);
    setPostedWithin(null);
  };

  const startMatchMode = () => {
    if (!desiredLocations || desiredLocations.length === 0) {
      toast({
        title: "Add your desired locations first",
        description: "Set the countries or cities you're looking in under Profile, then try Match me again.",
      });
      return;
    }
    setLocation(null);
    setRemoteOnly(false);
    setMatchMode(true);
  };

  const scorePill = (id: string, size = 28) => {
    const score = scores[id];
    if (score != null) return <ScoreGauge score={score} size={size} showLabel={size >= 40} />;
    if (!scored.has(id)) {
      return <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-muted text-muted-foreground animate-pulse">Scoring…</span>;
    }
    return <span className="text-xs text-muted-foreground">No resume yet</span>;
  };

  const selectedSalary = selected ? resolveSalary(selected) : null;
  const cultureSnippet = useMemo(
    () => (selected ? extractCultureSnippet(selected.description ?? "") : null),
    [selected],
  );

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
  const highlightCells = selected
    ? [
        selectedSalary && { key: "salary", label: "Salary", value: selectedSalary.text, tone: "gold" as const },
        selected.seniority && { key: "seniority", label: "Seniority", value: SENIORITY_LABELS[selected.seniority] || humanizeSlug(selected.seniority) },
        selected.work_mode && { key: "mode", label: "Work mode", value: selected.work_mode.charAt(0).toUpperCase() + selected.work_mode.slice(1), tone: "trust" as const },
        selected.employment_type && { key: "type", label: "Type", value: EMPLOYMENT_TYPE_LABELS[selected.employment_type] || humanizeSlug(selected.employment_type) },
      ].filter((c): c is { key: string; label: string; value: string; tone?: "gold" | "trust" } => !!c)
    : [];

  const detail = selected && (
    <div className="flex flex-col h-full">
      <div className="p-5 border-b space-y-3" style={{ borderColor: "var(--rh-hair)" }}>
        <div className="flex items-start gap-3">
          {resolveLogoUrl(selected) && !logoFailed.has(selected.id) ? (
            <img
              src={resolveLogoUrl(selected)!}
              alt=""
              className="w-14 h-14 rounded-xl shrink-0 object-contain bg-white p-1.5 border"
              style={{ borderColor: "var(--rh-hair)" }}
              onError={() => setLogoFailed((prev) => new Set(prev).add(selected.id))}
            />
          ) : (
            <div
              className={`w-14 h-14 rounded-full flex items-center justify-center font-bold text-lg shrink-0 ${companyAvatar(selected.company).className}`}
              style={{ boxShadow: "0 6px 16px -6px rgba(28,23,18,0.35)" }}
            >
              {companyAvatar(selected.company).initial}
            </div>
          )}
          <div className="min-w-0">
            <h2 className="rh-display text-[19px] leading-snug">{selected.title}</h2>
            <p className="text-sm flex items-center gap-1.5 mt-0.5" style={{ color: "var(--rh-muted)" }}>
              <Building2 className="w-3.5 h-3.5 shrink-0" />{selected.company}
            </p>
            {selected.location && (
              <p className="text-sm flex items-center gap-1.5" style={{ color: "var(--rh-muted)" }}>
                <MapPin className="w-3.5 h-3.5 shrink-0" />{selected.location}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {scorePill(selected.id, 44)}
          <span className="text-xs" style={{ color: "var(--rh-faint)" }}>Posted {postedAge(selected.posted_at)} · {postedDate(selected.posted_at)}</span>
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
        <p className="text-xs font-semibold flex items-center gap-1.5" style={{ color: "var(--rh-trust)" }} title="Never a third-party aggregator, never LinkedIn or Indeed. Pulled straight from the company's own hiring system and dropped from AYN 3 days after it's posted, so nothing here goes stale.">
          <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
          Sourced directly from {selected.company}'s own hiring system
        </p>

        {activelyHiring && (
          <p className="text-xs font-semibold flex items-center gap-1.5" style={{ color: "var(--rh-trust)" }} title="Based on real turnover AYN has actually observed over time for this company, not a guess from one listing.">
            <TrendingUp className="w-3.5 h-3.5 shrink-0" />
            {selected.company} is actively hiring
          </p>
        )}

        {highlightCells.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {highlightCells.map((c) => (
              <div key={c.key} className="rounded-lg px-3 py-2" style={{ background: "var(--rh-raised)", border: "1px solid var(--rh-hair)" }}>
                <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--rh-faint)" }}>{c.label}</div>
                <div
                  className="text-[14px] font-bold truncate"
                  style={{ color: c.tone === "gold" ? "var(--rh-gold)" : c.tone === "trust" ? "var(--rh-trust)" : "var(--rh-ink)" }}
                >
                  {c.value}
                </div>
              </div>
            ))}
          </div>
        )}

        {selected.skills && selected.skills.length > 0 && (
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: "var(--rh-faint)" }}>Skills for this role</div>
            <div className="flex flex-wrap gap-1.5">
              {selected.skills.slice(0, 10).map((s) => (
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
              In {selected.company}'s own words
            </div>
            <p className="text-[13px] leading-relaxed" style={{ color: "var(--rh-ink)" }}>{cultureSnippet}</p>
          </div>
        )}

        {companyActivity && (
          <p className="text-xs" style={{ color: "var(--rh-faint)" }} title="How many roles this company has open right now, and how recently the newest one landed. Not how fast they reply to an application.">
            {companyActivity.count === 1
              ? `${selected.company}'s only open role right now`
              : `${companyActivity.count} open roles at ${selected.company} right now`}
            {" · newest posted "}{postedAge(companyActivity.mostRecent)}
          </p>
        )}

        <div className="flex items-center gap-2 flex-wrap pt-1">
          <Button onClick={() => handleAdd(selected)} disabled={addingId === selected.id} style={{ background: "var(--rh-gradient)", borderColor: "transparent", color: "#fff", boxShadow: "var(--rh-glow)" }} className="hover:opacity-90">
            {addingId === selected.id
              ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              : <Plus className="w-4 h-4 mr-2" />}
            Score and tailor
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
            <a href={selected.apply_url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-4 h-4 mr-2" />Apply on company site
            </a>
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        <h3 className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "var(--rh-faint)" }}>Job description</h3>
        <JobDescriptionBody text={selected.description ?? ""} />
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* v3.167.0 — reported directly: the toolbar visibly jumped up and
          down. Real cause: title and toolbar shared one flex-wrap row, so
          whenever a button's own label changed length ("Best match" <->
          "Newest", "Match me" <-> "Showing my matches") the row's total
          width crossed the wrap threshold and the toolbar jumped between
          sharing the title's line and wrapping below it. Stacked into two
          always-separate rows instead -- the toolbar's vertical position
          can no longer depend on any button's text length. Each button
          also gets a fixed min-width so its own label change doesn't
          shift its neighbors horizontally either. */}
      <div>
        <h3 className="rh-display text-[26px]">Browse jobs</h3>
        {/* v3.169.0 — asked directly to research what people actually say
            about LinkedIn and Indeed, then use it as an advantage. Ghost
            and fake listings came back as the single most-repeated
            complaint across every real source checked (surveys put it
            around 40% of job seekers, and it's a named driver of why
            people now blanket-apply to hundreds of jobs at once instead
            of trusting any one posting). This was already true and
            already stated as plain body text; given real weight instead —
            a shield icon and its own line — since research says this is
            exactly the thing worth leading with, not burying.
            v3.171.0 — recolored to the new trust teal, matching the same
            signal repeated in the detail pane below. */}
        <p className="text-sm mt-1.5 flex items-center gap-1.5 font-semibold" style={{ color: "var(--rh-trust)" }}>
          <ShieldCheck className="w-4 h-4 shrink-0" />
          Every posting comes straight from a real company's own hiring system. Never LinkedIn, Indeed, or a third-party aggregator.
        </p>
      </div>
      {/* v3.185.0 — reported directly from a mobile screenshot: the
          List/Swipe toggle used ml-auto inside the SAME wrapping row as the
          sort/discovery buttons, so once that row actually wrapped on a
          narrow screen, ml-auto flung the toggle onto its own line pinned
          hard against the right edge -- stranded, with no visual
          connection to anything above it. Splitting the sort cluster and
          the view toggle into two real sibling flex items under one
          justify-between row fixes both widths at once: wide screens still
          get the exact same left-cluster/right-toggle layout (justify-
          between does what ml-auto used to), and a narrow screen's second
          line now left-aligns directly under the sort buttons instead of
          floating disconnected on the right. */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1 flex-wrap">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setNewestFirst((v) => !v)}
            className="text-xs text-muted-foreground min-w-[104px] justify-start"
          >
            <Clock className="w-3.5 h-3.5 mr-1.5 shrink-0" />{newestFirst ? "Newest" : "Best match"}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={openTrending} className="text-xs text-muted-foreground">
            <TrendingUp className="w-3.5 h-3.5 mr-1.5" />Trending
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={openRoleFinder} className="text-xs text-muted-foreground">
            <Compass className="w-3.5 h-3.5 mr-1.5" />Explore roles
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => (matchMode ? setMatchMode(false) : startMatchMode())}
            style={matchMode ? { background: "var(--rh-accent)", borderColor: "var(--rh-accent)", color: "#fff" } : undefined}
            variant={matchMode ? undefined : "outline"}
            className={matchMode ? "hover:opacity-90 ml-1 min-w-[132px] justify-start" : "ml-1 min-w-[132px] justify-start"}
          >
            <Wand2 className="w-4 h-4 mr-1.5 shrink-0" />{matchMode ? "Showing my matches" : "Match me"}
          </Button>
        </div>

        {/* v3.171.0 — "swipe to decide," a genuinely second way to move
            through the same filtered/scored jobs, not a reskin of the
            list. A plain segmented toggle, not its own nav item, since
            it's a view of the same data rather than a different page. */}
        <div className="flex items-center rounded-lg p-0.5" style={{ background: "var(--rh-raised)" }}>
          <button
            type="button"
            onClick={() => setViewMode("list")}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md transition"
            style={viewMode === "list" ? { background: "var(--rh-surface)", color: "var(--rh-ink)", boxShadow: "var(--rh-shadow-card)" } : { color: "var(--rh-muted)" }}
          >
            <List className="w-3.5 h-3.5" />List
          </button>
          <button
            type="button"
            onClick={() => setViewMode("swipe")}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md transition"
            style={viewMode === "swipe" ? { background: "var(--rh-gradient)", color: "#fff", boxShadow: "var(--rh-glow)" } : { color: "var(--rh-muted)" }}
          >
            <Layers className="w-3.5 h-3.5" />Swipe
          </button>
        </div>
      </div>

      {matchMode && (
        <p className="text-xs text-muted-foreground -mt-2">
          Sorted by fit, filtered to {desiredLocations?.length === 1 ? "the location" : "the locations"} you set in Profile:{" "}
          <span className="text-foreground font-medium">{desiredLocations?.join(", ")}</span>.{" "}
          <button type="button" className="underline hover:text-foreground" onClick={onOpenProfile}>Change this</button>
        </p>
      )}

      {/* Filters */}
      <div className="flex flex-col lg:flex-row gap-2">
        <div className="relative flex-1" ref={searchBoxRef}>
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={rawQuery}
            onChange={(e) => { setRawQuery(e.target.value); setSearchOpen(true); }}
            onFocus={() => setSearchOpen(true)}
            placeholder="Search by title or company"
            className="pl-9"
          />
          {searchOpen && searchSuggestions.length > 0 && (
            <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg py-1 max-h-64 overflow-y-auto">
              {searchSuggestions.map((s) => (
                <button
                  key={`${s.kind}-${s.v}`}
                  type="button"
                  className="w-full flex items-center gap-2 text-left px-3 py-1.5 text-sm hover:bg-muted"
                  onClick={() => { setRawQuery(s.v); setQuery(s.v); setSearchOpen(false); }}
                >
                  {s.kind === "company"
                    ? <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    : <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                  <span className="truncate">{s.v}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className={`relative w-full lg:w-64 ${matchMode ? "opacity-50 pointer-events-none" : ""}`} ref={locBoxRef}>
          <button
            type="button"
            onClick={() => { setLocOpen((v) => !v); setLocFilter(""); }}
            className="flex h-10 w-full items-center gap-2 rounded-md border border-input bg-background px-3 text-sm"
          >
            <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className={`flex-1 text-left truncate ${location ? "" : "text-muted-foreground"}`}>
              {location ?? "All locations"}
            </span>
            <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
          </button>
          {locOpen && (
            <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg">
              <div className="p-2 border-b">
                <Input
                  autoFocus
                  value={locFilter}
                  onChange={(e) => setLocFilter(e.target.value)}
                  placeholder={`Search ${locations.length} locations`}
                  className="h-8"
                />
              </div>
              <div className="max-h-64 overflow-y-auto py-1">
                <button
                  type="button"
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted"
                  onClick={() => { setLocation(null); setLocOpen(false); }}
                >
                  All locations
                </button>
                {visibleLocations.flat
                  ? visibleLocations.flat.map((loc) => (
                    <button
                      key={loc}
                      type="button"
                      className={`w-full text-left px-3 py-1.5 text-sm hover:bg-muted ${loc === location ? "font-medium" : ""}`}
                      style={loc === location ? { color: "var(--rh-accent-2)" } : undefined}
                      onClick={() => { setLocation(loc); setLocOpen(false); }}
                    >
                      {loc}
                    </button>
                  ))
                  : visibleLocations.byCountry?.map((g) => (
                    <div key={g.country}>
                      <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {g.country} <span className="font-normal normal-case">· {g.items.length}</span>
                      </p>
                      {g.items.slice(0, 14).map((loc) => (
                        <button
                          key={loc}
                          type="button"
                          className={`w-full text-left px-3 py-1.5 text-sm hover:bg-muted ${loc === location ? "font-medium" : ""}`}
                          style={loc === location ? { color: "var(--rh-accent-2)" } : undefined}
                          onClick={() => { setLocation(loc); setLocOpen(false); }}
                        >
                          {loc}
                        </button>
                      ))}
                    </div>
                  ))}
                {visibleLocations.flat?.length === 0 && (
                  <p className="px-3 py-2 text-sm text-muted-foreground">No location matches that.</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* v3.185.0 — reported directly from a mobile screenshot: Search,
            Location, Remote and Filters stacked as four separate full-width
            rows with no grouping at all. Search and Location genuinely need
            that width (a text field, a dropdown trigger with real label
            text); Remote and Filters are both compact, button-shaped
            toggles, so they now share one row and split it evenly on
            mobile instead of each claiming a full row of their own.
            lg:contents makes this wrapper disappear from layout at the
            desktop breakpoint, so Remote and Filters rejoin the outer row
            exactly as before -- pixel-identical desktop behavior, purely
            additive on mobile. */}
        <div className="flex gap-2 lg:contents">
          <Button
            type="button"
            variant={remoteOnly ? "default" : "outline"}
            onClick={() => setRemoteOnly((v) => !v)}
            disabled={matchMode}
            className={`flex-1 lg:flex-initial shrink-0 ${matchMode ? "opacity-50" : ""}`}
          >
            <Home className="w-4 h-4 mr-1.5" />Remote
          </Button>

          {/* v3.167.0 — the job type/seniority/category/posted-within chips
              used to sit permanently on screen, ~20 of them wrapping across
              two lines — the single biggest thing making this page read as
              cluttered rather than clean. Collapsed into one button with an
              active-count badge; the panel it opens is the exact same
              controls, just out of the way until wanted. Same hand-rolled
              dropdown pattern as the location box, not a new primitive. */}
          <div className="relative flex-1 lg:flex-initial shrink-0" ref={filtersBoxRef}>
          <Button
            type="button"
            variant={activeFilterCount > 0 ? "default" : "outline"}
            onClick={() => setFiltersOpen((v) => !v)}
            style={activeFilterCount > 0 ? { background: "var(--rh-accent)", borderColor: "var(--rh-accent)", color: "#fff" } : undefined}
            className={activeFilterCount > 0 ? "hover:opacity-90" : ""}
          >
            <SlidersHorizontal className="w-4 h-4 mr-1.5" />Filters
            {activeFilterCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-semibold bg-white/25 px-1">
                {activeFilterCount}
              </span>
            )}
          </Button>
          {filtersOpen && (
            <div className="absolute z-50 mt-1 right-0 w-[300px] rounded-md border bg-popover shadow-lg p-3 space-y-3 max-h-[70vh] overflow-y-auto">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Posted within</p>
                <div className="flex flex-wrap gap-1.5">
                  {POSTED_WITHIN_OPTIONS.map((o) => (
                    <button
                      key={o.key}
                      type="button"
                      onClick={() => setPostedWithin((v) => (v === o.key ? null : o.key))}
                      className="text-xs px-2.5 py-1 rounded-full border transition"
                      style={postedWithin === o.key
                        ? { background: "var(--rh-accent)", borderColor: "var(--rh-accent)", color: "#fff" }
                        : { borderColor: "var(--border, hsl(var(--border)))" }}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              {employmentTypes.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Job type</p>
                  <div className="flex flex-wrap gap-1.5">
                    {employmentTypes.map((et) => (
                      <button
                        key={et}
                        type="button"
                        onClick={() => setEmploymentType((v) => (v === et ? null : et))}
                        className="text-xs px-2.5 py-1 rounded-full border transition"
                        style={employmentType === et
                          ? { background: "var(--rh-accent)", borderColor: "var(--rh-accent)", color: "#fff" }
                          : { borderColor: "var(--border, hsl(var(--border)))" }}
                      >
                        {EMPLOYMENT_TYPE_LABELS[et] || humanizeSlug(et)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {seniorities.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Seniority</p>
                  <div className="flex flex-wrap gap-1.5">
                    {seniorities.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSeniority((v) => (v === s ? null : s))}
                        className="text-xs px-2.5 py-1 rounded-full border transition"
                        style={seniority === s
                          ? { background: "var(--rh-accent)", borderColor: "var(--rh-accent)", color: "#fff" }
                          : { borderColor: "var(--border, hsl(var(--border)))" }}
                      >
                        {SENIORITY_LABELS[s] || humanizeSlug(s)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {categories.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Category</p>
                  <Select value={category ?? "__all"} onValueChange={(v) => setCategory(v === "__all" ? null : v)}>
                    <SelectTrigger className="h-8 w-full text-xs">
                      <SelectValue placeholder="All categories" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all">All categories</SelectItem>
                      {categories.map((c) => (
                        <SelectItem key={c} value={c}>{humanizeCategory(c)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {activeFilterCount > 0 && (
                <Button type="button" variant="ghost" size="sm" className="w-full" onClick={() => { setEmploymentType(null); setSeniority(null); setCategory(null); setPostedWithin(null); }}>
                  Clear these filters
                </Button>
              )}
            </div>
          )}
          </div>
        </div>

        {(hasFilters || matchMode) && (
          <Button type="button" variant="ghost" onClick={clearFilters} className="shrink-0">
            <X className="w-4 h-4 mr-1.5" />Clear
          </Button>
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        {loading
          ? "Loading jobs…"
          : total === null
            ? ""
            : hasFilters || matchMode
              ? <><span className="font-semibold text-foreground">{displayCount(total)}</span> job{total === 1 ? "" : "s"} match your search</>
              : <><span className="font-semibold text-foreground">{displayCount(total)}</span> jobs</>}
      </p>

      {/* Split view: list on the left, the full posting on the right */}
      {viewMode === "list" && (
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-4 items-start">
        <div className="space-y-3">
          {loading ? (
            <Card className="divide-y divide-border/60 border-border/60 overflow-hidden p-0 rounded-xl shadow-sm">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-4">
                  <Skeleton className="w-10 h-10 rounded-lg shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
              ))}
            </Card>
          ) : jobs.length === 0 ? (
            <Card className="p-10 text-center rounded-xl shadow-sm">
              <p className="text-sm text-muted-foreground">
                {hasFilters ? "No jobs match your search. Try clearing a filter." : "No fresh postings right now, check back soon."}
              </p>
            </Card>
          ) : (
            <>
              {/* v3.171.0 — was one bordered Card with hairline-divided
                  rows, the flat "safe" list-row pattern the earlier
                  research flagged. Each posting is now its own card with
                  the shared rh-lift hover treatment (translateY + a real
                  ember-tinted shadow on hover), matching the approved
                  Ember Discovery mockup — motion this page had almost none
                  of before. */}
              <div className="space-y-3">
                {jobs.map((j) => {
                  const isHot = Date.now() - new Date(j.posted_at).getTime() < HOT_WINDOW_MS;
                  const avatar = companyAvatar(j.company);
                  const logoUrl = resolveLogoUrl(j);
                  const showLogo = !!logoUrl && !logoFailed.has(j.id);
                  const salary = resolveSalary(j);
                  const active = selected?.id === j.id;
                  const isSaved = savedUrls.has(j.apply_url);
                  const isSeen = seenIds.has(j.id);
                  return (
                    // v3.142.0 — the row used to be one big <button>; adding
                    // a bookmark control meant it could no longer be, since
                    // an interactive element can't nest inside another one.
                    // The clickable area (avatar + text) is now its own
                    // inner button, with the bookmark as a sibling instead
                    // of a child.
                    <div
                      key={j.id}
                      className="rh-lift w-full flex items-start gap-2 p-4 rounded-xl relative"
                      style={{
                        background: "var(--rh-surface)",
                        border: active ? "1.5px solid var(--rh-accent)" : "1px solid var(--rh-hair)",
                        boxShadow: active ? "var(--rh-shadow-lift)" : "var(--rh-shadow-card)",
                      }}
                    >
                      <button type="button" onClick={() => openJob(j)} className="flex items-start gap-3 flex-1 min-w-0 text-left">
                        {showLogo ? (
                          <img
                            src={logoUrl!}
                            alt=""
                            className="w-12 h-12 rounded-xl shrink-0 object-contain bg-white p-1.5 border"
                            style={{ borderColor: "var(--rh-hair)" }}
                            onError={() => setLogoFailed((prev) => new Set(prev).add(j.id))}
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
                          <p className="rh-display text-[15.5px] leading-snug">{j.title}</p>
                          <p className="text-[13px] truncate" style={{ color: "var(--rh-muted)" }}>
                            {j.company}{j.location ? ` • ${j.location}` : ""}
                          </p>
                          <div className="flex items-center gap-2 flex-wrap pt-0.5">
                            {scorePill(j.id)}
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
                        </div>
                      </button>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        {/* v3.139.0 — reported directly: the New badge sat
                            inline right after the title, so a one-line title
                            and a two-line title left it in a different spot
                            on every card. Pulled out to its own column at the
                            end of the row instead, so it lands in the same
                            place on every card regardless of title length.
                            v3.171.0 — given the real ember gradient + glow
                            instead of a flat tint pill, matching every other
                            "real accent" moment on this page now. */}
                        {isHot && (
                          <Badge
                            variant="outline"
                            className="shrink-0 gap-1 border-0"
                            style={{ background: "var(--rh-gradient)", color: "#fff", boxShadow: "var(--rh-glow)" }}
                          >
                            <Flame className="w-3 h-3" /> New
                          </Badge>
                        )}
                        {/* v3.183.0 — reported directly: no way to tell at a
                            glance whether a card had already been opened
                            before. Real, persistent per-user tracking
                            (job_postings_seen), not a guess — set the moment
                            this card's detail is actually opened. */}
                        {isSeen && (
                          <Badge variant="outline" className="shrink-0 border-0" style={{ background: "var(--rh-raised)", color: "var(--rh-faint)" }}>
                            Seen
                          </Badge>
                        )}
                        {/* v3.142.0 — asked directly for a bookmark-style
                            save so a job can be kept without leaving the
                            list or reading the full posting first.
                            v3.144.0 — and asked directly to make it a real
                            toggle, not save-only. */}
                        <button
                          type="button"
                          onClick={(e) => toggleBookmark(e, j)}
                          disabled={addingId === j.id}
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
                })}
              </div>

              {total !== null && jobs.length < total && (
                <Button variant="outline" className="w-full" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : "Load more jobs"}
                </Button>
              )}
            </>
          )}
        </div>

        {/* Desktop detail pane */}
        <Card className="hidden lg:block border-border/60 overflow-hidden sticky top-4 h-[calc(100vh-8rem)] p-0 rounded-xl shadow-sm">
          {selected
            ? detail
            : <p className="p-10 text-sm text-muted-foreground text-center">Pick a job to read the full posting.</p>}
        </Card>
      </div>
      )}

      {viewMode === "swipe" && (loading ? (
        <div className="flex justify-center py-24">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--rh-accent)" }} />
        </div>
      ) : (
        <SwipeDeck
          jobs={swipeJobs}
          index={swipeIndex}
          onIndexChange={setSwipeIndex}
          scores={scores}
          scored={scored}
          logoFailed={logoFailed}
          setLogoFailed={setLogoFailed}
          onSave={(job) => saveJob(job)}
          onSeen={markSeen}
          onOpenDetail={(job) => { setViewMode("list"); openJob(job); }}
          hasMore={total !== null && jobs.length < total}
        />
      ))}

      {/* Narrow screens get the same detail as a full height sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg p-0 lg:hidden">
          <div className="h-full pt-6">{detail}</div>
        </SheetContent>
      </Sheet>

      {/* v3.151.0 — real job titles, scored the same free way every card
          already is, grouped from the live catalog instead of guessed by
          an AI. Picking one filters the list to real postings under it. */}
      <Dialog open={rolesOpen} onOpenChange={setRolesOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Roles that fit you</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-2">
            Real job titles from postings open right now, ranked by the same quick match every card shows. Not a guess at demand, just a count of what's actually listed.
          </p>
          <div className="max-h-[60vh] overflow-y-auto -mx-1 px-1 space-y-1.5">
            {rolesLoading ? (
              Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-md" />)
            ) : rolesError ? (
              <div className="py-6 text-center space-y-3">
                <p className="text-sm text-muted-foreground">Couldn't load this right now.</p>
                <Button type="button" variant="outline" size="sm" onClick={() => { setRoles(null); openRoleFinder(); }}>
                  Try again
                </Button>
              </div>
            ) : !roles || roles.length === 0 ? (
              <div className="py-6 text-center space-y-3">
                <p className="text-sm text-muted-foreground">
                  {rolesHasProfile
                    ? "Nothing in today's postings scored well against your profile yet. Check back as new jobs come in."
                    : "Add a resume or a few skills to Profile first, then AYN can find roles that fit you."}
                </p>
                {!rolesHasProfile && (
                  <Button type="button" size="sm" onClick={() => { setRolesOpen(false); onOpenProfile(); }}>
                    Open Profile
                  </Button>
                )}
              </div>
            ) : (
              roles.map((r) => (
                <button
                  key={r.title}
                  type="button"
                  onClick={() => pickRole(r.title)}
                  className="w-full text-left rounded-md border border-border/60 px-3 py-2.5 hover:bg-muted transition flex items-center gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{r.title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {r.openings} open posting{r.openings === 1 ? "" : "s"}{r.companies.length ? ` · ${r.companies.slice(0, 2).join(", ")}${r.companies.length > 2 ? "…" : ""}` : ""}
                    </p>
                  </div>
                  <span
                    className="shrink-0 text-xs font-semibold rounded-full px-2 py-1"
                    style={{ background: "var(--rh-tint)", color: "var(--rh-accent-2)" }}
                  >
                    {r.match_pct}%
                  </span>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* v3.166.0 — real posting volume, nationally and by chosen city, over
          the last 3 days. Never a guessed demand number, always a real count
          of what's actually landing on file right now. */}
      <Dialog open={trendingOpen} onOpenChange={setTrendingOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Trending right now</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground -mt-2">
            Real posting volume from the last 3 days, across the US and Canada. Not a guess at demand, just a count of what's actually landing.
          </p>

          {structuredCities.length > 0 && (
            <Select
              value={trendingCity ?? "__national"}
              onValueChange={(v) => pickTrendingCity(v === "__national" ? null : v)}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="US & Canada" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__national">US &amp; Canada</SelectItem>
                {structuredCities.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {trendingLoading ? (
            <div className="space-y-1.5">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-full rounded-md" />)}
            </div>
          ) : trendingError ? (
            <div className="py-6 text-center space-y-3">
              <p className="text-sm text-muted-foreground">Couldn't load this right now.</p>
              <Button type="button" variant="outline" size="sm" onClick={() => loadTrending(trendingCity)}>Try again</Button>
            </div>
          ) : (() => {
            const scope = trendingCity && trendingData?.city ? trendingData.city : trendingData?.national;
            const byCategory = scope && "byCategory" in scope ? scope.byCategory : [];
            const byCompany = scope && "byCompany" in scope ? scope.byCompany : [];
            if (!byCategory.length && !byCompany.length) {
              return <p className="py-6 text-center text-sm text-muted-foreground">Nothing landed here in the last 3 days.</p>;
            }
            return (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">By role</p>
                  <div className="space-y-1">
                    {byCategory.map((r) => (
                      <div key={r.category} className="flex items-start justify-between gap-2 text-sm py-1">
                        <span>{humanizeCategory(r.category)}</span>
                        <span className="shrink-0 text-xs font-semibold rounded-full px-2 py-0.5" style={{ background: "var(--rh-tint)", color: "var(--rh-accent-2)" }}>{r.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">By company</p>
                  <div className="space-y-1">
                    {byCompany.map((r) => (
                      <div key={r.company} className="flex items-start justify-between gap-2 text-sm py-1">
                        <span>{r.company}</span>
                        <span className="shrink-0 text-xs font-semibold rounded-full px-2 py-0.5" style={{ background: "var(--rh-tint)", color: "var(--rh-accent-2)" }}>{r.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}

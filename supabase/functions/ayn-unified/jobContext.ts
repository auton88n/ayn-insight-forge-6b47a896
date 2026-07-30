/**
 * jobContext.ts — v3.7.0 "AYN chat becomes a job search copilot"
 *
 * Builds the grounding context for the dashboard chat, SERVER SIDE ONLY.
 * The client sends messages and nothing else that matters; every fact about
 * the user in the prompt is read here with the service role from the user's
 * own rows.
 *
 * HARD RULE: no contact details. Email, phone, address, postal code, and
 * profile links never enter the model context. A copilot advising someone on
 * their job search has no use for them, and the cheapest way to guarantee a
 * leak cannot happen is to never load them into the prompt.
 */
import type { createClient } from "https://esm.sh/@supabase/supabase-js@2.56.0";

type SupabaseClient<A = any, B = any, C = any> = ReturnType<typeof createClient>;
import { loadIdentity } from "../_shared/identity.ts";

export interface CopilotContext {
  /** The block appended to the system prompt. */
  text: string;
  hasResume: boolean;
  hasProfile: boolean;
  /** Short machine-readable summary for logging and starters. */
  summary: {
    saved_jobs: number;
    scored_jobs: number;
    pending_proposals: number;
    discoverable: boolean;
    skills: number;
  };
}

type Row = Record<string, unknown>;

const s = (v: unknown): string => (typeof v === "string" ? v.trim() : v == null ? "" : String(v));
const arr = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const list = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => s(x)).filter(Boolean) : [];

/** "Senior React dev (5y, last used 2026)" from a v3.5.0 skill object. */
function skillLine(sk: Row): string {
  const name = s(sk.name);
  if (!name) return "";
  const bits: string[] = [];
  if (sk.level) bits.push(s(sk.level));
  if (sk.years != null && s(sk.years)) bits.push(`${s(sk.years)}y`);
  if (sk.last_used) bits.push(`last used ${s(sk.last_used)}`);
  return bits.length ? `${name} (${bits.join(", ")})` : name;
}

function experienceLine(e: Row): string {
  const head = [s(e.title), s(e.company) && `at ${s(e.company)}`].filter(Boolean).join(" ");
  const when = `${s(e.start) || "?"} to ${e.current ? "now" : s(e.end) || "?"}`;
  const where = s(e.location);
  const meta = [when, where, s(e.industry)].filter(Boolean).join(", ");
  const bullets = list(e.bullets).slice(0, 5).map((b) => `    achievement: ${b}`);
  return [`  ${head} (${meta})`, ...bullets].join("\n");
}

export async function buildJobSearchContext(
  admin: SupabaseClient<any, any, any>,
  userId: string,
): Promise<CopilotContext> {
  const [identity, canonRes, jobsRes, matchRes, poolRes, proposalsRes, memRes] = await Promise.all([
    loadIdentity(admin, userId).catch(() => null),
    admin.from("user_profile_canonical")
      .select("skills, experiences, education, certifications, work_auth, preferences, derived")
      .eq("user_id", userId).maybeSingle(),
    admin.from("jobs")
      .select("id, title, company, location, created_at")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(12),
    admin.from("job_matches")
      .select("job_id, score, breakdown, created_at")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(40),
    admin.from("talent_pool_consent").select("opted_in").eq("user_id", userId).maybeSingle(),
    admin.from("reveal_requests")
      .select("id, org_id, status, job_title, job_location, employment_type, salary_range, sent_at")
      .eq("candidate_user_id", userId).order("sent_at", { ascending: false }).limit(10),
    admin.from("user_memory").select("key, value").eq("user_id", userId).limit(20),
  ]);

  const canon = (canonRes?.data as Row) || null;
  const skills = arr(canon?.skills);
  const experiences = arr(canon?.experiences);
  const education = arr(canon?.education);
  const certifications = arr(canon?.certifications);
  const workAuth = (canon?.work_auth as Row) || {};
  const prefs = (canon?.preferences as Row) || {};
  const derived = (canon?.derived as Row) || {};

  const jobs = arr(jobsRes?.data);
  const matches = arr(matchRes?.data);
  const proposals = arr(proposalsRes?.data);
  const pending = proposals.filter((p) => s(p.status) === "pending");
  const discoverable = !!(poolRes?.data as Row | null)?.opted_in;

  // Company names for pending proposals. Org name is not contact detail.
  const orgNames = new Map<string, string>();
  const orgIds = [...new Set(pending.map((p) => s(p.org_id)).filter(Boolean))];
  if (orgIds.length) {
    const { data: orgs } = await admin.from("orgs").select("id, name").in("id", orgIds);
    for (const o of arr(orgs)) orgNames.set(s(o.id), s(o.name));
  }

  // Newest score per job.
  const bestScore = new Map<string, Row>();
  for (const m of matches) {
    const jid = s(m.job_id);
    if (jid && !bestScore.has(jid)) bestScore.set(jid, m);
  }

  const resume = identity?.resume;
  const hasResume = !!(resume && resume.source !== "none" && resume.raw);
  const hasProfile = skills.length > 0 || experiences.length > 0;

  const lines: string[] = [];
  lines.push("=== WHAT YOU KNOW ABOUT THIS PERSON (from their own AYN account, read server side) ===");
  lines.push(
    "You never receive their email, phone, or address. You do not need them and must not ask for them here.",
  );

  // WHO THEY ARE
  const who: string[] = [];
  const firstName = s(identity?.first_name?.value);
  if (firstName) who.push(`first name: ${firstName}`);
  const title = s(identity?.current_title?.value) || s(derived.current_title);
  if (title) who.push(`current title: ${title}`);
  const company = s(identity?.current_company?.value) || s(derived.current_company);
  if (company) who.push(`current employer: ${company}`);
  const yoe = identity?.computed_years_experience?.value ?? derived.total_yoe;
  if (yoe) who.push(`years of experience: ${yoe}`);
  const seniority = s(identity?.seniority?.value) || s(derived.seniority);
  if (seniority) who.push(`seniority: ${seniority}`);
  const fn = s(identity?.primary_function?.value) || s(derived.primary_function);
  if (fn) who.push(`primary function: ${fn}`);
  const city = s(identity?.city?.value);
  const country = s(identity?.country?.value);
  const where = [city, country].filter(Boolean).join(", ");
  if (where) who.push(`based in: ${where}`);
  const knownFor = list(derived.known_for);
  if (knownFor.length) who.push(`known for: ${knownFor.join("; ")}`);
  lines.push("\nWHO THEY ARE\n" + (who.length ? who.map((w) => `  ${w}`).join("\n") : "  nothing on file yet"));

  // RESUME
  lines.push(
    "\nRESUME\n  " +
      (hasResume
        ? `one active resume on file (${resume!.work.length} roles, ${resume!.education.length} education entries)`
        : "no resume uploaded. tell them to add one in Resume Hub, Profile tab, Your resume group"),
  );

  // SKILLS
  lines.push(
    "\nSKILLS (level, years, recency where they gave it)\n" +
      (skills.length
        ? "  " + skills.slice(0, 40).map(skillLine).filter(Boolean).join("\n  ")
        : "  none saved. Profile tab, About you group"),
  );

  // WORK HISTORY
  lines.push(
    "\nWORK HISTORY\n" +
      (experiences.length
        ? experiences.slice(0, 8).map(experienceLine).join("\n")
        : "  none saved. Profile tab, Your experience group"),
  );

  // EDUCATION
  lines.push(
    "\nEDUCATION\n" +
      (education.length
        ? education.slice(0, 5).map((e) =>
            `  ${[s(e.degree), s(e.field), s(e.school) && `at ${s(e.school)}`, s(e.end)].filter(Boolean).join(" ")}`
          ).join("\n")
        : "  none saved"),
  );
  if (certifications.length) {
    lines.push(
      "\nCERTIFICATIONS\n  " +
        certifications.slice(0, 8).map((c) => [s(c.name), s(c.issuer), s(c.year)].filter(Boolean).join(", ")).join("\n  "),
    );
  }

  // WHAT THEY ARE LOOKING FOR
  const want: string[] = [];
  const titles = list(prefs.desired_titles);
  if (titles.length) want.push(`desired titles: ${titles.join(", ")}`);
  const locs = list(prefs.desired_locations);
  if (locs.length) want.push(`desired locations: ${locs.join(", ")}`);
  const types = list(prefs.employment_types);
  if (types.length) want.push(`employment type: ${types.join(", ")}`);
  if (prefs.availability) want.push(`availability: ${s(prefs.availability)}`);
  if (prefs.start_date_availability) want.push(`can start: ${s(prefs.start_date_availability)}`);
  if (prefs.salary_min_usd) want.push(`minimum salary: ${s(prefs.salary_min_usd)} ${s(prefs.salary_currency) || "USD"}`);
  if (prefs.open_to_remote != null) want.push(`open to remote: ${prefs.open_to_remote ? "yes" : "no"}`);
  if (prefs.open_to_relocation != null) want.push(`open to relocation: ${prefs.open_to_relocation ? "yes" : "no"}`);
  const stages = list(prefs.company_stages);
  if (stages.length) want.push(`company stages: ${stages.join(", ")}`);
  lines.push(
    "\nWHAT THEY ARE LOOKING FOR\n" +
      (want.length ? want.map((w) => `  ${w}`).join("\n") : "  not set. Profile tab, What you are looking for group"),
  );

  // WORK ELIGIBILITY
  const elig: string[] = [];
  if (workAuth.citizenship) elig.push(`citizenship: ${s(workAuth.citizenship)}`);
  const countries = list(workAuth.countries);
  if (countries.length) elig.push(`can work in: ${countries.join(", ")}`);
  if (workAuth.work_authorized_us != null) elig.push(`authorized in the US: ${workAuth.work_authorized_us ? "yes" : "no"}`);
  if (workAuth.work_authorized_ca != null) elig.push(`authorized in Canada: ${workAuth.work_authorized_ca ? "yes" : "no"}`);
  if (workAuth.needs_sponsorship_now != null) elig.push(`needs sponsorship now: ${workAuth.needs_sponsorship_now ? "yes" : "no"}`);
  if (workAuth.needs_sponsorship_future != null) elig.push(`will need sponsorship later: ${workAuth.needs_sponsorship_future ? "yes" : "no"}`);
  if (workAuth.visa_type) elig.push(`visa: ${s(workAuth.visa_type)}`);
  if (workAuth.work_permit_expires) elig.push(`work permit expires: ${s(workAuth.work_permit_expires)}`);
  lines.push(
    "\nWORK ELIGIBILITY\n" +
      (elig.length ? elig.map((e) => `  ${e}`).join("\n") : "  not set. Profile tab, Work eligibility group"),
  );

  // SAVED JOBS AND SCORES
  if (jobs.length) {
    const jobLines = jobs.map((j) => {
      const m = bestScore.get(s(j.id));
      const head = `  ${s(j.title) || "untitled role"} at ${s(j.company) || "unknown company"}${s(j.location) ? `, ${s(j.location)}` : ""}`;
      if (!m) return `${head} — not scored yet`;
      const breakdown = (m.breakdown as Row) || {};
      const parts = Object.entries(breakdown)
        .filter(([, v]) => typeof v === "number")
        .map(([k, v]) => `${k} ${v}`)
        .slice(0, 6)
        .join(", ");
      return `${head} — match ${s(m.score)}/100${parts ? ` (${parts})` : ""}`;
    });
    lines.push(`\nSAVED JOBS (${jobs.length} most recent)\n${jobLines.join("\n")}`);
  } else {
    lines.push("\nSAVED JOBS\n  none saved yet. They save jobs from the Jobs tab or the browser extension");
  }

  // DISCOVERY AND PROPOSALS
  const disc: string[] = [
    `discoverable to employers: ${discoverable ? "yes" : "no, they are not indexed and cannot be recommended to anyone"}`,
  ];
  if (pending.length) {
    disc.push(`pending job proposals: ${pending.length}`);
    for (const p of pending.slice(0, 5)) {
      disc.push(
        `  ${s(p.job_title) || "role"} at ${orgNames.get(s(p.org_id)) || "a company"}${
          s(p.job_location) ? `, ${s(p.job_location)}` : ""
        }${s(p.employment_type) ? `, ${s(p.employment_type)}` : ""}${s(p.salary_range) ? `, ${s(p.salary_range)}` : ""}`,
      );
    }
  } else {
    disc.push("pending job proposals: none");
  }
  lines.push("\nDISCOVERY AND PROPOSALS\n" + disc.map((d) => `  ${d}`).join("\n"));

  // REMEMBERED FACTS
  const memories = arr(memRes?.data);
  if (memories.length) {
    lines.push(
      "\nTHINGS THEY TOLD YOU BEFORE\n  " +
        memories.map((m) => `${s(m.key)}: ${s(m.value)}`).join("\n  "),
    );
  }

  // GAPS TO NAME OUT LOUD
  const gaps: string[] = [];
  if (!hasResume) gaps.push("no resume, so you cannot judge fit properly. Profile tab, Your resume");
  if (!skills.length) gaps.push("no skills, so nothing can be matched. Profile tab, About you");
  if (!experiences.length) gaps.push("no work history, so you cannot speak to their background. Profile tab, Your experience");
  if (!titles.length) gaps.push("no desired titles, so you are guessing what they want. Profile tab, What you are looking for");
  if (!elig.length) gaps.push("no work eligibility, which employers filter on hard. Profile tab, Work eligibility");
  if (!discoverable) gaps.push("discovery is off, so employers cannot find them. Get discovered tab");
  if (gaps.length) {
    lines.push(
      "\nWHAT IS MISSING (say this plainly when it is relevant, point at the tab, do not guess around it)\n  " +
        gaps.join("\n  "),
    );
  }

  return {
    text: lines.join("\n"),
    hasResume,
    hasProfile,
    summary: {
      saved_jobs: jobs.length,
      scored_jobs: bestScore.size,
      pending_proposals: pending.length,
      discoverable,
      skills: skills.length,
    },
  };
}

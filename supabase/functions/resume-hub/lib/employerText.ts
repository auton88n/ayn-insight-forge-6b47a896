// v3.324.0 — extracted from index.ts (part of the ~58-action dispatcher
// split into per-domain files). All pure, no outer-scope closure
// dependency (no admin client, no userId) -- text/formatting helpers used
// wherever employer-facing AI output describes a role or a candidate:
// proposal drafting, candidate cards, assessment generation.
export const SENIORITY_LABEL: Record<string, string> = {
  intern: "intern", entry: "entry level", mid: "mid level", senior: "senior",
  staff_principal: "staff or principal", manager: "manager", director_plus: "director or above",
};
export const EMPLOYMENT_LABEL_FN: Record<string, string> = {
  full_time: "full time", contract: "contract", part_time: "part time", internship: "internship",
};

export function roleLine(spec: Record<string, unknown>): string {
  const title = String(spec?.title || "").trim() || "this role";
  const sen = SENIORITY_LABEL[String(spec?.seniority || "")] || "";
  if (!sen) return title;
  // Reproduced live: a job_spec.title of "Senior Wrenlathe Engineer" plus
  // seniority "senior" always prepended the label regardless, producing
  // "a senior Senior Wrenlathe Engineer" in drafted proposals -- most real
  // senior/staff/director/manager titles already say so themselves. Skip
  // prepending when the title already carries one of the seniority's own
  // words.
  const titleLower = title.toLowerCase();
  const senWords = sen.split(/\s+/).filter((w) => w !== "or" && w !== "level" && w !== "above");
  if (senWords.some((w) => titleLower.includes(w))) return title;
  return `${sen} ${title}`;
}

export function safeCard(c: Record<string, unknown>) {
  return {
    score: c.score, headline: c.headline, seniority: c.seniority,
    first_name: c.first_name || "", // v3.15.1 — first name only, never more.
    years_experience: c.years_experience, location: c.location,
    matched_must_haves: c.matched_must_haves, gaps: c.gaps, why: c.why,
    skills_extracted: c.skills_extracted, skills_inferred: c.skills_inferred,
    summary: typeof c.summary === "string" ? c.summary.slice(0, 900) : "",
  };
}

/** Strip markdown symbols and any internal ref that slipped into model text. */
export function cleanEmployerText(s: string, name = ""): string {
  const who = name ? name : "this candidate";
  return String(s || "")
    .replace(/[*_#`]/g, "")
    .replace(/\bcandidate\s+c\d+\b/gi, who)
    .replace(/\bc\d+\b/g, who)
    .replace(/[—–]/g, " to ")
    .trim();
}

export const VOICE_RULES = `- Plain prose. No markdown symbols, no asterisks, no bullet characters, no headings. Short sentences. NO EM DASHES, NO EN DASHES, EVER, NO EXCEPTIONS. Write ranges with the word "to".
- Never write an internal reference like c1 or c2. Refer to a candidate by their first name when one is given, otherwise say "this candidate". You do not know any last name, email or phone.
- Never praise without evidence from the data given. Never write perfect fit, huge asset, or exactly what you are looking for.
- If a fact is not in the data given, say that one fact is not available.  Never guess.
- Must not read as AI-generated. No telltale AI phrasing, no uniform sentence rhythm, no overused connector words. Write like an actual person would.`;

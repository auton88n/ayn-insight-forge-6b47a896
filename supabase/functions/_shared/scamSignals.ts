// v3.197.0 — a real listing must never reach a seeker even once before
// being checked, but the AI-based closure checker (job-checker/) only ever
// runs on candidates that have already aged past FRESHNESS_DAYS or the
// spot-check window — a brand-new listing is fully visible in Browse Jobs
// the instant it's ingested, with no check at all for days. Running the
// real checker on every incoming job (up to ~2000/cycle) would be far too
// slow and costly. This is the cheap alternative: a plain keyword check
// against text AYN already has in memory at ingestion (no extra fetch, no
// extra AI call), run on every row before it's ever inserted.
//
// A first version matched bare vocabulary ("gift card", "western union")
// and, checked against real live production data before being trusted,
// produced two confirmed false positives on real, well-known companies:
// Twilio's own posting contained its own anti-fraud disclaimer ("we will
// never ask for payment, gift cards..."), and a Hy-Vee retail posting
// listed "Western Union" and "money order machine" as real in-store
// equipment a Service Manager uses, neither a request aimed at the
// applicant. Rewritten around that lesson: every pattern below requires an
// actual request shape (a verb directed at the applicant, e.g. "send",
// "pay", "provide your") rather than bare vocabulary, AND the whole
// document is skipped outright if it contains its own anti-scam warning —
// exactly the shape a real employer disclaimer takes.
const NEGATION_PATTERNS: RegExp[] = [
  /\bwe will never ask\b/i,
  /\bwill not ask\b/i,
  /\bnever ask you\b/i,
  /\bdo not (provide|send|give) your\b/i,
  /\bbeware of (scam|fraud)/i,
  /\b(recruitment|job|hiring) scam\b/i,
  /\bfraud (alert|warning)\b/i,
  /\bprotect yourself from\b/i,
  /\breport (this|any) (scam|fraud)/i,
];

const SCAM_PHRASES: Array<{ phrase: RegExp; reason: string }> = [
  { phrase: /\b(send|pay|wire) (us |a |the )?(a )?processing fee\b/i, reason: "asks the applicant to send a processing fee" },
  { phrase: /\b(send|pay|wire) (us |a |the )?(a )?registration fee\b/i, reason: "asks the applicant to send a registration fee" },
  { phrase: /\bwire (us|your)\b.{0,15}\b(transfer|payment|deposit|fee)\b/i, reason: "asks the applicant to wire money" },
  { phrase: /\b(send|pay|purchase|buy) .{0,20}gift cards?\b/i, reason: "asks the applicant to send or buy gift cards" },
  { phrase: /\b(purchase|buy) (your own|a) (starter kit|equipment)\b/i, reason: "asks the applicant to buy their own starter kit or equipment" },
  { phrase: /\bno interview (is )?(necessary|required)\b/i, reason: "claims no interview is necessary" },
  { phrase: /\bwithout an interview\b/i, reason: "claims hiring happens without an interview" },
  { phrase: /\b(provide|send) your social security number\b.{0,60}\b(before|to (begin|start))\b/i, reason: "asks for a social security number before starting" },
  { phrase: /\b(provide|send) your (ssn|social security)\b.{0,40}\bbefore (we|your) interview\b/i, reason: "asks for a social security number before an interview" },
  { phrase: /\bprovide your bank account\b.{0,40}\brouting number\b/i, reason: "asks the applicant to provide bank account and routing number upfront" },
];

export function detectScamSignal(description: string, title?: string): { suspected: boolean; reason: string | null } {
  const text = `${title ?? ""}\n${description ?? ""}`;
  if (NEGATION_PATTERNS.some((p) => p.test(text))) return { suspected: false, reason: null };
  for (const { phrase, reason } of SCAM_PHRASES) {
    if (phrase.test(text)) return { suspected: true, reason: `Automated check: ${reason}.` };
  }
  return { suspected: false, reason: null };
}

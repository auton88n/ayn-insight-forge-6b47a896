// v3.163.0 — inbox message safety screening. Rules-only, deliberately no AI
// call here: the founder flagged AI screening as a real, recurring cost at
// volume, and the honest answer is that plain pattern matching already
// catches the overwhelming majority of real abuse (a phone number, an
// email address, a known off-platform app, a non-allowlisted link all have
// a predictable shape) for zero ongoing cost. If a real gap shows up in
// practice that rules alone can't catch, an AI pass belongs here later —
// scoped to only the messages these rules already flag as borderline, not
// run on every message.
//
// A message that fails any check is never delivered — inbox_send stores it
// with status 'blocked' (visible to the employer, who sent it, for their
// own record) and the candidate-facing RLS policy on inbox_messages
// already refuses to return anything but status = 'sent', so this is
// enforced at the data layer, not just by the caller remembering to check.

// No allowlist here on purpose, not an oversight — a call link now only
// ever comes from the dedicated "Schedule a call" action (never typed into
// a message), and the two other legitimate reasons someone might want to
// paste a link — the company's own website, the job posting itself — are
// both already shown to the candidate elsewhere on the proposal (org_website,
// job_url), so there's no real remaining case a message needs a link for.
// Simpler and safer to block every link in a message body outright than to
// try to allowlist arbitrary real company domains.
const OFF_PLATFORM_APPS = [
  "whatsapp", "telegram", "signal app", "wechat", "skype", "discord",
  "kik", "viber", "line app", "snapchat",
];

const OFF_PLATFORM_PHRASES = [
  "text me at", "call me at", "reach me at", "contact me outside",
  "email me directly", "let's talk outside", "talk off the platform",
  "off this app", "outside of ayn", "outside the app",
  "message me on", "add me on", "find me on",
];

const PHONE_RE = /(?:\+?\d[\s.-]?){9,15}/;
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
// http(s) URLs and bare domain-shaped tokens (e.g. "meet.google.com" typed
// without a scheme) — both get the same allowlist check.
const URL_RE = /\bhttps?:\/\/[^\s]+/gi;
const BARE_DOMAIN_RE = /\b[a-z0-9-]+(?:\.[a-z0-9-]+)+\.[a-z]{2,}\b/gi;

export interface ScreeningResult {
  ok: boolean;
  reason?: string;
}

/**
 * Checked on every inbox message body, regardless of sender — candidates
 * can't post links either (rule 4.b in the spec: only the dedicated
 * schedule-a-call action ever produces a call link).
 */
export function screenMessageBody(body: string): ScreeningResult {
  const text = (body || "").trim();
  if (!text) return { ok: false, reason: "Message is empty." };

  const urlMatches = text.match(URL_RE) || [];
  const bareMatches = text.match(BARE_DOMAIN_RE) || [];
  if (urlMatches.length || bareMatches.length) {
    return { ok: false, reason: "Links can't be shared in messages. Use \"Schedule a call\" for a real, verified call link — the company's website and the job posting are already shown on this conversation." };
  }

  if (PHONE_RE.test(text)) {
    return { ok: false, reason: "Contains what looks like a phone number. To protect both sides, phone numbers can't be shared through AYN messages." };
  }

  if (EMAIL_RE.test(text)) {
    return { ok: false, reason: "Contains what looks like an email address. Keep the conversation in AYN so it stays protected." };
  }

  const lower = text.toLowerCase();
  for (const app of OFF_PLATFORM_APPS) {
    if (lower.includes(app)) {
      return { ok: false, reason: `Mentions ${app}, an outside messaging app. Conversations need to stay inside AYN to stay protected.` };
    }
  }
  for (const phrase of OFF_PLATFORM_PHRASES) {
    if (lower.includes(phrase)) {
      return { ok: false, reason: "Sounds like it's asking to move the conversation outside AYN, which AYN can no longer protect once you do." };
    }
  }

  return { ok: true };
}

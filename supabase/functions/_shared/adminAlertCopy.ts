import { wrapEmail, heading, para, escapeHtml, ctaButton } from "./emailTemplate.ts";

// Deterministic copy only: never send log text, request data or identifiers
// to an AI service or echo them into the founder's email.
type ErrorEvent = { error_message?: string | null; endpoint?: string | null; source?: string | null; severity?: string | null; created_at?: string | null };
type SecurityEvent = { action?: string | null; severity?: string | null; created_at?: string | null };
type Explanation = { key: string; title: string; meaning: string; next: string };
const ADMIN_URL = "https://ayn.careers/manage-bae76e99d97e188b";

function recordedTime(events: { created_at?: string | null }[]): string {
  const times = events.map(e => e.created_at ? Date.parse(e.created_at) : NaN).filter(Number.isFinite);
  if (!times.length) return "The recording time is unavailable. Full records are kept in admin.";
  const date = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dubai", day: "numeric", month: "long", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  }).format(new Date(Math.max(...times)));
  return `Latest recorded event: ${date} (Dubai time).`;
}

function area(event: ErrorEvent): string {
  const path = (event.endpoint || "").split("?")[0].toLowerCase();
  if (/\/jobs(?:\/|$)|#(?:search|saved-jobs)/.test(path)) return "Job pages";
  if (/resume|tailor|cover-letter|optim/.test(path)) return "Resume tools";
  if (/billing|payment|checkout/.test(path)) return "Payments";
  if (/auth|sign-in|login/.test(path)) return "Sign-in";
  if (/employer/.test(path)) return "Employer tools";
  return event.source === "backend" ? "An AYN request" : "An AYN page";
}

function explainError(event: ErrorEvent): Explanation {
  const message = event.error_message || "";
  const affected = area(event);
  if (/dynamically imported module|loading chunk|chunkloaderror|importing a module script/i.test(message)) {
    return { key: `page-code:${affected}`, title: `${affected} could not open`,
      meaning: "Part of AYN’s browser code could not load. This can happen with an older open tab after an update, a missing website file, or a connection problem. The log alone does not tell us which caused it.",
      next: "Open the affected page in a fresh tab. If it still fails, have the website loading and deployment checked. Save any unfinished work before refreshing." };
  }
  if (/timeout|timed out|deadline exceeded/i.test(message)) {
    return { key: `timeout:${affected}`, title: `${affected} took too long to respond`,
      meaning: "An operation did not finish within its time limit. The record does not establish whether the delay came from AYN or a service it uses.",
      next: "Check the affected feature. Before repeating a paid action, check whether its result or payment already completed." };
  }
  if (/failed to fetch|networkerror|network error|fetch failed/i.test(message)) {
    return { key: `connection:${affected}`, title: `${affected} could not connect`,
      meaning: "A request could not complete over the network. This does not by itself mean the whole website is down.",
      next: "Check the affected feature and its service connection. Before repeating a paid action, check whether it already completed." };
  }
  return { key: `unknown:${affected}`, title: `${affected} reported a problem`,
    meaning: "An operation reported an error. We cannot reliably explain its cause from this message alone.",
    next: "Open System → Errors in admin and have the full record investigated. You can forward this email to the person maintaining AYN." };
}

function sections(explanations: Explanation[]): string {
  const unique = [...new Map(explanations.map(e => [e.key, e])).values()];
  return unique.slice(0, 5).map(e =>
    para(`<strong>What happened: ${escapeHtml(e.title)}</strong>`, { marginTop: 20 }) +
    para(`<strong>What it means:</strong> ${escapeHtml(e.meaning)}`) +
    para(`<strong>What to do:</strong> ${escapeHtml(e.next)}`)
  ).join("") + (unique.length > 5 ? para("Additional issues are recorded in admin.", { muted: true }) : "");
}

export function buildErrorAlertEmail(events: ErrorEvent[]): { subject: string; html: string } {
  const ordered = [...events].sort((a, b) => Number(b.severity === "critical") - Number(a.severity === "critical"));
  const explanations = ordered.map(explainError);
  const urgent = events.some(e => e.severity === "critical");
  return {
    subject: `AYN: ${urgent ? "urgent review needed — " : ""}${explanations[0]?.title || "a website issue needs review"}`,
    html: wrapEmail(
      heading(urgent ? "Please investigate this promptly" : "A website issue needs review") +
      sections(explanations) +
      para("This email describes recorded failures, not a live health check. It does not confirm whether the issue is still happening or has been fixed.", { marginTop: 20 }) +
      para(escapeHtml(recordedTime(events)), { muted: true }) +
      para("Full technical details are kept in System → Errors in admin.", { muted: true }),
      ["The AYN system"], ctaButton(ADMIN_URL, "Open AYN admin"),
    ),
  };
}

export function buildSecurityAlertEmail(events: SecurityEvent[], repeated = false): { subject: string; html: string } {
  const urgent = events.some(e => e.severity === "critical");
  const deniedAdmin = events.some(e => e.action === "admin_action_denied");
  const title = deniedAdmin ? "An admin action was refused" : repeated ? "Repeated security activity needs review" : "Security activity needs review";
  return {
    subject: `AYN: ${urgent ? "urgent review needed — " : ""}${title}`,
    html: wrapEmail(
      heading(title) +
      para(`<strong>What happened:</strong> ${deniedAdmin ? "AYN recorded an attempt to perform an admin action without the required permission." : repeated ? "AYN recorded repeated security events associated with the same account or connection." : "AYN recorded a security event that requires attention."}`) +
      para("<strong>What it means:</strong> This is a reason to investigate, not proof that AYN was hacked or that anyone’s information was exposed.") +
      para(`<strong>What to do:</strong> ${urgent ? "Investigate promptly. " : ""}Ask the person maintaining AYN to review the full security records and establish what was attempted and whether it succeeded. Do not assume that a refused action means every related attempt was blocked.`) +
      para("Account identifiers, connection addresses and full technical details stay in AYN’s security logs, rather than this email. Email delivery history is available under System → Email in admin.", { marginTop: 20, muted: true }) +
      para(escapeHtml(recordedTime(events)), { muted: true }) +
      para("This alert does not confirm that the activity has stopped.", { muted: true }),
      ["The AYN system"], ctaButton(ADMIN_URL, "Open AYN admin"),
    ),
  };
}

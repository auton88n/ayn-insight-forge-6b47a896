// v3.44.0 — shared branded email shell, matching the "Charcoal & Ember"
// design system used everywhere else in the product (src/index.css's .lp
// tokens). One copy of the card/CTA/footer markup so every transactional
// email (auth, billing, proposals, assessments) looks like the same
// product instead of drifting template by template.
const FONT_STACK = "-apple-system,Segoe UI,Inter,Helvetica,Arial,sans-serif";
const EMBER = "#e85d3a";
const INK = "#0b0b0c";
const BODY_TEXT = "#3d3733";
const MUTED = "#8a8178";
const BORDER = "#ece5da";
const PAGE_BG = "#faf7f2";

// Any user-authored text (job titles, company names, proposal messages)
// must go through this before landing in an email body. Same rule as
// admin-broadcast's escapeHtml, same reason: v3.40.0 found a real HTML
// injection because an admin-authored field skipped exactly this step.
export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// v3.115.0 — every real email was ending straight from its last sentence
// into the copyright line, with nothing in between reading like it came
// from a person or a team. signatureLines defaults to a plain "The AYN
// Team" sign-off, rendered the same muted style para() already uses.
// Callers that build their own sign-off (admin-inbox-reply's per-identity
// signatures) pass null to skip this one, so an email never ends up with
// two signatures stacked on top of each other.
export function signatureBlock(lines: string[] = ["Sincerely,", "The AYN Team"]): string {
  return `<p style="color:${MUTED};line-height:1.7;margin:24px 0 8px;font-size:13px;">${lines.map(escapeHtml).join("<br/>")}</p>`;
}

// v3.116.0 — the header used to spell out "AYN" as plain bold text with a
// manual ember underline. Replaced with the real logo lockup (the black
// triangular mark plus the "YN" wordmark), served from a stable public/
// path since email clients cannot load a Vite-hashed bundle asset.
const LOGO_URL = "https://ayn.careers/ayn-email-logo.png";

export function wrapEmail(
  content: string,
  signatureLines: string[] | null = ["Sincerely,", "The AYN Team"],
  ctaHtml: string = "",
): string {
  // v3.116.0 — the signature used to sit after the whole content block,
  // which put it below any CTA button embedded at the end of that block
  // (every template built its button as the last line of `content`).
  // Callers now pass the button separately so it renders after the
  // signature instead of before it.
  const sig = signatureLines ? signatureBlock(signatureLines) : "";
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:${PAGE_BG};font-family:${FONT_STACK}">
  <div style="max-width:560px;margin:0 auto;padding:32px 16px;">
    <div style="background:#ffffff;border-radius:16px;border:1px solid ${BORDER};padding:36px 32px;">
      <div style="margin-bottom:28px;">
        <img src="${LOGO_URL}" alt="AYN" height="30" style="display:block;height:30px;width:auto;border:0;">
      </div>
      ${content}
      ${sig}
      ${ctaHtml}
    </div>
    <p style="font-size:12px;color:${MUTED};margin:20px 4px 0;text-align:center;">
      © ${new Date().getFullYear()} AYN AI. All rights reserved.
    </p>
  </div>
</body>
</html>
`;
}

export function ctaButton(url: string, text: string): string {
  return `
<div style="text-align:center;margin:32px 0 8px;">
  <a href="${url}" style="display:inline-block;background:${EMBER};color:#ffffff;padding:14px 40px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;">
    ${text}
  </a>
</div>
`;
}

export function heading(text: string): string {
  return `<h1 style="color:${INK};font-size:22px;margin:0 0 20px;font-weight:600;">${text}</h1>`;
}

export function para(text: string, opts?: { muted?: boolean; marginTop?: number }): string {
  const color = opts?.muted ? MUTED : BODY_TEXT;
  const size = opts?.muted ? 13 : 15;
  const mt = opts?.marginTop ?? 0;
  return `<p style="color:${color};line-height:1.7;margin:${mt}px 0 8px;font-size:${size}px;">${text}</p>`;
}

// Small key/value receipt-style row, used by the payment receipt email.
export function receiptRow(label: string, value: string): string {
  return `
<div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid ${BORDER};font-size:14px;">
  <span style="color:${MUTED};">${label}</span>
  <span style="color:${INK};font-weight:600;">${value}</span>
</div>
`;
}

// Best-effort send. Never throws — a Resend failure must never break the
// action (proposal sent, credits granted, assessment submitted) that
// triggered the notification. Callers should still log a failed result.
export async function sendBrandedEmail(
  to: string,
  subject: string,
  html: string,
): Promise<{ ok: boolean; error?: string }> {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return { ok: false, error: "RESEND_API_KEY not configured" };
  if (!to) return { ok: false, error: "no recipient email" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      // v3.160.0 — self-hosted's Resend account only has support.ayn.careers
      // verified as a domain (the plan's 1-domain limit); ayn.careers itself
      // was never registered there, so this send-from moved to the
      // subdomain that's actually verified rather than pay for a second
      // domain slot. Affects every caller of sendBrandedEmail: resume-hub's
      // proposal/assessment notifications, stripe-webhook's receipts, and
      // error-alert-check.
      body: JSON.stringify({ from: "AYN <noreply@support.ayn.careers>", to: [to], subject, html }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `${res.status}: ${text.slice(0, 300)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

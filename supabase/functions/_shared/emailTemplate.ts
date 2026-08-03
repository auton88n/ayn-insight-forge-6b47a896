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

export function wrapEmail(content: string): string {
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
        <span style="font-weight:800;font-size:22px;letter-spacing:-0.02em;color:${INK};">AYN</span>
        <div style="width:36px;height:3px;background:${EMBER};border-radius:2px;margin-top:8px;"></div>
      </div>
      ${content}
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
      body: JSON.stringify({ from: "AYN <noreply@mail.aynn.io>", to: [to], subject, html }),
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

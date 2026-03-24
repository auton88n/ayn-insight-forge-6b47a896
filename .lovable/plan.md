

# Fix Branding for Custom Order Emails & PDF Contracts

## Summary

Redesign the 3 edge functions for premium, professional branding, fix the build error in ClientSign.tsx, and create the missing `send-contract-pdf` edge function.

---

## 1. Fix Build Error in ClientSign.tsx

**Problem**: Line 257-258 has `.map((s, i) => (` followed by `{s.description...` — the parenthesis starts JSX context but the curly brace is interpreted as an object literal, not a ternary expression.

**Fix**: Change `=> (` to `=>` (no parenthesis) so the ternary is treated as a JS expression, not JSX.

---

## 2. Redesign `send-contract-email` (Contract Email to Client)

**Current issues**:
- Logo is just text `<h1>AYN</h1>` — no visual logo (SVG won't render in email clients)
- Design is plain and not premium

**Changes**:
- Replace SVG logo with a **text-based logo** using bold typography and a decorative divider line (email-safe approach — no images needed)
- Redesign the email layout to be premium: refined spacing, elegant service table using inline table styles, subtle borders
- Add conditional payment button: show "Complete Payment" CTA only when `order.status !== 'paid'`; when paid, show a green "PAID" confirmation badge
- Format the description text with line-break handling (replace `\n` with `<br>`)
- Polish footer with proper branding

---

## 3. Create Missing `send-contract-pdf` Edge Function

**Problem**: The `CustomOrders.tsx` component calls `send-contract-pdf` but this edge function doesn't exist.

**Create**: A new edge function that sends a confirmation/receipt email after payment or signing. It will:
- Verify admin auth
- Fetch the order
- Send a branded confirmation email via Resend with "PAID" status
- Include contract PDF link if available
- Same premium design language as `send-contract-email` but with a "Payment Confirmed" theme

---

## 4. Redesign `generate-contract-pdf` (HTML for Ctrl+P PDF)

**Current issues**:
- Looks like a messy receipt, not a formal service agreement
- Description text shows raw unformatted content
- Payment button shows even when already paid

**Changes**:
- Redesign as a formal, multi-section document with clear visual hierarchy:
  - Numbered article sections (1. Parties, 2. Scope of Work, 3. Services & Pricing, etc.)
  - Professional typography with serif-style headings
  - Clean table with proper borders and alternating rows
  - Formal legal footer
- Format description text: convert `\n` to `<br>`, strip markdown artifacts
- Conditional payment section: show "Pay Now" box only when `order.status !== 'paid'`; when paid, show a "PAID IN FULL" stamp/badge
- Proper print-optimized CSS (`@media print`, `@page` margins, page-break controls)
- Clean signature blocks with formal labels

---

## 5. Deploy Edge Functions

After all 3 edge functions are updated/created, deploy them. Also register `send-contract-pdf` in `supabase/config.toml`.

---

## Technical Details

**Logo approach for emails**: Since SVG and external images are unreliable in email clients, use pure HTML/CSS text: a large bold "AYN" heading with letter-spacing and a thin horizontal rule — guaranteed to render everywhere.

**Description formatting helper**: Both email and PDF will use a shared approach — split on `\n`, strip markdown (`**`, `#`, backticks, pipe chars), join with `<br>` tags.

**Paid vs unpaid logic**: Check `order.status === 'paid'` to conditionally render either the payment CTA or a confirmation badge.

**Files to modify/create**:
- `src/pages/ClientSign.tsx` — fix build error (line 257-258)
- `supabase/functions/send-contract-email/index.ts` — redesign email
- `supabase/functions/generate-contract-pdf/index.ts` — redesign PDF HTML
- `supabase/functions/send-contract-pdf/index.ts` — create new function
- `supabase/config.toml` — register new function


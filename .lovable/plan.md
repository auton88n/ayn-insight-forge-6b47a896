# AI-Powered Business Document Generator — Admin Tool

## Summary

Add a new admin panel tab "Document Studio" that lets you describe what you need in plain text, and AI generates a professional PDF document with full AYN branding (brain icon + AYN text, blue divider, report reference number, date — matching the uploaded image style).

## What You Get

- A new "Document Studio" tab in the admin sidebar
- Text input where you describe what you want (business plan, deal memo, letter, brainstorming doc, etc.)
- Document type selector: Business Plan, Deal Memo, Letter, Brainstorming, Report, Proposal
- AI generates structured content with proper sections, then renders it as a branded PDF
- PDF matches the uploaded image: brain icon + "AYN" header, report reference badge,and clean typography
- Download button for the generated PDF
- History of previously generated documents

---

## Technical Plan

### 1. Create Edge Function: `generate-business-document`

- Accepts: `{ prompt, documentType, language }` from admin
- Uses Lovable AI Gateway (`google/gemini-3-flash-preview`) with tool calling to extract structured sections (title, sections with headings + content + optional bullet lists)
- Generates an HTML document styled to match the AYN branding from the image:
  - Brain SVG icon + "AYN" text in header (left)
  - Report reference + date (right)
  - Blue horizontal divider
  - Clean serif/sans-serif body with proper heading hierarchy
  - `@media print` + `@page` CSS for Ctrl+P PDF saving
- Returns the HTML as a response (same pattern as `generate-contract-pdf`)
- Auth: requires admin role (JWT + user_roles check)

### 2. Create Admin Component: `DocumentStudio.tsx`

- UI with:
  - Document type dropdown (Business Plan, Deal Memo, Letter, Brainstorming, Report, Proposal)
  - Large textarea for the user's prompt/description
  - "Generate" button that calls the edge function
  - Loading state with progress indicator
  - Preview panel showing the generated document in an iframe
  - "Download as PDF" button (opens in new tab for Ctrl+P, same as contract PDF flow)
- Follows existing admin component patterns (card-based layout, motion animations)

### 3. Register in Admin Panel

- Add `'document-studio'` to `AdminTabId` type in `AdminSidebar.tsx`
- Add sidebar entry with `FileText` or `Scroll` icon in the AI sections
- Add the tab rendering in `AdminPanel.tsx`
- Import and render `DocumentStudio` component

### 4. Register Edge Function

- Add `[functions.generate-business-document]` with `verify_jwt = false` to `supabase/config.toml`

---

## Files to Create/Modify


| File                                                     | Action                                |
| -------------------------------------------------------- | ------------------------------------- |
| `supabase/functions/generate-business-document/index.ts` | Create — AI + branded HTML generation |
| `src/components/admin/DocumentStudio.tsx`                | Create — admin UI component           |
| `src/components/admin/AdminSidebar.tsx`                  | Edit — add tab ID + sidebar entry     |
| `src/components/AdminPanel.tsx`                          | Edit — import + render DocumentStudio |
| `supabase/config.toml`                                   | Edit — register new function          |


## Branding Details (from uploaded image)

The PDF will replicate the exact style:

- Header: Brain SVG (inline, ~28px) + bold "AYN" text (48px, black, tight letter-spacing)
- Top-right: "Report: AYN-XXXXXXXX" + "Date: Month DD, YYYY" in small gray text
- Blue divider line (3px, #2563eb) below header
- Document title in bold navy, underlined
- Section headings in bold, clean hierarchy
- Bullet lists with proper indentation
- Clean white background, professional spacing
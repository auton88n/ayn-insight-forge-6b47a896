## What gets delivered

Three things, all built from the existing AYN mark and brand palette (ink #0B0B0C, ember #F97015, paper white, Outfit for headings, Inter for body).

### 1. Investor deck, PowerPoint (.pptx)

Roughly 12 slides, dark ink base with ember accents, one visual element per slide, no bullet-only slides.

1. Title. AYN AI, the line "A resume tailored to every job you apply to", founder name and site.
2. The problem. Generic resumes into automated screening, both sides waste time.
3. What AYN is. Two sides of one product, seeker and employer.
4. Seeker side. Chrome extension reads the real job posting, scores the fit, tailors resume and cover letter. Resume Hub holds one profile, one resume, saved jobs, proposals.
5. Employer side. Described role becomes a structured spec, candidate search over people who opted in, three best fits with the evidence, assessments and proposals.
6. Why it is defensible. Job description grounding: the six tier resolver and quality score, so the model never judges a job from a nav bar.
7. Matching, how it works. Deterministic prefilter, vector recall, grounded rerank, skills tagged extracted or inferred, candidates never invented.
8. Consent and contact release. Nothing is revealed until the candidate accepts. This is a real trust asset for an investor.
9. Market and focus. US and Canada, English, job seekers plus small to mid employers.
10. Business model. The four plan tiers and credits, exactly as the product prices them today.
11. Traction. Numbers I will not invent. Every figure is a visibly marked placeholder such as [SIGNUPS TO DATE, replace] until you give me real ones, or I pull live counts from the database if you want me to.
12. Ask and use of funds. Placeholder amount and allocation for you to fill in.

### 2. Business card

Print ready PDF at 3.5 in by 2 in with 0.125 in bleed and crop marks, plus a PNG preview to look at in chat.

- Front: AYN mark on ink, the wordmark, and the tagline line.
- Back: FOUNDER, GHAZI ALDHYAEI, ghazi@aynn.io, +1 416 660 9926, aynn.io, and a QR code to aynn.io.

### 3. Brand assets in Supabase, private bucket

- Create a private storage bucket `brand`.
- Upload: `ayn-mark.svg`, plus PNG renders at 64, 128, 256, 512 and 1024 px with transparent backgrounds, plus a wordmark lockup and a one page brand sheet recording the palette and fonts.
- RLS on `storage.objects`: read restricted to admins via `has_role(auth.uid(),'admin')`, writes service role only. Nothing public, as you chose.
- Because the bucket is private, the deck and card embed the images directly rather than linking to them, so they render for anyone you send them to.

## Technical notes

- Deck built with pptxgenjs, images embedded as base64 so PDF conversion and visual QA work.
- Card built as a vector PDF so it prints sharp at any size.
- QA: every slide and both card faces get converted to images and inspected before delivery, and I will tell you what I found and fixed.
- Files land in /mnt/documents so you can download them: `ayn-investor-deck.pptx`, `ayn-business-card.pdf`, `ayn-business-card-preview.png`.
- Writing rules respected throughout: no em dashes, no en dashes, ranges written with "to".
- No app code changes. The only project change is the storage migration for the `brand` bucket and its policies.

## What I need from you

Nothing to start. Two things will stay as marked placeholders until you fill them in: traction numbers and the funding ask. Tell me if you would rather I pull real counts (accounts, employers, proposals, assessments) from the live database for the traction slide instead.

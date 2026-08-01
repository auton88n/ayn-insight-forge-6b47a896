## Goal

Rewrite the landing page as a calm, premium, high conversion page. Same product, sharper positioning, fewer words, one new proof section. No claims we cannot back, no invented customers or numbers.

## Voice rules

- Calm and premium. Quiet confidence, no hype words, no exclamation marks.
- Headline: one idea, under 9 words. Lead: one sentence, 12 to 16 words.
- Card copy under 14 words. Bullets under 9 words.
- No em dashes, no en dashes, ranges use "to".
- Every claim maps to something the product actually does.

## Part A, hero

Both audiences keep the switch, the single CTA and the small note, and get a tighter promise.

- Seeker headline moves from "Stop rewriting your resume for every single job." to a calmer, more premium line in the same rhythm, with the emphasis word carried by the existing `<em>`.
- Seeker lead states the outcome in one line, not the mechanism.
- Employer headline keeps the "three, not six hundred" contrast but loses the shouty framing.
- Notes shortened to a half line each.
- Add a quiet second action under the primary CTA ("See how it works", scrolls to the new proof section). Text link styling, not a second button, so the page keeps one clear action.

## Part B, new section, before and after proof

A new section placed directly under the hero, seeker mode only, employer mode keeps the current flow.

- Two panels side by side: "Your resume" and "Your resume, for this job".
- The left panel shows three flat generic lines, greyed. The right shows the same three lines rewritten against a posting, with the changed phrases quietly highlighted in ember.
- A single caption under the pair: one line, states that nothing was invented, only reordered and reworded.
- Built as a new component in `src/components/landing/AppMockups.tsx` style, rendered from `LandingSections.tsx`. Static markup, no data, no backend.
- Mobile: panels stack, left panel collapses to a short preview so the interesting half stays above the fold.

## Part C, tighten the existing sections

Copy only, in `src/components/landing/LandingSections.tsx`.

- PAIN: keep the three lines per audience, cut the lead to a single calm sentence.
- SEEKER_TILES: six titles rewritten as noun phrases rather than sentences, descriptions cut to one short line, meta chips trimmed to four each.
- EMPLOYER_STEPS: verbs first, one line each.
- TRUST: title and lead calmer, chips shortened to three words each.
- FAQS: keep all twelve questions, answers cut to two sentences maximum, phrased plainly.
- Closing section: one line and one button.

## Part D, remove what does not earn its place

- The logo and marks strip above the fold repeats what the tiles already say. Keep it, but as a single quiet line of names, no chips, no label duplication.
- Any sentence that only restates its heading gets deleted rather than reworded.
- No new sections beyond the before and after panel, so the page stays short.

## Technical notes

- Files touched: `src/components/landing/LandingSections.tsx` (copy plus one new section), `src/components/landing/AppMockups.tsx` (the before and after panels), `src/index.css` (styles for the new section, using existing `lp-` tokens and the ember accent).
- No props, state, routing, backend or SEO schema changes. The FAQ schema in `src/components/LandingPage.tsx` gets its answers matched to the new FAQ wording so structured data and page text agree.
- Nothing in `docs/map/*` changes, since no seam changes.

## Verification

Screenshot the page in both audience modes at desktop and mobile widths, confirm no card runs past three rendered lines, and confirm the before and after section reads clearly on a 390px viewport.

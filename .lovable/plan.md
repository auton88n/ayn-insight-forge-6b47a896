## Goal

Redo both artifacts so they match the landing page look: white/paper background, ember orange accents, Outfit headings with Inter body, generous whitespace.

## Design tokens taken from the landing page

- Paper white background #FFFFFF, warm paper #FAF8F3 for alternating bands
- Ink #221C1A for text, muted grey for captions
- Ember #E85D3A as the single accent, with the ember gradient to #F0803C for bars and highlights
- Hairline borders in warm grey, soft lift shadows on cards
- Outfit for headings and numbers, Inter for body

## Deck, ayn-investor-deck-v2.pptx

Same 12 slides and same real numbers as the current deck, restyled:

- All slides on white, no dark sandwich. Section dividers use the warm paper tint instead of dark.
- Title slide: AYN full logo top left, big Outfit headline, one ember underline block, quiet footer line.
- Content slides: left column headline plus body, right column a card grid, stat callouts, or a simple diagram. Every slide keeps a visual element.
- Motif carried across every slide: ember pill eyebrow label at top left, thin ember rule at the bottom, page number bottom right.
- Stats in large Outfit numerals in ember with small ink labels.
- Logo mark in the corner of each slide, sourced from the brand PNGs already saved in Supabase.

## Business card, ayn-business-card-v2.pdf

- Front: white background, full AYN logo (mark plus wordmark) in the top left, name and title lower left, thin ember rule, keep 0.125in bleed and safe margins.
- Back: white background, AYN icon mark centred, nothing else except a small ember hairline or tagline if it stays balanced.
- Contact details move to the front under the name so the back stays a clean mark.

## Verification

Render every deck slide and both card faces to images and inspect each one for overflow, overlap, contrast and margins, fix and re-render until clean, then report what I checked.

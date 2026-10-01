# Match the social share image to the AYN favicon

## What will change
- Replace the outdated brain graphic in the social share image with the exact black-and-orange AYN mark already used in the current favicon. Keep it centered and large enough to read in link previews, on a simple solid backdrop, at the existing 1200 × 630 share size.
- Make the static social tags and the page-level share tags point to the same new image so sharing from different pages does not alternate between old and new artwork.
- Check the actual image and rendered share tags after the change.

## What will not change
- The favicon itself, AYN's on-page design, layout, colors, and app behavior will stay as they are.
- No new logo or interpretation of the mark will be created; the current favicon artwork is the source.

## Technical details
- Render the current `public/favicon.png` into a share-sized image in `public/` without stretching or redesigning the mark. Replace the existing obsolete `og-image.png` and `og-image.jpg` consistently if both are still referenced.
- Align the image references in `index.html` and `src/components/shared/SEO.tsx`, preserving the site's other metadata. Use a new image URL version so platforms can fetch the replacement after publication.
- A social platform may continue showing a previously fetched preview until it re-scrapes the URL. The live link changes only after the updated site is published.

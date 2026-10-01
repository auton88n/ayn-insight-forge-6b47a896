# Fix the social media share preview

## What is actually wrong

The share-preview image (`og-image.png`, 1200x630) is already the AYN brand icon, and both live domains serve the exact same correct file today. The tags in `index.html` and `SEO.tsx` already point at it.

So the image is not the problem. What keeps showing an old preview:

1. **Crawler cache.** WhatsApp, LinkedIn, X, Slack, iMessage store the first preview they ever fetched for a URL and keep showing it until the image URL itself changes.
2. **Publish state.** The live URL serves the last published build. If the icon-based share image has not been published since it was made, the live page still serves whatever came before it.

## The fix (small, frontend only)

1. In `index.html`: change the `og:image` and `twitter:image` URLs from `?v=3` to a fresh cache-buster `?v=4`.
2. In `src/components/shared/SEO.tsx`: change `DEFAULT_IMAGE` from `?v=3` to `?v=4` the same way, so every page's share tags pick it up.
3. No image regeneration, no new asset: the existing icon image is correct and verified.

## After the code change

- The change reaches the live URL only on the next **publish**. Nothing changes at the shared link until then.
- After publishing, platforms may still show their cached copy for a while. Force a fresh scrape with each platform's own link-preview debugger (LinkedIn Post Inspector, X Card Validator, or re-pasting in WhatsApp) to see the icon immediately.

## Verification

- Confirm the served image at the new `?v=4` URL is the icon image (HTTP 200, 1200x630).
- Confirm no duplicate og:image tags in the built page head.
- Publish is required for the live link preview to update; that step is the user's one click.

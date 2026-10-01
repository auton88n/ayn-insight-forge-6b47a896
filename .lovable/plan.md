# Fix what people see when an AYN link is shared

## What's wrong today
When someone shares an AYN link (WhatsApp, LinkedIn, Slack, X), the card shows the AYN logo image plus a headline and a short line of text underneath. That text still describes the retired Chrome extension:

- Headline: "Stop sending the same resume to every job"
- Line under it: "Open a posting, hit AYN, and get a one page resume and cover letter written for that role from your own history. Free to start."

"Open a posting, hit AYN" was the extension flow, which no longer exists. The image itself has no text on it, so only these two lines need changing.

## New text (proposed, editable)
- Headline: "AYN: real jobs, and a resume tailored to each one"
- Line under it: "Browse jobs straight from company career pages, no ghost listings. See how well you match, then get a resume and cover letter written for that role from your real history. Free to start."

No dashes, matching the site's writing rule.

## What changes
- `index.html`: replace `og:title`, `twitter:title`, `og:description`, `twitter:description` with the new text, and bump the image cache tag (`?v=3` to `?v=4`) so platforms refetch the card.
- `src/components/shared/SEO.tsx`: bump the same `?v=3` default image tag to `?v=4` so per-page previews stay in step.

## After it ships
The live link only picks this up on the next publish. Platforms that already cached the old card (LinkedIn, WhatsApp, Facebook) keep showing it until they re-scrape; LinkedIn's Post Inspector and Facebook's Sharing Debugger force a refresh.

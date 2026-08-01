## Goal

Every headline, lead and description gets cut to the shortest honest version. The hero you showed is the target rhythm: one short headline, one line of support, one button, one small note. Nothing else on the site should be denser than that.

## Copy rules applied everywhere

- Lead paragraphs: one sentence, 12 to 18 words. Never two clauses joined by "then".
- Card and tile descriptions: one sentence, under 15 words.
- Bullets: under 10 words each.
- FAQ answers: two sentences maximum.
- No em dashes, no en dashes, ranges use "to".
- Cut every sentence that only restates the heading.

## Part A, landing page (src/components/landing/LandingSections.tsx)

Rewrite the copy constants in place, no layout or logic changes.

- HERO: seeker lead becomes one line ("A resume and cover letter written for the exact job in front of you."). Employer lead becomes one line. Notes shortened to a half line.
- PAIN: drop the `lead` paragraph entirely for both audiences, keep the title and the three bullets, each cut to under 10 words.
- SEEKER_TILES: six descriptions cut to one short sentence each. The lead tile loses its second clause.
- EMPLOYER_STEPS: four descriptions cut to one short sentence each.
- TRUST: titles shortened, leads cut to one sentence, chips shortened to three or four words each.
- FAQS: all twelve answers cut to two sentences maximum.
- Section headings in the seeker and employer showcases: the long explanatory lead under "One posting in, one tailored application out" collapses to one line.

## Part B, the rest of the app

Same treatment, copy only, on the surfaces a user actually reads:

- `src/components/auth/AuthModal.tsx`: role tile descriptions and helper text.
- `src/pages/Pricing.tsx`: plan blurbs and feature lines.
- `src/components/resume-hub/*`: HomeTab next-action text, DiscoveryTab and TalentPoolCard explanations, ProposalsTab and AssessmentsTab empty states, ExtensionTab install copy, ProfileTab group hints.
- `src/pages/EmployerHub.tsx` and `src/components/employer/*`: intake wizard prompts, ask card labels, company profile nudges, proposal dialog helper text.
- `src/pages/Handoff.tsx`, `ResumeMatch.tsx`, `SubscriptionSuccess.tsx`, `NotFound.tsx`: shorten the standing explanations.
- Extension `extension/sidepanel.html`: section subtitles and empty states, matched to the same rhythm.

Legal pages (Terms, Privacy, Do Not Sell), the cookie banner and any consent wording are left alone, since those need to stay precise.

## Technical notes

- All edits are string constants and JSX text. No component structure, props, state or backend changes.
- Line lengths shrink, so a few tiles will look shorter than their neighbours. Where that leaves a visibly empty card, the fix is CSS alignment in `src/index.css` or `src/styles/resume-hub.css`, not padding the copy back out.
- Extension copy changes mean a version bump in `extension/manifest.json` and `extension/content.js`, then `node extension/build.mjs`, per the repo rule.
- `docs/map/*` only gets updated if a seam changes. Nothing here changes a seam, so the map files stay as they are apart from the extension version line.

## Verification

Screenshot the landing page in both audience modes and the main Resume Hub tabs before and after, and check no line in a card runs past three rendered lines. we keep it simple but infomative not to wordy 
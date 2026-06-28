Reposition the AYN landing page from B2B business intelligence to a personal job hunting/career assistant, matching the direction of Jobright.ai. Keep the 3D eye scroll animation and visual frames untouched; only rewrite text, section content, and SEO metadata.

Plan
1. SEO and meta (src/components/LandingPage.tsx)
- Update title, description, keywords, and FAQ schema for a job hunting AI assistant.
- Remove all business intelligence, market analysis, and geopolitical language.
- Keep the existing light/white background enforcement and Header/HeroScroll structure.

2. Hero and scroll chapters (src/components/landing/HeroScroll.tsx)
- Rewrite the main headline to communicate "AYN helps you find and land the right job faster" instead of business intelligence.
- Rewrite the four scroll chapter headlines and bodies around job hunting moments: finding roles, matching your resume, filling applications, and staying organized.
- Keep the existing scroll timing, opacity transitions, and the 3D EmotionalEye.
- Update final CTA copy to a careers demo/early access call to action.

3. About section (src/components/landing/HeroScroll.tsx)
- Replace the company owner paragraph with a job seeker focused message: AYN reads jobs, matches your resume, fills forms, writes cover letters, and tracks applications in one place.
- Remove Arabic "عين" literal eye wording per project memory.

4. Features section (src/components/landing/HeroScroll.tsx)
- Replace the six business features with job hunting features:
  a. AI Resume Builder
  b. Job Match Score
  c. One Click Autofill
  d. Smart Job Tracker
  e. Cover Letters That Fit
  f. Interview Prep
- Keep the existing grid layout, cards, glass styling, and hover animations.

5. Solutions/audience section (src/components/landing/HeroScroll.tsx)
- Reposition the six cards from industries to job seeker segments, for example: new graduates, career switchers, experienced professionals, remote workers, international applicants, busy parents returning to work.
- Keep the same card grid and visual styling.

6. Final CTA and footer (src/components/landing/HeroScroll.tsx)
- Rewrite to a job seeker focused closing: land the job you want with AYN.
- Keep dark background section and ring decoration.
- Keep footer links and copyright unchanged.

7. Copy style and constraints
- Natural human tone, no em dashes (—), no hyphens (-), no Arabic "عين".
- Update English, Arabic, and French strings where they exist in the component.
- Preserve all existing animation frames and CSS motion.

8. Verification
- Build the project to confirm no TypeScript errors after text changes.
- Spot check the landing page preview to ensure the 3D eye and white background remain intact and the new copy renders correctly.

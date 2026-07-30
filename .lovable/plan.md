## 1. Label the assessments you sent

Right now an employer sees "Software Engineer, 6 questions, 30 minute limit" with no name, so three assessments for one role are indistinguishable.

- Backend `employer_assessment_list` already reads the assessment rows; add `candidate_user_id` to the select, look the candidates up in one batched profile query, and return `first_name` per assessment (same pattern already used by `employer_reveal_status`).
- `AssessmentsPanel` rows become: candidate first name as the headline, role plus question count plus time limit as the second line, status pill unchanged. Falls back to the role title when no name exists.
- The candidate-side list keeps the role as the headline (a candidate does not need their own name).

## 2. Landing page rebuilt around what AYN actually is

Today the page promises tailoring only, calls employers a waitlist, and its mockups are invented shapes. All three are now wrong.

**Structure (two clear sides, seeker first):**

```text
Hero            One promise, one live mockup, two CTAs
Proof strip     Where AYN reads postings
The pain        Why applying and why hiring are both broken
For job seekers 3 real features, each with a real mockup
For employers   3 real features, each with a real mockup, self serve CTA
How it works    Two short columns: seeker path, employer path
Trust           Read only, grounded, contact private until you approve
FAQ             Rewritten to match today's product
Final CTA       Sign up free / Sign up as an employer
```

**Copy direction (pain, then power, no em dashes):**
- Seeker pain: you send the same resume to forty jobs and hear nothing, and you cannot tell which ones were ever worth the evening.
- Seeker power: AYN reads the real posting, tells you where you actually stand, rewrites your resume and cover letter for that role in your own facts, and puts you in front of employers searching for someone like you.
- Employer pain: a job post buys you three hundred resumes and no signal, and a screening call is the first time you learn the resume was written by a model.
- Employer power: describe the role, get three candidates with the evidence for each, send a short assessment written from that person's own background, then send a proposal. Contact details only after they accept.

**Employer CTA becomes self serve** ("Sign up as an employer" into the auth modal in employer role). Every "waitlist", "early access", "we onboard one at a time" line is removed.

**Mockups replaced with the real screens (all four):**
1. Extension on a posting: browser chrome, real job text on the left, AYN panel with score, matched, missing, and the "grounded on the posting you are reading" line.
2. Tailored documents: the one page resume and the cover letter generated for that job, with the job title on the header and a download row.
3. Employer candidate card: first name, score ring, matched skills, gaps, why AYN picked them, the skills provenance split, and the two buttons (send an assessment, send a proposal).
4. Verification assessment: a question written from the candidate's background, a live timer, and the employer result view with score, verdict and per question time.

These are hand written inline SVG in the existing `ProductIllustrations.tsx` style (no images, no runtime fetch, static so reduced motion is satisfied by construction), matching the current Charcoal and Ember tokens and the app's real orange.

**SEO:** single H1, title under 60 chars and description under 160 in `index.html` covering both sides, FAQ JSON-LD regenerated from the new FAQ list, alt/aria text on every mockup.

### Technical notes
- Files: `supabase/functions/resume-hub/index.ts` (`employer_assessment_list` only), `src/components/employer/AssessmentsPanel.tsx`, `src/lib/employer.ts` (type), `src/components/landing/LandingSections.tsx`, `ProductIllustrations.tsx`, `HeroFillMockup.tsx`, landing CSS in `src/index.css`, `index.html` metadata.
- No schema change, no new tables, no change to matching or proposal logic.
- Landing keeps the existing `lp-*` class system and reveal-on-scroll observer; new sections reuse it rather than introducing a second styling approach.

# Closing JD gaps without inventing anything

## Where I disagree, plainly

I will not build a feature that writes employers, job titles, dates, skills, or metrics a person never had. A resume is a document someone submits to a real employer under their own name. An invented Kubernetes line gets them through a keyword filter and then ends the interview thirty seconds after it starts, and it exposes them to a rescinded offer or a firing later. Every honesty rule in this codebase exists because that failure mode is worse than a low score.

The real problem behind your message is still worth solving, though: people who genuinely have the experience are scoring low because their resume words it differently than the posting does. That is a wording and surfacing problem, not a truth problem, and we are leaving a lot on the table there.

## What actually closes the gap

### 1. Ask the person, then use their answer

`resume_gap_probe` already exists but only fires on three rubric issues. Extend it so every genuinely missing JD requirement gets a targeted question: "This role asks for Terraform. Have you used it, even on a side project or a course?" If yes, they type what they actually did and we write it in their words. If no, the gap stays honest.

This is the single biggest win. Most "missing" skills are things the person has and never wrote down.

### 2. Match the posting's vocabulary against their real experience

Today a bullet saying "provisioned cloud infrastructure with Terraform modules" and a requirement saying "Infrastructure as Code (IaC)" can still read as a miss. Expand the tailor step so, for every requirement we can honestly satisfy, the tailored bullet uses the posting's own phrasing alongside theirs, never instead of a fact.

### 3. Surface skills already buried in their history

Skills mentioned once inside a bullet, or implied by a tool they list, never make it into the SKILLS block. Pull those forward so an ATS keyword scan actually sees them. Nothing new is claimed, only relocated.

### 4. Tell them exactly what to go get

Where a gap is real, say so and name the shortest honest path: a specific free certification, a small project, a course. This is the difference between a tool that lies for you and one that makes you actually competitive.

### 5. Show the honest score with the reason

Instead of a bare number, show which requirements are matched, which are matched-but-worded-differently (now fixed), which are missing-but-askable, and which are genuinely absent. Someone who can see the four missing items can decide whether to apply anyway, which is often the right call.

## Technical notes

- `_shared/tailoring.ts`: extend `computeGap` output with a per-requirement status (`matched`, `matched_semantically`, `askable`, `absent`) rather than the current matched/missing split.
- `resume_gap_probe`: widen its trigger set from three rubric issues to any `askable` requirement. Its existing `inventedFigures()` and `stripInstructionLikeSpans()` guards stay in force, so a typed answer still cannot smuggle in fabricated numbers.
- `tailor` prompt: add a rule allowing the posting's terminology for a requirement code has already confirmed as satisfied, and forbidding it otherwise. The figure-preservation check is unchanged.
- Skills surfacing runs deterministically in code before the AI call, same as every other fact in this pipeline.
- No prompt anywhere gets permission to add an employer, title, date, number, or skill.

## What I am not building

A switch that fills gaps with plausible fiction. If that is genuinely what you want, it needs to be your explicit call with the liability understood, and it will not come from me.

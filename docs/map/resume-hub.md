# Resume Hub map (web app + resume-hub backend)

## Surface
src/pages/ResumeHub.tsx with six tabs in src/components/resume-hub/ (Resumes removed in v3.4.0, Proposals added in v3.6.0, Get discovered removed in v3.69.0):

| key | label | hint | component |
|---|---|---|---|
| home | Home | Start here | HomeTab (next actions, replaced OverviewTab) |
| profile | Profile | You, your resume, your goals | ProfileTab (resume group + four field groups + discoverability, see below) |
| jobs | Jobs | Score and tailor | JobsTab (saved jobs, score, tailor, cover letter, generated documents, handoff) |
| proposals | Proposals | Roles employers want you for | ProposalsTab (pending proposal cards, accept or decline, collapsed history) |
| assessments | Assessments | Questions about your own work | AssessmentsTab |
| extension | Browser extension | Score jobs as you browse | ExtensionTab (zip download, version check, device tokens) |

Old nav for reference: Overview / Profile / Resumes / Saved jobs / Extension. TrackerTab was deleted in v3.0.1, OverviewTab in v3.3.0, CanadianProfileForm.tsx in v3.2.0, BuilderTab.tsx in v3.4.0, DiscoveryTab.tsx in v3.69.0.

## Sign out (v3.39.0 fix)
The account-menu "Sign out" item calls `handleSignOut`, an `async () => { await supabase.auth.signOut(); navigate("/"); }` defined near the top of `ResumeHub.tsx`. Before v3.39.0 it was a bare `supabase.auth.signOut()` with no await and no navigation, so the session cleared underneath but the page never reacted — `ResumeHub.tsx` is a top-level route (`src/App.tsx`), not nested inside `Index.tsx`'s `AuthedShell`, so `AuthedShell`'s own `onAuthStateChange` listener was never in the tree to catch it. `EmployerHub.tsx` had the identical bug at two buttons (desktop sidebar, mobile bottom nav) with the same fix, `handleSignOut` defined once and reused at both call sites. `EmployerPending.tsx` and the delete-account flow in `PrivacySettings.tsx` already did this correctly and were the reference pattern.


## One profile, one resume (v3.4.0)

BuilderTab and ProfileTab edited the same facts (name, location, summary, company, experience) in two places, and a resume library implied resumes are things a user maintains. Both are gone.

RULES:
1. A user has exactly ONE active resume: the `resumes` row with `is_primary = true`. Uploading a replacement flips every other row to `is_primary = false`; nothing is deleted.
2. Profile is the only place any of those fields are edited. No other surface writes name, location, summary, titles, dates, experience, education, or skills.
3. Tailored resumes and cover letters are OUTPUTS of a job, not resumes. They live on the job in JobsTab.

PROFILE GROUP 0, "Your resume", line "Everything AYN writes starts from this.": the active resume title, the date it was added, Download (PDF), and Replace resume. Replace asks for confirmation, then reveals ResumeUpload; the parse refreshes the derived profile fields via mapResumeToCareer and fires reindexTalentPool("resume_upload"). No list, no versions, no set-as-primary, no resume title editing.

MIGRATION AFFORDANCE: accounts created before v3.4.0 can hold several rows. ProfileTab loads all of them, treats the primary (or newest) as the resume, and shows one quiet line: "You have <n> older resumes from an earlier version of AYN." Expanding lists them read only with download and delete. It is not a manager: no editing, no switching active resume from the list.

TAILORED OUTPUTS (JobsTab): the newest `resume_versions` row with `created_for_job_id = job.id` and the newest `cover_letters` row with `job_id = job.id` render as "Documents for this job" with the generated date and PDF / Word downloads. Regenerating deletes the previous copy for that job and inserts the new one, so there is at most one of each per job. Cache behaviour in the edge function is unchanged. ResumeDiffViewer survives as "See what changed" on the tailored resume, comparing it against the active source resume.

Document building moved into the web app at src/lib/resumeDocs.ts (jsPDF + docx, real selectable text, same contract as extension/resumeFormat.js): resumeToText (plain text, feeds ResumeDiffViewer only), buildResumePdfBlob, buildResumeDocxBlob (build directly from structured `ResumeContent`, replaced the old text-flattening `buildTextPdfBlob`/`buildTextDocxBlob` in v3.65.0 — see below), downloadBlob, fileBase.

## Resume diagnosis and optimizer (v3.64.0)

Two backend actions, both operating on the ACTIVE resume's structured content (`ResumeContent`), never the original uploaded file — by the time a resume is in this schema, `resumeDocs.ts` already guarantees single-column, real-text, ATS-friendly output regardless of what the source file looked like, so nothing here diagnoses visual layout, only writing quality.

`resume_diagnose` (free, `resumeHubApi.diagnose`): `DEFAULT_MODEL`, returns `{ats_score, verdict, issues}` — 3 to 6 specific, concrete problems naming the actual weak bullet or missing section, not generic advice. Pass `resumeId` to cache the result onto `resumes.ats_score`/`resumes.ats_issues` (the former existed unused since before this feature, the latter added by this migration: `20260805120000_add_resume_ats_issues.sql`). `ProfileTab.tsx` calls this automatically, silently, right after every upload, and offers a manual "Check my resume" button for anyone who uploaded before this shipped.

`rewrite` (paid, 15 credits, `COST_OPTIMIZE`, `resumeHubApi.rewrite`): was already built and returning `{resume, ats_score, suggestions}` but had zero callers anywhere in `src/` and no credit gate at all. Now gated like `tailor`/`cover_letter` (`assertCredits`/`creditSpend`, `QUALITY_MODEL`), with a stricter prompt: never invent a metric that is not already implied by the resume's own content, consistent "Month YYYY" dates, no em/en dashes. `ProfileTab.tsx`'s `optimizeResume()` calls it, then performs the exact same `is_primary` swap as a fresh upload (old rows to `false`, new row inserted as the primary with the new `ats_score`) — paying for this is the acceptance, there is no separate preview-then-accept step, matching how `tailor` already works. Shows a "what changed" list from `suggestions` afterward and lets the person download the new resume immediately.

`JobsTab.tsx` reads the cached `ats_score` and shows an amber warning below the tailor/cover-letter buttons when it is under 70 ("tailoring still works, but a weak base resume means a weaker one for every job"), linking back to Profile via a new `onOpenProfile` prop threaded through from `ResumeHub.tsx`. Tailoring itself is unaffected either way — the warning is informational, not a gate.

### v3.65.0 fix: the actual output was two pages, unbolded, and read like AI wrote it

Reported directly against the founder's own downloaded PDF after using the feature. `resumeDocs.ts`'s PDF/DOCX builders are rebuilt from `ResumeContent` directly rather than a flattened text string (see the Document building line above). Two independent problems, both real: (1) the PDF had no shrink-to-fit logic, so a normal 4-job resume silently spilled onto a second page with one line of skills on it; (2) bolding was guessed from ALL-CAPS text-matching, which only ever caught section headers, never the name or a job title. Also tightened the `rewrite` prompt: banned specific resume-cliché phrases, required atomic `skills` entries (one skill per array item — the model had been writing category-prefixed comma lists into a single entry, e.g. "Technical Stack: React, TypeScript, Supabase...", which is what rendered as a dense wall of text). Verified by rebuilding the PDF from the founder's actual resume content and inspecting the raw PDF bytes: `/Count 1`, `/F2` (Helvetica-Bold) selected before the name and every title line.

### v3.66.0 fix: the score bounced around on identical input, root cause and real fix

Reported directly: running the optimizer on the same resume showed 75/100, running it again showed 65/100, "what are the ground rules for it." First attempt (already live, undocumented until now) added `ATS_RUBRIC`, a fixed point-deduction rubric shared by both actions, plus low temperature. That alone genuinely fixed `resume_diagnose` (identical input now scores within a few points every time, same verdict every time) but did NOT fix `rewrite`, measured directly: two back-to-back calls on the exact same input scored 90 then 70, an even wider swing than before. Root cause: `rewrite` was doing two stochastic jobs in one completion — writing new resume content AND grading its own writing — so both the content and the self-assigned score wobbled together, and there was no way to tell which one was actually responsible for a given score change.

Real fix: scoring was pulled out into one shared function, `scoreResumeContent(resume)`, the same low-temperature (0.1), rubric-driven call `resume_diagnose` already used. `rewrite` now does two calls in sequence: first a generation-only call (temperature raised slightly to 0.3, since natural human-sounding phrasing genuinely needs some variation and no longer has to also hold a score steady) that returns just the rewritten resume and `suggestions`, then `scoreResumeContent` is called on that output exactly the way a fresh diagnosis would be. This guarantees a diagnosis and an optimize's reported score are always computed by the literal same function, not two different prompts that happen to share a rubric.

Verified live against the exact same test resume across 3 consecutive `rewrite` calls: scores 75, 75, 80, verdict "Good" all three times, versus the prior 90-then-70 swing. The rewritten bullets differ each run (expected — that's the point of temperature on the generation side, so a re-optimize doesn't read like a template), but the number attached to them no longer does.

### v3.95.0 fix: certifications never reached the downloaded file

Found while producing an ATS/resume-craft reference guide, not reported by a user first. Every other link in the chain already carried certifications correctly: `ProfileTab.tsx`'s Certificates section (v3.70.0) saves to `user_profile_canonical.certifications`, the initial resume upload/parse action explicitly extracts certifications from the uploaded file, and `RESUME_SCHEMA` (the AI's structured-output contract for both `rewrite` and `tailor`) has always had a `certifications: string[]` field. The one broken link was `resumeDocs.ts` itself: `buildResumeBlocks()` (PDF/DOCX) and `resumeToText()` (the diff viewer) built exactly six sections — name, contact, summary, experience, education, skills — and never once read `c.certifications`. A real, ATS-relevant certification could sit in the data the whole time and never reach the actual file a recruiter or ATS opens. Fixed by adding a `CERTIFICATIONS` block to both functions, positioned right after Skills, reusing the same `header`/`plain` block kinds Skills already uses — no new styling or plumbing needed, since the PDF/DOCX renderers already key off `STYLE[block.kind]` generically.

Verified directly: bundled `resumeDocs.ts` with esbuild and ran it in Node against a mock resume carrying two certifications. `resumeToText()` produced a real `CERTIFICATIONS` section; the generated PDF blob's raw bytes contained the literal `CERTIFICATIONS` text and still reported `/Count 1` (stayed one page); the DOCX blob came back as a valid zip archive at a sane size. `npx tsc --noEmit` clean.

### v3.96.0 fix: links missing from the file, section order, title-first summaries, gap detection

Same audit, three more findings, all fixed together. **Links**: the exact same bug shape as certifications above — `identityContactBlock()` (`_shared/identity.ts`) and `RESUME_SCHEMA` both already carry LinkedIn/portfolio/GitHub `links`, and the AI is explicitly told "never omit" them, but `resumeDocs.ts` only ever joined `title/email/phone/location` into the contact line. Fixed by appending `(b.links ?? []).map(l => l.url)` onto that same join in both `buildResumeBlocks()` and `resumeToText()`. Verified directly: a test resume with two link URLs produced a plain-text output, a PDF (raw bytes), and a DOCX that all contain both URLs.

**Section order**: changed from Name/Contact/Summary/Experience/Education/Skills/Certifications to Name/Contact/Summary/**Skills**/Experience/**Certifications**/Education. Checked current (2026) ATS guidance live via web search rather than assumed from training data before making this change — skills-near-the-summary is described as the stronger default now, not a toss-up, and certifications ranks above education in relevance for most fields. Verified the new order directly in real builder output.

**Title-first summaries and gap detection**: `ATS_RUBRIC` (shared by `resume_diagnose` and `rewrite`) gained two lines — summary's first sentence must name the candidate's own title (-5), and an unexplained 6+ month gap between two roles (-10 per gap, capped -20). Verified live: a diagnosis on a resume with a real 8-month gap and a title-less generic summary correctly surfaced "The summary's first sentence does not name the candidate's own current or most recent job title" as an issue, and scored 15 points higher once both were fixed in a control resume. `rewrite`'s system prompt, the web `tailor` prompt, and the extension's `TAILOR_RULES` all gained a matching rule requiring the summary to open with the candidate's real title — deliberately NOT told to explain a gap, since inventing a reason would be exactly the kind of fabrication this pipeline exists to prevent. Scoring may notice a gap; generation may not paper over one.

**A real, current, unrelated finding surfaced while testing**: `rewrite`/`tailor` (both `QUALITY_MODEL`, `google/gemini-2.5-pro`) could not be round-tripped live today — `ai_call_telemetry` shows a real `tailor_web` call took 176 seconds for one generation, past the edge function's 150s idle timeout. `resume_diagnose` (the faster `DEFAULT_MODEL`) worked instantly and correctly in the same session, isolating this to the specific model, not a regression from this change. Flagged, not fixed — an external AI-gateway latency condition, worth the founder's own look since it could be timing out real users right now.

### v3.97.0 fix: the slow model, actually swapped

Asked directly, right after v3.96.0's finding, to try flash instead of pro. `QUALITY_MODEL` (`google/gemini-2.5-pro`) is shared by seven features; only the three that were actually measured slow got changed to `DEFAULT_MODEL` (`google/gemini-2.5-flash`) — `rewrite`, web `tailor`, and the extension's `handleSmartTailor` (every `callAI` call site in each, including `smart_tailor`'s two-call draft-plus-mandatory-critique chain, the worst case for hitting a timeout, plus the `logAiCall` telemetry entries so recorded model names stay accurate). Canonical-profile extraction (`extractCanonical`), candidate reranking, assessment grading, and cover letters were deliberately left on `gemini-2.5-pro` — not flagged as slow, not tested, out of scope for this specific fix.

Verified live: the identical test resume from v3.96.0 (title-less summary, a real 8-month gap, a link, a certification) through the real deployed `rewrite` action completed in **6 seconds**, down from the 176 seconds measured before. Quality held across the swap: summary opened with the real title, both numbers ("3 days to 1 day", "35%") survived unchanged, the link and certification both came through, dates normalized to "Month YYYY". Deployed live via `supabase functions deploy resume-hub`. `npx tsc --noEmit` clean. Test account and data fully erased after.

### v3.98.0 fix: `tailor` had no anti-cliché rule at all, and basics.title could inherit the job posting's seniority

Asked directly whether flash was actually good, answered by testing rather than asserting rather than trusting the one earlier test. Stress test: a backend-engineer resume against a JD requiring Kubernetes and GraphQL (neither present anywhere in the resume), through `tailor`. Honesty held — neither fabricated skill appeared — but the summary came back with "a proven track record of," a phrase on `rewrite`'s banned-cliché list. Checked `tailor`'s actual system prompt: it never had an anti-cliché rule at all, only `rewrite` did. Fixed by adding the same "WRITE LIKE A PERSON, NOT A TEMPLATE" rule (with the banned-phrase list) to `tailor`'s prompt as a new rule, and adding "proven track record of" and "in today's fast-paced" to `rewrite`'s list and the extension's `TAILOR_RULES` VOICE line, so all three prompts share one list instead of three that could silently drift apart.

**A second, more serious bug surfaced while re-verifying the first fix**: the same test's `basics.title` (the resume's own header line, distinct from any work-entry title) came back as "Senior Backend Engineer" — the job posting's title, not the candidate's real one ("Backend Engineer"). Root cause, confirmed by checking the test account directly: it had no `resumes` row, so `basics.title` arrived empty in the prompt, and none of the three prompts' "don't change job titles" rules explicitly covered this specific field (the model correctly kept the *work-entry* title "Backend Engineer" untouched, reading "job titles" as referring only to that). With the header field empty and unconstrained, the model filled it from the job posting instead of deriving it from the real work history — a visible seniority inflation on the page itself, not a subtle wording issue. Fixed in `rewrite`, `tailor`, and `TAILOR_RULES` with an explicit rule: the header title must come from the candidate's own most recent real role (derived from their work history if the field arrives empty), never from the job description, never bumped with "Senior"/"Lead"/"Staff"/"Principal" beyond what the real title already says.

Verified with four separate live tests, not just the one that found the bugs: (1) the same Kubernetes/GraphQL test, re-run — clean summary, `basics.title` correctly "Backend Engineer." (2) A marketing-coordinator resume against a "Senior Marketing Manager" JD requiring Google Analytics 4 and Salesforce Marketing Cloud (neither in the resume) — same result, nothing invented, title stayed "Marketing Coordinator." (3) A resume with three stacked clichés in one sentence ("dynamic professional... proven track record of... results-driven") through `rewrite` with no JD at all — all three gone, replaced with a plain title-first sentence, and three weak-verb bullets ("Responsible for," "Helped," "Worked on") all strengthened. One deploy attempt returned a transient `DecodeError` from the Supabase platform itself; confirmed the file was still valid UTF-8 before retrying, which then succeeded — not a code problem. `npx tsc --noEmit` clean. All test accounts and data fully erased after.

Deployed live via `supabase functions deploy resume-hub` (not just committed). `npx tsc --noEmit` clean. Test account and all data fully erased after.

### v3.99.0 — title alignment and missing skills, confirmed by the person, applied to neither side silently

v3.98.0's title fix (never let the header inherit the job posting's seniority) was pushed back on directly: exact title matches are reported to raise interview odds up to 10x, a real cost the fix ignored. Checked the disagreement against real sources rather than assuming a side — title inflation carries real, documented risk too (reference checks, a hiring manager's bullets-vs-title suspicion), and the actual career-coaching consensus is "translate, not inflate." Resolution, agreed on together: neither always-match nor always-lock. Surface the option, apply nothing until the person clicks it — the same "nothing invented without you" principle already used everywhere else in this app, extended to title and to missing skills both.

**Backend**: `resume.basics.title` was already guaranteed real (v3.98.0), and the job's own title already lives in `JobsTab.tsx`'s own `jobs` row — so the title comparison needed zero backend change. The one real gap: `tailor` (web) has computed `gapAnalysis` (matched/missing) internally for a long time, logged it to telemetry, and never once returned it to the frontend — the same "computed but not sent" shape as other findings this session. Added `gapAnalysis: { missing: gap.missing.map(r => r.text).slice(0, 6) }` to the response.

**Frontend, `JobsTab.tsx`, no new credits, no new AI call**: after `tailorResume()` completes, compares `tailored.content.basics.title` to `selected.title` (the job's own title) — if they differ, shows one row with a single "Use this job's title" button. For each item in `gapAnalysis.missing`, a row with an editable input (pre-filled with the job's wording, replaceable with the person's own) and an "Add" button. Both actions call a shared `patchTailoredContent(updater)` that writes straight into the already-generated, already-charged `resume_versions` row — no re-generation, no second charge. `gapSuggestions` resets on `openJob`, so it only ever reflects the tailor that just ran, not stale state from a previous job.

Verified with a real browser session against the live UI, not curl against the API: signed in as a real throwaway account (`supabase.auth.setSession` with a real password-grant token, dev server, no mocking) with a real primary resume (title "Backend Engineer") and two real saved jobs. Job 1 ("Senior Backend Engineer"): title-mismatch row appeared; clicking "Use this job's title" patched `resume_versions.content.basics.title` in the database (confirmed by direct query) and the row disappeared. Job 2, deliberately written as a properly bulleted JD (Python/PostgreSQL/Kubernetes/GraphQL as separate requirement lines, since a single dense paragraph turned out to under-extract, see below): correctly surfaced "GraphQL API design" as missing; clicking Add patched `skills` in the database (confirmed by direct query) and that row disappeared too.

**One honest, pre-existing gap surfaced, not caused by this change**: the same JD's "Kubernetes" line, an equally real gap, was never surfaced alongside GraphQL. Not the bullet-length filter (`text.length < 8` in `extractRequirements`, "Kubernetes" is 10 chars, passes) — something else in `computeGap`'s matching logic in `_shared/tailoring.ts` is treating it as already covered. This predates this change (the same function already backs `smart_tailor`'s gap display) and needs its own look before touching it, not a guess-fix riding on this commit.

`npx tsc --noEmit` clean. Deployed live via `supabase functions deploy resume-hub`. Test account, the seeded resume, and both seeded jobs fully erased after.

### v3.100.0 fix: the Kubernetes gap-detection miss v3.99.0 flagged, plus a second gap only testing found

Asked directly to fix the pre-existing miss v3.99.0 surfaced (a bulleted "Kubernetes" requirement never showing up as missing, even though the resume genuinely lacked it), then to test more before calling it done.

**Root cause, traced past the first symptom**: `terms()` in `_shared/tailoring.ts` (splits a requirement string into countable words) has a hardcoded 3-character floor, so any single short token — "Go", "AI", "C#", "R", "ML" — reduces to an empty list. That floor was hit twice on the same requirement: once in `extractRequirements()` (a one-word bullet needed 2+ real terms to be tracked at all, so "- Kubernetes" alone never qualified) and again inside `computeGap()`'s own matching loop, which re-derives the same term list to score coverage — a requirement that did survive extraction with a short/single term could still compute to zero terms there and get silently dropped a second time, before ever being checked against the resume. Fixing extraction alone (a first attempt) still missed "Go" in testing for exactly this reason: the back door was reading the same 3-char floor.

**Fix**: parameterized `terms(s, minLen = 3)`, called with `minLen 1` at both real sites — `extractRequirements`'s bulletish branch (a bullet is already a deliberate single item, so "- Kubernetes"/"- Go"/"- AWS" now register) and `computeGap`'s coverage computation (a one-word requirement can now actually be scored). Prose lines keep the stricter 8-char/2-term floor unchanged; a stray short fragment in free-flowing text is still more likely noise than a genuine one-word ask.

**That alone opened a second, real gap, caught only because "test more" was followed literally rather than stopping at the first green test**: the lowered bulletish bar also let generic filler bullets through for the first time — "- 5+ years of experience", "- Bachelor's degree preferred", "- Strong team player" each now had one non-stopword token ("of", "player") and got tracked as a real "requirement," which the v3.99.0 confirm-UI would have shown as an "Add" button for a skill literally named "Strong team player." Fixed with a second, narrow regex denylist, `GENERIC_QUAL`, checked against the whole bullet before it's tracked: years-of-experience phrasing, degree/bachelor's/master's language, and the common soft-skill set (communication, team player, problem-solving, self-starter, fast-paced, detail-oriented, work independently, interpersonal, time management, organizational/leadership/analytical/people skills, multi-tasking). None of these are addable skills regardless of phrasing.

**Verified with four live tests against the deployed function, including the one scenario v3.99.0 never covered**: (1) a JD with AWS/Kubernetes/SQL/Go/AI/C# as separate bullets — all six now correctly flagged missing, versus only the multi-word ones before. (2) A JD mixing genuine short skills (Python, Terraform) with soft-skill/quals bullets (years of experience, degree preferred, communication skills, team player, multi-task in a fast-paced environment) — `missing` came back as exactly `["Terraform"]`, the one real gap. (3) A prose-style JD under a real "Requirements:" heading ("distributed systems and microservices architecture," "message queues," "incident response") — all three genuine multi-word gaps still correctly flagged, no regression in the existing prose-matching path. (4) The case never tested before: added "Go" to the test account's own skills via direct SQL, then ran a JD requiring Go — it correctly did NOT appear in `missing` (matched), while AWS and Kubernetes, still genuinely absent, correctly did. This closes what the first fix alone left open: a short skill can now be recognized as present, not just recognized as absent.

`npx tsc --noEmit` clean after both edits. Deployed live via `supabase functions deploy resume-hub` twice — once per fix, tested in between rather than batched, since the second gap was only found by testing the first fix's actual live output. Test account, its seeded canonical profile, and all four test jobs fully erased after (`erase_account_core`, confirmed zero rows remaining).

### v3.101.0 fix: `parse_file` fabricated a complete fake person on a genuinely blank/unreadable upload

Asked what happens to an upload whose format "looks off." Answering from the code first, then proving it live turned up a real bug the code-only answer would have missed.

**Two format-stress tests held up correctly, live**: a real two-column "sidebar template" `.docx` (a floating text box for Skills/Contact, anchored mid-document — the classic Canva/creative-template export) still got sorted correctly by the AI extraction step (contact → `basics`, skills → `skills`, both jobs' bullets attributed to the right employer) despite zero section headers, Education deliberately placed before Experience, and the sidebar content landing mid-stream in the raw extracted text rather than as a clean separate block. A synthetic "scanned photo" PDF (an image with no real text layer) was also read correctly — the vision model OCR'd the text directly off the image, contradicting the older assumption that any image-only PDF hits the "paste your text" fallback; it only does when the model genuinely can't make out the content.

**The real bug**: a completely blank PDF, reproduced twice, made the AI fabricate a full fake resume — "Alex Smith," a fake email, two fake employers with fake bullets, two fake degrees, two fake certifications, two fake project URLs, none of it present anywhere in the file. Root cause: the vision-path (`parse_file` Stage 3, PDF or a `.docx` mammoth failed to read) had `tool_choice` pinned to a single forced `emit_resume` call — the model had no way to say "there's nothing here," so on truly empty input it reached for what looks like a memorized generic example resume instead. This is the exact fabrication class the rest of the app (`rewrite`, `tailor`) is built to prevent — it just had never been stress-tested against genuinely empty input on this one path.

**Fix**: gave the model a real way out instead of a stronger instruction alone. The vision-path call now offers two tools — `emit_resume` and a new `emit_no_content` (one field, `reason`) — with `tool_choice: "required"` instead of pinned to one function; the model must still call something, but can now honestly decline. If `emit_no_content` comes back (or no tool call at all), the response is the same 422 the "couldn't read this PDF" case already returned, now naming blank files explicitly and carrying the model's own one-line reason as `detail`. The text-extraction path (real `.docx` via `mammoth`) only runs on 80+ already-extracted characters, so true blank input can't reach it — it got the lighter, prompt-only version instead: an explicit "if this isn't actually resume content, return every field empty, never substitute a placeholder person."

Verified live, twice each: the blank-PDF case now returns a clean, honest error with no fabricated person, both times post-fix. Re-ran both legitimate format-stress cases (sidebar-textbox resume, legible scanned-image resume) against the same deploy to confirm the fix cost nothing — both still extracted correctly. `npx tsc --noEmit` clean. Deployed live via `supabase functions deploy resume-hub`. Test accounts and all uploaded test files fully erased/deleted after.

### v3.104.0 fix: a corrupted or password-protected upload leaked a raw upstream provider error

Five more real-world "the format looks off" cases, tried live against the deployed function: a random-bytes file saved as `.pdf`, a real PDF encrypted with a password, a French-language resume, a cover letter uploaded in place of a resume, and a genuinely huge synthetic resume (7 pages, 180 distinct roles).

**Two of the five shared one real bug.** Both the garbage file and the password-protected PDF hit the identical wall: Google's own document parser rejects the file before the vision model ever runs, returning `"The document has no pages."` — and the generic `!r.ok` branch in `parse_file`'s Stage 3 was forwarding that raw upstream response straight into the `error` field shown to the user: `"AI error 400: {\"error\":{...,\"metadata\":{\"provider_name\":\"Google AI Studio\",...`. Not a fabrication, but a real leak of internal vendor detail and a genuinely unhelpful message for someone who just tried to upload a locked or damaged file. Fixed by reusing the same `noContentMsg` the blank/scanned-file case already returns, moving the raw provider text into `detail` (a secondary field, never the headline) instead of the main error. Verified live: both cases now return the friendly message post-fix.

**The other three needed no fix.** A French resume extracted with every fact and number intact ("3,8 secondes a 1,2 seconde"), nothing translated or altered. A cover letter, deliberately uploaded where a resume was expected, didn't crash and didn't invent an employer or figure that wasn't in the text — it did misattribute "Marketing Manager" (the role being applied *for*) as the person's own current title, a real but minor field-confusion given the source document isn't a resume at all, not a fabrication, and low priority since this specific mistake (uploading the wrong file type) is rare and visibly self-correcting once the person sees the result. The 180-role synthetic resume extracted completely: first and last entries verified correct against the source, no truncation, no timeout.

`npx tsc --noEmit` clean. Deployed live via `supabase functions deploy resume-hub`. Test account and all uploaded test files fully erased/deleted after.

## Home next actions (v3.3.0)

OverviewTab was a counts dashboard (resume count, saved job count, primary resume ATS badge, a static getting-started list). It told the user nothing to do, so it was deleted. HomeTab renders at most four cards, each only when its condition holds, from one loader: src/lib/hubSnapshot.ts -> loadHubSnapshot(userId).

| Card | Condition | Button |
|---|---|---|
| "<n> new job proposals" (always sorts first) | pending reveal_list requests > 0 | Read proposals (v3.6.0, was Get discovered before Proposals had its own tab) |
| "Add your resume" | resumes count = 0 | Go to Profile (v3.4.0, was Resumes) |
| "Complete your profile" (names the incomplete groups) | any groupGaps entry incomplete | Go to Profile |
| "<n> saved jobs not scored yet" | jobs without a job_matches row | Go to Jobs |

When all four are clear: one line, "You are set up. Open a job posting and AYN will score it.", plus the active resume name and whether the talent pool is on. No streaks, no completion percentage, no invented engagement metrics.

Gap logic moved out of ProfileTab into src/lib/profileGaps.ts -> computeGroupGaps(), so Home and Profile cannot disagree. (It briefly also fed TalentPoolCard's findability list inside Profile in v3.69.0; TalentPoolCard was deleted in v3.70.0, see below, so ProfileTab no longer calls computeGroupGaps at all — computeReadiness is enough on its own.)

## Single profile (v3.2.0)

The Hub used to show a Profile and a Canonical Profile. Canonical is an internal engineering concept and it leaked into the UI, so ProfileTab.tsx now renders exactly ONE profile. The word canonical appears nowhere user facing. Both tables stay; this is a UI and read-path consolidation, not a migration.

READ PATH: the UI mirrors _shared/identity.ts precedence, profile > canonical > resume > account. ProfileTab loads user_profile_canonical, user_profile_data, the primary resume, and auth.getUser in one Promise.all. Personal fields resolve through a `fallback` memo built from resume basics and the account email; a field shows the user-entered value when present, otherwise the fallback, with a muted source label: "You entered this", "From your resume", "From your account". Editing any field always writes the user-entered layer (user_profile_data) so it wins afterwards.

FIVE GROUPS (v3.5.0 order), each a collapsible card with a heading and a purpose line, open state remembered per session in sessionStorage, two columns on desktop for paired short fields and one column on mobile, autosave on blur with a small saved indicator and no Save button:
1. Your resume - Everything AYN writes starts from this. (the one active resume, upload or replace, download)
2. About you (first and last name, email, phone, location, current title, current company, LinkedIn, GitHub, portfolio) - Used in your tailored resumes and cover letters.
3. Your experience (skills with level and recency, work history with industry, team size and achievements, education with field of study, certificates since v3.70.0, derived years and seniority, what you are known for) - This is what AYN scores against a job and tailors from.
4. What you are looking for (desired titles, desired locations, minimum salary and currency, remote, relocation, employment type, availability, company stage) - Employers searching for candidates match on this first.
5. Work eligibility (countries, citizenship, sponsorship now, sponsorship later, work permit expiry) - Employers filter on this before anything else.

NEW FIELDS IN v3.5.0 AND WHY EACH EXISTS FOR MATCHING:
| Field | Where | Why it is matched on |
|---|---|---|
| skill.level (familiar, proficient, advanced, expert) | Your experience | "React" alone is unrankable. Level separates a user from an owner. |
| skill.years | Your experience | Employers filter on depth, e.g. 5+ years Python. |
| skill.last_used (this year, within 2 years, over 2 years ago) | Your experience | Recency decides whether a skill is live or historic. |
| experience.industry | Your experience | Domain is a hard filter for fintech, healthcare, government roles. |
| experience.team_size | Your experience | The only clean signal for management scope. |
| experience.bullets (2 to 5 achievements, labelled when they came from the resume) | Your experience | The tailoring engine rewrites these. Empty bullets means tailoring has nothing to work with. |
| education.field | Your experience | A real filter for regulated and technical roles. |
| derived.known_for (up to 3 lines) | Your experience | Feeds cover letters and the employer-facing summary. |
| preferences.employment_types (full time, contract, part time, internship) | What you are looking for | Cheap to answer, excludes wrong matches outright. |
| preferences.availability (immediately, 2 weeks, 1 month, 3 months, just looking) | What you are looking for | Employers with a start date filter on it first. |
| preferences.company_stages (early startup, growth, large, no preference) | What you are looking for | Stage fit is a common recruiter screen. |
| work_auth.work_permit_expires | Work eligibility | Shown only when a non-citizen country is selected. Prevents matches that expire mid-hire. |

FORM AUDIT (v3.71.0): asked directly to go through every field and toggle and check it against what the fields are actually asking, whether it matches what the backend needs, and whether it reads as confusing. Found and fixed six real issues, one of them a genuine data bug, not just a UX nit:

1. **The AI never actually saw availability, ever.** `canonicalDigest()` in `resume-hub/index.ts` (the compact profile summary fed into every score/tailor prompt) built its "start=" line from `preferences.start_date_availability` — a field name the frontend has never written to. `ProfileTab.tsx` only ever writes `preferences.availability`. So no matter what a seeker picked in the Availability dropdown, the digest always read `start=?`. One-line fix: read `pr.availability` instead, matching what two other call sites in the same file already correctly did (`canonicalDigest` was the one outlier). Verified by writing `availability: "Immediately"` through the real form and confirming the exact row `canonicalDigest` reads from now holds it.
2. **Visa type had no field anywhere, despite being asked in every scoring/tailoring prompt.** `waLine` in the same digest has always included `visa=${wa.visa_type || "n/a"}` — permanently "n/a" for every user, since `work_auth.visa_type` existed in the schema and the AI prompt but never in the form. Added "Visa type (optional)" to Work eligibility, shown alongside "Work permit expires" (both gated on `nonCitizenCountries.length > 0`, since neither is relevant to someone only eligible in their own citizenship country).
3. **Seniority and Primary function looked like multi-select fields but were single free-text boxes.** Placeholders read "entry, mid, senior, staff" and "Backend, Product, Design" — formatted exactly like the pill-button vocabulary lists used two sections later for Availability and Employment type, so a skimming user could read them as instructions to type the whole list. Converted both to `<Input list="...">` datalists (same pattern already used for "Industry or domain" in Work history): free entry preserved so no existing value is lost, but the suggested options are the actual vocabulary `derived.seniority` is documented and scored against elsewhere in the same backend file (`intern, entry, mid, senior, staff, principal, manager, director, vp, cxo`). Primary function has no established backend vocabulary to match, so a sensible general list was picked (Engineering, Product, Design, Data, Marketing, Sales, Operations, Finance, HR, Customer success, Legal).
4. **Current title and Current company were the only two resume-derived fields in "About you" with no provenance badge or revert.** Every sibling field (name, email, phone, location, LinkedIn, GitHub, portfolio) shows "From your resume" / "Edited by you" with a one-click revert, backed by the `field()`/`fallback` system built around `personal`/`user_profile_data`. These two live in `career.derived`/`user_profile_canonical` instead, so they never got that treatment. Added a parallel `derivedField()`/`derivedFallback` (computed from `resumeContent.basics.title`/`work[0]`) that does the same value-comparison, no separate "touched" tracking needed since `career.derived.current_title` is a single stored value, not two layers.
5. **"Current role" toggle could be switched on and silently do nothing.** `end` (the stored end date) always won over `current` (the boolean flag) in every place downstream that builds a date range, so a stale date left in "End" meant flipping the toggle had no visible effect. Turning it on now clears `end`; the End field is disabled and shows "Present" while current, and hands control back the moment it's turned off.
6. **Three different "where" fields with no signal they mean different things.** "Location" (About you, where you live), "Desired locations" (What you're looking for, where you want to work) and "Countries you can work in" (Work eligibility, legal eligibility) all correctly stay separate, but nothing said why. Added one-line cross-references on the latter two pointing at each other.

Also given a pass but left alone: `salary_min_usd` is stored and shown with whatever currency the adjacent field says (the AI-facing text already appends it, e.g. "salary_min=80000 CAD"), so despite the misleading internal name there is no real currency-mislabeling bug — just sloppy free-text input, fixed by converting Currency to the same datalist pattern with a short fixed list (CAD, USD, EUR, GBP, AUD, AED) rather than attempting real FX conversion, which would need a live rate source and ongoing maintenance this scope didn't call for. `open_to_travel` exists in the backend's `Preferences` type with no frontend field at all — noted, not added, since nothing currently asks for it anywhere (not even the employer intake side) and inventing a UI for a field nobody reads yet would be speculative.

SKILL MIGRATION: existing bare strings load as { name, level: null, years: null, last_used: null }. Nothing is lost and nothing is guessed. The user is prompted once, on their top skills only, to add levels; the group header shows "n of m have a level".

PROVENANCE DISPLAY RULES (v3.5.0, replacing the eight repetitions of "You entered this"): a field derived from the resume with no user edit shows "From your resume". A field the user changed away from a resume value shows "Edited by you" with a revert control. A field the user simply typed, with no resume value to compare against, shows nothing. The read precedence itself is unchanged.

MATCHING READINESS LINE: at the top of the tab, one sentence naming the one or two highest-impact missing things, from src/lib/profileGaps.ts -> computeReadiness(), which extends the same gap logic the findability panel uses to the new fields. Never a percentage. When nothing is missing it says so in one calm line.


TALENT POOL CARD, HISTORICAL (src/components/resume-hub/TalentPoolCard.tsx, new in v3.2.0, deleted in v3.70.0 — see TALENTPOOLCARD DELETED OUTRIGHT below): when opted in it rendered a "What employers see" preview (headline, seniority, years, location, skill chips), described honestly as the summary employers see first, with the note that they can also see the full profile and that email and phone are only shared after an approved intro. Skills were split by the candidate_skills.provenance column into "Backed by your resume" (extracted) and "AYN inferred these" (inferred); inferred chips had a delete control calling talent_pool_skill_delete. A freshness line read "Your profile was last indexed <relative time>", and flipped to "Your resume changed since AYN last indexed you" with a Refresh button when indexed_at was older than resume or profile updated_at. None of this exists in the UI any more; `talent_pool_skill_delete` and the freshness/indexed_at fields are still real backend concepts, just no longer surfaced to the seeker.

CONSENT (v3.5.1, "honest discovery consent"). The card no longer claims an "anonymized profile", because that is not what employers get. Copy when OFF: "Turn this on and employers searching AYN can see your full profile: your resume, work history, skills, education, what you are looking for, and where you can work. AYN's AI uses all of it to match you to roles you would not have found on your own. Employers reach you through AYN. Your email and phone are only shared when you approve a specific request." Copy when ON: "You are discoverable. Employers searching AYN can see your full profile, and AYN's AI matches you to open roles using everything you have provided. Your email and phone stay private until you approve an intro. Turn this off anytime and your profile leaves the pool immediately." Switching ON opens an AlertDialog ("Make your profile discoverable" / "Turn on discovery" / "Cancel") and nothing is written until the user confirms; switching OFF is immediate. talent_pool_set now takes consent_version and writes it to the new talent_pool_consent.consent_version column alongside consented_at (current value: v3.5.1-full-profile). talent_pool_get returns consent_version.

TOGGLE MOVED TO PROFILE (v3.67.0). Asked directly to make "Let employers find me" obvious and move it into Profile rather than leaving it one tab away in Get discovered. `ProfileTab.tsx` now owns the switch itself: its own `talentPoolGet`/`talentPoolSet` calls, its own confirm `AlertDialog`, rendered as a standalone card right after the readiness banner, above "Your resume" — the first thing on the page after the summary line. Styled to read at a glance rather than as a generic settings row: the whole card, the badge, and the switch itself all turn a solid green (`emerald-500`) when on, grey (`muted-foreground`) when off, overriding the app's default black/ember switch color specifically for this control since "am I visible to employers" is a bigger decision than a normal preference toggle. `CONSENT_VERSION` now lives in `ProfileTab.tsx` as `DISCOVERY_CONSENT_VERSION`, same value (`v3.5.1-full-profile`), same bump-when-wording-changes rule. `TalentPoolCard.tsx` (at this point still rendered in the Get discovered tab) lost its own `Switch`/`AlertDialog`/toggle function entirely, replaced with a "Manage in Profile" / "Turn on in Profile" button — superseded two versions later, see GET DISCOVERED TAB REMOVED below.

GET DISCOVERED TAB REMOVED, EVERYTHING FOLDED INTO PROFILE (v3.69.0, itself superseded a version later — see TALENTPOOLCARD DELETED OUTRIGHT below). Reported directly from a screenshot of the nav rail: with the switch already in Profile, the "Get discovered" tab had nothing load-bearing left in it and looked redundant. Removed outright rather than left as a half-empty tab. `DiscoveryTab.tsx` is deleted; `TalentPoolCard.tsx` lost its "Manage in Profile" button (the v3.67.0 stopgap) along with the rest of its header, and became body-only — no switch, no badge, no restriction message, all three already live in `ProfileTab.tsx`'s own toggle card. It rendered directly under that toggle card in `ProfileTab.tsx` rather than needing its own tab or navigation at all. `ResumeHub.tsx`'s `NAV` array and `TabKey` type dropped `discovery` entirely; `HomeTab.tsx` and `ProfileTab.tsx` both had a dead or dead-ending `onOpenDiscovery` prop removed (`HomeTab`'s was already unused before this — never wired to a click handler).

TALENTPOOLCARD DELETED OUTRIGHT, CERTIFICATES ADDED UNDER EDUCATION (v3.70.0). Reported directly from a screenshot of the exact body v3.69.0 had just moved into Profile ("What employers see" / skills / freshness / findability): remove it, and separately, add a Certificates field under Education. Confirmed via a follow-up question that "remove" meant the whole card, not just one section of it. `src/components/resume-hub/TalentPoolCard.tsx` is deleted outright (it had exactly one caller left after v3.69.0); `ProfileTab.tsx` dropped the `groupGaps`/`computeGroupGaps` computation that only existed to feed it, and its import. The discoverability toggle card itself (green/grey, v3.67.0) is unaffected and still the only thing on Profile about "Let employers find me" — nothing employer-preview-shaped renders anywhere in the Hub now; the tailoring/matching pipeline itself is untouched, this was a UI-only removal. Separately, `career.certifications` (`Cert = { name, issuer?, year? }`) already existed in `ProfileTab.tsx`'s state, was already read from and written to `user_profile_canonical.certifications` by `load()`/`persist()`, and `updateAt`/`removeAt` already supported it generically — the field existed end to end with no UI ever exposing it. Added a "Certificates" block directly after Education inside the "Your experience" group (same add/remove/PlainField pattern as Education: Certificate name, Issuer, Year), with a new `updateCert()` helper alongside `updateEdu()`. Verified live with a real throwaway account: the toggle card and "What employers see" body are both gone from Profile with the discovery switch still on, and the page text confirms "Certificates (0)" / "Add certificate" / "No certificates yet." rendering immediately after "Education (0)", before "Total years of experience".

REINDEX TRIGGERS (v3.2.1, the real bug behind the redesign: resumes and profile fields are written client side and bypass the edge function, so the pool index never rebuilt). All call sites go through ONE helper, src/lib/talentPoolSync.ts -> reindexTalentPool(reason). The helper enforces the rules so no call site can get them wrong: fire and forget, never awaited by the save path, errors swallowed, skipped entirely when the seeker is not opted in (opt-in state cached 5 minutes, seeded by `ProfileTab.tsx`'s own `loadPool()` since v3.70.0, previously by TalentPoolCard), concurrent calls coalesced, and on success it dispatches the AYN_POOL_REINDEXED window event — nothing listens for it since TalentPoolCard was deleted in v3.70.0, kept as a harmless extension point (see talentPoolSync.ts's own comment).

Call sites, one per client write that changes indexed content:
| Write | File | reason |
|---|---|---|
| Resume upload or replacement (becomes the one active resume) | ProfileTab.tsx handleResumeParsed() | resume_upload |

| Profile field save (user_profile_data + user_profile_canonical upserts) | ProfileTab.tsx save() | profile_save |

ResumeUpload.tsx deliberately does NOT call it: the component only parses, it never persists a row. Both of its callers reindex after their own insert, so firing inside the component would run before the row existed and double fire. ProfileTab.save() writes the two profile tables directly rather than through profile_canonical_save, so nothing reindexes server side and the client ping is required (no double fire). indexCandidate rebuilds both candidate_index and candidate_skills, so provenance stays accurate.

Production embedding audit (v3.2.1, checked against project dfkoxuokfkttjhfjcecx): candidate_index has 0 rows, candidate_skills 0 rows, talent_pool_consent 0 rows and 0 opted in. There are no deterministic-v1 rows to re-index because nobody has ever been indexed. Re-run this query before marketing the pool.

Bridges: src/lib/resumeHub.ts (session JWT client for the edge function), src/lib/extension.ts (AYN_PING, AYN_PROFILE_UPDATED, handoffUrl; extension id bjbifnpjbcbdojhgjpedkakkfjpcjmdl). src/pages/Handoff.tsx fallback when extension absent. src/pages/ExtensionApprove.tsx approves link codes. src/pages/ResumeMatch.tsx (standalone matcher using the resume-match function) was deleted in v3.58.0, found orphaned during the site navigation audit.

## Backend action registry (supabase/functions/resume-hub, one POST, body { action, ...payload })
Public (anon key): link_start, link_poll, ats_config_get (v2.10.0 — returns { config, version } from the ats_config 'registry' row so the extension can pull server-driven adapter rules before sign-in).
Public (anon key): link_start, link_poll.
Extension lane (x-ayn-ext-token): ext_bootstrap, ext_ingest_job, ext_cover_letter_text, ext_job_score, ext_suggest_roles, ext_find_contacts, ext_download_resume_text, ext_ask, smart_tailor, ext_profile_canonical_get, ext_job_lookup (v2.8.0 JD resolver backend branch, matches jobs.source_url ilike host+path, returns newest row with jd_text >= 400 chars). v3.0.0 REMOVED every write-path action: ext_autofill, ext_vision_fill, ext_log_result, ext_profile, ext_get_resume_blob, ats_config_get, answers_list/update/delete. v3.0.1 REMOVED the tracker actions: ext_save_application, ext_get_applications, ext_update_application.
Web lane (JWT): link_approve, token_mint, token_list, token_revoke, parse, parse_file, rewrite, match, tailor, cover_letter, profile_canonical_get, profile_canonical_extract, profile_canonical_save.
Dual-auth lane (v2.8.4 — accept EITHER x-ayn-ext-token OR a session JWT): answers_list, answers_update, answers_delete, ext_ingest_job. Defined by DUAL_AUTH_ACTIONS in supabase/functions/resume-hub/index.ts. When called from src/lib/resumeHub.ts (Learned Answers UI in ProfileTab, save-job in JobsTab), the edge function resolves userId from the Bearer JWT and runs the same handler with the admin client. All other EXT_ACTIONS keep the strict ext-token requirement.

resolveResumeContent(admin, userId, resumeVersionId): honors a tailored resume_versions row when passed, otherwise the is_primary resume. loadIdentity(admin, userId, { resume_version_id }) in supabase/functions/_shared/identity.ts is the single identity source of truth and is now wired into ext_job_score, smart_tailor and ext_cover_letter_text.
Aux functions: resume-match (standalone web matcher) — still deployed, but orphaned since v3.58.0 deleted its only caller, src/pages/ResumeMatch.tsx. All fill-only functions were deleted in v3.0.0 and every other unused function was deleted in v3.21.0.

## Tables
resumes (content jsonb, is_primary), resume_versions (content, created_for_job_id), jobs (jd_text, source_url, dedupe_hash sha256 of company|title|urlPath), job_matches, cover_letters, job_cache (url_hash, full_jd, parsed, expires_at 24h), device tokens (token_prefix, device_label, last_used_at, revoked_at), user_profile_data (legal names, email, phone, address jsonb, links jsonb, default_answers jsonb), canonical profile (loadCanonical / profile_canonical_*), candidate_index (talent pool embeddings). v3.1.0 adds ai_result_cache (cache_key, purpose, payload, expires_at) and ai_call_telemetry (purpose, model, duration_ms, cache_hit, source_map, gap_matched/missing/surfaced, meta). DEPRECATED: applications table (old split-brain tracker), job_applications (tracker removed in v3.0.1); never write to either.

## Integration truth table
| Seam | Mechanism | Status |
|---|---|---|
| Sign in / device link | link_start/poll/approve + token | CONNECTED |
| Download + latest version display | /ayn-extension.zip + ayn-extension-version.json | CONNECTED (v2.7.0) |
| Installed-version detection | AYN_PING | CONNECTED |
| One-click autofill from Hub | AYN_TRIGGER_AUTOFILL, /handoff fallback | CONNECTED |
| Tailored resume reaches fill | handoff resumeId -> HANDOFF_ARRIVED -> ext_autofill resume_version_id | CONNECTED (v2.7.0; before, sidepanel dropped resumeId and backend hardcoded is_primary) |
| Profile edits reach extension | AYN_PROFILE_UPDATED clears cache; 24h TTL fallback | CONNECTED (v2.7.0) |
| Job capture ext to hub | ext_ingest_job -> jobs -> JobsTab | CONNECTED |
| Application tracking | AUTO_TRACK_SUBMIT -> ext_save_application -> job_applications -> TrackerTab | CONNECTED (v2.7.0 unified) |
| Fill telemetry to user | ext_log_result -> autofill_runs -> TrackerTab | CONNECTED (v2.7.0) |
| Learned answers view/edit | ext_answers in ProfileTab | CONNECTED (v2.7.0) |
| Auto update of sideloaded builds | none; manual re-download | GAP. Ideas: sidepanel banner comparing manifest vs ayn-extension-version.json, or Chrome Web Store. |
| AUTO_TRACK_SUBMIT enrichment | v2.8.0: LAST_MATCH per tab (set by SCORE_JOB_CARD) attaches match_score + job_id at submit | CONNECTED |
| JD Resolver (full JD before AI) | v2.8.0: manual paste → current page → opener tab → registry fuzzy → listing fetch (PARSE_JOB_HTML) → ext_job_lookup; sidepanel provenance banner shows source + quality | CONNECTED |
| Preview-domain bridge | externally_connectable gates aynn.io | PARTIAL: on lovable.app previews AYN_PING falls back to handoff. Expected, but confusing in testing. |

## Talent pool (v2.9.0-A, Phase A data layer)

Foundation for a two-sided marketplace. Phase A ships schema, consent, and indexing only; Phase B (employer mode inside the dashboard chat) is pending.

Tables:
- **talent_pool_consent** (user_id pk → auth.users, opted_in, consented_at, revoked_at, updated_at). RLS: users manage only their own row.
- **candidate_index** (user_id pk → auth.users, headline, summary, seniority, location, years_experience, embedding vector(768), profile_text, indexed_at). RLS: users can read only their own row. NO cross-user select policy. Employer search in Phase B runs via the service role and MUST filter on talent_pool_consent.opted_in.
- **candidate_skills** (id, user_id → auth.users, skill, skill_norm lowercased, provenance 'extracted'|'inferred', source, unique(user_id, skill_norm, provenance)). RLS: users can read and delete only their own rows.
- pgvector HNSW cosine index on candidate_index.embedding.

Web-lane actions (session JWT, in supabase/functions/resume-hub/index.ts):
- **talent_pool_get**: returns { opted_in, consented_at, indexed, skills_count } for the caller.
- **talent_pool_set** { opted_in: boolean }: upserts consent (consented_at/revoked_at). Turning ON runs indexCandidate() synchronously; turning OFF deletes the caller's candidate_index and candidate_skills rows immediately.
- **talent_pool_reindex_self** (v2.9.1): re-runs indexCandidate for the caller (must be opted in) and returns { model, skills_count }. Fired automatically after every client-side write that changes indexed content (v3.2.0, via `reindexTalentPool()` in `talentPoolSync.ts`) — the manual Refresh button that also called it lived on TalentPoolCard and was removed with it in v3.70.0, so this is reachable only through the automatic path now.
- **talent_pool_skill_delete** (v3.2.0): deletes one candidate_skills row owned by the caller so a seeker can remove an inferred skill they disagree with. Its only caller was TalentPoolCard's inferred-skill delete button; with that component deleted in v3.70.0 this action is now orphaned (still deployed, zero callers in `src/`), the same shape as `delete-account`/`resume-match` in the platform map.

Embedding provider (v2.9.1):
- **embedText(text)** returns `{ vector, model }`. Calls the AI gateway `/v1/embeddings` with `openai/text-embedding-3-small` and `dimensions: 768` so the existing `vector(768)` column is unchanged. On any error (missing LOVABLE_API_KEY, non-2xx, malformed body, network) it falls back to `deterministicEmbed` and returns model `'deterministic-v1'`. Logs which path was used once per call at debug level.
- `candidate_index` now carries `embedding_model text not null default 'deterministic-v1'` and `embedded_at timestamptz`, so a row can be traced back to the model that produced its vector.
- indexCandidate uses embedText and stores both `embedding` and `embedding_model`.

Indexing routine indexCandidate(admin, userId):
1. Loads canonical profile (loadCanonical) + primary resume.
2. Builds profile_text. v3.5.0 widened it so employers can match on what the form now collects: seniority, function, YoE, current title, what the candidate is known for, each skill written as "name level years recency", a repeated "Strongest current skills" line for advanced or expert skills not stale (this is how level and recency get weight in the embedding, no schema change needed), per role title, company, dates, industry, team size and up to 5 achievement bullets, education with field of study, certifications, availability, employment type, company stage, desired titles, remote and relocation, and the resume summary. **Still excludes name, email, phone, address, links** — matching is anonymous until a reveal.
3. Embedding: `embedText(profile_text)` (see above). Real model when the gateway is reachable, `deterministicEmbed` fallback otherwise; the returned model tag is stored on the row.
4. Upserts candidate_index (vector, model, embedded_at).
5. Rebuilds candidate_skills. **Provenance rule (Graphify-inspired):** skills literally present in canonical.skills OR primary resume.skills → 'extracted' (source 'canonical_profile' or 'resume'). Skills in canonical.derived.top_skills NOT already extracted → 'inferred'. Phase B matcher must satisfy must-have requirements ONLY from 'extracted' edges; 'inferred' edges may support nice-to-haves. This is the noise-cancellation rule. v3.5.0 added three nullable columns to candidate_skills, `level`, `years` and `last_used`, carried through from canonical skills on extracted edges only; inferred edges always write null because AYN did not observe them.



Re-index hooks: profile_canonical_save fires reindexIfOptedIn(admin, userId) non-blocking after upsert. Toggling talent_pool_set to true also triggers a fresh index. (The resume is written client side in ProfileTab.tsx, which calls reindexTalentPool after the insert; users can also force a reindex by toggling the switch off and on.)

Hub UI (ProfileTab.tsx, was TalentPoolCard.tsx before v3.67.0/v3.70.0): "Let employers find me" switch wired to resumeHubApi.talentPoolGet / talentPoolSet. talent_pool_get returns opted_in, preview (headline, seniority, location, years_experience, indexed_at, embedding_model), skills[] with provenance, and indexed_at / resume_updated_at / profile_updated_at for the freshness check — the preview/skills/freshness fields are still returned by the API but nothing in the UI reads them since v3.70.0.

## Employer marketplace (v2.9.0-B)

Employer experience lives inside the AYN dashboard. Top-right "Hiring mode" button opens `src/components/dashboard/EmployerChatPanel.tsx` as a full-surface overlay. All employer calls are session-JWT web-lane actions in `supabase/functions/resume-hub/index.ts`, gated on `org_members` membership.

Tables:
- **orgs** (id, name, website, created_by, created_at). RLS: members select their own org rows; creator inserts.
- **org_members** (org_id, user_id, role, pk (org_id, user_id)). RLS: members select their own rows.
- **employer_searches** (id, org_id, created_by, job_spec jsonb, results jsonb, ref_map jsonb, created_at). RLS: NO client select policy. All reads go through the edge function via service role. **ref_map (opaque ref → user_id) never leaves the server.**
- **reveal_requests** — since v3.6.0 this is the PROPOSALS table, name kept for compatibility. (id, org_id, candidate_user_id, search_id, candidate_ref, status pending|approved|declined, created_at, decided_at, and the v3.6.0 columns job_title text NOT NULL default '', job_location, employment_type, salary_range, job_url, message text NOT NULL default '' with a CHECK ≤1000 chars, sent_at timestamptz default now(), responded_at timestamptz). Partial unique index on (org_id, candidate_user_id) WHERE status='pending'. RLS: candidates select/update rows where candidate_user_id = auth.uid(); employer reads go only through the edge function.

Web-lane actions:
- **employer_org_create** { name, website }: creates org + admin membership.
- **employer_org_get**: caller's first org (or null) plus role.
- **employer_intake_chat** { org_id, messages[] }: intake agent. System prompt asks at most 3 clarifying questions, then returns either `{done:false, question}` or `{done:true, job_spec:{ title, seniority ∈ intern|entry|mid|senior|staff|principal|manager|director, must_have_skills[≤6], nice_to_have_skills[≤6], location_preference, remote_ok, min_years, notes }}`. No markdown, no em/en dashes, ranges use "to".
- **employer_card_answer** { search_id, ref, card } (v3.9.0, replaces employer_results_chat): four fixed questions only, `why_score`, `what_is_missing`, `compare`, `screen_questions`. Loads the stored `employer_searches` row and answers from the stored card for that ref (plus the sibling cards for `compare`). The system prompt hard-codes the role line built from job_spec (seniority label plus title) so the model can never re-describe the role, states the candidate's years_experience as fact when it exists, and forbids internal refs. Server strips markdown symbols and any leftover `c1` style ref before returning. Client caches answers per search_id|ref|card in `CandidateAskCards.tsx`, so a second click never re-runs the model.
- **employer_draft_proposal** { org_id, search_id, ref } (v3.9.0): writes the proposal message before the employer sees the dialog. 4 to 6 plain sentences, opens with the role and company name, cites only matched must-haves and the stored why lines, opens with "Hi there" because no name is known, ends with what happens on accept. Capped at 1000 chars. Failure is silent: the dialog just keeps its placeholder and sending still works. "Rewrite draft" re-runs it.
- **employer_match** { org_id, job_spec }: THE HYBRID MATCHER. Two-step noise cancellation:
  1. **Deterministic extracted-only prefilter (zero AI).** Load opted-in candidates → for each, EVERY must_have_skill must match a `candidate_skills` row with `provenance='extracted'` (skill_norm equality OR token-overlap ≥ 0.8). Inferred edges cannot rescue a missing must-have.
  2. **Vector recall (v2.9.1 same-model guard, v3.38.0 moved into Postgres).** Embed the job spec text with `embedText`. If some eligible candidates are still on `'deterministic-v1'` while the spec is on the real model, re-index up to 25 of them inline first (bounded, non-blocking to the user, nothing surfaced). Ranking itself is now the SECURITY DEFINER RPC `match_candidates_by_embedding(p_ids, p_embedding, p_model, p_limit)`: `SELECT ... WHERE user_id = ANY(p_ids) AND embedding_model = p_model ORDER BY embedding <=> p_embedding LIMIT p_limit` — the same-model guard is a plain WHERE clause now, cosine distance runs inside Postgres via pgvector's `<=>` operator (able to use the real HNSW index on `candidate_index.embedding`, `vector_cosine_ops`), and only the top 12 rows cross the wire instead of every eligible candidate's full 768-dim vector. `employer_match` no longer touches embeddings in JavaScript at all. Grants: `service_role` only, nothing for `authenticated`/`anon` — it takes an arbitrary id list and returns real profile data with no authorization check of its own, so it must never be reachable directly via PostgREST, same restriction shape as `assessment_rubrics`/`assessment_results` (v3.13.0).
  3. **Grounded AI rerank (one call).** Anonymized payload only: opaque refs (c1, c2…), profile_text, seniority, years_experience, location, skills split into extracted[]/inferred[], headline. Never user_ids, names, or emails. Rules baked into the system prompt: score 1-100; must_have coverage may only cite extracted skills; inferred skills contribute at most 10 total points via nice-to-haves; every sentence in "why" must reference something literally in the provided data; if fewer than 3 candidates are genuinely strong, return fewer with a `pool_note` instead of padding.
  4. Persist to `employer_searches` (job_spec, top-3 results, ref_map). Return `{ search_id, results[≤3], pool_note }`. The ref_map stays server-side.

- **employer_reveal_request** { search_id, ref, job_title (required), job_location, employment_type, salary_range, job_url, message (required, ≤1000 chars) }: THE PROPOSAL. Resolves ref → user_id via the server-side ref_map, then enforces two rate limits before inserting into `reveal_requests`:
  1. One OPEN proposal per (org, candidate). A second send while a row is `pending` returns 429 with "You already have an open proposal with this candidate."
  2. No new proposal within 30 days of a decline from that candidate to that org (checked on `responded_at`), returns 429.
  A partial unique index `reveal_requests_one_open_per_org_candidate` on (org_id, candidate_user_id) WHERE status='pending' enforces limit 1 at the database level too.
- **reveal_list** (candidate side): every proposal for the signed-in candidate, newest first by `sent_at`, enriched with org name and website. Returns the full proposal body (title, location, employment type, salary range, url, message, sent_at, responded_at, status).
- **reveal_decide** { id, approve } (candidate side): sets status approved|declined plus `decided_at` and `responded_at`, own rows only. The employer never learns a decline reason because none is collected.
- **employer_reveal_status** { search_id? }: for org members. Without `search_id` it returns every proposal across the caller's orgs (the Sent list); with one it is scoped to that search. Includes name + email + phone ONLY for rows where status='approved' (from user_profile_data, falling back to auth.users for email). Otherwise no PII of any kind.

### v3.6.0 the proposal loop, end to end
1. Seeker turns "Let employers find me" ON in Profile (was its own Get discovered tab before v3.69.0). If it is OFF they are not in `talent_pool_consent` with `opted_in=true`, so `employer_match` never loads them.
2. Approved employer lands on `src/pages/EmployerHub.tsx` (routed from Index.tsx AuthedShell when profiles.role='employer' and employer_accounts.status='approved') and answers the intake widgets (v3.8.0).
3. `employer_match` returns up to three candidates, each with score, headline, seniority, years, location, matched must-haves, gaps, three why lines, plus `skills_extracted`, `skills_inferred`, and an anonymous `summary` slice of profile_text (v3.6.0 additions, still no PII).
4. Candidate detail dialog shows the full reasoning and the skills provenance split. No name, email, phone or user id exists in this payload.
5. Employer sends a proposal from the detail dialog, with the message pre-written by `employer_draft_proposal` (v3.9.0) and editable. The button becomes "Proposal sent, waiting for a reply".
6. Seeker sees it on the Proposals tab (`src/components/resume-hub/ProposalsTab.tsx`), badged with the pending count in the rail and as the first Home next-action.
7. Seeker chooses "Share my contact details" or "Not interested". Accepted and declined proposals collapse into a History section.
8. On accept only, `employer_reveal_status` starts returning name, email and phone to the org, and contact happens outside AYN.

Reveal ladder, what each side can see at each step: employer sees anonymous card → anonymous full reasoning → proposal sent (still anonymous) → on accept, name + email + phone. Seeker sees the org name, the full job details and the employer's message from the first moment.

v3.44.0 — no longer true. Sending a proposal (`employer_reveal_request`) now also emails the candidate (`notifyCandidate`, `_shared/emailTemplate.ts`), and `reveal_decide` emails every member of the org (`notifyOrgMembers`) on both accept and decline, no candidate identity or PII in the email body either way. Same pair of helpers, and the same "assessment sent"/"assessment submitted" wiring, are used by `employer_assessment_send` and `finaliseAssessment` below. In-app badge/Home-next-action notification is unchanged and still there too — email is additive, not a replacement. v3.47.0 — both helpers also write to `email_logs` now (each call site passes an explicit `emailType` string: `proposal_received`, `proposal_accepted`, `proposal_declined`, `assessment_received`, `assessment_completed`), readable from the admin System → Email pane. No FK-timing risk here the way `auth-send-email` had (see docs/map/platform.md v3.47.0 entry): every recipient here is an already-established account, never a same-transaction brand-new signup.



## v3.1.0 Tailor and Cover Letter (supabase/functions/_shared/tailoring.ts)

Tailor and cover letter are THE product now, so both run through one shared module instead of ad hoc prompt strings.

buildSections(identity, canonical, pastedResumeText) -> { sections, text, dropped[], chars }. Replaces resumeText.slice(0, 8000) in smart_tailor and slice(0, 6000) in ext_cover_letter_text. Budget is 24000 chars and nothing is ever cut mid item: whole sections are dropped in a fixed order (projects, certifications, education, then the oldest roles) and the dropped list is returned to the client and named in the prompt. Canonical experiences win over resume work when they are at least as complete; the pasted resume is appended verbatim when there is room, and used whole when there is nothing structured at all.

computeGap(jd, bundle, extra) -> GapAnalysis. DETERMINISTIC, no model call. It extracts requirement items from the JD (bullets plus lines under requirement / qualification / nice to have headings, with benefits and EEO sections excluded), tokenises each one with a stopword list, and tests the terms against the normalized section text. Short skill phrases (up to 3 terms) need full presence; longer sentences count as evidenced at 60 percent term overlap. Output is matched / missing / niceToHave with the evidencing terms attached. The model receives the result and only decides what to surface and how to phrase it.

Two pass quality. Tailoring always runs draft then a self critique and revise pass checking grounding, unchanged numbers, unsupported skills, and coverage of the top missing requirements. Cover letters run the second pass on the detailed length tier only.

### v3.72.0 — the web app's own Score/Tailor/Cover letter never used any of the above

Asked directly to check whether scoring and tailoring were "synced perfectly." They were not, and not in a small way: `match`, `tailor`, and `cover_letter` — the three web-lane actions `JobsTab.tsx` actually calls for the Hub's own Score this job / Tailor resume / Write cover letter buttons — had never been touched by the v3.1.0 rebuild above. They were still three bare, independent prompts from before it, each taking the client's raw resume JSON as its only input:

- **`match`** had no rubric, no honesty rule, no deterministic gap analysis, no canonical profile (so skill levels, certifications, work auth, known-for — everything Profile actually collects — were invisible to it), no temperature control (the same "score wobbles on identical input" bug already fixed once for the resume optimizer in v3.66.0, present here too and never caught since nothing had tested repeat calls), and no cache, so every click was a fresh full-price AI call.
- **`tailor`** took the raw resume blob directly, with no figure-preservation verification (the extension's `handleSmartTailor` checks every number/date survived the rewrite and retries once if not; this one just trusted the model), and no cache.
- **`cover_letter`** had no company-context fetch, no figure verification, no cache, and its bare prompt let the model invent a full letterhead ("[Hiring Manager name, if known, otherwise title]") — a real, visible defect caught while testing this fix, not present in the extension's cover letter, which has always specified an explicit 4-paragraph body-only structure.

Root cause: `ext_job_score` / `handleSmartTailor` / `handleCoverLetter` (the extension lane) were built in v3.1.0 specifically to fix this shape of problem for the extension, but nobody ever ported the fix to the web lane, since it's a separate, older set of actions with a different name (`match` vs `ext_job_score`) that never got connected to the same shared module.

Fix: all three now call the exact same shared pipeline the extension uses — `loadIdentity` + `loadCanonical` (server side; the client no longer sends a resume blob at all, `resumeHubApi.match/tailor/coverLetter` dropped the `resume` parameter and `JobsTab.tsx`'s three call sites were updated) → `buildSections` (full canonical profile, not just the raw resume) → `computeGap` (deterministic JD-requirement grounding, the model never re-derives what's missing) → a rubric-driven, honesty-ruled, `temperature: 0.1` scoring call for `match`; the same grounding plus a figure-preservation check with one retry for `tailor`; the same grounding plus `fetchCompanyContext` and an explicit no-placeholder paragraph structure for `cover_letter`. Same 24h/`TAILOR_TTL` (7 day) content-hash caching as the extension, so a repeat click on an unchanged resume against an unchanged JD costs zero credits, not a fresh charge. `ext_job_score`'s own scoring call also got `temperature: 0.1` added, since it had the identical missing-temperature bug independently.

Output shapes were deliberately left unchanged (`match` still returns `{score 0-100, breakdown, missing_keywords, summary}`, `tailor` still returns `{resume: ResumeContent}` matching `RESUME_SCHEMA`, `cover_letter` still returns `{body: string}`) — `tailor`'s structured JSON output stays structured rather than switching to the extension's flat ATS text, since `JobsTab.tsx` stores it as a `resume_versions` row and `resumeDocs.ts` builds a PDF/DOCX straight from that shape; unifying the *output format* between the two lanes would have broken that pipeline for no real benefit. What's synced now is the grounding and the quality bar, not the wire format, which is a legitimate, necessary difference given the two lanes hand their result to genuinely different consumers (a downloadable structured document vs. text meant for pasting into a live application form).

Verified live end to end: seeded a resume with no certifications and a canonical profile with an AWS certification the resume itself never mentions, scored a JD requiring that exact certification — response's summary named the AWS certification by name and `missing_keywords` came back empty, something structurally impossible under the old code path since it never read `user_profile_canonical` at all. Tailored the same JD, got a `resume.certifications` array containing the AWS cert. Wrote the cover letter, got a clean 4-paragraph letter with the cert cited and no bracketed placeholder text. Re-ran `match` and `tailor` with the identical JD and confirmed both came back `cached: true` / `credits.spent: 0`. Then drove the real Jobs tab UI end to end (Score this job → Tailor resume → Write cover letter) against a real job row and confirmed the same behavior through the actual buttons, not just curl.

Figure preservation is verified, not requested. extractFigures / droppedFigures pull every number, percentage, currency figure and year. For tailoring, every input figure must still be present in the output; for cover letters, every figure cited must exist in the sections. One retry on failure, then the draft ships with figuresVerified: false and the offending list.

fetchCompanyContext(admin, company, jobUrl): server side fetch of the employer's own About or home page, ATS hosts excluded, robots.txt respected, 3.5s timeout, 500 to 1000 chars, cached 7 days in ai_result_cache, fails open. Never LinkedIn, never anything behind a login. The prompt says to ground the opening in it or say nothing rather than invent enthusiasm.

Caching. tailor and cover by (user_id, resume_version_id, section hash, jd hash) for 7 days; ext_job_score by (jd hash, resume_version_id, applicant snapshot hash) for 24h. JD resolution is shared through job_cache so score, tailor, cover and ask reuse one fetch.

Speed. ext_job_score no longer awaits parseJobMeta before scoring: metadata parsing runs concurrently with the scoring call and is awaited afterwards for salary and the honesty safety net. The score prompt is grounded on the deterministic gap block instead of JOB_PARSED.

Client contract. smart_tailor returns gapAnalysis { method, alreadyStrong[], surfaced[], stillMissing[], niceToHave[], counts } plus figuresVerified / figuresAltered and sectionsUsed. surfaced is computed by re-running the gap analysis against the tailored output, so it reflects what actually landed. The sidepanel renders this as "Where you stand" under the tailored resume: surfaced, already strong, and genuinely missing with an explicit note that AYN left those out on purpose.

Telemetry. logAiCall writes one ai_call_telemetry row per AI call: purpose, model, duration_ms, cache hit, the identity sourceMap, and for tailor the matched / missing / surfaced counts.

## Findability panel, historical (deleted in v3.70.0)

A per-group findability list ("How findable you are") lived on TalentPoolCard instead of ad hoc nudges: out of ProfileTab into a dedicated Get discovered tab (DiscoveryTab) in v3.3.0, the switch back to ProfileTab in v3.67.0, the whole component back with it in v3.69.0, then deleted outright along with the rest of TalentPoolCard in v3.70.0 (see TALENTPOOLCARD DELETED OUTRIGHT above). Home's own next-action cards and the top-of-Profile readiness line, both driven by the same `computeReadiness`/`computeGroupGaps` functions in `src/lib/profileGaps.ts`, are the only "what's missing" surfaces left.

| Group | Complete when | Consequence when missing |
|---|---|---|
| About you | first name + email + (current title or city) | Employers cannot place you on a shortlist |
| What you're looking for | at least one desired title | You will not surface for role based searches |
| Where you can work | a work-auth country or citizenship | Excluded from most searches, employers filter here first |
| Your experience | at least one skill and one experience | Nothing for the matcher to compare a job against |

Freshness line and Refresh (talent_pool_reindex_self) are unchanged from v3.2.1.
Reindex triggers remain the seven call sites routed through src/lib/talentPoolSync.ts.

## v3.3.0 labels rewritten

| Where | Was | Now |
|---|---|---|
| Nav | Saved jobs | Jobs |
| Nav | Extension / "Install AYN" | Browser extension / "Score jobs as you browse" |
| Nav | Overview / "Snapshot" | Home / "Start here" |
| TalentPoolCard freshness | "Your profile was last indexed X" | "Employers have seen this version since X" |
| TalentPoolCard stale line | "changed since AYN last indexed you" | "changed since AYN last refreshed what employers see" |
| TalentPoolCard toasts | "Profile re-indexed" / "Couldn't re-index" | "Profile refreshed" / "Couldn't refresh" |
| TalentPoolCard empty states | "No skills indexed yet" / "Not indexed yet" | "No skills saved yet" / "Nothing to show yet" |
| JobsTab primary action | "Calculate match" | "Score this job" |
| ExtensionTab hero copy | autofill, recruiters, application tracking (all removed features) | "Score any job posting while you browse, and tailor your resume without leaving the page." |
| ProfileTab footer | (none) | "This profile is what employers search when you are in the talent pool" linking to Get discovered |

The words canonical, index, vector, embedding, and ingest no longer appear in any user-facing seeker string. They remain in code, table names, and these docs.

Embedding audit (2026-07-30): `select embedding_model, count(*) from candidate_index group by 1` returns zero rows. No 'deterministic-v1' rows exist, so no backfill is needed.


## v3.10.1 employer surface tokens (measured, not eyeballed)

The orange scope lives in src/index.css `.employer-surface` (--primary, --primary-foreground, --ring, --ayn-orange). Rule: the class must be on BOTH the page wrapper in src/pages/EmployerHub.tsx and on document.body via a mount effect. Portalled shadcn content (Dialog, AlertDialog, Popover, Select) attaches to document.body and inherits nothing from the page wrapper, so the body class is what turns the proposal dialog's Send proposal button orange. Measured after the fix: body --primary resolves 24 95% 53% and a body-level `.bg-primary` node computes rgb(249, 112, 21) on white text.

Company profile (orgs table: website, industry, company_size, headquarters, about, logo_url, linkedin_url) is edited in src/components/employer/CompanyProfile.tsx, rendered inside EmployerHub under the intake. It surfaces in two places: the seeker's Proposals card (ProposalsTab.tsx renders logo, industry, size, headquarters, website link and about), and the COMPANY FACTS block passed into employer_draft_proposal, where a null field is stated to be nonexistent so the model cannot invent one.

Intake draft persistence lives in employer_intake_drafts keyed by org, saved after every answered step and restored on return, with Start over clearing it. The step map jumps back to any completed step and only clears later answers the change genuinely invalidates.

## v3.11.0 company profile first (the gate)

REQUIRED before an employer can use the product: `name`, `website`, `industry`, `headquarters`, `company_size`, `about` (minimum 80 characters after trim). OPTIONAL and labelled "optional" in the UI: `linkedin_url`, `logo_url`. Website and LinkedIn are validated as links when present, and a bare domain is normalised to `https://` rather than rejected (`normaliseUrl` / `isValidUrl` in src/lib/employer.ts, which is also where `REQUIRED_ORG_FIELDS`, `missingOrgFields` and `isOrgComplete` live so client and copy stay in one place).

CLIENT GATE: src/pages/EmployerHub.tsx computes `profileComplete` from the loaded org. While it is false the ONLY thing rendered inside `<main>` is `<CompanyProfile onboarding />` (heading "Tell candidates who you are", sub "Candidates see this on every proposal. AYN cannot search until it is filled in."). The intake wizard, the results list and the sent proposals list are not rendered at all, not disabled. Saving the last required field unlocks in place with a toast, no reload.

BACKEND GATE: `assertOrgProfileComplete(orgId)` in supabase/functions/resume-hub/index.ts re-reads the org and returns HTTP 428 with `{ error, missing_org_fields }` when any required field is empty (or `about` is under 80 chars). It runs after the org-membership check in `employer_spec_extract` (the intake action that replaced employer_intake_chat in v3.8.0), `employer_match`, and `employer_reveal_request`. A UI-only gate is not a gate.

CLEARING A REQUIRED FIELD LATER: everything stays editable at all times. If an edit empties a required field, `handleOrgSaved` compares completeness before and after and shows a destructive toast naming the field ("Website is now empty. Candidate search and proposals are paused until you fill it back in."), and the surface re-locks to onboarding on the same render. The backend independently refuses the same three actions.

NUDGES: no percentage bar and no score. `missingOrgFields` produces one specific line per missing field ("Add your website so candidates can check you out"), rendered as a list in the same left-rule style as the seeker findability panel.

UI: the company size buttons are now the same `OptionCard` language as IntakeWizard (rounded-xl bordered card, `border-primary bg-primary text-primary-foreground` when selected, so they resolve to AYN orange under `.employer-surface`). The logo Upload button is a normal `secondary` button instead of a heavy outline.

## v3.12.0 — employer surface, properly

### Why the buttons were black, again
`.employer-surface` in src/index.css redefines `--primary`, but this repo's shadcn Button variants are written with `bg-foreground` / `border-foreground` utilities, not `bg-primary`. The token redefinition therefore never reached the default and outline variants, which is why the company size option cards (hand written, token driven) went orange while "Find candidates" and "Start over" stayed black. Fix: the scope also retints `button.bg-foreground` and `button.border-foreground`. Measured in Chromium inside the scope: primary background `rgb(249,112,21)`, outline background transparent, both 44px tall, `gap-3` between them, Start over rendered as outline so the hierarchy reads.

### Why intake drafts did not survive a refresh
Two independent bugs. (1) The persist effect returned early while `phase === "opening"`, so the free text opening description was never written even once. (2) The step the employer was on was never stored, so even a restored draft reopened at the first unanswered question. Now: the opener saves as it is typed (500ms debounce), and the cursor travels inside `phase` as `asking:<step>` (`summary` and `opening` are the other two values). The backend truncation on `phase` was widened from 24 to 64 characters, which had been silently cutting the longest step keys.

### Candidate background block
`employer_match` attaches `profile` to each of the top three cards, built by `buildCandidateProfile(canonical)`: seniority, years, current title, known for, `skills_by_level` (expert / advanced / proficient / familiar / other), experience rows (title, company, dates, industry), education lines, certifications, and a seeking list. Rendered by `src/components/employer/CandidateProfile.tsx`. No label is ever rendered for an empty value, and `buildProfileText` (the embedding text) was fixed for the same class of bug: it used to emit `YoE: .`, `Current title: .` and `Education: BSc  at`. Still anonymous: no name, email, phone, address, or links. `summary` (the old blob) remains on the type only so previously stored searches still render.

### Proposal draft
`employer_draft_proposal` writes an invitation, not an analysis. Shape: greeting ("Hi there", the employer does not know their name), one line on the company from the company profile only, one or two lines on the role and why they might fit with at most TWO specifics, an invitation to talk, then what happens next on accept. Forbidden in the prompt: skills with years attached, more than two facts about them, and the words "must-have skills", "match", "score", "requirements", "gaps", "profile".

### Navigation and branding
EmployerHub has an AYN branded sticky header (Brain mark, "Hiring / <company>", company menu on the right with Company profile and Sign out) and a left nav in the Resume Hub language: Search (intake plus results), Proposals (sent, with status), Company (opens the profile dialog). The v3.11.0 gate is unchanged and now also hides the nav: while a required company field is missing the onboarding profile is the only thing rendered. Once complete, the company profile no longer sits as a card in the flow; it lives in a dialog behind the menu and stays fully editable.

Resume Hub's top left "Back" button is gone (it had nowhere sensible to go). It is now the AYN mark, with Sign out in a dropdown on the right, matching the employer treatment.

### Legacy dashboard
Deleted: `src/components/Dashboard.tsx` and `src/components/dashboard/DashboardContainer.tsx`. `/dashboard` and `/dashboard/*` redirect to `/`, which routes by role (Resume Hub for a seeker, EmployerHub for an approved employer). `src/components/dashboard/` still exists because DashboardPricing, Sidebar and the simulator live there; nothing in it renders the old chat shell.

## v3.13.0 — verification assessments

### The idea
Before spending a proposal, an employer can send the candidate a short assessment generated from that candidate's own claimed background against the JobSpec of the search they were found in. It is not a quiz on textbook knowledge; the prompt (QUALITY_MODEL) is told to probe lived experience, so a person who did the work answers easily and a person who listed the skill does not.

### Schema
Three tables, and the split between them is the whole security design.

- `assessments` — one row per sent assessment: org, search, candidate ref, resolved user, job title, questions (no answers, no rubric), status (`sent`, `started`, `submitted`, `expired`), timer, sent/started/submitted timestamps. Grants: `SELECT` to `authenticated` only; `anon` has nothing; every write goes through the edge function as `service_role`. RLS: the candidate reads their own rows, an org member reads their org's rows.
- `assessment_rubrics` — what a good answer contains, per question. ALL privileges revoked from `anon` and `authenticated`. `service_role` only. No policies, RLS on, so even a stray grant cannot leak it.
- `assessment_results` — score, verdict, per question observations, per question `ms`. Same isolation as rubrics: `service_role` only. The candidate never sees a score, so nothing can be reverse engineered by re-taking.

Verified after the migration with `has_table_privilege`: `assessment_rubrics` and `assessment_results` return false for SELECT and INSERT for both `anon` and `authenticated`; `assessments` returns SELECT true for `authenticated` only, INSERT false.

### Backend actions (supabase/functions/resume-hub/index.ts)
Employer lane: `employer_assessment_generate` (draft questions from the candidate's canonical profile plus the JobSpec, returns questions and lets the employer cut or edit them; the rubric is generated alongside and never returned), `employer_assessment_send`, `employer_assessment_list` (results, service role, org scoped).
Candidate lane: `assessment_list`, `assessment_start` (stamps `started_at`, which is what the timer is measured against server side), `assessment_answer` (autosave per question, records `ms` spent), `assessment_submit` (calls `finaliseAssessment`, which grades against the private rubric and writes `assessment_results`), `assessment_growth_notes` (what the candidate gets back instead of a score: where their answers were thin, phrased as something to work on).

### Notifications (v3.44.0)
`employer_assessment_send` emails the candidate (`notifyCandidate`) with the company name, job title if known, and roughly how many minutes it takes. `finaliseAssessment` — the single function all three submission paths (`assessment_submit`, and the two server-side timeout paths inside `assessment_start`/`assessment_answer`) funnel through — emails every org member (`notifyOrgMembers`) once grading is written to `assessment_results`, deliberately with no score, verdict, or candidate identity in the email body, matching the same anonymity rule the product's own UI already follows; it just says an assessment was completed and links back into the app.

### Anti gaming
The timer is enforced from `started_at` on the server, not from a client clock. Per question `ms` is recorded and surfaced to the employer next to the answer, because a flawless four paragraph answer written in eleven seconds is the signal. The rubric is never sent to the client at any point in the flow, and results are readable only through a service role action that checks org membership first.

### UI
Employer: `src/components/employer/AssessmentDialog.tsx` (generate, review, edit, send) opened from "Send an assessment" in the candidate dialog, and `src/components/employer/AssessmentsPanel.tsx` on a new Assessments tab in the left nav.
Candidate: `src/components/resume-hub/AssessmentsTab.tsx`, a new badged tab in Resume Hub, with the timer, autosave, and the growth notes after submitting.
Client API: `src/lib/assessments.ts`.

# AYN v2.13 — "Reliable by construction"

Goal: fix the root causes surfaced in the second diagnostic report, not the symptoms. Ship in ordered slices so each one is verifiable before the next lands. No more incident patches on top of incident patches.

## Ordering rationale

Instrument → unify data → delete dead weight → improve output quality → consolidate runtime. Each step de-risks the next and each is independently valuable if the later ones slip.

---

## Slice 1 — Telemetry (v2.13.0)

Right now we cannot answer "why do fills fail?" from the DB. Fix that before writing another patch.

Add to `autofill_runs.meta` (jsonb, no schema change needed):

- `identity_source: { first_name, last_name, email, phone, address, links }` — each value is `"profile" | "canonical" | "resume" | "auth" | "missing"`
- `ungrounded_drops: [{ field_id, label, kind, rejected_shape }]` — v2.12.2 gate drops that the sidepanel already shows to the user but never persists
- `skip_reasons: { no_supporting_data, sensitive, model_skip, ungrounded }`
- `field_kinds: { text, radio, select, textarea, file, other }`
- `verified_in_dom_by_kind: { text, radio, select, textarea }`
- `jd_source: "full" | "snippet" | "manual" | "none"`, `jd_chars`, `jd_quality`
- `resume_used: { version_id, is_tailored, chars }`
- `model_calls: [{ purpose, model, ms, tokens_in, tokens_out }]` — one row per Gemini call

Files touched: `extension/background.js` (emit), `supabase/functions/resume-hub/index.ts` `ext_log_result` (persist), `src/components/resume-hub/TrackerTab.tsx` (surface a "Why did this run skip 4 fields?" expander per row).

Acceptance: one week of real fills answers the "where does time and failure go" question from SQL, no screenshots needed.

---

## Slice 2 — Unified identity (v2.13.1) — the biggest structural fix

Create `supabase/functions/_shared/identity.ts`:

```
loadIdentity(admin, userId) → Identity
  - reads auth.users, user_profile_data, resumes primary, user_profile_canonical in parallel
  - single documented per-field priority (profile > canonical > resume > auth)
  - each field carries its source tag
  - Identity.isComplete(), .missing(), .sourceDigest()
```

Update these call sites to use `loadIdentity` and delete their inline merge:

- `ext_autofill` (index.ts ~1091-1350) — the site of the Isha Sharma bug
- `ext_vision_fill` (~1655)
- `ext_job_score` (~1754) — for the "candidate profile" side of scoring
- `ext_cover_letter_text` (~2117) — currently ignores profile entirely
- `smart_tailor` (~2272) — currently ignores profile entirely
- `ext_bootstrap` — return `identity.missing()` so the sidepanel can prompt "add your email" instead of failing silently

Also:
- Add `identity` block to `user_profile_canonical`
- After `profile_canonical_save` and after resume upload, non-blocking re-run of canonical extract so canonical stops drifting
- v2.12.2 `sourceDigest` is now computed once in `loadIdentity`, not rebuilt inline per action

Acceptance: the Isha Sharma bug is impossible by construction; deleting a user's profile row still lets fills work from resume + auth email; a new column added anywhere shows up in every action's context.

---

## Slice 3 — Delete `rules/csp.json` (v2.13.2) — Chrome Web Store unblocker

- Confirm nothing in the fill pipeline requires CSP stripping (main-world bridge uses `chrome.scripting.executeScript` with `world:'MAIN'`; SnapDOM replaced runtime html2canvas load)
- Test on Ashby, Workday, Greenhouse, Lever, iCIMS, Gem with the ruleset removed
- If any specific site regresses, re-add only that single narrow rule with a written justification
- Remove `declarativeNetRequest` permission if fully unused

Acceptance: same fill success rate as v2.13.1 on the 6 supported ATSs, `declarativeNetRequest` permission gone, extension is Chrome-Web-Store-submissible.

---

## Slice 4 — Tailor / cover / score quality (v2.13.3)

The user says these are "not good enough". Prompt-only patches will not fix it. The fix is what we send the model and how many passes we use.

### smart_tailor
- Send structured `{ basics, work[], education[], skills[], projects[] }` from `loadIdentity` + canonical, not `resumeText.slice(0, 8000)` — nothing important gets truncated by chance
- Two-pass: draft → self-critique with metric-preservation check → revised output
- Post-generation regex verification that every number, percentage, dollar figure, and date in the input still appears in the output; single retry on failure
- Cache last successful tailor by `(user_id, resume_version_id, jd_hash)`; instant on repeat
- Keep `QUALITY_MODEL` (gemini-2.5-pro); add reasoning effort hint

### ext_cover_letter_text
- Structured resume input, same as tailor
- Send both parsed JD structure and raw JD, so paragraph 1 can quote a real detail
- Use `canonical.derived.top_skills` + a new `signature_achievements` field to pick bullets
- Include applicant's own contact block (from loadIdentity)
- Two-pass draft → critique → revise on the length="detailed" tier only (short/standard stay one-pass for speed)

### ext_job_score
- Cache per session by `(url_hash, resume_version_id, canonical_updated_at)`
- Two payload tiers: `card` (JD 3000 chars, resume basics + skills) for card badges, `page` (current 15k/5k) for opened jobs
- Score for card badges downgrades to `DEFAULT_MODEL` (flash); page-open score stays on quality
- Cache JD resolution per session across score/tailor/cover/ask, not per-action

Acceptance: repeat tailor on same JD returns in <300ms; cover letters include a specific quote from the JD; scores on the same page across features share one JD fetch; metric-preservation regex catches any silent number changes.

---

## Slice 5 — Consolidate fill runtime (v2.13.4)

The runtime is spread across 4 files with 5 overlapping recovery layers. Finish what `fill-session.js` started.

Refactor to a single explicit state machine:

```
SCAN → PLAN → INJECT → VERIFY → RECOVER → LOG
```

- `fill-session.js` becomes THE pipeline; owns the mutex, snapshot/restore, signature re-anchoring, and provenance gate
- `content.js` shrinks to: page classifier, DOM read helpers, adapter dispatch, and the state machine's I/O primitives. Target ≤ 2500 lines from 4744.
- Delete: `aynStabilizeAfterRender` (fold into VERIFY), redundant retry loops in background, orphaned helpers
- One writer (INJECT), one verifier (VERIFY), one recover pass (RECOVER — bounded to 1 iteration as today)
- `AYN_SENSITIVE_NO_GUESS_TYPES`, `directValueFor`, and `supabase-store.ts` sensitive-skip merged into one shared classifier
- Wire `question-engine/__corpus__` to CI so the good engine has a safety net

Acceptance: same or higher fill success rate than v2.13.3 with fewer lines and no `aynRecover*` naming; a new engineer can trace one fill top-to-bottom in one file; corpus tests run on every push.

---

## Slice 6 — Fuzzy answer memory hardening (v2.13.5, small)

The v2.11.0 fuzzy pass at 0.7 similarity can cross-contaminate Yes/No answers. Tighten:

- Require `question_kind` equality for fuzzy match
- For option fields, require option-set overlap ≥ 0.5
- Raise threshold to 0.8 for identity-adjacent kinds, keep 0.7 for free text
- Log every fuzzy hit into telemetry so we can measure precision

---

## Slice 7 — Employer chat ↔ matcher wiring (v2.13.6)

Known gap you flagged. Connect `EmployerChatPanel.tsx` to `employer_intake_chat` → `employer_match` → reveal flow so the employer surface is actually usable. No new backend actions; they exist.

---

## Explicitly out of scope (for this plan)

- Real embedding model for talent pool — already tracked in v2.9.1 followup
- Auto-update for sideloaded extension — pending Web Store submission
- Full rewrite of `resume-hub/index.ts` into modules — do it opportunistically as each action is touched in slices 2-4, not as a big-bang

---

## Rollout

Each slice is a version bump, its own PR-sized change, verified against acceptance criteria before the next slice starts. If any slice reveals a wrong assumption (especially slice 3), stop and revise this plan rather than pushing through.

## Estimated size

- Slice 1: half day
- Slice 2: 1 day (the important one)
- Slice 3: 2 hours + testing
- Slice 4: 1-2 days
- Slice 5: 3-5 days (biggest, do last)
- Slice 6: 2 hours
- Slice 7: half day

Total ~2 weeks of focused work. After it lands the product is materially better than a patchwork and defensibly better than Jobright on the two things they don't do well: honest provenance, and learning that survives page rebuilds.

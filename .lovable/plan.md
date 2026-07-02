## What I found

This is not one single missing regex. The telemetry shows AYN already generated answers for the BioRender page, but the system is still unreliable because the architecture has three weak points:

1. **Wrong success metric**
   - The sidepanel says 100% because it counts only the AI answers it attempted to inject.
   - It does not count the full scanned form, already filled fields, skipped AI decisions, and failed injections together.
   - Example: the latest telemetry scanned 13 fields, AI answered 7, injected 7, then the UI showed 7/7 as 100%. That hides the real state.

2. **Question identity is still too fragile**
   - BioRender's Disability Status scanned as `Question` instead of `Disability Status`.
   - The scanner is still choosing nearby helper text or option blocks in some cases instead of building a stable question object from heading, helper text, options, container path, and visual order.
   - That means the backend sometimes answers the right option for the wrong label, or the UI displays confusing results.

3. **The engine is AI-first where it should be rules-first**
   - EEO, work authorization, sponsorship, location eligibility, consent, yes/no, and common profile fields should not rely on the LLM every time.
   - The LLM should only handle open text and ambiguous custom questions.
   - Proven autofill systems use deterministic field discovery, stable field identity, native setter plus React value tracker, MutationObserver for dynamic forms, iframes, shadow roots, and per-site adapters. AYN has pieces of this, but they are layered as patches instead of a single pipeline.

## Plan for AYN v1.9.62

### 1. Replace the misleading fill score
- Show three honest numbers:
  - **Answered by AYN**: AI or rules produced a value.
  - **Filled on page**: injector verified the value on the DOM.
  - **Needs review**: scanned fields that were empty, skipped, failed, or unknown.
- Never show 100% unless every scanned fillable field is either filled, already filled, safely ignored, or intentionally declined.
- Display EEO decline fields as `Declined`, not generic `Question`.

### 2. Add a deterministic pre-answer layer before the AI
Create a local rules engine that answers high-confidence fields without the LLM:
- EEO and demographic fields: always choose decline or prefer not to disclose when available.
- Work authorization and sponsorship: answer from canonical work authorization only.
- Name, email, phone, LinkedIn, location: answer directly from profile or resume.
- Consent and required attestation: tick only required application consent, not marketing.
- Yes/No pairs: classify by actual question text, not option text.

The AI will receive only fields that rules cannot safely answer.

### 3. Build stable field fingerprints
For every scanned field, create a `fingerprint` from:
- normalized question label
- section heading
- option labels
- field kind
- DOM path signature
- frame id
- visual order

Use this fingerprint for scan, AI decision, injection, telemetry, and second pass. This removes fragile index matching like `tf6:10` from the core flow.

### 4. Fix option group question detection properly
- Add a shared `findQuestionForOptionGroup()` resolver used by native radios, structural radios, label groups, custom radios, and yes/no buttongroups.
- Prefer headings/legends/labels immediately before the option group.
- Reject helper paragraphs such as `What is considered a disability?` when a stronger parent heading exists.
- If a group has options like `Yes / No / Decline`, and a nearby heading says `Disability Status`, classify it as `eeo.disability`.

### 5. Add a reconciliation pass after injection
After filling:
- rescan the page
- compare expected answers by fingerprint
- mark each field as `verified`, `already filled`, `not attempted`, `failed`, or `unsafe skipped`
- run a third targeted fill only on failed required fields
- include the exact reason in telemetry and sidepanel

### 6. Improve open text quality
- Keep AI for open text, but add a postprocessor that rejects generic answers.
- Require company name, role context, and one concrete resume backed achievement for `Why this company?`.
- Work history clarification should be short, honest, and not overstate if no gap is known.

### 7. Add a fixture test page for BioRender/Gem patterns
Create a local test fixture that reproduces:
- unique-name or nameless radio groups
- EEO Gender, Race, Veteran, Disability
- helper text between heading and options
- two open textareas
- yes/no checkbox pairs

Use it to verify scanner output and injection logic before bumping the extension.

## Files to change

- `extension/content.js`
  - stable fingerprints
  - shared option-group question resolver
  - deterministic pre-answer support metadata
  - post-fill rescan reconciliation

- `extension/background.js`
  - merge rule answers plus AI answers
  - truthful progress counts
  - richer telemetry payload

- `supabase/functions/resume-hub/index.ts`
  - accept pre-answered fields
  - only ask AI for unresolved fields
  - improve open text generation rules

- `extension/sidepanel.js`
  - replace misleading 100% UI with honest statuses
  - show `Needs review` and exact skip/fail reasons

- `extension/manifest.json`, `extension/constants.js`, `src/pages/ResumeHub.tsx`
  - bump to v1.9.62

## Expected result

BioRender/Gem style forms should no longer look falsely perfect. AYN should identify EEO sections correctly, decline them consistently, fill open text with better answers, and clearly show what was actually filled versus what still needs review.
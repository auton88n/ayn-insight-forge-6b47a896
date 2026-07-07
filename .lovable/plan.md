## Goal
Make the autofill system more robust on pages like the Jerry Ashby application where fields are detected but then rerenders or weak DOM mapping cause wrong answers, missing button group metadata, and resume upload misses.

## Plan
1. **Fix local memory misuse**
   - Stop the old local `chrome.storage` memory resolver from overriding sensitive or high risk fields.
   - Do not reuse memory for LinkedIn, work authorization, sponsorship, residence eligibility, open text questions, or resume file fields unless the current options and semantic type match strongly.
   - Keep the new verified Supabase memory, but only record positive memory after the final post rerender verification succeeds.

2. **Make button groups first class DOM fields**
   - Update the Question Engine and Ashby adapter so Yes and No segmented controls are detected as real `boolean` questions with live option metadata.
   - Register `__AYN_BG_MAP__` from Question Engine output so `buttongroup meta missing` is eliminated.
   - For Ashby hidden checkbox proxies, resolve the live container after every rerender instead of clicking stale nodes.

3. **Add rerender safe fill stabilization**
   - Replace the current short settle pass with a guarded “fill transaction” that snapshots intended values, waits through React rerenders, rescans, re resolves fields, and only reports success after the final DOM state matches.
   - For choices, verify the selected visible label equals the intended answer, not just that something is selected.
   - Prevent a second pass from refilling already correct fields with stale memory answers.

4. **Improve invisible field discovery with vision plus DOM fusion**
   - Auto run vision discovery when scan coverage is low, when visible prompts have no controls, or when required fields remain unanswered after injection.
   - Convert vision discovered labels into candidate questions only when they can be anchored to a nearby live DOM control or upload input.
   - Feed the discovered fields into the normal answer and injection pipeline instead of leaving vision as manual only.

5. **Fix resume upload detection**
   - Preserve file fields from the Question Engine scan and expose them correctly to the side panel and autofill flow.
   - Expand upload detection beyond native visible `input[type=file]` to labels, dropzones, hidden file inputs, and Ashby style resume blocks.
   - Return an explicit “manual upload required” state only when browser security blocks programmatic file assignment.

6. **Strengthen answer validation before injection**
   - Validate AI and memory answers against current field options before clicking.
   - Reject truncated or partial values like bare `https://www.linkedin.com/in/` unless the full profile URL exists.
   - Replan answers only with the fresh current DOM snapshot, not stale field descriptors.

7. **Rebuild extension bundle and zip**
   - Update generated extension bundles after source changes.
   - Keep only the new engine path active, with the legacy projection kept only as the compatibility adapter for the existing injector.

## Technical targets
- `extension/content.js`
- `extension/content.entry.js`
- `extension/background.js`
- `extension/question-engine/*`
- `extension/question-engine/adapters/ashby.ts`
- `supabase/functions/resume-hub/index.ts`
- generated extension bundles and `public/ayn-extension.zip`

## Expected result
The extension should detect each URL form more accurately, avoid stale memory mistakes after rerender, correctly handle Ashby Yes and No controls, discover missed visible fields with vision, and report resume upload separately instead of counting it as an unanswered text field.
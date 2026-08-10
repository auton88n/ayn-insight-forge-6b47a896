# Reword the investor deck in the landing page voice

Copy only. Same 14 slides, same layout, same images, same numbers. What changes is the wording and what each slide leads with.

## The reframe

Today the deck sells resume repair. Two lines change that.

Seekers: applying is only half of it. The other half is being found. Discovery moves up from a footnote to a headline promise: turn it on, employers searching for your background see your evidence, and your name and contact stay yours until you accept.

Employers: lead with what it saves them, not what it computes. No recruiter fee taken out of a salary. No pile of near identical resumes to read. Minutes to three people worth talking to, not weeks.

Voice comes straight from the landing page: short declarative lines, plain words, concrete claims, no invented numbers, no em dashes or en dashes, ranges written as "to".

## Slide by slide

| Slide | Now | After |
|---|---|---|
| 1 Title | "A resume tailored to every job you apply to." | Hunt and be hunted. One line that carries both sides. |
| 2 Problem | Volume game, tailoring takes forty minutes | Keeps the seeker pain, adds the two lines that matter: the company that would want you does not know you exist, and the employer either drowns in resumes or pays an agency a cut of the salary. |
| 3 What AYN is | Feature description with the tech stack | Two promises, one per side. Tech stack drops to a single quiet line. |
| 4 Seeker side | Read, Score, Tailor | Read, Score, Tailor, Get found. A fourth step, same three step visual plus the discovery line. |
| 5 The output | Same history, read properly | Unchanged in substance, tightened wording. |
| 6 Employer side | Intake, Match, Assess, Propose | Same four steps, retitled around the outcome: describe it once, read three people, verify, invite. Header leads with no agency fee and no resume pile. |
| 7 Proof of work | Evidence on the card | Reframed as why you can trust the shortlist without a phone screen. |
| 8 Why it holds up | The resolver ladder | Same content, plainer intro sentence. |
| 9 How matching works | Prefilter, Recall, Rerank | Same three steps, reworded so a non technical reader follows it. |
| 10 Consent | Nothing released until they say yes | Reframed as the seeker benefit: being found without being exposed. |
| 11 Market | Where we play | Same three columns, the closing line points at the two sided loop harder. |
| 12 Business model | Credit table | Same prices and credits, one added line on what employers pay for. |
| 13 Where we are | Real counts | Numbers unchanged, wording tightened. |
| 14 Raise | Placeholders | Placeholders stay as placeholders. |

## Details

- Contact details on slides 1 and 14 currently read `aynn.io` and `ghazi@aynn.io`. The live domain is `ayn.careers`, so both get corrected in the same pass.
- Every real figure stays exactly as it is: 28 accounts, 14 searches, 4 assessments, 1 proposal, the credit prices, the 45 quality floor, the 30 day decline cooldown. Nothing new is invented.
- `[RAISE AMOUNT, replace]` and `[INSTRUMENT AND TERMS, replace]` stay untouched and still need your real numbers.
- Output is a new file, `ayn-investor-deck-v5.pptx`, in the documents folder. The uploaded v4 is left alone.
- No project source files change, so no map file update is needed.

## Technical approach

Unpack the uploaded `.pptx`, edit the text runs in each `ppt/slides/slideN.xml` in place, repack, validate, then render every slide to an image and read it back to confirm no text overflows its box after the rewrite. Any line that runs long gets shortened rather than shrunk.

# October 10 QA completion ledger

This is implementation status, not a claim that every requested feature has shipped.
Latest verified production revision: `7eba4537` (GitHub and VPS checked in the preceding review). The original search/location/reading batch below was included in that shared Claude/Codex release; its historical “Local” rows describe the pre-release verification, not current deployment state. New document/record-label changes below are local and not deployed.

## Latest presentation pass

- Replaced Profile's plain-text resume block with a semantic document preview: name, section headings, bold role titles, dates, real bullet lists, projects and ungrouped skills. It uses the same pure block builder as Word exports, without importing DOCX/PDF download libraries.
- Replaced the cover-letter code block with escaped, spaced paragraphs. Copy/download still use the original body. Reading layouts are not a claim of final Word pagination.
- Admin overview, candidates, employers, money, marketplace, moderation, account details, support and SEO run status now use readable status/plan/reason labels. Storage keys and control values are unchanged; diagnostic identifiers remain available where needed.
- Employer candidate seniority uses the existing readable label mapping. Job descriptions support explicit bold source emphasis without treating source HTML as executable markup.
- Fixed ambiguous IN/CO/DE and other country/state codes being silently turned into US geography without explicit US/ZIP evidence. Unknown geography is retained, not guessed.
- Verification: 267 unit tests; 27 browser tests including 1280px/390px document/report layouts; final frontend typecheck, production build and bundle budgets passed. The 12 job/presentation browser checks also passed after the source-emphasis adjustment. Existing act/dialog-description/PostCSS warnings remain. A duplicate import caught by typecheck during this pass was removed before final verification.
- Actual local-browser desktop inspection of the document components used synthetic candidate text. Public route sampling from the prior pass included jobs/company pages, Insights, checker, salary guide, pricing, employers, help, about, contact and legal documents. Browser tests use mocked services and do not prove every live workflow.
- Current live seeker and admin tabs both show sign-in gates. A prior signed-in Saved detail was inspected, but the complete current authenticated seeker/employer/admin visual pass remains blocked on user sign-in. No account creation, payment, email or personal-record mutation was performed.

The London one-salary article was archived in `7eba4537`, and the company-location aggregate exists in production. This does not close the remaining search-feature work or prove every historical article's wording is correct.

| Item | Status |
| --- | --- |
| 1 Earlier appearances / timeline agreement | Baseline deployed; missing archive records disclosed |
| 2 Canonical locations | Local shared React/server presentation cleanup and alias-count merging; original data preserved. Full catalog location keys, worldwide disambiguation and alias-aware search are still open |
| 3 Full-sentence search silently returning zero | Local explicit keyword/location/mode guidance; no AI intent parser claimed |
| 4 Autocomplete, city/country granularity, radius | Open; radius requires reliable coordinates, not inferred distance |
| 5 Work-mode filters | Local public/account remote, hybrid and on-site; stored classification, not location substring |
| 6 Recency filters | Local public 24h/week/month and account 24h/3d/week/month; labeled first observed, not original employer publication |
| 7 Experience / employment filters | Local public controls; existing account controls retained |
| 8 Recent/saved searches and new-job alerts | Open; no personal search records or email sends added |
| 9 Dedicated company picker | Open |
| 10 Company hiring locations | Local whole-catalog aggregate, coverage, bounded 100 combinations and normalized counts; SQL rollback verified |
| 11 Saved filter | Baseline availability filters distinct from application stage |
| 12 Sparse work-mode coverage | Baseline denominator disclosure retained |
| 13 Signed-in Saved receipts | Baseline real signed-in pass completed |
| 14 Removed state | Baseline actual closed archive verified; pruning remains distinct |
| 15 Description diffs | Baseline future bounded excerpts; historical full text cannot be restored |
| 16 Mobile evidence | Baseline 390px verified; local filters also visually checked at 390px with six selects present and no horizontal overflow |
| 17 Direct job URL | Local selected-object render-loop fix, server detail bootstrap and bounded requests; cold-load/reload browser regression passes. The earlier redirect report is not independently attributed to the render loop |
| 18 Leading asterisk | Baseline fixed |
| 19 Equal pay endpoints | Baseline fixed |
| 20 USCIS boilerplate | Baseline shared exclusion rule retained |
| 21 Remaining source artifacts | Local additional presentation cleanup; unknown facility names are retained rather than guessed away |
| 22 Remote/HQ salary cohort | Baseline national explicit-eligibility cohort and sample guard retained |
| 23 Prose fit check | Baseline parser fix retained |
| 24 Hidden salary / FX | Local salary filter starts expanded; explicit currency and no FX remain intentional |

## Release gates

## Whole-site presentation follow-up (local)

Confirmed in the local browser: published Insights headings and paragraphs had identical 16px styling and zero paragraph margins because the `prose` plugin was absent. Explicit shared reading CSS now restores hierarchy, spacing, list markers and bounded tables for Insights and legal documents. Public job filters have consistent spacing and touch targets. Posting evidence source names and proposal employment types use display labels, not internal keys. Explicit Markdown headings in job descriptions are structured; invalid numeric entities no longer crash decoding, and encoded carriage returns preserve section boundaries. Employer wording is not rewritten.

Read-only browser sampling covered the checker, salary guide, Insights/report, legal pages and a production signed-in Saved detail; marketing routes need a settled-screen pass and employer/admin protected workflows are not yet fully visually audited. Initial SEO text is already hidden inline behind the boot skeleton; this pass did not change that mechanism. The London Sales report currently shown publicly uses a one-salary sample and unformatted amounts; this is a content-quality finding, not fixed by typography or by guessing currency in presentation.

New RPC: `20261010030000_company_location_summary.sql` must precede the app deployment.
Validation: `tests/company-location-summary.sql` inside a rollback-only transaction.
No paid action, account table, email worker or erasure/export seam is changed in this batch.

Local verification: 249 unit tests, all 23 browser tests (then the updated 8-test job QA file again), 6 server/SEO tests, frontend typecheck, wiring check, production build/bundle budgets, and rollback-only company-location SQL passed. Browser tests use mocked services; the local visual check read the real public catalog but did not publish anything or create an account. Known pre-existing test `act`/dialog-description/PostCSS warnings remain. No migration has been applied persistently, no CI run triggered and no deploy performed for this local batch.

Before claiming a complete release: implement the open discovery items, test ownership/export/erasure/admin/opt-in email seams for saved searches, verify real UI and responsive behavior, run required CI, back up the server/schema/dist, apply migrations and deploy through the official path.

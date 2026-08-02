## What arrived

Ten .docx files plus the earlier .md archive. Compared them all:

- Seven documents are identical in both formats (terms, privacy, cookies, security, subprocessors, dpa, sla). Word counts match exactly; the only differences are smart quotes and pandoc formatting, so the markdown originals are the cleaner source.
- `ayn-security-overview-2.docx` is byte for byte identical to `ayn-security-overview.docx`. Duplicate, ignore.
- `ayn-copyright-policy.docx` is **newer**: Version 1.1, retitled "AYN Copyright Policy", the United States DMCA section 512 machinery replaced with a plainer Canadian notice and counter notice process. This supersedes the 1.0 in the archive.
- `ayn-legal-gap-analysis.docx` is an internal working note for a lawyer, not a public document. It does not get a page. It does flag things worth acting on later (NYC Local Law 144 bias audit, Illinois and Colorado AI hiring rules, the checkout immediate performance acknowledgement). Out of scope here, raised separately.

All eight publishable documents are clean of em dashes and en dashes.

## Plan

1. Fill the eight placeholder files under `src/content/legal/`, exact text, no rewording, no reordering:

| Source | Destination | Version | Sections |
|---|---|---|---|
| ayn-terms-of-service-FINAL.md | terms.md | 1.0, effective 1 August 2026 | 21 |
| ayn-privacy-policy-FINAL.md | privacy.md | 1.0, effective 1 August 2026 | 14 |
| ayn-cookie-policy.md | cookies.md | 1.0, updated 1 August 2026 | 8 |
| ayn-security-overview.md | security.md | 1.0, updated 1 August 2026 | 11 |
| ayn-subprocessors.md | subprocessors.md | 1.0, updated 1 August 2026 | 5 |
| ayn-copyright-policy.docx | copyright.md | 1.1, updated 1 August 2026 | 8 |
| ayn-data-processing-agreement.md | dpa.md | 1.0, effective 1 August 2026 | 16 |
| ayn-sla.md | sla.md | 1.0, effective 1 August 2026 | 10 |

The copyright document is converted from the .docx with smart quotes normalised to straight quotes so it matches the other seven, and its own header lines kept verbatim.

2. Each document already states its own version and date at the top, so the placeholder YAML frontmatter is removed rather than kept beside it. Two version statements on one legal page is a liability.

3. One parser change in `src/lib/legalDocs.ts`: four documents state "Last updated" and no "Effective" date, so today they would render a version with no date. Add a fallback that reads "Last updated" when no effective date is stated, and label it "Updated" rather than "Effective" in the page header and on /legal. Nothing invented: a document stating neither still shows neither.

4. Also update the copyright entry in the registry: title becomes "Copyright Policy" and the alias list keeps "DMCA Policy" so any cross reference in the other documents still links.

5. Verify all eight routes in a real browser: header version and date line, table of contents on Terms, DPA, Privacy, Security and SLA and not on the three short ones, the Subprocessors tables rendering through remark-gfm, heading anchors, cross references turned into working links and none double wrapped or landing inside a heading, print stylesheet intact. Screenshot each.

6. Confirm `src/lib/legal.ts` still matches what the pages now say: Terms 1.0, Privacy 1.0, effective 1 August 2026. Checked, not assumed.

7. Same commit: `CLAUDE.md` and `docs/map/platform.md` updated to record that the eight documents hold real text, that copyright is at 1.1, and the "Last updated" parser fallback.

## Technical notes

- No route, footer or sitemap change needed; that wiring shipped in v3.32.0 and the glob picks the files up automatically.
- No backend, database or edge function change.
- The gap analysis stays out of the repo. If you want its findings turned into work, that is a separate pass.

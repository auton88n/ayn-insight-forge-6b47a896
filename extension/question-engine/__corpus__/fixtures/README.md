# Corpus fixtures

One JSON file per captured form: `fixtures/<ats>/<name>.json`, produced by
`capture.ts` run on a live application page, then hand-annotated with the
`expected` questions the engine should reconstruct.

Priority captures (the known failures first):
- ashby/scribd-eeo.json      (the gender-group case)
- ashby/jerry-workauth.json  (hidden-checkbox proxy)
- workday/accenture-questions.json (Select One dropdowns)
- workday/accenture-workhistory.json (repeating sections)
- greenhouse/standard.json
- lever/standard.json
- icims/standard.json
- generic/standard.json

Each fixture carries `capturedAt`; re-capture the top ATSes on a schedule since
their DOM drifts. A passing benchmark on stale fixtures is false confidence.

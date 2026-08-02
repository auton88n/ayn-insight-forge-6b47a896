# AYN Subprocessors

Version: 1.0
Last updated: 1 August 2026

AYN uses a small number of third parties to deliver the service. This page lists all of them. It is the authoritative list referenced by our Data Processing Agreement and our Privacy Policy.

---

## Current subprocessors

| Subprocessor | What it does | Data it can reach | Processing location |
|---|---|---|---|
| Supabase | Database, authentication, file storage, serverless functions | All account data, profiles, resumes, job records, proposals, assessments | London, United Kingdom |
| Lovable | AI gateway routing our model requests, and application hosting | Content sent for generation or evaluation, in transit | United States |
| Google | Language models used for fit assessment, document generation, candidate ordering, and assessment evaluation, reached through the gateway above | Content sent for generation or evaluation | United States and globally |
| OpenAI | Text embedding model used to represent profiles for matching | Profile text sent for embedding, which excludes name, email, telephone, address, and links | United States and globally |
| Stripe | Payment and subscription processing | Billing name, email, and payment details. AYN never receives full card numbers | United States and globally |
| Google Analytics | Aggregate usage measurement | Pseudonymised usage events, only where analytics cookies have been accepted | United States and globally |

## What each one can actually see

**Supabase** holds everything. It is our database, so it is the subprocessor with the broadest access by a wide margin.

**Lovable** sits in the path between our servers and the model providers. Content passes through it in transit rather than being stored by us there. It also hosts the application.

**Google and OpenAI** receive only the content of a specific request. They do not have access to our database. We reach them through the gateway above rather than under agreements we hold with them directly, so our position on training rests on the gateway operator's terms.

**Stripe** never gives us your full card number and we never store one.

**Google Analytics** only runs where a visitor has accepted analytics cookies. Reject, or a Global Privacy Control signal, means it does not load.

## Change notification

We give at least **fifteen days' notice** before adding or replacing a subprocessor, by updating this page with a new version number and date. Please check this page periodically.

Employers subject to our Data Processing Agreement may object on reasonable data protection grounds within that period. If we cannot reasonably accommodate the objection, you may terminate the affected subscription at the end of your current period. No refund is payable.

## Change history

| Date | Change |
|---|---|
| 1 August 2026 | Initial publication |

## Questions

support@aynn.io

# AYN Subprocessors

Version: 2.0
Last updated: 18 August 2026

AYN uses a small number of third parties to deliver the service. This page lists all of them. It is the authoritative list referenced by our Data Processing Agreement and our Privacy Policy.

**AYN currently operates only in the United States and Canada.**

---

## Current subprocessors

| Subprocessor | What it does | Data it can reach | Processing location |
|---|---|---|---|
| Hostinger | Infrastructure hosting for the servers we run our own database and application software on | All account data, profiles, resumes, job records, proposals, assessments — as infrastructure, not as an operator with its own access | United States |
| Lovable | AI gateway routing our model requests | Content sent for generation or evaluation, in transit | United States |
| Google | Language models used for fit assessment, document generation, candidate ordering, and assessment evaluation, reached through the gateway above | Content sent for generation or evaluation | United States and globally |
| OpenAI | Text embedding model used to represent profiles for matching | Profile text sent for embedding, which excludes name, email, telephone, address, and links | United States and globally |
| Stripe | Payment and subscription processing | Billing name, email, and payment details. AYN never receives full card numbers | United States and globally |
| Resend | Transactional and support email delivery | Email address and message content for emails we send you | United States |
| Google Analytics | Aggregate usage measurement | Pseudonymised usage events, only where analytics cookies have been accepted | United States and globally |

## What each one can actually see

**Hostinger** provides the physical servers and network our database and application run on. Unlike a managed database provider, Hostinger does not operate the database software itself or have its own access to query it — we administer that ourselves. It is listed here because it is the infrastructure the data physically sits on.

**Lovable** sits in the path between our servers and the model providers. Content passes through it in transit rather than being stored by us there.

**Google and OpenAI** receive only the content of a specific request. They do not have access to our database. We reach them through the gateway above rather than under agreements we hold with them directly, so our position on training rests on the gateway operator's terms.

**Stripe** never gives us your full card number and we never store one.

**Resend** only receives what's needed to deliver a specific email — your address and that message's content.

**Google Analytics** only runs where a visitor has accepted analytics cookies. Reject, or a Global Privacy Control signal, means it does not load.

## Change notification

We give at least **fifteen days' notice** before adding or replacing a subprocessor, by updating this page with a new version number and date. Please check this page periodically.

Employers subject to our Data Processing Agreement may object on reasonable data protection grounds within that period. If we cannot reasonably accommodate the objection, you may terminate the affected subscription at the end of your current period. No refund is payable.

## Change history

| Date | Change |
|---|---|
| 18 August 2026 | Corrected the database/infrastructure entry from a third-party managed provider based in the United Kingdom to Hostinger, the infrastructure provider we run our own self-hosted database and application on in the United States. Added Resend, previously omitted. Narrowed stated operating scope to the United States and Canada. |
| 1 August 2026 | Initial publication |

## Questions

support@ayn.careers

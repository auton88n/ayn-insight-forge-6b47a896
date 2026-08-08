# AYN Security Overview

Version: 1.0
Last updated: 1 August 2026

This page describes how AYN protects data as at the date above. It is written to answer the questions a vendor security review normally asks, so you can assess us without sending a questionnaire. If you still need one completed, email support@ayn.careers.

**This page is descriptive, not contractual.** It sets out our current practices and is not a warranty, guarantee, or representation that any specific control will remain in place. Our practices change as the product does. Nothing here forms part of any agreement, adds to the commitments in our Terms of Service or Data Processing Agreement, or creates any obligation or liability beyond them. No security measure prevents every incident.

We have written this honestly, including the things we do not yet have. A security page that claims everything is a security page nobody should believe.

---

## Architecture in one paragraph

AYN is a web application and a browser extension backed by a Postgres database with row level security, serverless functions for all privileged operations, and a small set of third party services listed on our Subprocessors page. No privileged operation runs in the browser. The client holds no service credentials.

## Data protection

**Encryption in transit.** All connections use TLS. The application is served over HTTPS only.

**Encryption at rest.** The database and file storage are encrypted at rest by our infrastructure provider.

**Data residency.** As at the date above, account data, profiles, resumes, and assessment records are stored in the **United Kingdom**. Text generation, payment processing, and analytics involve transfers to the United States. Full detail is on the Subprocessors page.

## Access control

**Row level security** is enabled on every table holding user data. Each account can reach only its own records, enforced by the database rather than by application code, so a bug in the application cannot expose another user's data.

**Assessment rubrics and results** are isolated further. All privileges are revoked from both the anonymous and authenticated database roles, so they are reachable only by our server side service role. Candidates cannot read their own scores. This was verified against the live database after the migration that created it.

**Candidate anonymity** is enforced at the server, not in the interface. An employer searching the talent pool receives opaque references rather than user identifiers, and the mapping between them never leaves the server. Name, email, telephone, and address are released only when a candidate accepts a proposal.

**Administrative access** requires a role check against a dedicated roles table, plus a server verified PIN with server side lockout. Administrative operations run through dedicated definer functions that each re-check the role, so an administrative interface cannot be reached by manipulating the browser.

**Privileged actions are logged** to an audit table, including who acted, on whom, and why.

## Authentication

Passwords are stored only as hashes and are never transmitted to the browser extension. The extension authenticates using a scoped device token limited to resume features, revocable by the user at any time from settings. Sessions are managed by our authentication provider.

## Application security

**No secrets in the client.** All model calls, payment operations, and privileged queries run server side.

**Rate limiting** is applied per account and per action, with automatic blocking of abusive patterns.

**Plan limits** are enforced server side, not in the interface.

**Input handling.** Model output is escaped before rendering. The extension is read only and does not write to, click, or submit anything on any page it reads.

**Dependency management.** We use managed platform services and keep dependencies current.

## AI specific controls

Content sent for generation or evaluation is limited to what the task requires.

We reach the model providers through an AI gateway rather than under agreements we hold with those providers directly, so our position on training rests on the gateway operator's terms rather than on a contract between AYN and the model provider. We state that plainly rather than implying a direct commitment we do not hold.

Inferred attributes are labelled as inferred everywhere they appear and cannot satisfy a requirement an employer has marked mandatory, which limits the influence of model guesswork on outcomes.

Assessment timing is measured server side from a stored start time rather than from a client clock.

## Availability and continuity

The database is backed up daily by our infrastructure provider, with approximately seven days of retention. We do not currently have point in time recovery. Backup and recovery capability depends on that provider and is not separately warranted by AYN.

Uptime commitments and service credits for paid employer plans are in our Service Level Agreement.

## Incident response

We investigate suspected incidents on becoming aware of them. Where a breach creates a real risk of significant harm we notify affected users and the relevant regulators within the periods the law requires, and we maintain a breach record as required under PIPEDA.

Employers under our Data Processing Agreement are notified in accordance with that agreement.

Report a suspected vulnerability or incident to **support@ayn.careers**. We aim to acknowledge within a few business days, though we do not commit to a response time and do not operate a paid disclosure programme. We will not pursue legal action against anyone who reports a vulnerability in good faith, does not access or alter data beyond what is needed to demonstrate it, and gives us reasonable time to fix it before disclosing.

## Privacy commitments

We do not sell personal information and do not share it for cross context behavioural advertising.

Job seekers are not discoverable unless they turn discovery on themselves, and can turn it off at any time.

Users can export their data and delete their account.

Retention periods are published in our Privacy Policy.

## What we do not have yet

Stated plainly so you can weigh it:

- **No SOC 2 or ISO 27001 certification.** We are a small company and have not completed a formal audit.
- **No penetration test report.** We have not commissioned an independent test.
- **No bug bounty programme.** Reports are welcome by email, but we do not pay for them.
- **No single sign on or SCIM** for employer accounts.
- **No customer managed encryption keys.**
- **No point in time recovery.** Daily backups only.
- **No independent uptime monitoring.** We do not currently publish or retain formal availability metrics.
- **No direct contracts with model providers.** We reach them through a gateway.
- **Limited personnel separation.** AYN is operated by a very small team, so the same people build and operate the system. Access is minimal by necessity rather than by organisational separation.

If any of these is a blocker for your procurement process, tell us. We would rather know than have you assume.

## Contact

AYN AI
145 Cresthaven Drive, Nova Scotia B3M 2E4, Canada
support@ayn.careers

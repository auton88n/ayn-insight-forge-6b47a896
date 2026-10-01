# AYN

AI collaborators: read CLAUDE.md first. It is the system map index.

AYN is a job search product with two sides.

**For job seekers:** Resume Hub, a web app holding one resume, one profile, saved jobs, fit scores, tailored resumes, cover letters, and proposals.

**For employers:** a chat that turns a described role into a structured spec, searches candidates who opted into discovery, returns the three best fits with the evidence behind each, and lets them send an assessment or a job proposal. Contact details are shared only when the candidate accepts.

## Stack

React and Vite frontend, Supabase (Postgres, pgvector, edge functions, auth, storage), and Stripe for billing.

## Matching

A deterministic prefilter on extracted skills, then vector recall, then a grounded rerank. Candidates are never invented and skills are tagged extracted or inferred.

## Getting started

```bash
npm install
npm run dev
npm test
npm run build
```

## Environment variables

Create a `.env` file with the required Supabase credentials.

## License

Proprietary - All rights reserved.

# AYN

AI collaborators: read CLAUDE.md first. It is the system map index.

AYN is a job search product with two sides.

**For job seekers:** a Chrome extension that reads the job posting off the page, scores it against their resume and profile, and generates a tailored resume and cover letter for that specific role. Plus Resume Hub, a web app holding one resume, one profile, saved jobs, and proposals.

**For employers:** a chat that turns a described role into a structured spec, searches candidates who opted into discovery, returns the three best fits with the evidence behind each, and lets them send an assessment or a job proposal. Contact details are shared only when the candidate accepts.

## Stack

React and Vite frontend, Supabase (Postgres, pgvector, edge functions, auth, storage), Stripe for billing, Chrome MV3 extension.

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

# Browse jobs becomes its own page, with descriptions and real filters

Today Browse jobs is a mode that takes over the Jobs tracker, shows 24 rows, hides the job description entirely, and builds its location dropdown only from those 24 rows. The database has 2,382 live postings across 1,095 distinct locations and 982 companies, with full descriptions averaging about 5,400 characters, so almost everything the page needs is already there and simply not shown.

## What changes

**1. Its own page, separate from the manual tracker**
A new "Browse jobs" item in the Resume Hub left rail, sitting right above "Jobs". The Jobs tab goes back to being only your saved jobs, scoring and tailoring. The "Browse jobs" button inside the Jobs tab becomes a plain link over to the new page, so the two never share a screen again.

**2. A split view, list on the left, the full posting on the right**
Desktop gets a two pane layout: a compact scrollable result list on the left, and the selected posting on the right with company, title, location, posted date, match score, the full description, and two clear actions (Apply on the company site, Score and tailor in AYN). On narrow screens the right pane opens as a full height sheet instead, so nothing gets cut off.

**3. Real search and real filters**
Search by title or company, and the location filter, both run against the whole 2,382 row set on the server instead of filtering 24 already loaded rows. The location picker becomes a searchable list built from every distinct location in the table, not just what happens to be on screen. Remote stays a toggle. A "Clear filters" control appears once anything is set.

**4. More than 24 jobs**
Results paginate: 25 at a time with a "Load more" button, and a real total count ("2,382 jobs" / "48 matching your search") so the page never looks like the whole board is two dozen postings.

**5. Cleaner cards than Indeed or LinkedIn**
Each row: company monogram or logo, title, company, location, posted age ("2 days ago"), a New flame for anything under 24 hours, and the match pill. No duplicated buttons per row, since the actions live in the detail pane. The selected row is highlighted. Skeleton rows while loading instead of a bare spinner.

**6. Match scores stay honest**
Scoring still runs once per loaded page through the existing free `job_board_score` action, still labelled as a quick keyword match, and still shows the real reason when there is no resume to score against. Newly loaded pages get scored as they arrive.

## Technical notes

- New `src/pages/BrowseJobsPage.tsx` (or a `BrowseJobsTab` rendered by `ResumeHub.tsx`), with `src/components/resume-hub/BrowseJobs.tsx` rebuilt as the list plus detail panes. `TabKey` in `ResumeHub.tsx` gains `browse`.
- Queries move to server side filtering on `job_postings`: `ilike` on title and company for search, `eq` on location, `ilike '%remote%'` for the remote toggle, `range()` for pagination, and a `count: "exact"` head request for the total.
- The location list comes from a single lightweight `select("location")` over the table, deduped and sorted client side, cached for the page lifetime. No schema change and no new RPC.
- `addFromBoard` in `JobsTab.tsx` moves to a shared helper so picking a job from the new page still inserts the same `jobs` row and lands on the same score and tailor view, unchanged.
- Frontend only. No backend, billing, RLS or edge function changes.
- House style holds: no em dashes, no en dashes, ranges use "to". `docs/map/resume-hub.md` and CLAUDE.md updated in the same commit.

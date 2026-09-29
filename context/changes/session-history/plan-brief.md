# Session History (S-05) — Plan Brief

> Full plan: `context/changes/session-history/plan.md`

## What & Why

Give a logged-in user a **history page** at `/sessions` that lists their saved sessions and lets them reopen any one. This closes FR-006 ("zapisać sesję na koncie i wrócić do niej z historii") and the S-05 roadmap slice. It's the small persistence-reuse slice the roadmap flags as low-risk — the return-to-session view and the list query already exist; the missing piece is the list surface itself.

## Starting Point

Sessions are already persisted (`sessions` table, RLS-scoped) and `SessionRepository.listSessions()` already returns a user's sessions newest-first. `/sessions/[id].astro` already SSR-renders a full saved session with an ownership check. What's missing: no list page, no service wrapper for the list query, no navigation entry point. The dashboard only offers "Nowa decyzja"; `/sessions` (bare) isn't a route yet though it's already in `PROTECTED_ROUTES`.

## Desired End State

A signed-in user clicks "Historia" (Topbar or dashboard), lands on `/sessions`, sees their sessions newest-first — clipped decision text, Polish-formatted date, active/completed badge — and clicks any row to reopen it at `/sessions/[id]`. Zero-session users get a friendly empty panel with a "Nowa decyzja" CTA. Isolation holds across accounts and devices (server auth + RLS).

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Placement | Dedicated `/sessions` page + Topbar/dashboard links | Clean URL already in `PROTECTED_ROUTES`; keeps the dashboard uncluttered and leaves room to grow | Plan |
| Row content | Decision + date + status badge | Uses only existing columns (no `title` exists); scannable at a glance | Plan |
| Ordering | Newest created first (`created_at desc`) | Exactly what `listSessions()` already returns — zero new query work | Plan |
| Empty state | Message + "Nowa decyzja" CTA | Turns a dead end into the primary action | Plan |
| Data access | New `SessionService.listSessions()` | Honors backend.md handler→service→repository layering | Plan |
| Provider coupling | Make `SessionServiceDeps.provider` optional | Lets the read-only list page skip the LLM adapter; run-methods guard on absence | Plan |
| Rendering | Static `.astro`, no React island | List is SSR data + links with no interactivity (frontend.md §1) | Plan |

## Scope

**In scope:**
- `SessionService.listSessions()` + a Polish `formatSessionDate` helper + a unit test
- `provider` made optional on the service (read path needs no LLM adapter)
- `/sessions/index.astro` page + static `SessionList.astro` (rows, badge, truncation, empty state)
- "Historia" Topbar link + a dashboard link

**Out of scope:**
- Pagination/search/sort/filter; delete/rename/archive; `updated_at` ordering
- Any new session detail view (already exists); any schema/migration change
- Synthesis/round-count previews on rows

## Architecture / Approach

Two phases by verification surface. **Phase 1 (backend, unit-testable):** thin `listSessions` service method delegating to the existing RLS-scoped repository query, provider made optional, date formatter. **Phase 2 (SSR UI):** `/sessions` page builds the service from the cookie client, renders a static list component, and navigation is wired in the Topbar and dashboard. Ownership on the list is enforced by RLS scoping (no per-row id check applies — see the lessons.md rule, which targets single-row-by-id reads).

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Data access | `listSessions` service method, optional provider, date helper, unit test | Guarding the four LLM run-methods after making `provider` optional — must not change their behavior when a provider is present |
| 2. History UI | `/sessions` page, `SessionList.astro`, Topbar + dashboard links | Pixel-retro theme + a11y (badge = text+color, keyboard focus, 375/1280px) |

**Prerequisites:** S-01 (sessions exist to list) — done. F-02 persistence + RLS — done.
**Estimated effort:** ~1 session, 2 phases (small slice).

## Open Risks & Assumptions

- **Making `provider` optional touches four existing run-methods.** Each needs an entry guard; existing tests always pass a provider, so they should stay green, but this is the one change that reaches beyond new files.
- **No pagination** — capped at the existing 50-row `DEFAULT_LIST_LIMIT`. backend.md §4 prefers paginated lists from day one; deferred as a known gap for an SSR page read (not a public JSON endpoint).
- Assumes `LibBadge.astro` can style the status badge; if its API doesn't fit, fall back to a token-styled `<span>`.

## Success Criteria (Summary)

- A user sees their own saved sessions at `/sessions`, newest-first, and can reopen any of them.
- A zero-session user sees an empty state with a working "Nowa decyzja" CTA; a second account sees a disjoint list (isolation holds).
- `npm run test`, `npx astro check`, `npm run lint`, and `npm run build` all pass.

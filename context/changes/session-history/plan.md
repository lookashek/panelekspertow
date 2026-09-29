# Session History (S-05) Implementation Plan

## Overview

Give a logged-in user a **history page** listing their saved sessions — decision text, creation date, and an active/completed status badge — newest first, each row linking to the already-built `/sessions/[id]` view. This closes FR-006 ("zapisać sesję na koncie i wrócić do niej z historii"). Multi-device access falls out for free: the list is server-rendered under cookie auth and RLS, so any device the user is signed in on sees the same history.

## Current State Analysis

- **The list query already exists.** `SessionRepository.listSessions({ limit })` (`src/lib/repositories/session.repository.ts:128`) selects all `sessions`, orders `created_at desc`, default limit 50 (`DEFAULT_LIST_LIMIT`, `:29`). It applies no `.eq("user_id", …)` filter — isolation is enforced entirely by the `sessions_select_own` RLS policy (`supabase/migrations/20260923140522_create_sessions_and_advisor_opinions.sql:40`).
- **No service method wraps it.** `SessionService` (`src/lib/services/session.service.ts:393`) exposes create/run/synthesis/side-thread methods but no list method.
- **Returning to a session is fully built.** `/sessions/[id].astro` SSR-renders a saved session (rounds, opinions, synthesis, side-threads) with an ownership check + 404 (`src/pages/sessions/[id].astro:30-32`). "Return to a chosen session" is therefore just an `<a href="/sessions/{id}">` — no new detail view.
- **No list UI.** `dashboard.astro` is a welcome panel + single "NOWA DECYZJA" CTA (`src/pages/dashboard.astro:17-22`). `Topbar.astro` (global, `src/layouts/Layout.astro:28`) has `Panel → /dashboard` and `Nowa decyzja → /sessions/new` (`src/components/Topbar.astro:10-15`). `/sessions` (bare) is **not** a route yet, though `/sessions` is already in `PROTECTED_ROUTES` (`src/middleware.ts:4`).
- **No `title`/`summary` column.** A session's only human-readable label is `decision` (plus optional `context`). Status enum is `active | completed` (`src/types/session.ts:9`). Both `created_at` and `updated_at` exist.
- **No date formatter, no `card`/`table`/`badge` shadcn components.** `src/components/ui/` has only button/input/textarea/label + `LibBadge.astro`. `src/lib/utils.ts` holds only `cn()`.
- **`SessionServiceDeps.provider` is required** (`LlmProvider`, `src/lib/services/session.service.ts:132`); every route builds the service with `createLlmProvider()` (`src/lib/adapters/create-llm-provider.ts:12`, which can return `null`). A read-only list page must not be forced to instantiate an LLM provider.

### Key Discoveries:

- `listSessions` exists and is RLS-scoped — Phase 1 is a thin service wrapper + a unit test, not new query logic (`src/lib/repositories/session.repository.ts:128`).
- Ownership for a **list** is enforced by RLS scoping, not a per-row check. The lessons.md rule "enforce ownership with RLS AND an explicit service-side check" targets loading a single row **by id**; there is no id to cross-check on a list, so RLS scoping is the correct and sufficient mechanism here (`context/foundation/lessons.md:26`).
- Existing read pages call the repository directly in frontmatter (`src/pages/sessions/[id].astro:30`), but backend.md prescribes handler→service→repository; this plan adds the service method (user decision) and routes the page through it.
- `provider` must become optional in `SessionServiceDeps` so the list page doesn't drag in the LLM adapter — the run-methods already assume it exists and will need a guard (see Critical Implementation Details).
- Astro-first: the list is SSR data + links with no interactivity → a static `.astro` component, no React island (`.claude/rules/frontend.md` §1).

## Desired End State

A signed-in user clicks **"Historia"** in the Topbar (or a link on the dashboard) and lands on `/sessions`, a page listing their saved sessions newest-first — each row showing the (clipped) decision, the creation date formatted in Polish, and an active/completed badge — and clicking a row opens that session at `/sessions/[id]`. A user with no sessions sees a friendly empty panel with a "Nowa decyzja" CTA. A different user, signed in on any device, sees only their own sessions.

Verify: `npm run test` covers the new `listSessions` service method; manually, sign in as a user with ≥1 session, open `/sessions`, confirm rows/date/badge/ordering, click through to a session, then confirm a second account sees a disjoint list and an empty account sees the CTA.

## What We're NOT Doing

- **No pagination / infinite scroll / "load more."** MVP shows up to the existing `DEFAULT_LIST_LIMIT` (50) newest sessions. (backend.md §4 asks list endpoints to be paginated from day one; this is an SSR page read, not a public JSON list endpoint, and 50 is a hard cap — pagination is deferred, noted as a known gap.)
- **No search, filtering, or sorting controls.** Fixed order: newest created first.
- **No delete / rename / archive actions** on the list.
- **No new session detail view** — `/sessions/[id].astro` already exists and is untouched.
- **No `updated_at`-based "recently active" ordering** — created_at desc only (user decision).
- **No synthesis/round-count preview** on rows — decision + date + status only.
- **No schema/migration changes** — reuses the existing `sessions` table and RLS.

## Implementation Approach

Two phases, split by verification surface. Phase 1 is pure backend: add `SessionService.listSessions()` wrapping the existing repository method, make `provider` optional so the read path doesn't need the LLM adapter, and add a Polish date formatter — all unit/type verifiable. Phase 2 is the SSR UI: a `/sessions/index.astro` page that builds the service and renders a static `SessionList.astro` (rows, badge, truncation, empty state), plus navigation wiring in `Topbar.astro` and `dashboard.astro`.

## Critical Implementation Details

- **`provider` optionality.** Change `SessionServiceDeps.provider` to optional and store it as `LlmProvider | undefined`. The four LLM-using methods (`runFirstRound`, `runSecondRound`, `runSynthesis`, `askSideThread`) must guard at entry — if the provider is absent, return `err(new AppError("Service not configured", ErrorCode.NOT_CONFIGURED, 503))` and bind a local non-null `provider` for the rest of the method. This keeps existing callers (which always pass a provider) behaving identically while letting the list page construct the service with `{ repository }` alone. Existing service tests always pass a provider, so they stay green.

## Phase 1: Data access — service list method + formatter

### Overview

Add the RLS-scoped list use case to the service layer and a display-only date helper, without coupling reads to the LLM provider.

### Changes Required:

#### 1. Make provider optional on the service

**File**: `src/lib/services/session.service.ts`

**Intent**: Allow a read-only construction (`new SessionService({ repository })`) so the history page needn't instantiate an LLM provider it never uses.

**Contract**: `SessionServiceDeps.provider` becomes `provider?: LlmProvider`; the private field becomes `LlmProvider | undefined`. Each of `runFirstRound`/`runSecondRound`/`runSynthesis`/`askSideThread` gains an entry guard returning `err(new AppError("Service not configured", ErrorCode.NOT_CONFIGURED, 503))` when the provider is absent, then uses a locally-bound non-null provider. No behavior change when a provider is supplied.

#### 2. Add `listSessions` to the service

**File**: `src/lib/services/session.service.ts`

**Intent**: Expose the user's saved sessions as a service use case (honors backend.md handler→service→repository layering) by delegating to the existing repository method.

**Contract**: `listSessions(opts?: { limit?: number }): Promise<Result<Session[]>>` — thin passthrough to `this.repository.listSessions(opts)`. No ownership arg and no per-row check: the repository query is RLS-scoped to the caller (see Key Discoveries). Returns the repository `Result` unchanged.

#### 3. Polish date formatter

**File**: `src/lib/utils.ts`

**Intent**: Render a session's ISO `createdAt` as a readable Polish date for the list rows (no date library — the project has none and backend/frontend rules prefer the platform).

**Contract**: `formatSessionDate(iso: string): string` using `Intl.DateTimeFormat("pl-PL", { dateStyle: "medium", timeStyle: "short" })`. Pure function, no dependencies.

#### 4. Unit test for `listSessions`

**File**: `src/lib/services/session.service.test.ts`

**Intent**: Lock the service method's contract — delegates to the repository and propagates both ok and error Results.

**Contract**: Add cases: (a) `listSessions` returns the repository's `ok([...])` value; (b) propagates a repository `err(DbError)`; (c) the service constructs and the list path works with `new SessionService({ repository })` (no provider). Follow the existing mock-repository style at `src/lib/services/session.service.test.ts:229`.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test`
- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`

#### Manual Verification:

- (none — Phase 1 has no user-visible surface; verified by tests)

**Implementation Note**: After completing this phase and all automated verification passes, proceed to Phase 2 (no manual gate needed here).

---

## Phase 2: History UI — page, list component, navigation

### Overview

Render the list at `/sessions`, wire it into navigation, and handle the empty state — all SSR, no React island.

### Changes Required:

#### 1. History page

**File**: `src/pages/sessions/index.astro` (new)

**Intent**: SSR the user's session list. Auth is already guaranteed by `PROTECTED_ROUTES` covering `/sessions`; build the service from the cookie client and call `listSessions`.

**Contract**: Frontmatter: `const client = createClient(Astro.request.headers, Astro.cookies)` → if `null`, render a "service not configured" state (mirror the null-client handling in `[id].astro:27`). Else `new SessionService({ repository: new SessionRepository(client) })` and `await service.listSessions()`. On `err`, render an error state (message, no crash). On `ok`, pass `value` (a `Session[]`) to `SessionList`. Renders inside `Layout` with a pixel-panel container consistent with `sessions/new.astro`.

#### 2. Session list component

**File**: `src/components/session-history/SessionList.astro` (new)

**Intent**: Present the sessions as scannable rows and handle the empty state. Static Astro — no interactivity.

**Contract**: Props `{ sessions: Session[] }`. When empty, render a pixel-panel empty state with copy (e.g. "Nie masz jeszcze żadnych sesji") and a `pixel-btn` link to `/sessions/new` (reuse the dashboard CTA styling, `dashboard.astro:17-22`). When non-empty, render each session as a link `href={`/sessions/${s.id}`}` containing: the decision text clipped with `line-clamp-2` (full text stays in the DOM), `formatSessionDate(s.createdAt)`, and a status badge. Badge: a small pixel-styled element for `active` vs `completed` (reuse `src/components/ui/LibBadge.astro` if its API fits, else a `<span>` with token classes) — status conveyed by **text + color**, never color alone (frontend.md §6). Follow the single dark pixel-retro theme (frontend.md §5): sharp corners, 2px borders, token colors via `cn()`, no `rounded-*`.

#### 3. Topbar link

**File**: `src/components/Topbar.astro`

**Intent**: Give logged-in users a persistent entry point to their history.

**Contract**: Add an `<a href="/sessions">Historia</a>` in the logged-in link group (`Topbar.astro:9-21`), styled identically to the existing "Panel"/"Nowa decyzja" links.

#### 4. Dashboard link

**File**: `src/pages/dashboard.astro`

**Intent**: Surface history from the post-login landing page alongside the existing "Nowa decyzja" CTA.

**Contract**: Add a link/button to `/sessions` (e.g. "MOJE SESJE") next to the existing CTA (`dashboard.astro:17-22`), matching its `pixel-btn` styling.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification:

- Signed in as a user with ≥1 session, `/sessions` lists them newest-first with decision text, Polish-formatted date, and correct active/completed badge.
- Clicking a row opens that session at `/sessions/[id]`.
- A user with zero sessions sees the empty panel + working "Nowa decyzja" CTA.
- A second account sees only its own sessions (isolation) — sign in as user B, confirm user A's sessions are absent.
- "Historia" appears in the Topbar for logged-in users and navigates to `/sessions`; the dashboard link works.
- Renders correctly at 375px and 1280px; accent text meets AA contrast; keyboard-navigable rows with visible focus (frontend.md §6, §9).

**Implementation Note**: After completing this phase and all automated verification passes, pause for human manual confirmation before considering the change done.

---

## Testing Strategy

### Unit Tests:

- `SessionService.listSessions` delegates to the repository and propagates ok/err Results.
- Service constructs and the read path works without a provider (`new SessionService({ repository })`).

### Integration Tests:

- None automated (no page-level test harness in the project). Covered by the manual steps below and the existing smoke test for auth/routing.

### Manual Testing Steps:

1. Start the dev server; sign in as a user who has run ≥1 session.
2. Click "Historia" in the Topbar → `/sessions` renders the list newest-first.
3. Confirm each row shows decision (clipped), Polish date, and the right status badge.
4. Click a row → the session opens at `/sessions/[id]`.
5. Sign in as a second account → `/sessions` shows only that account's sessions (empty if none, with CTA).
6. Resize to 375px and 1280px; tab through rows to confirm focus rings.

## Performance Considerations

Single indexed query per page load (`sessions_user_id_created_at_idx`), capped at 50 rows, rendered server-side — negligible. No client JS added.

## Migration Notes

None — no schema changes; reuses the existing `sessions` table and RLS policies.

## References

- Roadmap item S-05: `context/foundation/roadmap.md:51` (Change ID `session-history`, FR-006)
- Existing list query: `src/lib/repositories/session.repository.ts:128`
- Session detail view (return target): `src/pages/sessions/[id].astro`
- Service construction precedent: `src/pages/api/sessions/index.ts:38`
- RLS SELECT policy: `supabase/migrations/20260923140522_create_sessions_and_advisor_opinions.sql:40`
- Ownership lesson (why no per-row check on a list): `context/foundation/lessons.md:26`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data access — service list method + formatter

#### Automated

- [x] 1.1 Unit tests pass: `npm run test` — fc8b922
- [x] 1.2 Type checking passes: `npx astro check` — fc8b922
- [x] 1.3 Linting passes: `npm run lint` — fc8b922

### Phase 2: History UI — page, list component, navigation

#### Automated

- [x] 2.1 Type checking passes: `npx astro check`
- [x] 2.2 Linting passes: `npm run lint`
- [x] 2.3 Production build succeeds: `npm run build`

#### Manual

- [x] 2.4 `/sessions` lists the user's sessions newest-first with decision, Polish date, and correct status badge
- [x] 2.5 Clicking a row opens that session at `/sessions/[id]`
- [x] 2.6 A user with zero sessions sees the empty panel + working "Nowa decyzja" CTA
- [x] 2.7 A second account sees only its own sessions (isolation)
- [x] 2.8 "Historia" appears in the Topbar and the dashboard link works
- [x] 2.9 Renders at 375px and 1280px with AA-contrast accents and keyboard-navigable rows

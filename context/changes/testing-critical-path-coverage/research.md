---
date: 2026-11-09T06:40:52+00:00
researcher: lstepien (Claude Code, Sonnet 5)
git_commit: 60f7ffc
branch: main
repository: panelekspertow
topic: "Rollout Phase 1 (test-plan.md) — session-ownership (Risk #1) and API/SSE-layer coverage (Risk #3)"
tags: [research, codebase, testing, auth, ownership, rls, sse, session-service, session-repository]
status: complete
last_updated: 2026-11-09
last_updated_by: lstepien (Claude Code, Sonnet 5)
---

# Research: Critical-path coverage — auth, ownership, API routes

**Date**: 2026-11-09T06:40:52+00:00
**Researcher**: lstepien (Claude Code, Sonnet 5)
**Git Commit**: 60f7ffc
**Branch**: main
**Repository**: panelekspertow

## Research Question

Ground rollout Phase 1 of `context/foundation/test-plan.md` (Risk #1 — session-scoped
resource served to a non-owning user; Risk #3 — zero automated coverage on the
API-route/streaming-hook layer, including SSE lifecycle on the Cloudflare Workers edge
runtime). For each risk: locate the real failure path in code, verify or correct the
plan's response guidance, locate existing tests, name the cheapest useful test layer,
and flag any misleading hot-spot evidence or speculative sub-risks.

**Method.** Two read-only sub-agents inspected the repo in parallel: one mapped
`src/pages/api/**`, `src/middleware.ts`, the three SSE routes, and `src/lib/supabase.ts`;
the other mapped `src/lib/repositories/session.repository.ts`,
`src/lib/services/session.service.ts`, every `supabase/migrations/*.sql` RLS policy, and
the `lessons.md` F5 incident plus its archived origin. Findings below are anchored to
`file:line`; nothing was inferred from naming alone.

## Summary

Both risks are real, but neither is where the test-plan's §2 wording would suggest on
first read, and Risk #1 is **partially already fixed** — the plan's "must challenge"
framing is correct, but the specific gap has moved.

- **Risk #1 (ownership)**: the exact F5 incident (RLS-only session load) is **already
  fixed** at the four use-case entry points (`runFirstRound`, `runSecondRound`,
  `runSynthesis`, `askSideThread`) and at the `[id].astro` page — each does an explicit
  `session.userId !== userId → NotFoundError` check on top of RLS, matching
  `backend.md` §7. The **real, currently-unaddressed gap** is one layer down:
  `getOpinions`, `getSynthesis`, `getSideThreadMessagesForSession`,
  `getSideThreadMessages`, and `countSideThreadUserMessages` filter only by
  `session_id`/`persona_id`, never by `user_id` — they have no second line of defense
  if a future call site ever reaches them with an unvalidated `sessionId` or an
  elevated client. `countRecentSideThreadMessagesByUser` is the weakest point: it takes
  no `sessionId` or `userId` argument at all and depends **entirely** on RLS.
- **Risk #3 (API/SSE layer)**: confirmed zero test files under `src/pages/**`,
  `src/components/**`, `src/hooks/**`. All three SSE routes (`stream.ts`,
  `side-thread.ts`, `synthesis.ts`) correctly handle `request.signal` abort and close
  the stream controller in a `finally` block — but **none of them apply
  `AbortSignal.timeout(...)`**, contradicting `backend.md` §5 ("Timeouts and
  cancellation are mandatory"). This is a real gap, not a speculative one: a hung
  upstream LLM call with no client-side abort is currently unbounded at the route
  layer. The middleware's `PROTECTED_ROUTES` (`/dashboard`, `/sessions`) does **not**
  cover `/api/sessions/**` at all (API paths don't start with `/sessions`) — each API
  route independently checks `locals.user`, correctly, by inspection.

**Hot-spot evidence correction needed**: §1/§3 of the test plan cite
`src/hooks/**` as a zero-coverage area; the explore agent could not confirm a
populated `src/hooks/` directory exists at all (glob returned nothing, and the
streaming is actually driven from inside the route handlers' `ReadableStream`, not a
client-side hook file under that path). This should be flagged to the user, not
silently backported.

## Detailed Findings

### Risk #1 — Session/resource ownership

**What's already fixed (do not re-test as if broken):**

Service-level explicit ownership check, same pattern in all four use cases
(`src/lib/services/session.service.ts`):
- `runFirstRound` — `:424-431`: `if (session?.userId !== userId) { return err(new NotFoundError("Session not found")); }`
- `runSecondRound` — `:461-468`, identical pattern
- `runSynthesis` — `:525-532`, identical pattern
- `askSideThread` — `:607-614`, identical pattern, with a doc comment (`:591-595`) naming "ownership check" as step one

The SSR page independently repeats the same check: `src/pages/sessions/[id].astro:30-31`
— `if (!result.ok || result.value?.userId !== user.id) { notFound = true; }`.

Underlying repository call, `getSession` (`src/lib/repositories/session.repository.ts:174-179`),
filters by `.eq("id", id)` only — ownership is enforced by the service layer on top of
RLS, matching `backend.md` §7's "RLS + explicit check" mandate and closing the F5
lesson (`context/foundation/lessons.md:25-30`) for these four entry points.

**Where the F5 incident originated** (for context, not an anchor to re-break):
`context/archive/2026-09-25-first-divergent-round/plan.md:165` planned
`runFirstRound` to rely on "RLS-null → NotFoundError" with no explicit `userId`
comparison — the exact gap the lesson now forbids. Current code no longer matches that
old plan text; the fix already landed.

**The real, currently open gap** — repository methods one layer below the four entry
points perform no ownership filter of their own, trusting only that `sessionId` was
pre-validated upstream, or trusting RLS alone when it wasn't validated at all:

| Method | Anchor | Filters by |
|---|---|---|
| `getOpinions(sessionId, roundNumber)` | `session.repository.ts:151-157` | `session_id`, `round_number` — no `user_id` |
| `getSynthesis(sessionId)` | `session.repository.ts:196-201` | `session_id` — no `user_id` |
| `getSideThreadMessagesForSession(sessionId)` | `session.repository.ts:270-277` | `session_id` — no `user_id` |
| `getSideThreadMessages(sessionId, personaId)` | `session.repository.ts:294-304` | `session_id`, `persona_id` — no `user_id` |
| `countSideThreadUserMessages(sessionId, personaId)` | `session.repository.ts:321-327` | `session_id`, `persona_id`, `role` — no `user_id` |
| `countRecentSideThreadMessagesByUser(sinceIso)` | `session.repository.ts:336-341` | `role`, `created_at` only — **no `session_id` or `user_id` at all** |
| `listSessions(opts)` | `session.service.ts:409-416` | none — documented as intentionally RLS-only (no `id` input to spoof) |

RLS policies do back every one of these tables (`auth.uid() = user_id` on
`select`/`insert`/`update`/`delete` for `sessions` and `advisor_opinions`
— `supabase/migrations/20260923140522_create_sessions_and_advisor_opinions.sql:40-72`;
same shape for `session_syntheses` —
`20260929120000_create_session_syntheses.sql:18-33`; `advisor_side_thread_messages` has
**select + insert only**, no update/delete, intentionally append-only —
`20260929130000_create_side_thread_messages.sql:16-29`). So today, a cross-user read at
this layer is denied **by RLS alone** — there is no application-level second check,
which is exactly the single-point-of-failure pattern the F5 lesson exists to prevent.

**Response-guidance correction for `/10x-plan`:** the test plan's §2 Response
Guidance for Risk #1 ("integration test against the repository/service layer with two
seeded Supabase users") is still the right shape, but the test target should be
reframed: write it against `getOpinions`/`getSynthesis`/`getSideThreadMessagesForSession`/
`getSideThreadMessages` directly (not against `runFirstRound` etc., which already pass),
and explicitly include `countRecentSideThreadMessagesByUser` as the no-session-id edge
case. The "must challenge" framing in §2 ("RLS policy is enough") is correct and should
stay — it's just now scoped to the downstream reads, not the four already-fixed entry
points.

### Risk #3 — API route / streaming-hook layer coverage

**Route inventory** (`src/pages/api/**`, 7 files, no others exist):
- `auth/signin.ts`, `auth/signup.ts`, `auth/signout.ts` — public, redirect-with-`?error=`
  style, consistent with `backend.md` §3's note not to mix styles.
- `sessions/index.ts` — `POST` only (`:11`); auth check `:12-14` (`UnauthorizedError` → 401
  JSON). No `GET` is wired despite `SessionService.listSessions` existing
  (`session.service.ts:414`) — not a bug for this phase, just worth the plan noting so a
  test isn't written against a route that doesn't exist.
- `sessions/[id]/side-thread.ts` (POST), `sessions/[id]/stream.ts` (GET, SSE),
  `sessions/[id]/synthesis.ts` (GET, SSE) — each does its own `if (!locals.user)` → 401
  JSON check (`side-thread.ts:28-30`, `stream.ts:48-50`, `synthesis.ts:29-31`), then
  delegates ownership to the service layer as above.

**Middleware** (`src/middleware.ts`, full file, 25 lines): `PROTECTED_ROUTES = ["/dashboard",
"/sessions"]` (`:4`), matched with `startsWith` (`:18`). Because API routes live under
`/api/sessions/...` (not `/sessions/...`), **the middleware redirect never fires for any
API route** — confirmed by inspection, not inference. Each JSON API route's own 401 check
is the only auth gate it gets, and by inspection every session-scoped API route has one.
`context.locals.user` defaults to `null` when the Supabase client is unavailable
(`:14-16`), so an unconfigured deployment fails closed to "sign in required" rather than
crashing — same null-client discipline as `src/lib/supabase.ts:6-8`.

**SSE lifecycle** (`stream.ts:85-123`, `side-thread.ts:71-108`, `synthesis.ts:56-93` —
byte-identical shape across all three):
- Abort handling: **present**. `request.signal.addEventListener("abort", onAbort, { once:
  true })` closes the controller early; the listener is removed in `finally`.
- Finally-block close: **present**. The event-forwarding loop is wrapped in
  `try { … } finally { controller.close() }`, with an inner `try/catch` to swallow
  "already closed" errors from the race between normal completion and abort.
- Explicit timeout: **absent**. No `AbortSignal.timeout(...)` or `AbortSignal.any(...)`
  anywhere in these three routes. This is a genuine gap against `backend.md` §5's
  "Timeouts and cancellation are mandatory" — only a client-initiated abort bounds the
  stream; a stalled upstream LLM call with no client disconnect is not bounded by the
  route itself. (Whether `src/lib/adapters/**` applies its own timeout was out of scope
  for this pass — `/10x-plan` should decide whether to verify that separately before
  writing a test that assumes no timeout exists anywhere in the call chain.)
- `locals.cfContext?.waitUntil(view.persistTail)` is used in all three routes to let
  background DB writes continue past the returned Response — note for the plan: aborting
  the client-facing SSE stream does not necessarily cancel `persistTail`; a lifecycle
  test should decide whether that's in scope or an accepted non-goal.

**Existing test coverage**: confirmed zero test files under `src/pages/**`,
`src/components/**`, `src/hooks/**` (glob `*.{test,spec}.*` — no matches in any of the
three). 16 Vitest files exist under `src/lib/**`; the two most relevant as fixture/mocking
precedent for this phase are `src/lib/repositories/session.repository.test.ts` and
`src/lib/services/session.service.test.ts` — read these before writing new tests to reuse
the existing Supabase-client mocking pattern rather than inventing a new one.

### Hot-spot evidence correction

Test plan's hot-spot citation for Risk #3 includes `src/hooks/**`
(`usePanelStream`/`useSideThreadStream`/`useSynthesisStream`). No populated `src/hooks/`
directory was found by glob, and the actual SSE producer/consumer logic lives inside the
route handlers themselves (`ReadableStream` construction in the three API routes above),
not in a separate client-side hook file at that path. `/10x-plan` should verify where (if
anywhere) those hook names actually live before scoping a sub-phase to them, rather than
assuming the test-plan's citation is current.

## Open questions / gaps

- Whether `src/lib/adapters/**` (the LLM provider adapters) already apply their own
  timeout independent of the route layer — not verified in this pass; relevant to how
  strict the Risk #3 "SSE lifecycle/edge timeout" response guidance should be.
- Whether a hooks-based client consumer for the SSE streams exists under a different
  path than `src/hooks/` — not located; `/10x-plan` should re-grep before committing a
  sub-phase name to it.

## Answer for `/10x-plan`

Both risks are plan-able now. Risk #1's cheapest test layer is a repository/service-level
integration test with two seeded Supabase users, targeted at the five downstream
read methods listed above (not the four already-fixed entry points) — reuse the mocking
pattern in `session.repository.test.ts`/`session.service.test.ts`. Risk #3's cheapest
layer is route-level integration tests asserting 401/ownership-404 behavior for each of
the 7 API routes, plus a narrower, deterministic test (or documented manual check, per
the test plan's own anti-pattern guidance) for the SSE abort/finally behavior — the
missing `AbortSignal.timeout` is a real finding worth a sub-phase note even if fixing it
is out of scope for a pure test-rollout phase.

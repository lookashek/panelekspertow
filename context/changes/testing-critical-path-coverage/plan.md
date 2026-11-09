# Critical-path coverage: auth, ownership, API routes — Implementation Plan

## Overview

Rollout Phase 1 of `context/foundation/test-plan.md`. Closes the two highest-confirmed
test gaps: Risk #1 (a session-scoped read served to a non-owning user) and Risk #3 (zero
automated coverage on the API-route/streaming-hook layer, including SSE lifecycle). All
new tests are Vitest unit/integration tests — no browser e2e, per rollout scope.

## Current State Analysis

- `src/pages/api/**` (7 route files), `src/components/**`, `src/hooks/**` have zero test
  files (`research.md` §"Existing test coverage").
- `src/lib/**` has 16 Vitest files, all mocking the Supabase client or the repository —
  none exercise real Postgres RLS (`research.md` Risk #1 detail, `session.repository.test.ts`,
  `session.service.test.ts`).
- `scripts/rls-smoke.mjs` already proves real cross-user RLS isolation, but only for raw
  `sessions`/`advisor_opinions` table calls via `@supabase/supabase-js` directly — not
  through `SessionRepository`, and not for `session_syntheses` or
  `advisor_side_thread_messages` (confirmed by reading the script in full during planning;
  not previously anchored in `research.md`).
- `npm test` (`vitest run`) is **not invoked anywhere in CI** (`.github/workflows/ci.yml`
  has a `ci` job — lint, lint:ui, astro check, build — and a `smoke` job — local Supabase +
  `npm run smoke:rls` + `npm run smoke` — neither runs `vitest`). This means even the
  existing 16 test files are not CI-enforced today, and any test this phase adds would
  silently rot without being wired in. Confirmed by reading `package.json` scripts and
  `.github/workflows/ci.yml` during planning.
- The four use-case entry points (`runFirstRound`, `runSecondRound`, `runSynthesis`,
  `askSideThread` in `src/lib/services/session.service.ts`) already do the explicit
  `session.userId !== userId → NotFoundError` ownership check on top of RLS
  (`research.md` Risk #1). **Do not write tests asserting these are broken** — they pass
  today.
- `getOpinions`, `getSynthesis`, `getSideThreadMessagesForSession`, `getSideThreadMessages`,
  `countSideThreadUserMessages` (`src/lib/repositories/session.repository.ts`) filter only
  by `session_id`/`persona_id`, never `user_id` — RLS is the only defense.
  `countRecentSideThreadMessagesByUser` takes no `sessionId`/`userId` argument at all and
  depends entirely on RLS (`research.md` Risk #1 table).
- Only the two **GET/EventSource** streaming routes — `stream.ts` and `synthesis.ts` —
  route pre-stream errors (auth, validation, ownership) through `sseErrorResponse()`
  (`src/lib/http.ts:35-51`), which **always returns HTTP 200** with a single
  `event: fatal` frame carrying `{ code, message }` — confirmed by reading `http.ts`,
  `stream.ts:47-50`, and `synthesis.ts:28-31` in full during planning. **`side-thread.ts`
  is a `POST` route and uses `errorResponse()` (plain JSON, real status code) for every
  pre-stream error** (`side-thread.ts:28-29`) — it only emits an SSE body after the
  ownership/validation checks pass, for the token-streaming part of the response. This
  corrects an assumption in `research.md`, which grouped all three "SSE routes" together
  without checking this split. So: JSON 401 for `sessions/index.ts` **and**
  `side-thread.ts`; SSE `event: fatal` with `code: "UNAUTHORIZED"`/`code: "NOT_FOUND"` only
  for `stream.ts` and `synthesis.ts`.
- SSE abort handling: all three streaming routes register `request.signal.addEventListener("abort", ...)`
  and close the controller in a `finally` block (`stream.ts:85-123`, byte-identical in the
  other two) — this works today. None of the three apply `AbortSignal.timeout(...)`,
  contradicting `backend.md` §5 ("Timeouts and cancellation are mandatory").

### Key Discoveries:

- `scripts/rls-smoke.mjs:20-28` already has the two-real-user seeding pattern
  (`client.auth.signUp` against local Supabase) this phase reuses — write new Vitest
  integration tests with the same seeding approach rather than inventing a new one.
- `session.service.test.ts:5-7` shows the precedent for mocking `@/lib/adapters/create-llm-provider`
  via `vi.mock` so a service/route test can run without live LLM calls or
  `astro:env/server` resolution — the new route-level integration tests reuse this to keep
  Supabase real while keeping the LLM provider fake and deterministic.
- `errorResponse()`/`sseErrorResponse()` (`src/lib/http.ts`) are the only two response
  shapes in the app (`backend.md` §3) — every new auth/ownership test asserts against one
  of these two shapes, never a hand-rolled check.

## Desired End State

Every session-scoped API route rejects an unauthenticated request in its route-appropriate
shape, and a non-owning authenticated user is denied read access to another user's session,
opinions, synthesis, and side-thread messages — proven against a real local Supabase with
two real seeded users, not a mocked DB client. The SSE abort/finally lifecycle is covered by
a deterministic test. `npm test` runs in CI for both the existing suite and the new tests,
with the Supabase-dependent ones gated to the job that actually has local Supabase running.

**Verification**: `npm test` passes locally and in CI; the `smoke` CI job runs the new
Supabase-backed integration file after `supabase migration up` and before `smoke:rls`.

## What We're NOT Doing

- Not fixing the missing `AbortSignal.timeout` gap in the three SSE routes — Phase 1 of
  this rollout is a test phase; the missing timeout is recorded as a flagged finding in
  `test-plan.md` §6 for a future implementation change, not patched here.
- Not adding ownership tests for `runFirstRound`/`runSecondRound`/`runSynthesis`/
  `askSideThread` — already covered and passing (`research.md`).
- Not testing `listSessions` cross-user isolation at the application-code level — it is
  intentionally RLS-only by design (`session.service.ts:409-413`) and has no `id` input to
  spoof; out of scope per that documented design decision.
- Not writing browser/Playwright e2e for any of this — rollout scope is unit/integration
  only (test-plan.md §3 Phase 1 test types, user instruction for this rollout).
- Not retrofitting `scripts/rls-smoke.mjs` itself — the new coverage is a Vitest
  integration file so it can assert against typed `SessionRepository`/route-handler
  contracts and run inside the standard `npm test` harness, not a second standalone script.

## Implementation Approach

Three layers, cheapest first:

1. **Pure unit, no DB** — unauthenticated-request shape for every session-scoped route.
   Zero new infra; runs anywhere `npm test` runs.
2. **Real local Supabase, two real users, fake LLM provider** — a single new Vitest file
   gated with `describe.skipIf(!process.env.SUPABASE_URL)` (same skip discipline as
   `rls-smoke.mjs`), covering both the repository-level downstream-read gap and the
   route-handler-level ownership denial, reusing the real `SessionRepository` + real RLS as
   the oracle. The LLM provider is mocked via `vi.mock("@/lib/adapters/create-llm-provider")`
   so no live LLM call or `astro:env/server` resolution is needed — Supabase itself stays
   real and unmocked, satisfying the anti-pattern guidance in `test-plan.md` §2.
3. **Wire it in** — add `npm test` to CI so the above actually gates merges; close out the
   rollout-phase bookkeeping.

## Phase 1: Unauthenticated-request coverage (no DB)

### Overview

Prove every session-scoped API route rejects a request with no `locals.user`, in its
route-appropriate response shape.

### Changes Required:

#### 1. New test file for JSON routes

**File**: `src/pages/api/sessions/index.test.ts`

**Intent**: Call the exported `POST` handler directly with an `APIContext`-shaped object
whose `locals.user` is `null`; assert the response is the `errorResponse()` shape — status
401, JSON body `{ error: { code: "UNAUTHORIZED", message: ... } }`.

**Contract**: Construct a minimal `APIContext` stub (`request`, `cookies`, `locals: { user: null }`)
— the handler never reaches `createClient`/`createLlmProvider` when `locals.user` is falsy
(`sessions/index.ts:12-14`), so no Supabase/LLM stubbing is needed for this test.

#### 2. New test file for the two GET/EventSource SSE routes

**Files**: `src/pages/api/sessions/[id]/stream.test.ts`,
`src/pages/api/sessions/[id]/synthesis.test.ts`

**Intent**: Call each exported `GET` handler directly with `locals.user: null`; assert the
response status is **200** (not 401 — `sseErrorResponse` never sets a non-200 status) and
the body, read from the stream, is a single `event: fatal` frame whose JSON payload has
`code: "UNAUTHORIZED"`.

**Contract**: Read the full `ReadableStream` body via `new Response(res.body).text()` (or
equivalent) and assert on the decoded SSE frame text, matching the exact format
`sseErrorResponse` produces (`http.ts:37`: `` `event: fatal\ndata: ${JSON.stringify({ code, message })}\n\n` ``).

#### 3. New test file for `side-thread.ts` (POST, plain JSON)

**File**: `src/pages/api/sessions/[id]/side-thread.test.ts`

**Intent**: Call the exported `POST` handler directly with `locals.user: null`; assert the
response is the `errorResponse()` shape — status 401, JSON body
`{ error: { code: "UNAUTHORIZED", message: ... } }` — same shape as item 1, not the SSE
shape in item 2, because `side-thread.ts`'s auth check runs before any stream is
constructed (`side-thread.ts:28-29`).

**Contract**: Same minimal `APIContext` stub as item 1, plus `params: { id: "session-1" }`
(the handler checks `locals.user` before `params.id`, so the exact id value doesn't matter
for this test).

### Success Criteria:

#### Automated Verification:

- `npm test -- src/pages/api/sessions/index.test.ts src/pages/api/sessions/\[id\]/stream.test.ts src/pages/api/sessions/\[id\]/side-thread.test.ts src/pages/api/sessions/\[id\]/synthesis.test.ts` passes
- `npm run lint` passes on the new files
- `npx astro check` passes (no type errors from the `APIContext` stub shape)

#### Manual Verification:

- None — this phase is fully deterministic and requires no manual check.

---

## Phase 2: Cross-user ownership integration coverage (real Supabase, two users)

### Overview

Prove the downstream repository reads and the route-handler ownership path deny a
non-owning user, using real Postgres RLS as the oracle — not a mocked DB client, and not
an assertion mirroring current code.

### Changes Required:

#### 1. Repository-level cross-user denial

**File**: `src/lib/repositories/session.repository.integration.test.ts` (new)

**Intent**: Seed two real Supabase users (same `auth.signUp` pattern as
`scripts/rls-smoke.mjs:20-28`). As user A, create a session, round-1 opinions, a synthesis,
and a side-thread message via `SessionRepository(clientA)`. Then, as user B, call
`SessionRepository(clientB).getOpinions`, `.getSynthesis`, `.getSideThreadMessagesForSession`,
`.getSideThreadMessages`, `.countSideThreadUserMessages` against A's `sessionId`, and
`.countRecentSideThreadMessagesByUser` right after A's write. Assert every one returns
empty/zero for B — proving RLS (not application code) is the thing denying access, which is
exactly the gap `research.md` found has no code-level second line of defense.

**Contract**: `describe.skipIf(!process.env.SUPABASE_URL)(...)` at the top, mirroring
`rls-smoke.mjs`'s skip-when-unconfigured discipline so this file is inert outside the
`smoke` CI job and local dev with Supabase running. No Supabase client is mocked — only a
real `createClient`-equivalent (`@supabase/supabase-js`'s `createClient`, same as the
script) against the local instance.

**Edge/boundary case asserted**: `countRecentSideThreadMessagesByUser` — called with no
`sessionId` argument at all — must still not leak B's count including A's message; this is
the weakest point `research.md` flagged, since it has no `sessionId`/`userId` filter in code
to check.

**Anti-pattern avoided**: no DB mocking (the one place this phase cannot cut the cost —
mocking would make the test pass against the code's current, possibly-incomplete, behavior
instead of against the real RLS oracle); no assertion copied from the implementation (the
oracle is "B gets nothing", not "B gets whatever the current query returns").

#### 2. Route-handler-level ownership denial

**File**: `src/pages/api/sessions/[id]/stream.integration.test.ts` (new; mirror for
`side-thread` and `synthesis` in the same or sibling files)

**Intent**: Using the same two real seeded users from the file above (or a shared fixture
helper — implementer's choice, no code snippet needed), call the real exported `GET`
(`stream.ts`, `synthesis.ts`) / `POST` (`side-thread.ts`) handlers with user B's
`locals.user` and `cookies`/`request` pointed at A's `sessionId`. Mock
`@/lib/adapters/create-llm-provider` (same `vi.mock` pattern as
`session.service.test.ts:5-7`) so no live LLM call happens — Supabase stays real. For
`stream.ts`/`synthesis.ts`, assert status 200 with an `event: fatal` SSE frame whose `code`
is `"NOT_FOUND"`; for `side-thread.ts`, assert the plain JSON `errorResponse()` shape —
status 404, `{ error: { code: "NOT_FOUND", ... } }` (per the `side-thread.ts`/`sessions/index.ts`
JSON-vs-SSE split documented in Current State Analysis). All three deny via the service
layer's `NotFoundError` (`session.service.ts:424-431` et al. — deliberately not leaking
existence of A's session to B).

**Contract**: Same `describe.skipIf` gate as Phase 2.1. Re-run the same case for a valid
A-owned `sessionId` as a control (A succeeds, B is denied) so the test can't pass by
accident on a route that always returns `NOT_FOUND`.

### Success Criteria:

#### Automated Verification:

- `SUPABASE_URL=<local> SUPABASE_KEY=<local anon key> npm test -- src/lib/repositories/session.repository.integration.test.ts src/pages/api/sessions` passes against a running local Supabase with migrations applied
- Without `SUPABASE_URL` set, `npm test` still passes (the new files no-op via `skipIf`)
- `npm run lint` passes on the new files

#### Manual Verification:

- None — asserted against real RLS, which is itself the independent oracle; no human
  judgment call is needed to interpret the result.

---

## Phase 3: SSE lifecycle determinism

### Overview

Prove the abort/finally close behavior already present in the three SSE routes is real and
covered, and record (without fixing) the missing `AbortSignal.timeout` as a finding for a
future implementation change.

### Changes Required:

#### 1. Abort-triggers-close test

**File**: `src/pages/api/sessions/[id]/stream.integration.test.ts` (same file as Phase 2.2,
additional `describe` block — or a sibling `*.lifecycle.test.ts`, implementer's choice)

**Intent**: As the owning user, start a real `GET` request to `stream.ts` (LLM provider
mocked to emit a slow/held token stream so the test can abort mid-stream deterministically),
then call `AbortController.abort()` on the request's controller before the stream finishes.
Assert the stream closes (no unhandled rejection/thrown error reaches the test) and that
reading past the abort point yields no further chunks.

**Contract**: Reuses the abort-listener/`finally` behavior already in `stream.ts:91-112` —
this test exercises existing code, adds no new production code. The mocked LLM provider's
`stream()` must yield at least one chunk before the test issues the abort, so the loop is
provably mid-iteration when aborted (not just aborting before anything started).

**Anti-pattern avoided**: asserting only "the promise resolved" (a mirror of "it didn't
crash") — the test must also assert no further SSE frames were written after the abort,
which is the actual behavior-under-test.

#### 2. Record the missing-timeout finding (no code change)

**File**: `context/foundation/test-plan.md` §6 (updated in Phase 4 below, not here —
listed for traceability only)

**Intent**: The absence of `AbortSignal.timeout(...)` in all three SSE routes
(`backend.md` §5 gap, confirmed in `research.md`) is noted as a finding, not fixed in this
test-only rollout phase.

### Success Criteria:

#### Automated Verification:

- `SUPABASE_URL=<local> SUPABASE_KEY=<local anon key> npm test -- src/pages/api/sessions/\[id\]/stream.integration.test.ts` passes, including the abort sub-case
- `npm run lint` passes on the new/changed files

#### Manual Verification:

- None.

---

## Phase 4: Wire tests into CI; close out the rollout phase

### Overview

Make the new coverage (and the pre-existing 16 `src/lib/**` files) actually CI-enforced,
and update the test-plan guide's bookkeeping.

### Changes Required:

#### 1. Run the DB-independent suite in the main CI job

**File**: `.github/workflows/ci.yml`

**Intent**: Add a `npm test` step to the `ci` job, after `npx astro check` and before
`npm run build` — this runs the existing 16 pure/mocked files plus this phase's Phase 1
unauthenticated-route tests. The Phase 2/3 Supabase-backed integration files no-op here via
their `skipIf` guard (no `SUPABASE_URL` is set in that job's non-build steps).

**Contract**: One new `- run: npm test` step in the `ci` job's existing step list.

#### 2. Run the Supabase-backed suite in the `smoke` job

**File**: `.github/workflows/ci.yml`

**Intent**: After "Apply migrations" and before "Run RLS isolation smoke test", add a step
that runs `npm test` with `SUPABASE_URL`/`SUPABASE_KEY` exported from `supabase.env` —
this is where the Phase 2/3 integration files actually execute against a real, migrated
local Supabase.

**Contract**: One new step, same `source supabase.env` + env-prefixed command pattern
already used for the `smoke:rls` step (`ci.yml:51-54`).

#### 3. Update the test plan's bookkeeping

**File**: `context/foundation/test-plan.md`

**Intent**: Flip §3 Phase 1's Status cell to `complete`. Add two cookbook entries to §6:
one naming the "real two-user Supabase, no DB mock" ownership-test pattern (pointing at
`src/lib/repositories/session.repository.integration.test.ts` and the route-handler
integration files), one naming the "abort triggers finally-close, LLM provider mocked /
Supabase real" SSE-lifecycle pattern (pointing at `stream.integration.test.ts`). Also add a
one-line note under §6 (or a new short §7 addendum) recording the missing
`AbortSignal.timeout` finding from Phase 3, so a future rollout phase or ad-hoc fix can pick
it up without re-deriving it.

**Contract**: Edits are confined to the Status cell in the §3 table and new bullet content
in §6 — no change to §1/§2 risk wording (that would require the `--refresh` path per the
test-plan skill's own rules).

### Success Criteria:

#### Automated Verification:

- `.github/workflows/ci.yml` parses as valid YAML (`npx -y js-yaml .github/workflows/ci.yml` or equivalent) and both new steps are present
- `npm run lint && npm run build` pass

#### Manual Verification:

- A maintainer confirms, after the next CI run on this branch, that both the `ci` job's
  `npm test` step and the `smoke` job's new Supabase-backed `npm test` step actually ran
  (visible in the Actions log) and passed.

---

## Testing Strategy

### Unit Tests:

- Unauthenticated-request shape per route (Phase 1) — no DB, fully deterministic.

### Integration Tests:

- Cross-user ownership denial at the repository and route-handler level, against real
  Postgres RLS with two real seeded Supabase users (Phase 2).
- SSE abort/finally lifecycle, LLM provider mocked, Supabase real (Phase 3).

### Manual Testing Steps:

- None required for this phase; every success criterion above is automated. The only
  manual step is confirming the two new CI steps actually executed (Phase 4).

## References

- Research: `context/changes/testing-critical-path-coverage/research.md`
- Existing two-user seeding precedent: `scripts/rls-smoke.mjs`
- Existing LLM-provider-mock precedent: `src/lib/services/session.service.test.ts:5-7`
- Response-shape helpers: `src/lib/http.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands.

### Phase 1: Unauthenticated-request coverage (no DB)

#### Automated

- [x] 1.1 `npm test` passes for the four new route unauthenticated-request test files — 59ec674
- [x] 1.2 `npm run lint` passes on the new files — 59ec674
- [x] 1.3 `npx astro check` passes — 59ec674

### Phase 2: Cross-user ownership integration coverage (real Supabase, two users)

> **Blocked in this session**: local Supabase (`supabase start`) failed to come up reliably
> on this machine (CLI connect race against the DB container's health check). Code for 2.1/2.2
> is written, type-checks, lints clean, and collects/skips correctly under plain `npm test`
> without `SUPABASE_URL` set (2.3/2.4 below) — but the actual DB-backed assertions in 2.1/2.2
> have **not** been executed against a real instance in this session. Run them against a
> working local Supabase (or let the `smoke` CI job run them) before checking 2.1/2.2 done.

#### Automated

- [ ] 2.1 Repository-level cross-user denial test passes against local Supabase
- [ ] 2.2 Route-handler-level ownership denial test passes against local Supabase
- [x] 2.3 `npm test` still passes with `SUPABASE_URL` unset (new files no-op) — 7773060
- [x] 2.4 `npm run lint` passes on the new files — 7773060

### Phase 3: SSE lifecycle determinism

> **Blocked in this session** for the same reason as Phase 2 — see note above. The abort test
> is written and type-checks/lints clean but has not run against a real local Supabase.

#### Automated

- [ ] 3.1 Abort-triggers-close test passes against local Supabase
- [x] 3.2 `npm run lint` passes on the new/changed files — 7773060

### Phase 4: Wire tests into CI; close out the rollout phase

#### Automated

- [ ] 4.1 `ci` job runs `npm test`
- [ ] 4.2 `smoke` job runs `npm test` against local Supabase after migrations
- [ ] 4.3 `test-plan.md` §3 Phase 1 Status flipped to `complete`, §6 updated with both cookbook patterns and the timeout finding
- [ ] 4.4 `npm run lint && npm run build` pass

#### Manual

- [ ] 4.5 Maintainer confirms both new CI steps ran and passed on this branch

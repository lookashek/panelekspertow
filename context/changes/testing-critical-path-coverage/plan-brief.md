# Critical-path coverage: auth, ownership, API routes — Plan Brief

> Full plan: `context/changes/testing-critical-path-coverage/plan.md`
> Research: `context/changes/testing-critical-path-coverage/research.md`

## What & Why

Rollout Phase 1 of `context/foundation/test-plan.md`: prove every session-scoped API route
fails closed on auth, and that a non-owning user cannot read another user's session,
opinions, synthesis, or side-thread messages — closing the two highest-confirmed test gaps
(Risk #3: zero coverage on the API/streaming layer; Risk #1: session-ownership isolation)
before any later rollout phase builds on this harness.

## Starting Point

`src/pages/api/**`, `src/components/**`, `src/hooks/**` have zero test files. The four main
ownership-check entry points (`runFirstRound`, `runSecondRound`, `runSynthesis`,
`askSideThread`) already enforce ownership correctly and are not re-tested. The real open
gap is one layer down — repository reads (`getOpinions`, `getSynthesis`,
`getSideThreadMessagesForSession`, `getSideThreadMessages`, `countSideThreadUserMessages`,
`countRecentSideThreadMessagesByUser`) rely on RLS alone, with no application-level second
check. `npm test` currently isn't run anywhere in CI, so even the existing 16 `src/lib/**`
tests aren't enforced today.

## Desired End State

Every session-scoped route has deterministic coverage for "no user" and "wrong user";
the downstream repository reads are proven denied by real Postgres RLS using two real
seeded Supabase users (not a mocked client); the SSE abort/finally lifecycle is covered by
a real test; and `npm test` runs in both CI jobs so none of this silently rots.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Test target for Risk #1 | Downstream repository reads + route handlers, not the 4 entry points | The entry points already pass; testing them again gives zero new signal | Research |
| DB fixture strategy | Real local Supabase, two real seeded users, RLS as the oracle | Mocking the DB would defeat the purpose — the whole risk is "RLS alone isn't enough," which a mock can't prove either way | Research |
| LLM provider in route tests | Mocked via existing `vi.mock` precedent | Keeps Supabase real while avoiding live LLM calls / `astro:env/server` resolution in tests | Plan |
| SSE error-response status | Assert 200 + `event: fatal` for the 3 streaming routes, 401 JSON only for `sessions/index.ts` | `sseErrorResponse` always returns HTTP 200 by design (`http.ts:35-51`) — asserting 401 there would be testing against a shape that doesn't exist | Plan |
| Missing `AbortSignal.timeout` | Record as a flagged finding, don't fix | This is a test-rollout phase, not an implementation phase; fixing it is a separate, explicit future change | Plan |
| CI wiring | Add `npm test` to both the `ci` job (DB-independent tests) and the `smoke` job (Supabase-backed tests, after migrations) | `npm test` currently runs nowhere in CI — new tests without this would be unenforced from day one | Plan |
| Test runner for new ownership checks | New Vitest integration files, not an extension of `scripts/rls-smoke.mjs` | Keeps typed assertions against the real `SessionRepository`/route-handler contracts inside the standard `npm test` harness | Plan |

## Scope

**In scope:**
- Unauthenticated-request tests for all 4 session-scoped API routes (JSON 401 for
  `sessions/index.ts`; SSE `event: fatal`/`UNAUTHORIZED` for the 3 streaming routes)
- Cross-user ownership-denial tests for the downstream repository reads and the 3 SSE
  route handlers, against real local Supabase with two seeded users
- SSE abort/finally lifecycle test
- Wiring `npm test` into both CI jobs
- Recording the missing `AbortSignal.timeout` as a finding in `test-plan.md` §6

**Out of scope:**
- Fixing the missing `AbortSignal.timeout`
- Re-testing the 4 already-passing ownership entry points
- `listSessions` cross-user isolation (intentionally RLS-only by design, no `id` to spoof)
- Any browser/Playwright e2e

## Architecture / Approach

Three cost-ordered layers: (1) pure unit tests with no DB for the auth-rejection shape per
route; (2) one new Vitest integration file family, gated by `describe.skipIf(!process.env.SUPABASE_URL)`,
that seeds two real Supabase users and exercises both the repository methods directly and
the real route handlers (LLM provider mocked) to prove cross-user denial via actual RLS;
(3) a deterministic abort/finally test built on the same real-Supabase fixture. A final
phase wires `npm test` into the `ci` job (layer 1) and the `smoke` job (layers 2–3, which
need the local Supabase that job already boots).

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Unauthenticated-request coverage | 4 new test files, no DB, deterministic | Low — pure unit tests |
| 2. Cross-user ownership integration | Repository + route-handler denial proven against real RLS | Medium — requires local Supabase running; `skipIf` must not silently mask a broken test |
| 3. SSE lifecycle determinism | Abort/finally behavior proven; timeout gap recorded | Medium — mocking the LLM provider's `stream()` to pause mid-emission for a deterministic abort point |
| 4. CI wiring + rollout bookkeeping | `npm test` enforced in both CI jobs; test-plan.md updated | Low — mechanical, but easy to put the step in the wrong job |

**Prerequisites:** local Supabase running with migrations applied (for Phases 2–3; already
available via `supabase start` + `supabase migration up`, same as `scripts/rls-smoke.mjs`
requires today).
**Estimated effort:** ~1 session across 4 phases.

## Open Risks & Assumptions

- Whether `src/lib/adapters/**` applies its own timeout independent of the route layer was
  not verified in research — Phase 3 only records the route-layer gap, doesn't assume the
  adapter layer is equally unbounded.
- No populated `src/hooks/` directory was confirmed to exist for the SSE-consuming hooks
  named in the test plan's hot-spot citation — this plan tests the route/server side only,
  which is where the actual SSE production logic lives regardless.

## Success Criteria (Summary)

- Every session-scoped route has a passing automated test for "no user" and "wrong user"
- The downstream repository reads are proven denied for a non-owner against real Postgres
  RLS, not a mock
- The SSE abort/finally lifecycle has a passing deterministic test
- `npm test` is a required, executed step in both CI jobs

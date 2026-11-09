---
project: "Panel Ekspertów"
version: 1
status: draft
created: 2026-11-09
source_prd_version: 2
source_roadmap_milestone: mvp-divergent-panel
---

# Test Plan — Panel Ekspertów

> Phased test-rollout strategy. Written by `/10x-test-plan`, driven one phase at a time through
> `/10x-new` → `/10x-research` → `/10x-plan` → `/10x-implement`. §3 is the load-bearing section —
> every re-run of `/10x-test-plan` reads its status column to resume. Do not hand-edit §3 status
> cells; let the orchestrator and downstream skills update them. §1/§2 only change via the
> post-research backport check or `--refresh`.

## 1. Strategy

Three principles govern every rollout phase in this plan:

1. **Cost × signal.** Every test this rollout adds — classic or AI-native — must answer one
   question: _what is the cheapest test that gives a real signal for this risk?_ Do not promote to
   e2e because it "feels safer"; do not layer a vision model on top of a deterministic diff that
   already catches the regression.

2. **User concerns are evidence.** Risks the team has lived through carry the same weight as PRD
   lines or hot-spot data.

3. **Risks are scenarios, not code locations.** This plan cites evidence (PRD lines, interview
   answers, roadmap status, hot-spot directories) for _why_ a risk matters. It never asserts a
   file as "where the failure lives" — that anchor is `/10x-research`'s output, produced fresh
   during each rollout phase, because the code changes between when this plan is written and when
   a phase actually runs.

## 2. Risk Map

Evidence citations below are PRD lines, roadmap rows, the lessons register, or the interview in
§5 — never `file:line` anchors. Impact/likelihood are coarse (High/Medium/Low); the goal is a
defensible order, not false precision.

| #   | Risk (failure scenario)                                                                                                                                                                                                                                                                         | Impact | Likelihood | Source(s) — evidence, not anchors                                                                                                                                                                                           |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | A session-scoped read or write (session, round, side-thread, opinion) is served to a user who doesn't own it — RLS regresses, or a handler checks "logged in" but not "owns this resource."                                                                                                     | High   | Medium     | PRD §Access Control guardrail ("izolacja per użytkownik"); `lessons.md` — "Enforce ownership with RLS AND an explicit service-side check" (already surfaced once as F5 in the `first-divergent-round` review); interview Q1 |
| 2   | Round-two attribution is schema-valid but meaningless — a score change ships with an author field that doesn't trace to a real round-one argument ("attribution theater").                                                                                                                      | High   | Medium     | PRD Open Question #2 (explicitly unresolved); roadmap S-02 Unknowns; FR-004                                                                                                                                                 |
| 3   | The entire API-route and streaming-hook layer (`src/pages/api/**`, `usePanelStream`/`useSideThreadStream`/`useSynthesisStream`) has zero automated coverage for auth, ownership, and SSE lifecycle — including the edge-runtime streaming-length limit tech-stack.md already flags as a gotcha. | High   | High       | Test-base profile (confirmed: 0 test files under `src/pages/**`, `src/components/**`, `src/hooks/**`); `tech-stack.md` edge-runtime streaming-limit note; interview Q3/Q4                                                   |
| 4   | A route path change silently stops routing (e.g. an underscore-prefixed segment, or any other Astro private-path convention) and nothing catches it before a user hits a 404.                                                                                                                   | Medium | Medium     | `lessons.md` — documented incident (underscore-prefixed `_debug` route silently excluded from routing, fixed in commit a0a44f2); interview Q2                                                                               |
| 5   | The product's Primary success criterion — round-one score spread across advisors > 2pts — regresses silently as advisor prompts/models change, with no gate measuring it before it reaches users.                                                                                               | High   | Medium     | PRD §Success Criteria Primary ("Niespełnienie tego progu oznacza, że produkt nie działa"); PRD NFR; roadmap S-01 Unknowns                                                                                                   |

### Risk Response Guidance

| Risk # | What would prove protection                                                                                                                                                                                                        | Must challenge                                                                                                             | Context needed                                                                                                                                                                                     | Likely cheapest layer                                                                                                                                               | Anti-pattern to avoid                                                                                                                                                                                                     |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1      | A request for a session/side-thread/opinion row owned by user A, made with user B's valid session, is rejected (403/404) — never returns A's data — even under normal RLS operation.                                               | "RLS policy is enough" — this exact gap was already found missing an explicit service-side check once in this codebase.    | Which endpoints under `src/pages/api/sessions/**` currently perform an explicit ownership check vs. relying on RLS alone; how ownership is loaded (session → round → side-thread → opinion chain). | Integration test against the repository/service layer with two seeded Supabase users — not a mocked DB.                                                             | Mocking the DB layer (defeats the purpose given the lessons.md incident); asserting against whatever the current (possibly incomplete) check does rather than an independent "must deny cross-user access" oracle.        |
| 2      | When round two reports a score change, the response's author-attribution field references a round-one argument that the LLM output actually produced for that advisor — not merely a non-empty string.                             | "The field is present and non-empty" ≠ "the field is correct" — a schema-valid placeholder author would pass a naive test. | Round-two prompt/response shape; how attribution is parsed from LLM output; whether parsing validates the cited author exists among round-one advisors.                                            | Contract/schema test + fixture-based referential-integrity checks (cited author must exist in round-one output) — not full live-LLM e2e for every case.             | Asserting only "field is present" (oracle problem — mirrors the parser's own success condition instead of an independent correctness check).                                                                              |
| 3      | Every session-scoped route rejects unauthenticated and non-owning requests; the SSE stream endpoint terminates and cleans up correctly rather than hanging past the edge-runtime limit.                                            | "It works in manual testing" ≠ "it fails closed on auth/ownership edge cases or edge-runtime timeout."                     | Current `middleware.ts` / `PROTECTED_ROUTES` behavior; SSE response lifecycle under the Cloudflare Workers runtime.                                                                                | Handler/route-level integration tests for auth + ownership; a narrower deterministic or documented-manual check for the SSE streaming-limit edge case specifically. | Reaching for full browser e2e (Playwright) for every route when a handler-level integration test gives equivalent signal cheaper.                                                                                         |
| 4      | A smoke-level check confirms every documented route in the app actually resolves (expected status, not 404) after a build — catching path-naming mistakes like the underscore-prefix incident.                                     | "The route exists in the source tree" ≠ "Astro actually serves it."                                                        | Full route inventory; existing coverage in `scripts/smoke.mjs`.                                                                                                                                    | Extend the existing smoke script — this is a path-naming-class problem, not a new test layer.                                                                       | Adding e2e/browser coverage for what is fundamentally a build-time routing-convention check.                                                                                                                              |
| 5      | A repeatable test, run against recorded advisor-response fixtures, computes round-one score spread and fails if parsing/aggregation regresses it below the 2pt threshold; a periodic (non-blocking) live sample tracks real drift. | "The panel produces 4 different numbers" ≠ "the spread is real, not a parsing/aggregation artifact."                       | How advisor scores are currently parsed and aggregated; whether a spread-computation utility already exists.                                                                                       | Deterministic unit/integration test against recorded fixtures (no live LLM call in CI); a separate, non-blocking periodic check for live-data drift.                | Writing the assertion as "spread > 2" against whatever the current fixture happens to produce (oracle problem) instead of independently chosen fixture values representing a known-divergent and a known-convergent case. |

**Abuse/security lens applied:** the product has authentication and per-user persisted data, so the
map above includes an authorization/IDOR scenario (Risk #1) covering both RLS regression and the
"logged in but not owner" class of bug — this is the mandatory abuse row; the two framings share
one response because they're the same failure mode tested the same way.

**Challenger findings:** none of the candidate risks were dropped as speculative. One candidate —
"visual-refactor UI gets disproportionate test investment" — was reframed out of the risk map
entirely and moved to §7 Negative Space, since it isn't a failure scenario to protect against, it's
budget guidance.

## 3. Phased Rollout

Status vocabulary (parser literals — do not rename): `not started` → `change opened` → `researched`
→ `planned` → `implementing` → `complete`. The orchestrator and downstream skills update Status and
Change-folder on this table as the rollout advances; the rest of each row is frozen until
`--refresh`.

| #   | Phase name                                          | Goal                                                                                                                                                                                                                                                      | Risks covered | Test types                                                                                                                          | Order rationale                                                                                                                          | Status       | Change folder                                     |
| --- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------- |
| 1   | Critical-path coverage: auth, ownership, API routes | Prove that every session-scoped route fails closed on auth and ownership, and that the SSE streaming lifecycle behaves on the edge runtime — close the largest, highest-confirmed gap first and stand up the integration-test harness later phases reuse. | #3, #1        | Integration tests against handlers/services with seeded two-user Supabase fixtures; documented check for SSE lifecycle/edge timeout | Highest impact × highest (confirmed) likelihood; unlocks the fixture/harness pattern Phase 2 and the ownership half of Phase 1 both need | implementing | `context/changes/testing-critical-path-coverage/` |
| 2   | Round-two attribution integrity                     | Prove that attribution in round two is substantive, not theater — a cited author must trace to a real round-one argument.                                                                                                                                 | #2            | Contract/schema test + fixture-based referential-integrity test                                                                     | Protects the product's Secondary success criterion credibility; depends on no infra beyond Phase 1's fixture pattern                     | complete     | `context/changes/testing-round-two-attribution/`  |
| 3   | Score-spread regression gate                        | Prove that the Primary success criterion (round-one score spread > 2pts) doesn't silently regress as advisor prompts/models evolve.                                                                                                                       | #5            | Fixture-based unit/integration test computing spread from recorded advisor responses; non-blocking periodic live-sample check       | Protects the Primary success criterion directly; cheapest once advisor-response fixtures exist from Phase 1/2                            | not started  | —                                                 |
| 4   | Routing & smoke-gate hardening                      | Prove that route-path regressions (the underscore-prefix class of bug) are caught by CI, not discovered manually.                                                                                                                                         | #4            | Extend `scripts/smoke.mjs` to assert every documented route resolves                                                                | Cheapest phase, lowest impact×likelihood; piggybacks on existing smoke infra, no new framework                                           | not started  | —                                                 |

## 4. Stack

- Test runner: Vitest (`vitest.config.ts`), scoped to `src/**/*.test.{ts,tsx}`.
- Test-base profile: **sparse** — 15 test files, all under `src/lib/**` (schemas, adapters,
  repositories, services, advisors). Zero tests under `src/pages/**`, `src/components/**`,
  `src/hooks/**`.
- Existing non-Vitest checks: `scripts/smoke.mjs` (auth-flow smoke against a running server),
  `scripts/advisor-smoke.mjs`, `scripts/rls-smoke.mjs`, `scripts/ui-scan.mjs` (hardcoded-value
  lint). CI (`.github/workflows/ci.yml`) runs lint + `lint:ui` + `astro check` + build + a smoke
  job against a local Supabase.
- Runtime: Astro 7 SSR on Cloudflare Workers (`@astrojs/cloudflare`) — edge runtime has a
  streaming-response-length constraint noted in `tech-stack.md` as the one gotcha to watch.
- **Stack grounding tools (current session):**
  - Docs: none available in current session — checked: 2026-11-09
  - Search: none available in current session — checked: 2026-11-09
  - Runtime/browser: Claude in Chrome (`mcp__claude-in-chrome__*`) available — possible future e2e
    signal for the SSE streaming lifecycle, not used for this plan since Risk #3's cheapest layer
    is handler-level integration, not browser e2e — checked: 2026-11-09
  - Provider/platform: none available as MCP in current session (GitHub CLI `gh` is available as a
    shell tool, not as an MCP, and isn't a quality-gate input here) — checked: 2026-11-09

## 5. User-Stated Concerns (Phase 2 interview)

The user deferred the interview ("nie wiem, wymyśl coś za mnie") and asked for evidence-grounded
answers on their behalf, confirmed per-question. Answers below are grounded in PRD/roadmap/lessons
evidence already cited in §2, not invented from nothing.

| #                              | Question                                        | Answer (proposed from project evidence, user-confirmed)                                                                                                                                             | Implied risk(s)         |
| ------------------------------ | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| 1                              | Worries most                                    | RLS/per-user isolation breaking — a user sees or reaches another user's session.                                                                                                                    | Risk #1                 |
| 2                              | Burned before                                   | The underscore-prefixed route silently 404ing (documented incident in `lessons.md`); separately, the RLS-only ownership gap flagged as F5 in a past review.                                         | Risk #4, Risk #1        |
| 3                              | Change without confidence                       | The API-route/streaming-hook layer (session CRUD, SSE endpoints) — zero test coverage, and it's the layer carrying the edge-runtime streaming-limit risk.                                           | Risk #3                 |
| 4 (rephrased — sparse profile) | Most worrying gap given the one-sided test base | Same as Q3 — the untested API/streaming layer is the gap, since `src/lib/**` already has a real suite.                                                                                              | Risk #3                 |
| 5                              | Do NOT spend budget on                          | The dev-only `/dev/kitchen-sink` page (404s in production) and pixel/snapshot testing for the S-08 UI visual refactor, which PRD explicitly scopes as "pure visual refactor, no functional change." | Negative-space note, §7 |

## 6. Cookbook

Filled in by each rollout phase as it ships. Placeholders name the future pattern by
behavior/failure mode, not by file.

- **Ownership/authorization tests** — in progress, Phase 1 (`testing-critical-path-coverage`) —
  unauthenticated-request coverage shipped for all 4 session-scoped routes (commit `59ec674`);
  the real-Supabase cross-user-denial tests are written but not yet verified against a live
  instance (local Supabase failed to start in-session) — see that change's `plan.md` Phase 2/3.
- **SSE/streaming lifecycle tests** — in progress, same change/phase as above — abort/finally
  test written, not yet verified against a live instance.
- **Attribution referential-integrity tests** — shipped, Phase 2 (`testing-round-two-attribution`,
  commit `4909439`). Pattern: extend the existing mocked-repository/mocked-provider test family
  around the service-layer invariant function (here, `resolveRoundTwo` in
  `session.service.test.ts`) with one fixture per referential-integrity branch — valid peer,
  self-attribution, non-participant-but-valid-id. Reuses existing fixtures; no new infra.
  **Flagged, product-blocked finding** (not a test-rollout defect): attribution _quote-content_
  fidelity (does the quoted text actually match the cited persona's round-one argument?) is
  implemented nowhere in the codebase — only persona-id referential integrity is enforced
  (`resolveRoundTwo`, `session.service.ts:79-124`). This is PRD Open Question #2 ("attribution
  theater"), explicitly unresolved, Owner: user. A deliberate tripwire test
  (`session.service.test.ts`, "TRIPWIRE —" test name) documents the current accepted behavior;
  if a future change enforces quote fidelity, that test must be updated deliberately.
- **Score-spread fixture tests** — TBD — see §3 Phase 3 for the recorded-fixture spread-gate
  pattern.
- **Route-resolution smoke check** — TBD — see §3 Phase 4 for the extended `scripts/smoke.mjs`
  pattern.

## 7. Negative Space

Deliberately out of scope for test budget, and why:

- `/dev/kitchen-sink` — dev-only, 404s in production; no production user ever reaches it.
- Pixel/snapshot testing for the S-08 UI visual refactor — PRD FR-012 explicitly scopes S-08 as "a
  pure visual refactor, no change to existing functionality"; roadmap's own risk note calls it
  "low functional risk." Snapshot tests here would mostly catch intentional visual changes, not
  regressions — a cheap manual/screenshot-gate check (already used by `/10x-ui`) gives better
  signal per dollar than a snapshot suite.
- Generated/scaffold code from `10x-astro-starter` that hasn't been touched — the generator is the
  test.

Refresh cadence: re-run `/10x-test-plan --refresh` when a new top-5 risk surfaces, a tool's
`checked:` date is > 3 months old, the tech stack changes, or this section no longer matches what
the team believes.

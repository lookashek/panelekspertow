<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Round Two — Attribution (S-02)

- **Plan**: context/changes/round-two-attribution/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4, 5, 6
- **Date**: 2026-09-29
- **Verdict**: APPROVED
- **Findings**: 0 critical, 4 warnings, 6 observations (first pass: 1 warning; deeper second pass: 3 more warnings + 6 observations)

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Evidence

- **Plan drift sub-agent**: all 14 planned file changes verified MATCH against actual content, including the subtle invariants (participant-list threading instead of full `ADVISOR_REGISTRY`, single-derivation `resolveRoundTwo` helper shared by emit and persist paths, mount-only `EventSource` deferral in `RoundTwoPanel`). No missing/extra items. `git diff --name-only 9f610df..1d526b4` shows exactly the 14 planned files + expected `*.test.ts` siblings + 3 expected process files (`plan.md`, `change.md`, `roadmap.md`). No scope creep.
- **Safety/pattern sub-agent**: no CRITICAL findings. No injection, hardcoded secrets, missing-auth, N+1, or resource-leak issues. `runSecondRound` confirmed to enforce ownership via RLS + explicit service-side check (lessons.md rule), matching `runFirstRound`'s shape. The attribution invariant is enforced in three independent layers (prompt instruction, `resolveRoundTwo`'s `namesRealPeer` check, DB `CHECK` constraints) — genuine defense-in-depth. Migration confirmed additive/forward-only. `fanOutPanel` genuinely shared between `runPanel`/`runSecondRoundPanel`, not duplicated. Frontend confirmed accessible (aria-live, no color-only signal, no `dark:` variants).
- **Success criteria (Step 3)**: re-ran the full automated gate stack after all phases landed — `npm run test` (140/140 passing), `npx astro check` (0 errors), `npm run lint` (0 errors, 1 pre-existing unrelated warning). All match the plan's per-phase Automated Verification commands. Manual verification items in the plan's `## Progress` section are correctly left `- [ ]` (unchecked, not rubber-stamped) — deferred to the user per this session's explicit instruction to skip manual testing.

## Findings

### F1 — Raw `Error` throw instead of an `AppError` subclass in `requireHead`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/advisors/run-panel.ts:191-197
- **Detail**: `requireHead` throws a bare `new Error(...)` when a persona id is missing from `priorHeads`. shared.md: "Never throw raw strings. Throw `Error` subclasses from `@/lib/errors`." In practice this path is unreachable — callers only invoke it with ids pre-filtered by `priorHeads.has(...)` — but if it ever did fire it would propagate as an unhandled synchronous exception out of `runSecondRoundPanel`, called directly (not try/caught) inside `session.service.ts`, bypassing the `Result<T,E>` boundary the rest of the service uses everywhere else.
- **Fix**: Throw an `AppError` subclass (e.g. reuse `LlmError` with `ErrorCode.LLM_PROVIDER_ERROR`, or a small internal invariant error) instead of the bare `Error`, matching the project's error-hierarchy convention.
- **Decision**: FIXED — replaced `new Error(...)` with `new LlmError(..., ErrorCode.LLM_PROVIDER_ERROR)` in both `requireHead` call sites' shared helper.

## Second pass (deeper adversarial review)

The first pass returned only 1 finding, so a second sub-agent was dispatched to look harder at edge
cases, test coverage gaps, and defensive-programming gaps across the same diff. It surfaced 3 more
WARNINGs and 6 OBSERVATIONs. The three WARNINGs were triaged and fixed (see below); the OBSERVATIONs
were reviewed and accepted as-is (documented reasoning, no action needed — see each item).

### F2 — Missing test: round-two replay with partial participant rows

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria / Test Coverage
- **Location**: src/lib/services/session.service.test.ts
- **Detail**: Round one has a "replay with a missing persona" test but round two's equivalent (some participants have a round-two row, others don't) was untested, even though `buildReplayEventsRoundTwo` has an explicit error-emitting branch for exactly this case.
- **Fix**: Added `"replay with partial round-two rows: a participant missing its round-two row surfaces an error, not a hang"` to `session.service.test.ts`, mirroring the round-one test.
- **Decision**: FIXED.

### F3 — `AdvisorCard.scoreDelta` had no defensive fallback for `previousScore === score`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (defensive programming) / Accessibility
- **Location**: src/components/advisor-panel/AdvisorCard.tsx
- **Detail**: The component's ▲/▼ glyph and screen-reader announcement relied entirely on a cross-file invariant enforced only in `session.service.ts`'s `resolveRoundTwo`. If that invariant were ever violated, the UI would render a wrong `▼` and announce `"(w dół)"` even when nothing changed — a misleading result specifically for screen-reader users.
- **Fix**: Added an explicit `previousScore === score` branch to `scoreDelta` and the matching sr-only text, rendering "no change" instead of a wrong direction.
- **Decision**: FIXED.

### F4 — `MIN_ROUND_TWO_PARTICIPANTS` duplicated with no shared source

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency / Maintainability
- **Location**: src/lib/services/session.service.ts, src/pages/sessions/[id].astro
- **Detail**: Both files hardcoded `= 2` independently for the round-two availability gate. They agreed today, but nothing enforced that — a future change to the threshold in one place would silently desync the SSR "show the trigger" check from the service's actual gate.
- **Fix**: Extracted `MIN_ROUND_TWO_PARTICIPANTS` as a single exported constant from `src/lib/advisors/registry.ts` (already imported server-side by both files) and updated both call sites to import it.
- **Decision**: FIXED.

### Accepted observations (no action needed)

- **Migration hardcodes persona ids in a CHECK constraint** duplicating `ADVISOR_REGISTRY`'s id set with no automated link — low risk now (adding a persona is already a multi-file change), accepted as-is.
- **`[id].astro`'s two `getOpinions` calls are sequential, not parallel** — correctly gated behind `roundTwoAvailable` so parallelizing unconditionally would trade a rare saved query for an always-paid one; accepted as-is.
- **`RoundTwoPanel` doesn't move focus into the panel on activation** — real but minor a11y polish item; accepted as a follow-up, not blocking this change.
- **Defense-in-depth confirmation**: the attribution invariant is enforced in three independent layers (prompt instruction, service-level `namesRealPeer` check, DB `CHECK` constraints) — confirmed correct, no gap found.
- **Migration additivity confirmed**: forward-only, no edits to the prior applied migration, no new RLS policies needed.
- **`fanOutPanel` reuse confirmed**: `runSecondRoundPanel` genuinely shares the controller/reader-cleanup/partial-failure machinery with `runPanel`, not duplicated.

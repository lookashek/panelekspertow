<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Round Two — Attribution (S-02)

- **Plan**: context/changes/round-two-attribution/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4, 5, 6
- **Date**: 2026-09-29
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 0 observations

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

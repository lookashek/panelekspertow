<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Session Synthesis Implementation Plan

- **Plan**: context/changes/session-synthesis/plan.md
- **Scope**: Full plan (Phases 1-5)
- **Reviewed phases**: 1, 2, 3, 4, 5
- **Date**: 2026-09-29
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS (after F1 fix) |

## Findings

### F1 — CRLF line endings + prettier formatting drift in Phase 1 files

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: src/lib/schemas/synthesis.ts, src/lib/prompts/synthesis.v1.ts, src/lib/prompts/synthesis-prompts.test.ts
- **Detail**: `src/lib/schemas/synthesis.ts` had picked up CRLF line endings (most likely from the Phase 1 deliberate-break-check's `git checkout -- <file>` restore interacting with this Windows repo's `core.autocrlf` setting — the review process's own gate discipline reintroduced this rather than the original implementation), and two other Phase 1 files (`synthesis.v1.ts:83`, `synthesis-prompts.test.ts:37`) had unrelated prettier line-wrapping issues. `npm run lint` failed with 35 errors when re-run fresh during this review, contradicting the Phase 1 gate's original "PASS" verdict (which was likely read from a background-task exit-code notification without re-verifying output content after the later checkout). This violates shared.md's "Run `npm run lint` before declaring a task done" and backend.md §8's done-checklist.
- **Fix**: Ran `npx eslint --fix` on the three files to normalize line endings and formatting; verified `npm run lint` now passes with 0 errors and the full test suite (181/181) still passes.
- **Decision**: FIXED (commit 7ef4bdd)

### F2 — `stream.tee()` dual-consumer pattern in the persist-tail

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — no action needed
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/session.service.ts (`runSynthesis`, `persistSynthesis`)
- **Detail**: `runSynthesis` uses `stream.tee()` to split the prose `ReadableStream` between the live SSE event generator and the persist-tail's narrative accumulator. Traced end-to-end: the underlying `run-synthesis.ts` stream's `start()` callback enqueues either a single error chunk (head failure) or the full drained rationale (head success) before either tee branch is read, so an abandoned branch (e.g. `persistStream` when `persistSynthesis` returns early on head failure) holds only a small already-buffered/closed queue — no backpressure stall, no unbounded growth, no deadlock. Both branches are fully drained on the success path.
- **Fix attempted and reverted**: Tried adding an explicit `await stream.cancel()` on the abandoned `persistStream` branch in the head-failure early-return, to deterministically release it instead of relying on GC. This **hung the "live: head failure" test indefinitely** (5s timeout) — cancelling one tee branch while the other is also unread interacts with the Web Streams tee algorithm in a way that doesn't resolve cleanly here. Reverted; confirmed all 18 service tests pass again with the revert. This is concrete evidence that the original "no action needed" call was correct — the seemingly-safe hardening was actually a regression.
- **Decision**: ACCEPTED (verified correct; a proposed fix was attempted, found to break the test suite, and reverted)

### F3 — Ownership-check ordering in `runSynthesis`

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — no action needed
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/session.service.ts:450-458
- **Detail**: `runSynthesis` performs the explicit ownership check (`session?.userId !== userId` → `NotFoundError`) immediately after loading the session and before any other repository access, exactly matching `runFirstRound`/`runSecondRound` and the lessons.md rule requiring RLS + explicit service-side ownership checks. The new `session_syntheses` migration mirrors the established RLS policy shape exactly (per-op, per-role, no `anon` policies, cascading FKs).
- **Verification performed**: re-ran the targeted test `SessionService.runSynthesis > returns NotFoundError when the session belongs to another user` in isolation (passes). This invariant was also exercised as a deliberate-break-check during Phase 4's implementation: the ownership check was temporarily removed, the test went red (`TypeError: Cannot read properties of undefined (reading 'ok')` — it fell through and crashed instead of returning `NotFoundError`), then restored — proving the test is load-bearing, not just present.
- **Fix**: None required — the check is correct and provably enforced by an existing, break-tested assertion.
- **Decision**: ACCEPTED (verified correct via targeted re-run + citing the Phase 4 break-check evidence; no code change needed)

## Automated verification (full plan)

- `npm run lint` — PASS (after F1 fix; 0 errors, 1 pre-existing unrelated warning in `DecisionForm.tsx`)
- `npm run build` — PASS
- `npm test` (vitest) — PASS (181/181 across 13 test files)
- `npm run smoke` — not run (requires a running dev server + local Supabase; out of scope for this headless review, left for manual verification per plan Progress item 4.4)

## Manual verification status (from plan.md Progress)

Unchecked, pending user action (consistent with this implementation run's "skip manual tests, do them after" directive):
- 1.5 — Read `buildSynthesisPrompt` output for consensus-smoothing prohibition + Polish
- 2.5 — Apply migration locally, confirm RLS blocks cross-user reads
- 4.4 — `npm run smoke` against a running server
- 4.5, 4.6 — `curl -N` the endpoint, confirm DB state after first call
- 5.4-5.8 — Frontend manual pass (trigger, replay, a11y, responsive, error path)

No manual items were marked complete without evidence (none were rubber-stamped).

## Plan drift summary

All 13 planned file changes across 5 phases verified MATCH against their plan contracts (schema shape, migration/RLS shape, repository methods, orchestration contract, service method behavior, SSE endpoint shape, frontend hook/panel behavior, SSR wiring). No scope creep — no files changed outside the plan's file list. All "What We're NOT Doing" boundaries respected (no regeneration UI, no post-completion rounds, no fabricated dispute fallback, no per-persona fan-out, no new env var, no rate-limiting, `stream.ts` untouched). All three "Critical Implementation Details" call-outs (latest-per-persona merge order, persist-tail save-before-complete ordering, schema-only dispute-axis guardrail) verified correctly implemented.

<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Session quality polish (S-07 / FR-011)

- **Plan**: context/changes/session-quality-polish/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-10-09
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Summary

Reviewed all 4 phases (commits f4208c4, 4e70e2d, 6beb31d, 1a24cf4, closed out by 1f277e5) against `plan.md`. Diff scope (`git diff f4208c4^..1f277e5`) matches the plan's file list exactly, plus the plan/roadmap bookkeeping files. Two parallel sub-agent passes (plan-drift detection, safety/quality + pattern compliance) both came back clean — no CRITICAL or WARNING findings. Automated success criteria verified directly:

- `npm test` — 234/234 passed (includes `deriveSessionStep` transitions, adapter `max_tokens` present/absent, prompt-clause pinning with negative assertions against `/rozbuduj|pełniejsze/`).
- `npm run lint` on the changed files — clean (the full-repo `npm run lint` run surfaces ~520 pre-existing CRLF/prettier errors in unrelated files, outside this diff's scope).
- `npx astro check` — 0 errors, 0 warnings, 0 hints.
- `npm run build` — succeeded.
- `grep` for `NOWA DECYZJA` / `URUCHOM RUNDĘ 2` / `ZAKOŃCZ SESJĘ` in `RoundTwoPanel.tsx` / `SynthesisPanel.tsx` — 0 hits, confirming Phase 2's button-migration criterion.

Plan-drift agent: every planned contract (`deriveSessionStep`'s `SessionStep` union, `SessionFlow` props, `StepActionBar` props/action-mapping, `RoundSummary` fold behavior, `AdvisorCard` argument toggle, `StreamRequest.maxTokens` scoped to `stream()` only, `brevity.ts` clauses, the S-06 coordination note) matches the implementation. All "What We're NOT Doing" guardrails held: no `nanostores`, no `.max()` on `arguments`, no `max_tokens` on `complete()`, no sticky bar, no shadcn `Button`, no `.v2.ts` renames, no S-06 implementation.

Safety/pattern agent: the change's central risk area — EventSource error handling (`readyState === CLOSED` vs `CONNECTING`) — is correctly disambiguated with proper listener/connection cleanup in every effect teardown; `max_tokens` is wired only into the prose `stream()` call site, never into the JSON-parsed `complete()` calls, so there is no truncation risk to structured output. No security, performance, reliability, or data-safety defects found.

## Findings

### F1 — Redundant `cn()` wrapping of static strings

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/advisor-panel/StepActionBar.tsx
- **Detail**: `cn(PRIMARY_CLASS)` / `cn(SECONDARY_CLASS)` wrap single static class-string constants with no merging need — a no-op call. Harmless, not a plan or safety issue.
- **Fix**: Use the class constants directly (`className={PRIMARY_CLASS}`) instead of wrapping them in `cn()`.
- **Decision**: FIXED

### F2 — Side-thread API authorization not re-verified for this diff

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/advisor-panel/AdvisorPanel.tsx (sideThreadEnabled derivation)
- **Detail**: `sideThreadEligible` (SSR-computed allowlist) was replaced by a live client-side flag (`state[persona.id].score !== undefined`) per the plan. This flag only gates a UI affordance (showing the DOPYTAJ button) — it is not itself an authorization boundary. No `api/` side-thread files are in this diff, so server-side ownership enforcement is presumed unchanged, but wasn't directly re-confirmed in this review's file set.
- **Fix**: Quick confirmation (not a code change) that the side-thread POST endpoint still independently checks session/persona ownership server-side, so the UI gate is defense-in-depth only, not the actual boundary.
- **Decision**: NO_CHANGE_NEEDED — confirmed `session.service.ts:612` (`askSideThread`) enforces `session.userId !== userId` server-side, unchanged by this diff and independent of the client-side `sideThreadEnabled` affordance flag.

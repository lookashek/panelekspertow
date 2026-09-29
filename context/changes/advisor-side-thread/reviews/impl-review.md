<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Advisor Side Thread (FR-007)

- **Plan**: context/changes/advisor-side-thread/plan.md
- **Scope**: Full plan (all 6 phases)
- **Reviewed phases**: 1, 2, 3, 4, 5, 6
- **Date**: 2026-09-29
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Side-thread stream can get stuck in "streaming" state on a silent connection drop

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/advisor-panel/useSideThreadStream.ts:121-142
- **Detail**: The `for (;;)` read loop only leaves the `"streaming"` status when it sees an explicit `event: done` or `event: error` SSE frame, or when the `fetch`/reader throws (caught below). If the underlying connection closes without either — a dropped TCP connection, a Cloudflare Worker eviction, or the server closing the stream before writing a final frame — `reader.read()` resolves `{ done: true }` and the loop simply `break`s. The async IIFE then returns normally, leaving `status` on `"streaming"` forever: the "Doradca odpowiada…" indicator never clears and the composer (textarea + send button) stays disabled with no way to retry short of a page reload. The existing `usePanelStream` hook doesn't have this gap because `EventSource` has browser-level auto-reconnect; this hand-rolled `fetch`+reader loop has no equivalent fallback.
- **Fix**: After the `for (;;)` loop exits (i.e. execution reaches the line after the loop without having returned via the `catch` block), check if `status` is still `"streaming"` and if so transition to `setStatus("error")` with a message like "Połączenie z doradcą zostało przerwane." — mirroring the message already used in the `catch` block's abort-vs-error branch.
  - Strength: One small addition after the loop; doesn't touch the parsing or happy-path logic; matches the existing catch-path error message style exactly.
  - Tradeoff: None meaningful — this only changes behavior in the previously-unhandled "silently closed without a terminal frame" case.
  - Confidence: HIGH — the control-flow gap is unambiguous by reading the loop; the fix is a direct, narrow patch.
  - Blind spot: Haven't reproduced an actual mid-stream Worker eviction in a live environment — this is a code-reading finding, not one confirmed by a repro test.
- **Decision**: PENDING

### F2 — Composer doesn't stay disabled once the per-thread message cap is hit

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/components/advisor-panel/SideThread.tsx:23
- **Detail**: The plan's Phase 6 contract for `SideThread.tsx` says: "Disable the input while `streaming` **and once the per-thread cap is hit**." The actual code only computes `disabled = status === "streaming"`. When the per-thread cap (or the per-user rate limit — both surface as `RateLimitError`/code `RATE_LIMITED` from the service) is hit, the hook sets `status: "error"` with a friendly message, but `"error"` is not in the disabled condition, so the textarea and send button re-enable immediately and the user can keep retrying — each retry just re-hits the same 429 and re-shows the same message. Not a data-safety issue (the server-side cap still holds; the client can't bypass it), but it's a UX deviation from what the plan explicitly asked for.
- **Fix**: Have `useSideThreadStream` surface the SSE/HTTP error's `code` (already parsed in `ErrorFrameData`/the non-2xx JSON body) as part of the hook's returned state (e.g. `errorCode?: string`), and in `SideThread.tsx` compute `disabled = status === "streaming" || errorCode === "RATE_LIMITED"` so the composer stays locked once either guardrail trips, until the user reloads or a new session state changes things.
  - Strength: Reuses data the hook already has (the frame's `code` field is already parsed and discarded); no new server call or state machine needed.
  - Tradeoff: Slightly widens the hook's public return shape; minor, additive change.
  - Confidence: HIGH — the fix is mechanical and the existing test suite covers the service-side enforcement, so this is purely a client-side presentation fix with no risk to the actual guardrail.
  - Blind spot: None significant.
- **Decision**: PENDING

### F3 — Side-thread count queries rely on RLS alone, no explicit `user_id` filter

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/repositories/session.repository.ts:321-348 (`countSideThreadUserMessages`, `countRecentSideThreadMessagesByUser`)
- **Detail**: Neither new count method filters explicitly by `user_id` — both rely entirely on RLS to scope rows to the caller. `backend.md` §7 and `context/foundation/lessons.md` ("Enforce ownership with RLS AND an explicit service-side check") call for defense-in-depth. That said, this exactly matches the existing convention already used by `getOpinions` and other pre-existing queries in this same file — it is not a new deviation introduced by this change, and the service layer's `askSideThread` does perform an explicit session-ownership check before ever reaching these counters. Recorded as an observation, not a blocking finding, since fixing it here alone would be inconsistent with the rest of the file.
- **Fix**: No action required for this change. If the team decides to tighten this project-wide, it should be a separate pass across the whole repository file, not a one-off patch to just the two new methods.
- **Decision**: PENDING

## Notes on findings investigated and not included

- Review Agent 1 initially reported a template-literal typo (`Decyzja\problem` instead of `Decyzja/problem`) in three of the four persona prompt files. This was checked directly with byte-level inspection (`sed`/`cat -A`) and disproven — all four files correctly use a forward slash. Not included as a finding.

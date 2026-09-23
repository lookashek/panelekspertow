<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Adapter LLM (OpenRouter) + rejestr predefiniowanych doradców

- **Plan**: context/changes/advisor-llm-adapter/plan.md
- **Scope**: Full plan (all 4 phases)
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-09-23
- **Verdict**: REJECTED
- **Findings**: 1 critical, 3 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | FAIL |
| Scope Discipline | PASS |
| Safety & Quality | FAIL |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — Unauthenticated, unrated debug route is live on the production Worker

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/debug/advisor-stream.ts (whole file)
- **Detail**: `output: "server"` means every route ships to the deployed Cloudflare Worker — there is no `prerender`/dev-only gate. This route has no auth check, no rate limit, no idempotency (by its own header comment), yet each POST fans out to 4 personas × up to 2 OpenRouter `complete()` calls plus 4 streamed completions. That's an anonymous, internet-reachable amplifier for paid API spend, directly contradicting `.claude/rules/backend.md` §7 ("Rate limit LLM-triggering endpoints per user — cost guardrail"). Confirmed: `wrangler.jsonc` has no route exclusion for `debug/`, and `src/middleware.ts`'s `PROTECTED_ROUTES` only covers `/dashboard`.
- **Fix A ⭐ Recommended**: Gate the route behind `import.meta.env.DEV` (return 404 in production) so it never ships live, matching the plan's own framing of this as a throwaway local-proof route removed before S-01.
  - Strength: Zero cost exposure, minimal code, consistent with the route's stated purpose (measure streaming locally, not serve traffic).
  - Tradeoff: Can't be exercised against a deployed preview if that's ever needed for manual QA.
  - Confidence: HIGH — this is exactly what `import.meta.env.DEV` is for in Astro, and the plan already frames this as local-only ("clearly-marked throwaway route").
  - Blind spot: Haven't checked whether QA workflow expects to hit this route on a deployed preview URL.
- **Fix B**: Add minimal auth (require `ctx.locals.user`) + a per-IP/per-user rate limit before merge.
  - Strength: Route stays testable against any deployed environment.
  - Tradeoff: More code for a route explicitly planned to be deleted at S-01 — likely wasted effort.
  - Confidence: MEDIUM — depends on whether the team actually needs deployed access to this route.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix A) — POST handler now returns 404 when `!import.meta.env.DEV`; header comment updated.

### F2 — `runPanel` does not cancel sibling personas on a single persona's failure

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence
- **Location**: src/lib/advisors/run-panel.ts:43-65 (`createSharedController`)
- **Detail**: The plan's "Critical Implementation Details" section states: "In `runPanel`, one persona's failure or the caller aborting must cancel the siblings — do not let orphaned OpenRouter requests run on after the client disconnects." The implementation deliberately does the opposite — the code comment reads "without letting one persona's own failure abort its siblings (partial results are useful — see plan Phase 4)." Only caller-abort cancels the shared controller; a single persona's own failure does not. This is a genuine, undocumented deviation from an explicit load-bearing contract in the plan, not a bug — but it wasn't fed back into plan.md.
- **Fix A ⭐ Recommended**: Update `plan.md`'s Critical Implementation Details to document the deviation and its rationale (partial results outrank strict fail-fast cancellation at foundation stage), keeping current behavior.
  - Strength: Preserves the (reasonable) partial-results behavior the code already has; the plan becomes accurate again for anyone reading it as source of truth.
  - Tradeoff: Orphaned OpenRouter calls for a failed persona's siblings can still run to completion after one persona errors, which is exactly what the plan's line was trying to prevent (cost).
  - Confidence: MEDIUM — reasonable given this is pre-cost-guardrail foundation work, but the plan explicitly called this out as a must, not a nice-to-have.
  - Blind spot: Haven't measured how often a single persona's `complete()` fails in practice (retry-once already covers transient JSON issues).
- **Fix B**: Implement failure-triggered cancellation to match the plan literally — the first `!result.ok` in the `Promise.all` loop calls `controller.abort()` before returning.
  - Strength: Matches the explicit spec, closes the "orphaned paid API calls" gap the plan was guarding against.
  - Tradeoff: Loses partial results — a report that could still show 3 good persona opinions instead now short-circuits on the first failure.
  - Confidence: HIGH — straightforward one-line change (`controller.abort()` in the failure branch).
  - Blind spot: Whether S-01's UI wants partial panels or an all-or-nothing round.
- **Decision**: FIXED (Fix A) — plan.md's Critical Implementation Details now documents this as an accepted, dated deviation.

### F3 — Debug route path drift not reflected in plan.md prose

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/advisor-llm-adapter/plan.md (lines 26, 28, 35, 218, 232, 236, 255, 278)
- **Detail**: Plan specifies `src/pages/api/_debug/advisor-stream.ts` and calls out the `_debug` prefix as the non-production marker. The actual route is at `src/pages/api/debug/advisor-stream.ts` (no underscore) — commit `a0a44f2` explains why: Astro treats underscore-prefixed path segments as private folders excluded from routing, so `_debug/` compiled but 404'd. This was a legitimate, necessary fix, but only the Progress checklist got a commit-sha annotation — the plan's prose (Overview, "How to verify", "What We're NOT Doing", Phase 4 contract, testing steps) still reads `_debug` throughout.
- **Fix**: Update every `_debug` reference in plan.md to `debug`, with a one-line addendum note on why (Astro's private-folder convention) so a future reader isn't misled.
- **Decision**: FIXED + ACCEPTED-AS-RULE: "Astro underscore-prefixed route paths are private and won't route" — lesson recorded in context/foundation/lessons.md; all 8 `_debug` references in plan.md updated to `debug` with an addendum note.

### F4 — Per-call logging omits `session_id` per backend.md §5

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/adapters/openrouter.adapter.ts:86-166, 224-269
- **Detail**: `.claude/rules/backend.md` §5 mandates logging "provider, model, persona, prompt version, token counts, latency, `session_id`" per call. No session concept exists yet in this foundation slice, so `session_id` can't be populated — this is expected at this stage, not a defect, but worth tracking so it isn't forgotten once S-01 introduces sessions.
- **Fix**: Accept as deferred debt; add a code comment noting `session_id` will thread through once S-01 wires session context, or track it as a follow-up.
- **Decision**: SKIPPED

### F5 — Stream readers/writers not released on non-abort teardown

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/advisors/run-panel.ts:115-120; src/lib/adapters/openrouter.adapter.ts:208-247
- **Detail**: The manual `reader.read()` loops never call `reader.releaseLock()`, and the outer `ReadableStream` in `run-panel.ts` has no `cancel()` handler. Today the only consumer (the debug route) wires `request.signal` explicitly, so this is currently covered — but `runPanel` is a reusable primitive S-01 will call directly, and a caller that doesn't thread a signal, or a Worker that doesn't propagate `request.signal` reliably under load, can leave the upstream OpenRouter reader open.
- **Fix A ⭐ Recommended**: Add a `cancel(reason)` handler on both `ReadableStream`s that aborts the shared controller, and wrap the reader loops in `try/finally { reader.releaseLock(); }`.
  - Strength: Makes `runPanel` safe as a standalone primitive regardless of caller discipline — cheap defensive addition before S-01 reuses it.
  - Tradeoff: A few extra lines in a hot path; no behavior change for the current single consumer.
  - Confidence: MEDIUM — standard `ReadableStream` hygiene, but no observed failure yet since the only caller already threads a signal.
  - Blind spot: Haven't stress-tested actual leak behavior on Cloudflare workerd under real disconnects.
- **Fix B**: Leave as-is and note it as a known gap to revisit when S-01 becomes the second consumer of `runPanel`.
  - Strength: No code change now, on a code path that currently has exactly one, already-correct caller.
  - Tradeoff: Risk compounds silently if S-01 reuses `runPanel` without matching signal discipline.
  - Confidence: LOW — depends entirely on how careful S-01's implementation is.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix A) — added `cancel(reason)` handlers to both `ReadableStream`s (openrouter.adapter.ts `stream()` and run-panel.ts's outer stream, which now tracks `activeReaders` and aborts the shared controller on cancel); reader loops wrapped in `try/finally { reader.releaseLock(); }`. Verified: 59/59 tests, lint, build all pass.

### F6 — Malformed SSE chunk silently swallowed

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/adapters/openrouter.adapter.ts:236-245
- **Detail**: A `JSON.parse` failure on a stream chunk is caught and skipped with only a code comment, no `logger.warn`. Minor, but could hide real upstream format drift from OpenRouter silently.
- **Fix**: Add `logger.warn` with a truncated/length-only field (never the raw payload) when a stream chunk fails to parse.
- **Decision**: FIXED — resolved as a side effect of the F5 edit; the catch block now calls `logger.warn` with a `payloadLength` field.
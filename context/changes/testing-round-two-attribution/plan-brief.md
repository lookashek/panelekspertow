# Round-two attribution integrity — Plan Brief

> Full plan: `context/changes/testing-round-two-attribution/plan.md`
> Research: `context/changes/testing-round-two-attribution/research.md`

## What & Why

Rollout Phase 2 of `context/foundation/test-plan.md`: close the test-coverage gap on Risk #2
("attribution theater" — round-two attribution can be schema-valid but meaningless). Research
found the risk is narrower than it first looked: persona-id referential integrity is already
implemented and tested; the real gap is one untested edge case plus a genuinely unenforced
quote-content check tied to an explicit, unresolved PRD open question.

## Starting Point

`resolveRoundTwo` (`src/lib/services/session.service.ts:79-124`) already rejects a round-two
score change with no attribution or with self-attribution — and this is already tested
(`session.service.test.ts:573-675`). Not tested: citing a real, valid persona id who simply
didn't participate in this session's round one. Not implemented or tested anywhere: checking that
`attributionQuote` actually matches the cited persona's real round-one argument — this is exactly
PRD Open Question #2 ("attribution theater"), explicitly unresolved and owned by the user.

## Desired End State

Two new fixture-based unit tests in the existing test file close the referential-integrity gap and
make the quote-fidelity gap explicit and intentional rather than silently unnoticed. No production
code changes. `test-plan.md` reflects Phase 2 as complete with the quote-fidelity gap recorded for
a later, product-scoped decision.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
|---|---|---|---|
| Re-test already-covered cases? | No | Self-attribution, no-attribution, valid-peer, and unchanged-score are already tested and passing | Research |
| Add a runtime quote-fidelity check? | No | Enforcing it is a product decision gated on PRD Open Question #2 (Owner: user) — out of scope for a test-only rollout | Research / Plan |
| How to handle the quote-fidelity gap | A "tripwire" test documenting current (unenforced) behavior, not a new safeguard | Avoids inventing a safeguard just to make a risk testable — the test-plan's own anti-pattern | Plan |
| Where the new tests live | Extend `session.service.test.ts`'s existing `resolveRoundTwo` test family | Reuses existing fixture helpers; no new test infra | Research / Plan |
| Test layer | Pure fixture-based unit tests | No live DB, no live LLM needed — the invariant lives entirely in `resolveRoundTwo`'s pure logic | Plan (per rollout's unit-tests-only scope) |

## Scope

**In scope:**
- A test proving a real-but-non-participating persona id is rejected the same way self-attribution is
- A tripwire test documenting that `attributionQuote` content is currently unverified
- `test-plan.md` §3/§6 bookkeeping update

**Out of scope:**
- Any new runtime validation of quote content
- Re-testing already-passing cases
- Any schema (`.refine()`) change
- Live DB/LLM/e2e of any kind

## Architecture / Approach

Two `it()` blocks added to the existing `describe` suite around `resolveRoundTwo`, using the same
mocked-repository/mocked-provider harness already in the file. A third phase is pure
documentation (updating `test-plan.md`).

## Phases at a Glance

| Phase | What it delivers | Key risk |
|---|---|---|
| 1. Non-participant-id test | Closes the one untested referential-integrity branch | Low — mirrors an existing, working test shape |
| 2. Quote-fidelity tripwire | Makes the real product gap explicit and intentional | Low — documentation-as-test; must stay a tripwire, not accidentally assert "should reject" |
| 3. Close out | `test-plan.md` reflects Phase 2 complete | Low — mechanical |

**Prerequisites:** none beyond what's already in the repo.
**Estimated effort:** ~30–45 minutes, one session, no infra setup.

## Open Risks & Assumptions

- The quote-fidelity gap is a real product-scope question (PRD OQ#2) that this phase deliberately
  does not resolve — a future change may need to revisit the tripwire test once that's decided.

## Success Criteria (Summary)

- A non-participating persona id is rejected by the same mechanism as self-attribution, and this
  is now proven by a test.
- The quote-fidelity gap is documented as a deliberate, named tripwire rather than silently
  unnoticed.
- `npm test`, `npm run lint`, and `npm run build` all stay green.

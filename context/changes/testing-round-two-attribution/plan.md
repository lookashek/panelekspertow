# Round-two attribution integrity — Implementation Plan

## Overview

Rollout Phase 2 of `context/foundation/test-plan.md`. Closes the test-coverage gap on Risk #2
(round-two attribution integrity) without adding new production code. Pure fixture-based Vitest
unit tests — no live DB, no live LLM, no browser e2e.

## Current State Analysis

- `resolveRoundTwo` (`src/lib/services/session.service.ts:79-124`) already enforces persona-id
  referential integrity when a round-two score changes: `attribution` must be non-null, must not
  name the advisor itself, and must name a persona id present in `priorHeads` (a real round-one
  participant). Any violation fails the turn with `LlmError(..., ErrorCode.LLM_INVALID_OUTPUT)`.
- `src/lib/services/session.service.test.ts:573-675` already tests this for: valid-peer
  attribution kept, unchanged-score attribution dropped, no-attribution-on-changed-score fails,
  **self-attribution fails**. These are real passing tests — not touched by this plan.
- Not tested anywhere: citing a persona id that is one of the 4 valid enum values but did **not**
  produce a round-one opinion in this session (distinct from self-attribution — e.g. a persona
  excluded by falling below `MIN_ROUND_TWO_PARTICIPANTS = 2`, or simply not part of this
  particular `priorHeads` map). `priorHeads.has(...)` should reject this the same way it rejects
  self-attribution, but no fixture exercises it (`research.md`).
- Not implemented or tested anywhere: `attributionQuote`/`quotedPeerArgument` content fidelity.
  `session.service.ts:122` passes the LLM's quote straight through with no check against the
  cited persona's actual round-one `arguments` array. Neither `AdvisorAttributionSchema`
  (`src/lib/schemas/advisor.ts:29-34`) nor `AdvisorOpinionRowSchema`
  (`src/lib/schemas/session.ts:28-41`) has a cross-field `.refine()`. This is exactly PRD Open
  Question #2 ("attribution theater") — explicitly unresolved, **Owner: user**
  (`context/foundation/prd.md:157`).

### Key Discoveries:

- `ADVISOR_REGISTRY` order (`src/lib/advisors/registry.ts:110-155`): `optymista` (0), `sceptyk`
  (1), `pragmatyk` (2), `analityk` (3) — the existing test file indexes personas this way
  throughout; this plan's new fixtures follow the same convention.
- Existing fixture helpers to reuse, no new ones needed: `makeOpinionRecord(personaId, overrides)`,
  `makeRepository(overrides)`, `makeGetOpinionsByRound(byRound)`, `makeRoundTwoProvider(overrides)`,
  `makeLogger()` — all already defined in `session.service.test.ts`.
- `MIN_ROUND_TWO_PARTICIPANTS = 2` (`src/lib/advisors/registry.ts:53`) — round two can legitimately
  run with fewer than all 4 personas, which is exactly the shape of the non-participant-id fixture
  (round one produces opinions for only 2 of the 4 registry personas).

## Desired End State

`session.service.test.ts` has fixture coverage for the one referential-integrity case that was
previously untested (non-participant but valid-enum persona id), and a new test explicitly
documents — as a deliberate tripwire, not a defect — that quote-content fidelity is currently
unenforced, citing PRD Open Question #2. `context/foundation/test-plan.md` reflects Phase 2 as
complete, with the quote-fidelity gap recorded for a future product-scoped change.

**Verification**: `npm test` passes; the new tests fail red when the underlying behavior they
protect is deliberately broken (per the implementation's deliberate-break-check discipline), then
pass again once restored.

## What We're NOT Doing

- Not adding a runtime quote-fidelity check to `resolveRoundTwo` or anywhere else — enforcing it
  is a product decision gated on PRD Open Question #2 (Owner: user), out of scope for a test-only
  rollout phase.
- Not re-testing the already-covered cases (valid-peer kept, self-attribution fails, unchanged
  dropped, no-attribution fails) — they pass today and this phase adds no redundant coverage.
- Not touching `AdvisorAttributionSchema`/`AdvisorOpinionRowSchema` — the gap is a missing
  cross-field check, not a shape problem; shape validation is already correct and tested.
- Not writing any live-LLM or live-Supabase test — everything here is a fixture-based unit test
  against `resolveRoundTwo` through `SessionService.runSecondRound`, same harness as the existing
  tests in this file.

## Implementation Approach

Two new `it()` blocks added to the existing `describe` suite around `resolveRoundTwo` in
`session.service.test.ts`, following the exact fixture pattern of the existing test at `:573-675`
(mocked `SessionRepository`, mocked `LlmProvider`, real `SessionService`). A third, final phase
updates `context/foundation/test-plan.md`'s bookkeeping — no further test code.

## Phase 1: Non-participant persona-id referential-integrity test

### Overview

Prove `resolveRoundTwo` rejects a round-two score change that attributes to a syntactically-valid
persona id who did not actually produce a round-one opinion in this session — the one
referential-integrity case `research.md` found untested.

### Changes Required:

#### 1. New test case in the existing `resolveRoundTwo` test family

**File**: `src/lib/services/session.service.test.ts`

**Intent**: Add one new `it()` (or one new fixture branch alongside `:573-675`'s existing
multi-persona test, implementer's choice) where round one produces opinions for only 2 of the 4
`ADVISOR_REGISTRY` personas (e.g. `optymista` and `sceptyk`), and round two has one of those two
change its score while attributing to `pragmatyk` — a real, valid enum persona id, but one with no
round-one opinion in this session's `priorHeads`. Assert the turn fails with
`ErrorCode.LLM_INVALID_OUTPUT`, exactly like the existing self-attribution case, and that nothing
is persisted for that persona.

**Contract**: Reuses `makeRepository({ getOpinions: makeGetOpinionsByRound({ 1: <two-persona
array>, 2: [] }) })` and `makeRoundTwoProvider({ complete: ... })` exactly as the existing test
does; asserts via `service.runSecondRound(...)` → collected events → `error` event with
`code: ErrorCode.LLM_INVALID_OUTPUT` for the attributing persona, and that `mock.saveOpinions` was
not called for it.

**Behavior asserted**: `resolveRoundTwo`'s `priorHeads.has(attribution.convincedByPersonaId)`
check rejects a real-but-non-participating persona id, not just self-attribution.

**Regression this catches**: a future change that loosens the `priorHeads` membership check (e.g.
accidentally checking against `ADVISOR_REGISTRY` instead of `priorHeads`) would let an advisor
"cite" a persona who never actually spoke in round one — silently reintroducing a referential-
integrity hole next to the one `:573-675` already guards.

**Research source**: `research.md` "Untested but implemented" finding;
`session.service.ts:79-124`.

**Edge case covered**: non-participant ≠ self — this is the one `priorHeads.has(...)` branch the
existing test suite never exercises.

**Anti-pattern avoided**: not asserting against whatever the code currently happens to do —
the oracle here is the documented invariant ("must be a real round-one participant"), independent
of this specific code path, and the deliberate-break check (production code change: temporarily
making `priorHeads.has(...)` always return `true`) must turn this new assertion red before it's
accepted.

### Success Criteria:

#### Automated Verification:

- `npm test -- src/lib/services/session.service.test.ts` passes, including the new case
- `npm run lint` passes on the changed file

#### Manual Verification:

- None — fully deterministic, no DB/LLM dependency.

---

## Phase 2: Quote-fidelity tripwire test

### Overview

Document, via an explicit test, that `attributionQuote` content is currently never checked
against the cited persona's real round-one arguments — a deliberate tripwire tied to PRD Open
Question #2, not a defect this rollout phase fixes.

### Changes Required:

#### 1. New tripwire test in the same file

**File**: `src/lib/services/session.service.test.ts`

**Intent**: Add one new `it()` where round one gives a real persona (e.g. `sceptyk`) a concrete,
checkable round-one argument (e.g. `arguments: ["Rynek może się pogorszyć w ciągu kwartału"]`),
and round two has a different persona change its score while attributing to `sceptyk` with a
`quotedPeerArgument` that does **not** match anything in `sceptyk`'s round-one `arguments` (e.g.
`"Coś, czego Sceptyk nigdy nie powiedział"`). Assert — as *current, accepted* behavior — that the
turn **succeeds** and the fabricated quote is persisted unchanged via `saveOpinions`. The test's
own doc comment must state this is a deliberate tripwire citing PRD Open Question #2
(`context/foundation/prd.md:157`): if a future change adds quote-fidelity enforcement, this test
must be deliberately updated to assert the new (rejecting) behavior, not left to fail by accident.

**Contract**: Same fixture shapes as Phase 1 — `makeOpinionRecord` for the round-one row with a
specific `arguments` string, `makeRoundTwoProvider` returning the fabricated-quote attribution,
assert `scoreEvent.attributionQuote` equals the fabricated string and `mock.saveOpinions` was
called with that exact string, not rejected.

**Behavior asserted**: today, `resolveRoundTwo` performs zero content check between
`attributionQuote` and the cited persona's actual round-one text — the test's assertion is "this
still passes through unchanged," which is the honest current contract.

**Regression this catches**: inverted from every other test in this file — this one is a
tripwire, not a safety net. Its "regression" is a *silent* future change to `resolveRoundTwo`
(e.g. someone adds a partial fuzzy-match check without updating this test) that would flip this
test red without anyone having made a deliberate decision to enforce quote fidelity. Red here is a
signal to go find the product decision, not evidence of a bug in the new code.

**Research source**: `research.md` "The real open gap" finding; PRD Open Question #2
(`context/foundation/prd.md:157`); roadmap S-02 Unknowns
(`context/foundation/roadmap.md:132-133`).

**Edge case covered**: the exact "attribution theater" scenario — real peer, fabricated content.

**Anti-pattern avoided**: this plan deliberately does *not* add a runtime check just to make a
"should reject" assertion pass (that would be inventing a safeguard to make a risk testable,
the exact anti-pattern the test-plan's own Challenger pass forbids) — instead it asserts the real,
current, accepted contract and documents why.

### Success Criteria:

#### Automated Verification:

- `npm test -- src/lib/services/session.service.test.ts` passes, including the tripwire case
- `npm run lint` passes on the changed file

#### Manual Verification:

- None.

---

## Phase 3: Close out the rollout phase

### Overview

Update the test-plan guide's bookkeeping to reflect Phase 2 as complete, with the quote-fidelity
gap recorded for later.

### Changes Required:

#### 1. Flip rollout status and update the cookbook

**File**: `context/foundation/test-plan.md`

**Intent**: Set §3 Phase 2's Status cell to `complete` and Change folder to
`context/changes/testing-round-two-attribution/`. Add a §6 cookbook entry naming the
"non-participant persona-id referential-integrity" fixture pattern (pointing at
`session.service.test.ts`'s `resolveRoundTwo` test family). Add a short note — under §6 or a new
§7-adjacent line — recording the quote-fidelity gap as a flagged, **product-blocked** finding
(PRD Open Question #2, Owner: user), explicitly distinct from a test-rollout defect, so a future
session doesn't re-discover it from scratch.

**Contract**: Edits confined to the §3 Status/Change-folder cells for Phase 2 and new §6 bullet
content — no change to §1/§2 risk wording (would require the `--refresh` path per the test-plan
skill's own rules).

### Success Criteria:

#### Automated Verification:

- `npm run lint && npm run build` pass

#### Manual Verification:

- None.

## Testing Strategy

### Unit Tests:

- Non-participant persona-id rejection (Phase 1).
- Quote-fidelity tripwire documenting the current accepted gap (Phase 2).

### Manual Testing Steps:

- None required — every criterion above is automated.

## References

- Research: `context/changes/testing-round-two-attribution/research.md`
- Existing test family being extended: `src/lib/services/session.service.test.ts:573-675`
- Enforcement point: `src/lib/services/session.service.ts:79-124` (`resolveRoundTwo`)
- PRD Open Question #2: `context/foundation/prd.md:157`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands.

### Phase 1: Non-participant persona-id referential-integrity test

#### Automated

- [ ] 1.1 `npm test` passes including the new non-participant-id case
- [ ] 1.2 `npm run lint` passes on the changed file

### Phase 2: Quote-fidelity tripwire test

#### Automated

- [ ] 2.1 `npm test` passes including the new tripwire case
- [ ] 2.2 `npm run lint` passes on the changed file

### Phase 3: Close out the rollout phase

#### Automated

- [ ] 3.1 `npm run lint && npm run build` pass

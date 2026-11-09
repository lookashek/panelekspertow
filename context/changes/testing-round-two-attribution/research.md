---
date: 2026-11-09T10:37:33+00:00
researcher: lstepien (Claude Code, Sonnet 5)
git_commit: c324964
branch: main
repository: panelekspertow
topic: "Rollout Phase 2 (test-plan.md) — round-two attribution integrity (Risk #2)"
tags: [research, codebase, testing, attribution, round-two, session-service, advisor-prompts]
status: complete
last_updated: 2026-11-09
last_updated_by: lstepien (Claude Code, Sonnet 5)
---

# Research: Round-two attribution integrity

**Date**: 2026-11-09T10:37:33+00:00
**Researcher**: lstepien (Claude Code, Sonnet 5)
**Git Commit**: c324964
**Branch**: main
**Repository**: panelekspertow

## Research Question

Ground rollout Phase 2 of `context/foundation/test-plan.md` (Risk #2 — round-two attribution is
schema-valid but meaningless; "attribution theater", PRD Open Question #2, unresolved). Locate
where `attributedPersonaId`/`attributionQuote` are produced, parsed, validated and persisted;
determine whether any existing code or test already checks that a cited author is a real
round-one participant, or that the quoted text is genuine; identify the cheapest useful test
layer and flag speculative sub-risks.

**Method.** Read the PRD Open Question #2 and roadmap S-02 entries directly (both explicitly
unresolved, "Owner: user", blocking the PRD's Secondary success criterion's credibility — not a
risk this test phase can resolve on its own). Read the archived `S-02` plan-brief and
impl-review for the original design decisions and review findings. One read-only Explore agent
traced the live code: schemas (`src/lib/schemas/advisor.ts`, `src/lib/schemas/session.ts`),
prompt construction (`src/lib/prompts/advisor-*.v1.ts`), the parse/validation path
(`src/lib/advisors/run-panel.ts`, `src/lib/services/session.service.ts`), and every existing test
touching attribution.

## Summary

**The risk is real, but narrower than the test plan's §2 wording suggests** — part of it is
already implemented and tested; the genuinely open part is more specific than "attribution
theater" in general.

- **Already implemented and tested**: persona-id referential integrity. `resolveRoundTwo()`
  (`src/lib/services/session.service.ts:79-124`) enforces that when a score changes,
  `attribution` must be non-null, must not name the advisor itself, and must name a persona id
  that actually produced a round-one opinion in this session (`priorHeads.has(...)`) — otherwise
  the whole turn fails with `LLM_INVALID_OUTPUT`. `src/lib/services/session.service.test.ts:573-675`
  already asserts: valid-peer attribution kept, unchanged-score attribution dropped,
  no-attribution-on-changed-score fails, **self-attribution fails**. This is real, working
  defense-in-depth (confirmed independently by the archived S-02 impl-review's "Accepted
  observations": "the attribution invariant is enforced in three independent layers... confirmed
  correct, no gap found" — `context/archive/2026-09-25-round-two-attribution/reviews/impl-review.md:82`).
  **Do not write a test asserting this is broken — it already passes.**
- **Untested but implemented**: citing a persona id that is one of the 4 valid enum values but
  did **not** actually participate in this session's round one (e.g., excluded because round one
  only had the `MIN_ROUND_TWO_PARTICIPANTS = 2` minimum, not all 4). `resolveRoundTwo`'s
  `priorHeads.has(...)` check should reject this (same mechanism as self-attribution), but no
  test exercises this specific case today.
- **The real, currently-unaddressed gap**: **quote-content fidelity**. `attribution.quotedPeerArgument`
  is passed straight through (`session.service.ts:122`) to the persisted `attributionQuote` with
  **zero check** that the text actually appears in the cited persona's round-one `arguments`
  array. Confirmed by reading `run-panel.ts`, `session.service.ts`, `parse-score.ts`, and
  `session.repository.ts` in full — no `.refine()`/cross-field check exists in either Zod schema
  (`AdvisorAttributionSchema` at `src/lib/schemas/advisor.ts:29-34`, `AdvisorOpinionRowSchema` at
  `src/lib/schemas/session.ts:28-41`), and no runtime check exists in `resolveRoundTwo` or
  anywhere else. The LLM is only *prompt-instructed* to quote verbatim
  (`src/lib/prompts/advisor-optymista.v1.ts:81`: "cytat musi być wierny, nie parafrazuj") — this is
  exactly the gap PRD Open Question #2 names ("sam wymóg wskazania autora argumentu nie gwarantuje
  merytorycznej zmiany zdania"). **This is the risk this rollout phase should target.**

**Scope boundary**: PRD Open Question #2 asks a broader product question ("does the attribution
mechanism produce genuine reasoning, not ritual?") that this test phase cannot answer — that
requires the user's prototype evaluation per the PRD, not a unit test. What a test **can** cheaply
and legitimately prove is the narrower, code-checkable claim: *the quoted text is not fabricated
relative to the cited persona's actual round-one output* (a referential/content-integrity check,
not a semantic-quality judgment). This matches the test plan's own "cheapest layer" framing
(contract/schema + fixture-based referential-integrity test, not live-LLM e2e) and does not
attempt to resolve the open product question.

## Detailed Findings

### Schemas — shape-only, no cross-field validation

`src/lib/schemas/advisor.ts:27-40` (LLM-output boundary):
```ts
const ROUND_TWO_PERSONA_IDS = ["optymista", "sceptyk", "pragmatyk", "analityk"] as const;
export const AdvisorAttributionSchema = z.object({
  convincedByPersonaId: z.enum(ROUND_TWO_PERSONA_IDS),
  quotedPeerArgument: z.string().min(1),
});
export const AdvisorRoundTwoOpinionSchema = AdvisorOpinionSchema.extend({
  attribution: AdvisorAttributionSchema.nullable(),
});
```
`src/lib/schemas/session.ts:28-41` (DB-row boundary, snake_case, mapped to camelCase at `:69-70`):
`attributed_persona_id: z.enum(PERSONA_IDS).nullable()`, `attribution_quote: z.string().nullable()`.

Both validate shape only (enum membership for the id, non-empty string for the quote). Neither
has a `.refine()`/`.superRefine()` tying the quote to any other field. Confirmed by
`src/lib/schemas/advisor.test.ts:65-122` and `src/lib/schemas/session.test.ts:99-166` — both only
exercise shape (valid/invalid enum member, empty-string rejection, camelCase mapping), never
cross-field logic.

### Prompt construction — instructs verbatim quoting, enforces nothing

Each persona has its own prompt file (`src/lib/prompts/advisor-{optymista,sceptyk,pragmatyk,analityk}.v1.ts`);
all four share structure. Peer round-one heads are dumped verbatim into the round-two user prompt
via `formatPeerHead` (`advisor-optymista.v1.ts:58-61`), including the peer's full `arguments`
array. The system prompt (`advisor-optymista.v1.ts:81`) explicitly instructs: cite exactly one
peer by id in `convincedByPersonaId`, and quote **literally** ("dosłownie") their round-one
argument in `quotedPeerArgument`, "cytat musi być wierny, nie parafrazuj" (the quote must be
faithful, do not paraphrase). This is natural-language instruction only — nothing downstream
checks compliance.

### Validation — `resolveRoundTwo`, the actual enforcement point

`src/lib/services/session.service.ts:79-124`, called from `runSecondRound` (`:455`, and the
batch-resolution path `:~754`):

```ts
function resolveRoundTwo(headResult, personaId, priorScore, priorHeads): RoundTwoResolution {
  // score unchanged → attribution force-dropped to null regardless of what the LLM sent
  // score changed → attribution must be non-null, must not name personaId itself, and
  //   attribution.convincedByPersonaId must be a key in priorHeads (a real round-one participant)
  // any violation → { failed: true, error: LlmError("Score changed without valid attribution", LLM_INVALID_OUTPUT) }
}
```

This is the one and only enforcement point for referential integrity on the **persona id**. It
does not and cannot check quote fidelity — `attribution.quotedPeerArgument` flows straight
through to `attributionQuote` at `:122` with no comparison against
`priorHeads.get(attribution.convincedByPersonaId)?.arguments`.

### Existing test coverage

- `src/lib/services/session.service.test.ts:573-675` — the only test exercising
  `resolveRoundTwo`'s logic (not just a persistence round-trip). Covers: valid-peer attribution
  kept; unchanged-score attribution dropped; no-attribution-on-changed-score fails; **self-attribution
  fails**. Does **not** cover: citing a valid-enum persona id who didn't participate in this
  session's round one; any quote-content check (every fixture uses an arbitrary placeholder
  string — `"peer arg"`, `"the exact peer argument"` — never cross-checked against another
  field).
- `src/lib/schemas/advisor.test.ts`, `src/lib/schemas/session.test.ts`,
  `src/lib/repositories/session.repository.test.ts` — all shape/round-trip only, as above.
- `src/lib/prompts/advisor-prompts.test.ts:95-174` — asserts prompt *text* properties (mentions
  the conditional-attribution rule, echoes the quote into the rationale prompt), not runtime
  validation of LLM output.
- `src/lib/advisors/run-panel.test.ts` — only uses `attribution: null` fixtures; doesn't exercise
  the validation logic (that lives in `session.service.ts`, not `run-panel.ts`).

### Response-guidance correction for `/10x-plan`

The test plan's §2 Response Guidance for Risk #2 ("cited author must exist in round-one output")
is **already satisfied** by `resolveRoundTwo` + its existing test, for the persona-id half of the
claim. The plan should be re-scoped to the two things that are actually open:
1. A referential-integrity test for citing a syntactically-valid persona id who did not
   participate in this session's round one (distinct from self-attribution, untested today).
2. A **new** code-level check (and test) that `attributionQuote` text actually matches/appears in
   the cited persona's round-one `arguments` — currently absent everywhere. This is a genuine
   feature gap, not just a test gap: if the plan's cheapest-layer principle extends to "test what
   exists," item 2 requires deciding whether this rollout phase also adds the missing runtime
   check (test-first) or writes a test that documents the gap as a known limitation pending a
   product decision (PRD OQ#2 is explicitly "Owner: user"). `/10x-plan` should decide which,
   consulting the user if needed — this research does not resolve that product-scope question.

## Open questions / gaps

- Whether adding a runtime quote-fidelity check (e.g., substring/fuzzy match against the cited
  persona's round-one arguments) is in scope for this test-only rollout phase, or whether the
  correct move is a test that documents the gap and fails closed only at the schema/referential
  level — this is a product-scope decision (PRD OQ#2, Owner: user), not something this research
  can settle.
- No test today exercises "cites a real-but-non-participating persona id" (as opposed to
  self-attribution) — cheap to add, uses the existing `priorHeads` mechanism, no new code needed.

## Answer for `/10x-plan`

Plan-able now. Cheapest layer: extend `src/lib/services/session.service.test.ts`'s
`resolveRoundTwo` coverage with the missing non-participant-id case (fixture-based, reuses
`ADVISOR_REGISTRY`/`makeOpinionRecord`, no new infra). For the quote-fidelity gap, `/10x-plan`
should present the user a scoped choice: (a) write a referential-integrity test against a new,
narrow runtime check this phase adds (e.g. a simple substring/normalized-match guard in
`resolveRoundTwo`), or (b) write a test that documents the current behavior (quote is *not*
verified) as an explicitly accepted limitation tied to PRD OQ#2, deferring the code change to a
separate, product-scoped change. Either way: no live LLM call, no live Supabase — this phase
stays entirely in fixture-based Vitest, consistent with the "unit tests, not e2e" rollout scope.

# Round Two — Attribution (S-02) Implementation Plan

## Overview

Add a user-triggered **second debate round** to an existing session. Each advisor that produced a
round-one opinion now sees the other advisors' round-one positions, reacts to them, and emits a
**fresh** opinion (score, thesis, arguments). When an advisor's score changes, it must name the
single peer whose argument convinced it and quote that argument — the FR-004 attribution mechanic
and the evidence for the PRD Secondary criterion ("at least one persona changes its score in round
two and points to the author of the argument that convinced it"). Round two reuses the S-01
fan-out, SSE contract, replay-by-unique-constraint, and pixel-retro panel components; it does not
end the session or synthesize (S-03) and does not let the user inject new context (S-06).

## Current State Analysis

Round one is complete and archived (S-01). The machinery this plan extends:

- **Fan-out** — `runPanel(deps, PanelInput, signal)` → `{ scores, stream }` (`src/lib/advisors/run-panel.ts:72`),
  two-phase per persona: `complete()` structured head → `stream()` prose rationale, partial-failure
  tolerant (one persona's failure never aborts siblings), abort wired through a shared controller.
- **Strategy registry** — `ADVISOR_REGISTRY` (`src/lib/advisors/registry.ts:50`); `AdvisorStrategy`
  (`registry.ts:36`) currently exposes `buildPrompt` + `buildRationalePrompt` + `temperature`.
  Personas only ever see their own `PanelInput` — there is **no peer-aware prompt**.
- **Structured output** — `AdvisorOpinionSchema = {score, thesis, arguments[]}`
  (`src/lib/schemas/advisor.ts:16`). **No attribution field.**
- **Persistence** — `advisor_opinions` (`supabase/migrations/20260923140522_...sql:18`) is already
  round-aware: `round_number` (check ≥1) + `unique(session_id, persona_id, round_number)`. It has
  **no column for attribution or a prior score**. RLS: per-op/per-role policies keyed on `auth.uid()`.
- **Service** — `SessionService.runFirstRound` (`src/lib/services/session.service.ts:131`) hardcodes
  round 1: ownership check, replay if `getOpinions(id,1)` non-empty, else run + `persistTail` (persist
  successes + log spread via `waitUntil`). `buildLiveEvents`/`buildReplayEvents` normalize both paths
  to one `AsyncIterable<PanelRunEvent>`.
- **Repository** — `SessionRepository.saveOpinions(sessionId, roundNumber, opinions)`
  (`src/lib/repositories/session.repository.ts:65`) and `getOpinions(sessionId, roundNumber)` already
  take a round argument. Row ↔ domain mapping in `src/lib/schemas/session.ts`.
- **Endpoint** — `GET /api/sessions/[id]/stream` (`src/pages/api/sessions/[id]/stream.ts:31`): auth →
  service → SSE frames `score|token|done|error`, `waitUntil(persistTail)`, abort handling.
- **Frontend** — `src/pages/sessions/[id].astro` renders one `<AdvisorPanel client:load>`;
  `AdvisorPanel` (`src/components/advisor-panel/AdvisorPanel.tsx`) maps personas to `AdvisorCard`;
  `usePanelStream(sessionId, personaIds)` (`.../usePanelStream.ts:53`) opens `/stream` on mount and
  auto-closes when all personas are terminal. `AdvisorCard` renders score glyph + thesis + arguments.

Constraints carried from the rules and lessons: RLS **and** an explicit service-side ownership check
(lessons.md); migrations forward-only + additive with an `-- FR-xxx` header (backend.md §4); one
debate round per request on the edge runtime (backend.md §5); every boundary Zod-validated; single
dark pixel-retro theme, no `dark:`/light styles, `aria-live` on streamed text (frontend.md §4–6).

## Desired End State

On `/sessions/[id]`, after round one has produced ≥2 opinions, a **"Runda 2"** trigger appears.
Activating it streams a second card set below round one: each participating advisor shows its new
score with a **delta vs round one** (e.g. `6 → 8 ▲`), its reaction thesis + arguments streaming live,
and — when the score moved — a **"Przekonał: Sceptyk"** author badge plus the quoted peer argument.
Round-two opinions persist; reloading replays them with no new LLM cost. The session stays `active`.
Server logs per-session round-two metrics (change count, attribution count, score spread).

Verify: run round one on a substantive decision, click "Runda 2", watch ≥1 advisor change its score
and attribute a named peer; reload and see the round-two panel replay identically; confirm the logged
metrics and that `sessions.status` is still `active`.

### Key Discoveries:

- `advisor_opinions` is already keyed `unique(session_id, persona_id, round_number)`
  (`migration:28`) — round-2 rows fit with **no** schema change to the key; only additive attribution
  columns are needed.
- `saveOpinions`/`getOpinions` already accept `roundNumber` (`session.repository.ts:65,119`) — round
  two needs a wider `SaveOpinionInput`, not new query methods.
- `buildLiveEvents`/`buildReplayEvents` (`session.service.ts:46,89`) already normalize live vs replay
  into one event stream — round two adds attribution fields to the `score` event, reusing the shape.
- `usePanelStream` is deliberately registry-free (persona ids as plain strings, `usePanelStream.ts:5`)
  — it can be reused for round two by parameterizing the round in the `EventSource` URL.
- `persona_id` CHECK lists the four ids (`migration:22`) — the new `attributed_persona_id` column
  reuses that enum and adds a self-attribution guard.

## What We're NOT Doing

- **Synthesis / session end** (FR-005, explicit-end → synthesis) — that is S-03. Round two leaves
  `sessions.status = 'active'`; no "finish session" action ships here.
- **Mid-session user context / comment before a round** (the FR-010 "dopisać własny komentarz" part)
  — deferred to S-06 (resume-session-round), which owns context injection.
- **Rounds beyond two** — this slice caps the debate at exactly round two; generalized "next round"
  is S-06.
- **Retrying personas that failed round one** — a persona absent from round one is absent from round
  two (graceful degradation, consistent with S-01 partial-success).
- **Multi-author attribution** — attribution is a single peer, present only when the score changed.
- **Score-distribution / delta visualization beyond the inline badge** — the charted round-over-round
  view is a v2 non-goal (PRD).
- **Per-user rate limiting** — same recorded gap as S-01; not introduced here.

## Implementation Approach

Bottom-up through the backend layers, then UI, mirroring S-01. The round-two structured head is the
persisted source of truth (validated against a new Zod schema); the streamed prose is the live FR-009
effect built from the resolved head. The LLM returns `attribution` (`null` or
`{ convincedByPersonaId, quotedPeerArgument }`); the **server** derives `previousScore` by comparing
the new head to that persona's persisted round-one score and enforces the invariant "attribution
present iff score changed" **in the service** (the adapter only validates the JSON shape against the
Zod schema and cannot see the round-one score). Enforcement is deterministic, not a re-prompt: on a
score change with no attribution, fail that persona's result with `LLM_INVALID_OUTPUT` (treated like
any partial failure — siblings continue); on an unchanged score with attribution present, drop the
attribution. Isolation is round-one-only: round-two prompts inject the peers' round-one
heads. A new `runSecondRoundPanel` reuses `run-panel.ts`'s shared-controller/partial-failure/merge
machinery. The endpoint gains a validated `round` query param routing to `runFirstRound` vs
`runSecondRound`; the UI adds a trigger island and a second panel that reads delta + attribution
straight off the round-two `score` frame.

## Critical Implementation Details

- **Attribution invariant is service-owned, not model-trusted and not adapter-enforced.** The model
  outputs `attribution`; `runSecondRound` compares the new score to the persisted round-one score and
  is the authority on whether attribution is required (score changed) or must be dropped (score
  unchanged). The adapter's existing retry only re-validates JSON against the Zod schema — it has no
  round-one score and cannot check this invariant, so enforcement lives in the service, applied once
  per persona (see Phase 4). Do not persist or emit an attribution the invariant rejects. Score changed
  but attribution missing → fail that persona (`LLM_INVALID_OUTPUT`, partial-failure path); score
  unchanged but attribution present → drop it. This is the concrete anti-"theater" control (PRD OQ#2)
  alongside the prompt-level honesty instruction and the metrics log.
- **Round-two availability is gated on ≥2 persisted round-one opinions**, evaluated server-side in the
  page frontmatter (a lone opinion has no peers to react to). Personas without a round-one opinion do
  not participate and are not rendered in the round-two panel.
- **Persist from resolved heads, not stream end** — reuse S-01's `persistTail` + `waitUntil` pattern
  so a mid-stream disconnect still saves round two.

## Phase 1: Data model — attribution migration + schemas

### Overview

Give `advisor_opinions` somewhere to record attribution, extend the row/domain boundary, and define
the round-two structured-output contract.

### Changes Required:

#### 1. Additive migration

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_add_round_two_attribution.sql`

**Intent**: Add nullable attribution columns to `advisor_opinions` so a round-two row can record what
changed and who caused it, without touching round-one rows or the existing unique key.

**Contract**: Forward-only, additive migration with an `-- FR-004` header comment. Adds three nullable
columns: `previous_score integer` (the persona's round-one score, set only when the score changed),
`attributed_persona_id text` (reuses the four-id CHECK list from the create migration), and
`attribution_quote text`. Add two CHECK constraints: `attributed_persona_id <> persona_id`
(no self-attribution) and a co-presence guard so `previous_score` / `attributed_persona_id` /
`attribution_quote` are either all null or all non-null. No new RLS policies (columns inherit the
table's existing per-op policies). Do not edit the applied create migration.

#### 2. Row schema + domain type

**File**: `src/lib/schemas/session.ts`, `src/types/session.ts`

**Intent**: Carry the new columns across the DB boundary and into the domain object.

**Contract**: Extend `AdvisorOpinionRowSchema` with `previous_score: z.number().int().min(1).max(10).nullable()`,
`attributed_persona_id: z.enum(PERSONA_IDS).nullable()`, `attribution_quote: z.string().nullable()`.
Extend `toAdvisorOpinion` to map them to camelCase. Add to `AdvisorOpinionRecord`:
`previousScore: number | null`, `attributedPersonaId: AdvisorPersonaId | null`,
`attributionQuote: string | null`.

#### 3. Round-two structured-output schema

**File**: `src/lib/schemas/advisor.ts`

**Intent**: Define the JSON contract the model returns for a round-two head — the round-one opinion
shape plus a nullable attribution object.

**Contract**: Add `AdvisorAttributionSchema = z.object({ convincedByPersonaId: <persona enum>, quotedPeerArgument: z.string().min(1) })`
and `AdvisorRoundTwoOpinionSchema = AdvisorOpinionSchema.extend({ attribution: AdvisorAttributionSchema.nullable() })`
with inferred types exported alongside. The persona enum is duplicated here as a local
`const [...] as const` (advisor.ts must not import the registry — client-bundle boundary, see
`schemas/panel.ts:1` rationale).

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly against a local Supabase: `npx supabase db reset`
- Schema unit tests pass (round-two schema accepts a valid attribution and a null; rejects
  self-referential/blank quote): `npm run test -- advisor session`
- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`

#### Manual Verification:

- Inspecting `advisor_opinions` in the Supabase Studio shows the three new nullable columns and the
  two CHECK constraints; inserting a round-two row with a score change + attribution succeeds and one
  with `previous_score` set but `attributed_persona_id` null is rejected.

**Implementation Note**: After completing this phase and all automated verification passes, pause here
for manual confirmation before proceeding.

---

## Phase 2: Peer-aware round-two prompts + registry

### Overview

Teach each persona to react to peers and, on a score change, name and quote the convincing peer.

### Changes Required:

#### 1. Round-two prompt builders (×4)

**File**: `src/lib/prompts/advisor-optymista.v1.ts`, `advisor-sceptyk.v1.ts`, `advisor-pragmatyk.v1.ts`,
`advisor-analityk.v1.ts`

**Intent**: Add the round-two structured-head prompt and its rationale-stream counterpart to every
persona, preserving each persona's bias voice from the existing v1 builders.

**Contract**: Export `buildRoundTwoPrompt(input, selfHead, peers)` and
`buildRoundTwoRationalePrompt(input, selfHead, roundTwoHead, peers)` from each file, where
`selfHead: AdvisorOpinion` is the persona's round-one head and
`peers: { label: string; head: AdvisorOpinion }[]` are the other advisors' round-one heads. The
round-two system prompt must: (a) instruct the persona to react to the listed peer positions in its
own voice; (b) permit keeping the score unchanged; (c) require that **if and only if** it changes its
score, it set `attribution` naming one peer and quoting the specific peer argument that moved it, and
otherwise set `attribution: null`; (d) demand JSON matching `AdvisorRoundTwoOpinionSchema` exactly.
The rationale prompt streams prose consistent with the already-decided round-two head, in-voice, no
JSON. Keep `PROMPT_VERSION = "v1"`.

#### 2. Strategy interface

**File**: `src/lib/advisors/registry.ts`

**Intent**: Surface the new builders on every registry entry.

**Contract**: Add `buildRoundTwoPrompt` and `buildRoundTwoRationalePrompt` to `AdvisorStrategy` with
signatures matching the prompt files, and wire each of the four `ADVISOR_REGISTRY` entries to its new
builders. Temperatures unchanged.

### Success Criteria:

#### Automated Verification:

- Registry/prompt unit tests pass (each persona exposes both round-two builders; system prompt
  includes peer labels and the conditional-attribution instruction; user prompt embeds self head +
  peer heads): `npm run test -- registry prompts`
- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`

#### Manual Verification:

- Spot-read one generated round-two prompt string: peer positions are present, the
  "attribution only if score changes" rule reads unambiguously, and no round-one isolation language
  leaked in.

**Implementation Note**: After completing this phase and all automated verification passes, pause here
for manual confirmation before proceeding.

---

## Phase 3: Round-two peer-aware fan-out

### Overview

Run the four (or fewer) participating personas in parallel for round two, each seeing its peers.

### Changes Required:

#### 1. `runSecondRoundPanel`

**File**: `src/lib/advisors/run-panel.ts`

**Intent**: A round-two sibling of `runPanel` that builds each persona's prompt from its own and its
peers' round-one heads, validating the head against the round-two schema.

**Contract**: Export `runSecondRoundPanel(deps, input, priorHeads, signal?)` returning
`{ scores: Promise<Result<AdvisorRoundTwoOpinion, LlmError>[]>, stream: ReadableStream<PanelStreamChunk> }`,
where `priorHeads: Map<AdvisorPersonaId, AdvisorOpinion>` are the persisted round-one heads. Only
personas present in `priorHeads` run; for each, `peers` = the other entries of `priorHeads`. Reuse
`createSharedController`, the two-phase complete→stream flow, `activeReaders` cleanup, and
partial-failure isolation from `runPanel` (extract shared helpers rather than duplicating the
controller/merge logic). `complete()` validates against `AdvisorRoundTwoOpinionSchema`;
`buildRoundTwoRationalePrompt` drives `stream()`.

### Success Criteria:

#### Automated Verification:

- Fan-out unit tests pass with a fake `LlmProvider` (only personas in `priorHeads` run; peer heads are
  passed to each builder; one persona's failure doesn't abort siblings; caller abort cancels all):
  `npm run test -- run-panel`
- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`

#### Manual Verification:

- With a 3-entry `priorHeads` map, confirm exactly three persona streams start and each persona's
  peer list excludes itself.

**Implementation Note**: After completing this phase and all automated verification passes, pause here
for manual confirmation before proceeding.

---

## Phase 4: SessionService.runSecondRound + persistence + metrics

### Overview

Orchestrate round two: ownership, availability gate, replay-or-run, attribution derivation,
persistence, and the Secondary-criterion metrics log.

### Changes Required:

#### 1. Round-two event type + service method

**File**: `src/lib/services/session.service.ts`

**Intent**: Add `runSecondRound(sessionId, userId)` mirroring `runFirstRound`, extended for
attribution, and widen `PanelRunEvent`'s `score` variant with the round-two fields.

**Contract**: `runSecondRound` returns `Result<PanelRunView>`. Steps: (1) load session + explicit
ownership check → `NotFoundError` (RLS + service check, per lessons.md); (2) load round-one opinions
via `getOpinions(id, 1)`; if fewer than 2, return a `ValidationError` (`ROUND_TWO_UNAVAILABLE`);
(3) load `getOpinions(id, 2)` — if non-empty, return a replay view; (4) else build the `priorHeads`
map, call `runSecondRoundPanel`, and return live events + a `persistTail`. **The persona list threaded
through round two is the participating subset, never `ADVISOR_REGISTRY`**: derive
`participants: AdvisorStrategy[]` = `ADVISOR_REGISTRY.filter(p => priorHeads.has(p.id))` and pass that
same list to `runSecondRoundPanel`, `buildLiveEvents`, and the replay builder. This matters because the
existing `buildReplayEvents` (`session.service.ts:92-113`) emits a hard "No round-one opinion recorded"
error event for any persona in its list without a record, and both builders index `scores` positionally
(`:52`) — handing them the full registry would surface spurious error cards for non-participants and
misalign live results. The round-two replay/live builders (or the shared generalization) therefore
iterate `participants`, so the ≤4 rendered personas exactly match who ran. The `score` event variant
gains `previousScore: number | null`, `attributedPersonaId: AdvisorPersonaId | null`,
`attributionQuote: string | null`. `buildLiveEvents`/`buildReplayEvents` (and a round-two counterpart
or a shared generalization) emit those fields; the invariant "attribution present iff score changed"
is enforced in the service (not the adapter, which cannot see the round-one score) when mapping each
resolved head — compute `previousScore` from the matching round-one record, then: score unchanged +
attribution present → drop the attribution and leave the three columns null; score changed +
attribution missing → fail that persona's result with `LLM_INVALID_OUTPUT` (partial-failure path,
siblings unaffected); score changed + attribution present → keep, setting all three columns — **but first validate
`convincedByPersonaId` is a real participating peer**: it must be present in `priorHeads` and not equal
the persona's own id. An attribution naming a non-participant (e.g. a persona that failed round one) is
treated as no attribution (dropped), so the invariant's changed-score branch then fails that persona
(`LLM_INVALID_OUTPUT`) rather than emitting a badge that points at an advisor the panel never renders.
This backstops the DB-level self-attribution CHECK, which only rejects self-references, not references
to absent personas. This
derivation is a **single pure helper** — `resolveRoundTwo(headResult, priorScore, priorHeads)` returning
`{ score, thesis, arguments, previousScore, attribution } | { failed }` — computed **once per persona**
and consumed by both the live event builder (for the `score` frame) and `persistTail` (for the inserted
row and metrics). The emit path and persist path must not each re-derive the invariant independently, or
the emitted `score` frame and the persisted/replayed row can diverge (a badge shown live but absent on
reload). Round-one's dual `scores` consumers (`buildLiveEvents` at `session.service.ts:51` and
`persistAndLogSpread` at `:168`) are the pattern to preserve — same resolved values feed both.

#### 2. Persist round-two opinions with attribution

**File**: `src/lib/repositories/session.repository.ts`

**Intent**: Let `saveOpinions` write the attribution columns.

**Contract**: Widen `SaveOpinionInput` to `{ personaId, opinion: AdvisorOpinion, previousScore?: number | null, attributedPersonaId?: AdvisorPersonaId | null, attributionQuote?: string | null }`
and map the new fields into the inserted row (null when absent). Round-one callers pass none →
columns stay null. Insert continues to rely on the `unique(session_id, persona_id, round_number)`
constraint for replay safety.

#### 3. Metrics log

**File**: `src/lib/services/session.service.ts`

**Intent**: Emit the signal that makes the Secondary criterion evaluable.

**Contract**: In the round-two `persistTail`, log one structured `info` line: `sessionId`,
`participantCount`, `changedCount` (personas whose score moved), `attributedCount`, and round-two
`spread` (max−min of round-two scores, null if <2). No prompt/response bodies (backend.md §5).

#### 4. Error code

**File**: `src/lib/errors.ts`

**Intent**: Name the availability failure.

**Contract**: Add `ROUND_TWO_UNAVAILABLE` to `ErrorCode`; surface via a `ValidationError` (400) or a
dedicated subclass — pick the 400-mapping already handled by `@/lib/http`.

### Success Criteria:

#### Automated Verification:

- Service unit tests pass with fakes: availability gate (<2 round-one opinions → error); replay when
  round-two rows exist (no provider calls); live path persists successes with correct `previousScore`
  and attribution; attribution dropped when score unchanged; attribution naming a non-participant peer
  is dropped (and the changed-score persona then fails); metrics line emitted:
  `npm run test -- session.service`
- Repository test covers round-two `saveOpinions` writing/reading attribution columns:
  `npm run test -- session.repository`
- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`

#### Manual Verification:

- Against a real session with a persisted round one, invoking the service (via the Phase 5 endpoint)
  persists round-two rows; a persona that changed its score has non-null attribution columns and one
  that didn't has all three null.

**Implementation Note**: After completing this phase and all automated verification passes, pause here
for manual confirmation before proceeding.

---

## Phase 5: Endpoint — `?round=2` routing

### Overview

Let the existing stream endpoint serve either round.

### Changes Required:

#### 1. Round-param routing + attribution frame

**File**: `src/pages/api/sessions/[id]/stream.ts`

**Intent**: Parse a validated `round` query param and dispatch to the right service method; extend the
`score` SSE frame with attribution.

**Contract**: Read `round` from the URL (`z` coercion to `1 | 2`, default `1`; invalid → 400
`VALIDATION_ERROR`). `round === 2` → `service.runSecondRound(...)`, else `runFirstRound`. Everything
downstream (auth, `waitUntil(persistTail)`, SSE lifecycle, abort) is unchanged. `frameFor`'s `score`
case includes `previousScore`, `attributedPersonaId`, `attributionQuote` when present. No new route
file (reuses the single-purpose-per-resource stream endpoint, branching on the round param).

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`
- Auth-flow smoke still green: `npm run smoke` (against a running server)

#### Manual Verification:

- `curl -N` on `/api/sessions/<id>/stream?round=2` (authenticated) streams round-two `score` frames
  carrying attribution fields; `?round=3` returns 400; `?round=2` on a session without round one
  returns the `ROUND_TWO_UNAVAILABLE` error shape.

**Implementation Note**: After completing this phase and all automated verification passes, pause here
for manual confirmation before proceeding.

---

## Phase 6: Frontend — trigger + round-two panel

### Overview

Surface the round-two trigger, stream the second panel, and show deltas + attribution.

### Changes Required:

#### 1. Stream hook — round parameter

**File**: `src/components/advisor-panel/usePanelStream.ts`

**Intent**: Reuse the hook for round two by targeting `?round=2` and carrying attribution into view
state.

**Contract**: Accept a `round: 1 | 2` argument (default 1) and open
`/api/sessions/${sessionId}/stream?round=${round}`. Extend `ScoreEventData` and `PersonaViewState`
with `previousScore?`, `attributedPersonaId?`, `attributionQuote?`. To avoid an eager LLM call, round
two only connects once activated, achieved by **mount-only**: the streaming child that calls
`usePanelStream(..., 2)` is not mounted until the trigger fires — so the hook opens its `EventSource`
on first mount, exactly as round one does. Do **not** add an `enabled` flag: the hook's effect deps are
`[sessionId]` (with an eslint-disable justified by "personaIds is a stable list", `usePanelStream.ts:146`),
so an `enabled` gate would silently fail to reconnect on flip without also widening the deps — mount-only
keeps that contract untouched. The `round` argument is baked into the URL at mount, so it needs no deps
change either. Keep the registry-free string-id design.

#### 2. Round-two panel + trigger island

**File**: `src/components/advisor-panel/RoundTwoPanel.tsx` (new),
`src/components/advisor-panel/AdvisorCard.tsx`

**Intent**: A section that, on user activation, streams the round-two card set with delta and author
badge; extend `AdvisorCard` to render them.

**Contract**: `RoundTwoPanel` takes `{ sessionId, personas, available }` and renders a "Runda 2"
`pixel-btn` trigger; on click it mounts a child panel that calls `usePanelStream(sessionId, ids, 2)`
(mount-only deferral — the hook connects on mount, so no round-two `EventSource` opens until the trigger
fires; no `enabled` flag, per Phase 6 §1).
`AdvisorCard` gains optional props to show a delta line (number + direction word, never color alone —
frontend.md §6). Because `previousScore` is null exactly when the score did not change (Phase 1
invariant), the render branches on it: **null → current score with the ▬ (bez zmian) glyph and no
arrow** (there is no prior operand to show); **non-null → `previousScore → score` with ▲ (w górę) /
▼ (w dół)**. A non-null `previousScore` always differs from `score`, so ▲/▼ never mislabels an
unchanged score. and, when `attributedPersonaId` is set,
a "Przekonał: <label>" badge plus the quoted argument. Streamed prose stays in the existing
`aria-live="polite"` region. Tokens/`cn()` only; sharp corners; respects `prefers-reduced-motion`.

#### 3. Page wiring

**File**: `src/pages/sessions/[id].astro`

**Intent**: Compute availability + replay server-side and render round two below round one.

**Contract**: In frontmatter, load round-one and round-two opinion counts via `SessionRepository`.
Pass `available = roundOneCount >= 2` and a `hasRoundTwo` flag to `<RoundTwoPanel client:load>`,
rendered under the existing `<AdvisorPanel>`. When `hasRoundTwo`, `RoundTwoPanel` mounts its streaming child
immediately (replay path — the round-two rows already exist, so connecting on mount incurs no LLM cost). Persona list derives from the participating round-one personas.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Linting passes (no new `console.*`): `npm run lint`
- Build passes: `npm run build`

#### Manual Verification:

- Fresh session: after round one yields ≥2 opinions the "Runda 2" trigger is enabled; clicking it
  streams the round-two panel; ≥1 card shows a score delta and a "Przekonał: …" badge with the quoted
  argument; unchanged advisors show no badge.
- Reloading the page replays both rounds with no new LLM spend; round-two deltas/attribution render
  identically.
- Keyboard-reach the trigger and cards; `aria-live` announces streamed text; layout holds at 375px and
  1280px; animations disabled under `prefers-reduced-motion`.
- With a partial round one (one persona errored), round two runs for the survivors only and the failed
  persona is absent.

**Implementation Note**: After completing this phase and all automated verification passes, pause here
for manual confirmation. This is the last phase.

---

## Testing Strategy

### Unit Tests:

- Round-two schema: valid attribution, null attribution, rejected self/blank quote.
- Prompt builders: peer heads embedded; conditional-attribution instruction present.
- `runSecondRoundPanel`: only `priorHeads` personas run; peer exclusion of self; partial failure;
  abort propagation.
- `SessionService.runSecondRound`: availability gate, replay, `previousScore` derivation, invariant
  enforcement (attribution iff score changed), metrics line.
- Repository: round-two `saveOpinions`/`getOpinions` round-trip of attribution columns.

### Integration Tests:

- `?round=2` end-to-end against a fake provider through the endpoint: live stream then reload replay,
  honoring the unique constraint.

### Manual Testing Steps:

1. Create a session, run round one on a substantive decision.
2. Click "Runda 2"; confirm ≥1 score change with a named + quoted attribution.
3. Reload; confirm both rounds replay with no new cost and `sessions.status = 'active'`.
4. Inspect logs for the round-two metrics line; sanity-check attribution genuineness on 2–3 real
   sessions (PRD OQ#2 evaluation).
5. Force a round-one persona failure; confirm graceful round-two degradation.

## Performance Considerations

Round two is the same parallel four-persona fan-out as round one — the known Cloudflare edge
streamed-response limit (F-01 gotcha) is exercised again. Replay-by-unique-constraint caps cost:
each round runs at most once per session. No new hotspots.

## Migration Notes

Single additive, forward-only migration; existing round-one rows keep the new columns null. No
backfill. Do not edit the applied create migration.

## References

- Sibling (round one) plan: `context/archive/2026-09-25-first-divergent-round/plan.md`
- Fan-out to extend: `src/lib/advisors/run-panel.ts:72`
- Service to mirror: `src/lib/services/session.service.ts:131`
- Round-aware persistence: `src/lib/repositories/session.repository.ts:65`
- Create migration (RLS + unique key pattern): `supabase/migrations/20260923140522_create_sessions_and_advisor_opinions.sql`
- Rules: `.claude/rules/backend.md` §1–7, `.claude/rules/frontend.md` §3–6, `context/foundation/lessons.md`
- PRD: FR-004, FR-010, Success Criteria (Secondary), Open Question #2 — `context/foundation/prd.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data model — attribution migration + schemas

#### Automated

- [ ] 1.1 Migration applies cleanly against a local Supabase: `npx supabase db reset`
- [ ] 1.2 Schema unit tests pass (round-two schema accepts valid + null attribution; rejects self/blank quote): `npm run test -- advisor session`
- [ ] 1.3 Type checking passes: `npx astro check`
- [ ] 1.4 Linting passes: `npm run lint`

#### Manual

- [ ] 1.5 Supabase Studio shows the three new nullable columns + two CHECK constraints; valid round-two insert succeeds, co-presence-violating insert rejected

### Phase 2: Peer-aware round-two prompts + registry

#### Automated

- [ ] 2.1 Registry/prompt unit tests pass (both round-two builders per persona; peer labels + conditional-attribution instruction present): `npm run test -- registry prompts`
- [ ] 2.2 Type checking passes: `npx astro check`
- [ ] 2.3 Linting passes: `npm run lint`

#### Manual

- [ ] 2.4 Spot-read one generated round-two prompt: peer positions present, attribution rule unambiguous, no isolation language leaked

### Phase 3: Round-two peer-aware fan-out

#### Automated

- [ ] 3.1 Fan-out unit tests pass (only `priorHeads` personas run; peer self-exclusion; partial failure; abort cancels all): `npm run test -- run-panel`
- [ ] 3.2 Type checking passes: `npx astro check`
- [ ] 3.3 Linting passes: `npm run lint`

#### Manual

- [ ] 3.4 With a 3-entry `priorHeads` map, exactly three persona streams start; each peer list excludes self

### Phase 4: SessionService.runSecondRound + persistence + metrics

#### Automated

- [ ] 4.1 Service unit tests pass (availability gate; replay; `previousScore` + attribution persistence; attribution dropped when score unchanged; attribution naming a non-participant dropped + changed-score persona fails; metrics line): `npm run test -- session.service`
- [ ] 4.2 Repository test covers round-two `saveOpinions` attribution columns: `npm run test -- session.repository`
- [ ] 4.3 Type checking passes: `npx astro check`
- [ ] 4.4 Linting passes: `npm run lint`

#### Manual

- [ ] 4.5 Real session: round-two rows persisted; changed persona has non-null attribution columns, unchanged persona all null

### Phase 5: Endpoint — `?round=2` routing

#### Automated

- [ ] 5.1 Type checking passes: `npx astro check`
- [ ] 5.2 Linting passes: `npm run lint`
- [ ] 5.3 Auth-flow smoke still green: `npm run smoke`

#### Manual

- [ ] 5.4 `curl -N` `?round=2` streams attribution frames; `?round=3` → 400; `?round=2` without round one → `ROUND_TWO_UNAVAILABLE`

### Phase 6: Frontend — trigger + round-two panel

#### Automated

- [ ] 6.1 Type checking passes: `npx astro check`
- [ ] 6.2 Linting passes (no new `console.*`): `npm run lint`
- [ ] 6.3 Build passes: `npm run build`

#### Manual

- [ ] 6.4 Round-two trigger enables after ≥2 round-one opinions; streaming shows ≥1 delta + "Przekonał: …" badge with quote; unchanged advisors show no badge
- [ ] 6.5 Reload replays both rounds with no new LLM spend; `sessions.status` stays `active`
- [ ] 6.6 Keyboard reach + `aria-live` + 375px/1280px + `prefers-reduced-motion` all pass
- [ ] 6.7 Partial round one: round two runs for survivors only; failed persona absent

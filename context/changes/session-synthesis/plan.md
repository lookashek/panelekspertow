# Session Synthesis Implementation Plan

## Overview

Add the "explicitly end the session → receive a synthesis" capability (S-03, FR-005, FR-010, US-01). When the user ends a session, a single **synthesizer** LLM call reads each persona's latest opinion and produces four structured sections — points of agreement, **at least one real axis of dispute** (mandatory), risks by weight, and a recommended next step — plus a short prose narrative. The synthesis is streamed over a dedicated SSE endpoint, persisted to a new `session_syntheses` table, and marks the session `completed` (read-only, idempotent replay). The mandatory dispute axis is the product's core anti-averaging guardrail: the synthesis must never collapse into a single smoothed verdict.

## Current State Analysis

The debate loop is fully built up to round two:

- **Rounds 1 & 2** stream over `GET /api/sessions/[id]/stream?round=1|2` (`src/pages/api/sessions/[id]/stream.ts`), SSE frames `score|token|done|error`, abort-wired, `persistTail` on `waitUntil`.
- **`SessionService`** (`src/lib/services/session.service.ts`) owns `runFirstRound` / `runSecondRound`: ownership check (RLS + explicit `session.userId !== userId → NotFound`), replay-if-persisted vs live, persist-and-log in a `waitUntil` tail.
- **`run-panel.ts`** fans out per-persona `complete()` (structured head, Zod-validated) then `stream()` (prose) via `fanOutPanel`; a single synthesizer needs the two-phase shape but not the fan-out.
- **`SessionRepository`** (`src/lib/repositories/session.repository.ts`) is the only Supabase caller; `sessions.status` is already `'active' | 'completed'` with an `sessions_update_own` RLS UPDATE policy, but nothing sets `completed` yet.
- **`OpenRouterAdapter.complete()`** already retries once with the validation error appended, then returns `LLM_INVALID_OUTPUT` (`openrouter.adapter.ts:131-154`) — the dispute-axis `.min(1)` enforcement rides on this for free.
- **Frontend**: `src/pages/sessions/[id].astro` SSR-checks state (round-one/two records) and mounts islands; `RoundTwoPanel.tsx` gates a trigger button that mounts the streaming child (`usePanelStream(..., 2)`) only on click, and mounts it immediately when a persisted round exists (`hasRoundTwo`).

### Key Discoveries:

- Round-two attribution (commits `cbfe9ed`, `0120bea`, `3768463`) is the exact template for every layer here — schema → prompt → orchestration → service → endpoint → island — and is only days old.
- `sessions_update_own` policy exists (`20260923140522_...sql:48-51`), so the repository can flip `status` to `completed` under RLS with no new policy.
- `complete()`'s retry-then-`LLM_INVALID_OUTPUT` path (`openrouter.adapter.ts:139-154`) means a schema-level `disputeAxes.min(1)` is automatically retried and, if still empty, surfaced as an error — no bespoke enforcement code needed.
- `usePanelStream` is per-persona keyed; synthesis is a single generator, so it needs its own hook (`useSynthesisStream`) rather than reusing the persona-map shape.
- Schemas shared with the client bundle must not import the advisor registry (persona prompts) — see `schemas/advisor.ts:22-27` and `schemas/panel.ts`. The synthesis schema will follow that rule.
- `defaultAdvisorModel()` is the only model accessor; the synthesizer reuses it (no new env var).

## Desired End State

A user viewing a session with at least round one complete sees an "END SESSION" trigger. Activating it opens an SSE stream that renders, live: agreement points, one or more dispute axes, weighted risks (high/medium/low badges), a recommended next step, and a prose narrative. The synthesis is saved; the session is marked `completed`; reloading the page replays the persisted synthesis with no further LLM cost, and the trigger is gone (session is read-only). If the model cannot produce a dispute axis after the built-in retry, the user sees an error state with retry rather than a fabricated consensus.

Verify: run round one on a fresh session, click END SESSION, watch the four sections + narrative stream in; reload → identical synthesis replays instantly; DB shows one `session_syntheses` row and `sessions.status = 'completed'`; a second session run to round two synthesizes from the round-two heads.

## What We're NOT Doing

- **No synthesis regeneration / refinement** — generating is terminal and idempotent (replay). A "re-run synthesis" affordance is out of scope (candidate for a later slice).
- **No new rounds after completion** — completing the session locks it; resuming with new context is S-06 (`resume-session-round`), not this slice.
- **No fabricated dispute fallback** — if the model returns zero dispute axes after retry, the synthesis fails loudly; we never synthesize a fake axis.
- **No per-persona fan-out for synthesis** — one synthesizer voice over all opinions, not four.
- **No new LLM model/env var** — reuse `DEFAULT_ADVISOR_MODEL`.
- **No changes to round-one/round-two behavior**, prompts, or the existing stream endpoint's `round` semantics.
- **No rate-limiting / cost-guardrail work** beyond the idempotent-replay property (backend.md §7 rate limiting is a separate concern, not introduced here).

## Implementation Approach

Mirror the round-two-attribution layering exactly, replacing "per-persona fan-out" with "single synthesizer". Bottom-up: (1) the shared Zod schema + versioned prompt establish the contract the adapter validates; (2) the migration + repository give persistence and the status transition; (3) `run-synthesis.ts` wires one `complete()` + `stream()` with shared abort; (4) the service method orchestrates ownership/merge/replay/persist and a new SSE route frames it; (5) the island renders it. Each phase is independently type-checkable and testable against the existing vitest suite.

## Critical Implementation Details

- **Merge order (latest-per-persona)** — Phase 3/4 must build the synthesizer input by taking each persona's round-2 record if present, else its round-1 record, preserving `ADVISOR_REGISTRY` order. Round two only ever contains a subset of personas (participants), so the merge is "round-2 record overrides round-1 record per persona id", not "round 2 replaces round 1 wholesale". Getting this wrong either drops non-participating personas or double-counts them.
- **Persist tail must succeed before replay is correct** — the synthesis row and the `status='completed'` flip happen in the same `waitUntil` tail after the stream is consumed (same pattern as round persistence). Order: save synthesis row first, then flip status; if the save fails, do **not** flip status (a `completed` session with no synthesis row would render an empty terminal state on reload). Log both outcomes.
- **Dispute-axis guardrail is schema-only** — do not add imperative "if empty then…" checks; `disputeAxes: z.array(...).min(1)` inside the schema handed to `complete()` is the single enforcement point, and the adapter's existing retry/`LLM_INVALID_OUTPUT` path does the rest.

## Phase 1: Synthesis schema + prompt

### Overview

Define the structured contract for a synthesis and the versioned prompt that produces it. No wiring yet — this phase is pure, unit-testable functions.

### Changes Required:

#### 1. Synthesis Zod schema

**File**: `src/lib/schemas/synthesis.ts` (new)

**Intent**: Define `SynthesisSchema` — the structured head the synthesizer's `complete()` call validates against — enforcing the mandatory dispute axis and weighted risks at the schema boundary. Client-bundle-safe (no registry import), same as `schemas/advisor.ts`.

**Contract**: Export `SynthesisSchema` and `type Synthesis = z.infer<...>`. Shape:
- `agreementPoints: z.array(z.string().min(1))` (may be empty — genuine full dispute is valid)
- `disputeAxes: z.array(DisputeAxisSchema).min(1)` — **mandatory**; each axis `{ title: string.min(1), positions: z.array(z.string().min(1)).min(2) }` (an axis needs at least two opposing positions to be a real dispute, not a lone concern)
- `risks: z.array(RiskSchema)` where `RiskSchema = { description: string.min(1), weight: z.enum(["high","medium","low"]) }`
- `recommendedNextStep: z.string().min(1)`

The `.min(1)` on `disputeAxes` is the enforcement point for the "at least one real axis of dispute" guardrail — no imperative check elsewhere.

#### 2. Versioned synthesis prompt

**File**: `src/lib/prompts/synthesis.v1.ts` (new)

**Intent**: Two prompt builders mirroring the persona prompt files: a structured-JSON builder for `complete()` and a prose-narrative builder for `stream()`. The synthesizer is a neutral meta-role that must *surface* dispute, never resolve it into an average.

**Contract**: Define a `SynthesisInput` shape (the panel `decision`/`context` plus the merged per-persona heads with labels and scores — a `{ label, head }[]` list analogous to `RoundOnePeer`). Export:
- `buildSynthesisPrompt(input: SynthesisInput): { system, user }` — system prompt instructs: neutral synthesizer, must output ≥1 real dispute axis with ≥2 opposing positions, must NOT smooth into consensus, risks tagged high/medium/low by materiality, one concrete next step; JSON-only, exact shape matching `SynthesisSchema`.
- `buildSynthesisRationalePrompt(input, synthesis: Synthesis): { system, user }` — prose narrative in Polish tying the sections together, no JSON/markdown, does not restate scores mechanically. Follows the "second stage, don't re-decide" framing used in `advisor-*.v1.ts` rationale builders.

Keep all user-facing prompt text Polish, consistent with the persona prompts.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npm run build` (astro check)
- Linting passes: `npm run lint`
- New unit test passes: `SynthesisSchema` rejects `disputeAxes: []`, rejects a dispute axis with `<2` positions, accepts a valid synthesis, and rejects an invalid `weight` value (`src/lib/schemas/synthesis.test.ts`)
- Prompt builders return non-empty `system`/`user` and embed every persona head passed in (`src/lib/prompts/synthesis-prompts.test.ts`)

#### Manual Verification:

- Read the generated `buildSynthesisPrompt` output for a sample panel and confirm it explicitly forbids consensus-smoothing and demands ≥1 dispute axis in Polish.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Migration + repository

### Overview

Persist a synthesis 1:1 with its session and provide the `status='completed'` transition, following the established RLS + repository patterns.

### Changes Required:

#### 1. `session_syntheses` table migration

**File**: `supabase/migrations/<timestamp>_create_session_syntheses.sql` (new, timestamp via `YYYYMMDDHHmmss`)

**Intent**: Additive, forward-only table holding one synthesis per session, with RLS mirroring `sessions`/`advisor_opinions`. Structured content stored as JSONB (validated by Zod on read, per the "validate every DB boundary" rule).

**Contract**: `-- FR-005, FR-010` header comment. Columns: `id uuid pk default gen_random_uuid()`, `session_id uuid not null references sessions(id) on delete cascade`, `user_id uuid not null default auth.uid() references auth.users(id) on delete cascade`, `content jsonb not null`, `narrative text not null default ''`, `created_at timestamptz not null default now()`, `unique (session_id)` (enforces 1:1 + idempotent upsert target). Enable RLS; add per-op policies for `authenticated` (`select`/`insert`/`update`/`delete`, `auth.uid() = user_id`), no `anon` policies — copy the shape from the create migration exactly.

#### 2. Row schema + domain mapping

**File**: `src/lib/schemas/session.ts` (extend)

**Intent**: Add the row schema and snake→camel mapper for `session_syntheses`, alongside the existing session/opinion mappers.

**Contract**: Export `SessionSynthesisRowSchema` (`content` validated against `SynthesisSchema` from Phase 1, `narrative: z.string()`, plus id/session_id/user_id/created_at) and `toSessionSynthesis(row): SessionSynthesis`. Add the `SessionSynthesis` domain type to `src/types/session.ts` (`{ id, sessionId, userId, content: Synthesis, narrative, createdAt }`).

#### 3. Repository methods

**File**: `src/lib/repositories/session.repository.ts` (extend)

**Intent**: Add the three DB operations synthesis needs: read persisted synthesis, save it, and mark the session completed.

**Contract**:
- `getSynthesis(sessionId: string): Promise<Result<SessionSynthesis | null, DbError>>` — `.eq("session_id").maybeSingle()`, parse via `SessionSynthesisRowSchema`, map, `null` when absent.
- `saveSynthesis(sessionId, input: { content: Synthesis; narrative: string }): Promise<Result<SessionSynthesis, DbError>>` — insert (unique `session_id`), select single, parse+map.
- `completeSession(sessionId: string): Promise<Result<void, DbError>>` — update `sessions` set `status = 'completed'`, `updated_at = now()`.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Type checking passes: `npm run build`
- Repository unit tests pass for `getSynthesis` (present/absent), `saveSynthesis`, `completeSession` against the existing mocked-client test style (`src/lib/repositories/session.repository.test.ts`)
- Row schema round-trip test: a valid row maps to the domain type; a row with invalid `content` fails validation (`src/lib/schemas/session.test.ts`)

#### Manual Verification:

- Apply the migration to a local Supabase (`supabase db reset` or push) and confirm the table + policies exist and RLS blocks cross-user reads (attempt a select as a different user returns nothing).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Synthesis orchestration

### Overview

The single-generator analogue of `run-panel.ts`: merge the panel's latest-per-persona heads, run one two-phase (`complete()` → `stream()`) synthesizer call with shared abort wiring.

### Changes Required:

#### 1. Synthesis runner

**File**: `src/lib/advisors/run-synthesis.ts` (new)

**Intent**: Given a provider, the panel input, and the merged per-persona heads, fire the structured `complete()` then stream the prose rationale — reusing `defaultAdvisorModel()` and the caller-signal → shared-controller pattern from `run-panel.ts` (so caller abort cancels the in-flight call). No fan-out, no per-persona loop.

**Contract**: Export `runSynthesis(deps: { provider: LlmProvider }, input: SynthesisInput, signal?: AbortSignal): { synthesis: Promise<Result<Synthesis, LlmError>>; stream: ReadableStream<StreamChunk> }`. `synthesis` resolves the `complete()` call validated against `SynthesisSchema`; `stream` yields the prose `StreamChunk`s but only after the head resolves successfully (on head failure, the stream emits a single `error` chunk carrying the same `LlmError` and closes — mirror `fanOutPanel`'s "completion failed → enqueue error, return" branch). Pass `persona: "synthesis"` and `promptVersion: "v1"` for logging.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Type checking passes: `npm run build`
- Unit tests pass with a stubbed `LlmProvider`: head success → stream drains prose tokens; head failure → stream emits one `error` chunk and closes, `synthesis` resolves `err`; caller abort cancels the provider call (`src/lib/advisors/run-synthesis.test.ts`)

#### Manual Verification:

- None beyond automated (pure orchestration; exercised end-to-end in Phase 4/5).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Service method + SSE endpoint

### Overview

Orchestrate ownership, head-merge, replay-vs-live, and the persist-tail (save synthesis → complete session), then expose it over a dedicated SSE route.

### Changes Required:

#### 1. `SessionService.runSynthesis`

**File**: `src/lib/services/session.service.ts` (extend)

**Intent**: The use-case orchestration for ending a session. Ownership check (RLS + explicit), load round-one and round-two opinions, merge latest-per-persona, replay if a synthesis already exists, else run live and persist in a `waitUntil` tail. Emits a synthesis-shaped event stream analogous to `PanelRunView`.

**Contract**: Add a `SynthesisRunEvent` union: `{ kind: "synthesis"; synthesis: Synthesis } | { kind: "token"; text: string } | { kind: "done" } | { kind: "error"; code; message }` and a `SynthesisRunView { events: AsyncIterable<SynthesisRunEvent>; persistTail?: Promise<void> }`. Method `runSynthesis(sessionId, userId): Promise<Result<SynthesisRunView>>`:
- ownership check → `NotFoundError` (reuse the `session?.userId !== userId` pattern);
- `getSynthesis` → if present, return a replay view (yield one `synthesis` event with `content`, then `token` chunks reconstructed from the persisted `narrative` as a single token, then `done`) — no LLM call;
- else load round 1 + round 2 opinions; require round-one non-empty (else a domain error — reuse/extend an existing error code, e.g. a `SynthesisUnavailableError` if round one is empty); merge latest-per-persona in registry order into `SynthesisInput`;
- run `runSynthesis` (Phase 3), build a live event generator (mirror `buildLiveEvents`: await head → emit `synthesis` or `error`, then drain prose stream → `token`/`done`/`error`);
- `persistTail`: await head; on success, `saveSynthesis({ content, narrative })` then — only if save ok — `completeSession`; log both. On head failure, persist nothing.

Add `SynthesisUnavailableError` to `src/lib/errors.ts` (+ `ErrorCode.SYNTHESIS_UNAVAILABLE`, status 400) only if round-one-empty is reachable; otherwise reuse `NotFoundError`. (Decide during impl: the SSR page won't show the trigger without round one, but the endpoint is directly reachable, so a guard is warranted.)

#### 2. SSE endpoint

**File**: `src/pages/api/sessions/[id]/synthesis.ts` (new)

**Intent**: Dedicated SSE route (not the numbered-round stream) that frames `SynthesisRunEvent`s. Auth, config, abort, and `waitUntil` handling copied from the round stream handler.

**Contract**: `GET` handler ≤~30 lines: auth from `locals.user` → 401; require `params.id` → 400; build client + provider (503 `NOT_CONFIGURED` if null); `service.runSynthesis(id, user.id)`; map `Result` error via `errorResponse`; wire `view.persistTail` to `locals.cfContext?.waitUntil`; stream SSE frames via a `frameFor` mapping the four event kinds to `event: synthesis|token|done|error`. No `round` query param.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Type checking passes: `npm run build`
- Service unit tests pass: replay path (synthesis present → no provider call, emits persisted content + done); live path (head success → `synthesis` then `token`/`done`, persistTail saves then completes); head failure → `error` event, persistTail saves nothing and does NOT complete session; not-owned → `NotFound`; round-one-empty → the chosen error (`src/lib/services/session.service.test.ts`)
- `npm run smoke` passes against a running server (auth/API route touched)

#### Manual Verification:

- `curl -N` the endpoint for a session with round one complete and confirm SSE frames arrive in order (`synthesis`, then `token`s, then `done`); a second `curl` replays instantly with no new LLM logs.
- Confirm the DB shows one `session_syntheses` row and `sessions.status='completed'` after the first call.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 5: Frontend — end-session trigger + synthesis panel

### Overview

Surface the trigger and render the streamed synthesis, following the `RoundTwoPanel` gating pattern (mount the streaming child on click, or immediately on reload when a synthesis exists).

### Changes Required:

#### 1. Synthesis stream hook

**File**: `src/components/advisor-panel/useSynthesisStream.ts` (new)

**Intent**: Single-generator SSE hook (not per-persona) exposing the synthesis view state. Consumes `/api/sessions/[id]/synthesis`; supports abort on unmount; does not import the registry.

**Contract**: `useSynthesisStream(sessionId): { status: "pending"|"streaming"|"done"|"error"; synthesis?: Synthesis; narrative: string; error?: string }`. Listens for `synthesis` (set `synthesis`, status `streaming`), `token` (append to `narrative`), `done` (status `done`), `error` (status `error`, message) — mirroring `usePanelStream`'s EventSource lifecycle and the reserved-`error`-event handling.

#### 2. Synthesis panel island

**File**: `src/components/advisor-panel/SynthesisPanel.tsx` (new)

**Intent**: Gate an "END SESSION" trigger that mounts the streaming child on click; mount immediately when `hasSynthesis`. Render the four structured sections + prose narrative with loading/error/empty states (frontend.md §8).

**Contract**: Props `{ sessionId, available: boolean, hasSynthesis: boolean }`. `available` gates whether the section renders at all (round one complete). Structure mirrors `RoundTwoPanel`: `useState(hasSynthesis)` for `started`; button "ZAKOŃCZ SESJĘ" when not started; child `<SynthesisStream>` calling the hook otherwise. Render: agreement points list; dispute axes (each title + its positions, visually emphasized as the headline guarantee); risks grouped/sorted high→low with a pixel severity badge per weight (number+label, not color-only — frontend.md §6); recommended next step; prose narrative in an `aria-live="polite"` region. Use existing pixel tokens/`cn()`, no new hardcoded colors, respect `prefers-reduced-motion`.

#### 3. SSR wiring

**File**: `src/pages/sessions/[id].astro` (extend)

**Intent**: Compute `synthesisAvailable` (round one present) and `hasSynthesis` (persisted) in frontmatter and mount `SynthesisPanel` below `RoundTwoPanel`.

**Contract**: In the existing `if (id && user)` block, set `synthesisAvailable = roundOneRecords.length > 0` and `hasSynthesis = (await repository.getSynthesis(id)).ok && value !== null`. Render `<SynthesisPanel sessionId={sessionId} available={synthesisAvailable} hasSynthesis={hasSynthesis} client:load />`.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Type checking passes: `npm run build`
- Component/hook unit tests pass if a runner covers them (render dispute axes always shown; risks render weight label text; error state shows retry) — otherwise covered by manual verification

#### Manual Verification:

- On a session with round one complete: "ZAKOŃCZ SESJĘ" appears; clicking streams the four sections + narrative live; the dispute axis is visually prominent.
- Reload: synthesis replays instantly, trigger is gone, no new LLM logs.
- Keyboard + screen reader: trigger focusable, narrative announced via `aria-live`, risk weights conveyed by text not color alone.
- 375px and 1280px layouts hold; animations disabled under `prefers-reduced-motion`.
- Error path: simulate a head failure (e.g. misconfigured model) → error state with retry, no partial persistence.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Unit Tests:

- `SynthesisSchema`: rejects empty `disputeAxes`, axis with `<2` positions, invalid `weight`; accepts valid synthesis.
- Prompt builders: embed every head, forbid consensus, Polish text present.
- Repository: `getSynthesis` present/absent, `saveSynthesis`, `completeSession`.
- `runSynthesis` orchestration: head success/failure, abort propagation.
- `SessionService.runSynthesis`: replay, live, head-failure-no-persist, ownership, round-one-empty.

### Integration Tests:

- `npm run smoke` extended path (session create → round one → synthesis) if the smoke script grows a synthesis step; otherwise the existing smoke plus manual `curl -N`.

### Manual Testing Steps:

1. Fresh session → run round one → END SESSION → verify four sections + narrative stream in, dispute axis prominent.
2. Reload → verify instant replay, no new LLM logs, trigger gone.
3. Run a second session through round two → verify synthesis reflects round-two heads (latest-per-persona).
4. Force a head failure → verify error+retry, no `session_syntheses` row, session still `active`.
5. Cross-user access: attempt the endpoint with another user's session id → 404/empty.

## Performance Considerations

Single LLM call per synthesis (one `complete()` + one `stream()`), well within the Workers "one debate round per handler" constraint (backend.md §5). Idempotent replay means at most one synthesis generation per session — no repeat cost. Persist-tail runs on `waitUntil`, off the response path.

## Migration Notes

Forward-only additive migration; no backfill (existing sessions simply have no synthesis row and show the trigger if they have round one). The `sessions.status` column and its UPDATE policy already exist — no change to `sessions` schema.

## References

- Similar implementation (the template for every layer): round-two attribution — `src/lib/services/session.service.ts:332` (`runSecondRound`), `src/pages/api/sessions/[id]/stream.ts`, `src/components/advisor-panel/RoundTwoPanel.tsx`, `supabase/migrations/20260929070318_add_round_two_attribution.sql`
- Adapter retry contract: `src/lib/adapters/openrouter.adapter.ts:131-154`
- RLS pattern + `sessions_update_own`: `supabase/migrations/20260923140522_create_sessions_and_advisor_opinions.sql:48-51`
- PRD: FR-005, FR-010, US-01 (`context/foundation/prd.md`); Roadmap S-03 (`context/foundation/roadmap.md:133`)
- Lessons: RLS + explicit ownership check (both); no leading-underscore route paths (`context/foundation/lessons.md`)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Synthesis schema + prompt

#### Automated

- [x] 1.1 Type checking passes: `npm run build`
- [x] 1.2 Linting passes: `npm run lint`
- [x] 1.3 `SynthesisSchema` unit test: rejects empty disputeAxes, axis with <2 positions, invalid weight; accepts valid synthesis
- [x] 1.4 Prompt-builder unit test: builders return non-empty system/user and embed every head

#### Manual

- [ ] 1.5 Read `buildSynthesisPrompt` output: explicitly forbids consensus-smoothing, demands ≥1 dispute axis, Polish

### Phase 2: Migration + repository

#### Automated

- [ ] 2.1 Linting passes: `npm run lint`
- [ ] 2.2 Type checking passes: `npm run build`
- [ ] 2.3 Repository unit tests: `getSynthesis` (present/absent), `saveSynthesis`, `completeSession`
- [ ] 2.4 Row schema round-trip test: valid row maps; invalid `content` fails validation

#### Manual

- [ ] 2.5 Apply migration locally; confirm table + per-op policies exist and RLS blocks cross-user reads

### Phase 3: Synthesis orchestration

#### Automated

- [ ] 3.1 Linting passes: `npm run lint`
- [ ] 3.2 Type checking passes: `npm run build`
- [ ] 3.3 `runSynthesis` unit tests: head success drains prose; head failure emits one error chunk + closes; abort cancels provider call

### Phase 4: Service method + SSE endpoint

#### Automated

- [ ] 4.1 Linting passes: `npm run lint`
- [ ] 4.2 Type checking passes: `npm run build`
- [ ] 4.3 Service unit tests: replay, live, head-failure-no-persist, not-owned→NotFound, round-one-empty error
- [ ] 4.4 `npm run smoke` passes against a running server

#### Manual

- [ ] 4.5 `curl -N` the endpoint: SSE frames arrive in order; second call replays instantly with no new LLM logs
- [ ] 4.6 DB shows one `session_syntheses` row and `sessions.status='completed'` after first call

### Phase 5: Frontend — end-session trigger + synthesis panel

#### Automated

- [ ] 5.1 Linting passes: `npm run lint`
- [ ] 5.2 Type checking passes: `npm run build`
- [ ] 5.3 Component/hook unit tests pass (if runner covers them): dispute axes always shown, risk weight label text, error state shows retry

#### Manual

- [ ] 5.4 Trigger appears with round one complete; clicking streams four sections + narrative live; dispute axis prominent
- [ ] 5.5 Reload replays instantly, trigger gone, no new LLM logs
- [ ] 5.6 Keyboard + screen reader pass; risk weight conveyed by text not color alone
- [ ] 5.7 375px and 1280px layouts hold; animations disabled under `prefers-reduced-motion`
- [ ] 5.8 Error path: head failure → error+retry, no partial persistence

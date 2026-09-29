# Resume Session Round (S-06) Implementation Plan

## Overview

Let a signed-in user return to a **saved session** (from history, S-05), **add new context**, and **run another confrontation round** on top of the debate so far — closing FR-008. "Another round" generalizes the existing round-two mechanic (peer-aware confrontation + attributed score changes) to an arbitrary round N: each resumed round seeds off the latest head per persona (round N-1) plus all context added so far, and score changes still require naming the peer argument that convinced the persona. Cost is bounded three ways per the roadmap/PRD: a hard **5-round cap** per session, a **per-user rate limit** on the round-starting endpoint, and **shorter responses for rounds > 2** (lower max-tokens + fewer arguments). Reopening a *completed* (already-synthesized) session flips it back to `active` and deletes the now-stale synthesis, so the synthesis a user sees always reflects the latest rounds.

## Current State Analysis

- **Rounds are hard-coded to 1 and 2.** The SSE stream route validates `round` with `z.coerce.number().int().min(1).max(2)` and branches `round === 2 ? runSecondRound : runFirstRound` (`src/pages/api/sessions/[id]/stream.ts:12,71-73`). The client hook types `round: 1 | 2` (`src/components/advisor-panel/usePanelStream.ts:62`).
- **The confrontation mechanic already exists and is reusable.** `runSecondRound` (`src/lib/services/session.service.ts:440`) does ownership check → read round-1 heads → build `priorHeads`/`priorScores` → filter participants → `runSecondRoundPanel` → persist via `persistRoundTwoAndLogMetrics`, with `resolveRoundTwo` (`:78`) enforcing the attribution invariant. `runSecondRoundPanel` (`src/lib/advisors/run-panel.ts:181`) reuses the generic `fanOutPanel`; the only round-two-specific pieces are the peer-aware prompt builders and `AdvisorRoundTwoOpinionSchema`. **Nothing about it is intrinsically "round 2" except that it reads round-1 as prior** — it seeds from a `priorHeads` map the caller supplies.
- **Synthesis reads rounds 1 and 2 explicitly** and merges latest-per-persona (round-2 record ?? round-1 record) in registry order (`src/lib/services/session.service.ts:518-548`), then `completeSession` flips status to `completed` (`:794`). This merge must generalize to "latest round per persona across all rounds."
- **`context` is a single, immutable `text` column** set at `createSession` (`sessions.context`, migration `20260923140522_...:11`; repo `createSession` `:76`). There is no per-round context storage anywhere.
- **`advisor_opinions` already permits round ≥ 3**: `round_number integer ... check (round_number >= 1)` + `unique (session_id, persona_id, round_number)` (migration `20260923140522_...:23,28`). Round N is a code/mechanic problem, **not** a schema-cap problem.
- **No `max_tokens` is ever sent to OpenRouter.** `CompleteRequest`/`StreamRequest` have no token-limit field (`src/lib/adapters/llm-provider.ts:16-39`); the adapter body omits `max_tokens` (`src/lib/adapters/openrouter.adapter.ts:74-80,188-193`). "Shorter responses" requires adding an optional `maxTokens` to the port + body.
- **`arguments` schema has no upper bound**: `z.array(z.string().min(1)).min(1)` (`src/lib/schemas/advisor.ts:17`). Capping argument count for later rounds is a **prompt-instruction** concern, not a schema change.
- **Persist-before-stream is the established crash-safe pattern.** The side-thread flow persists the user's question, then streams the answer (`src/lib/services/session.service.ts:642-667`); `EventSource` is GET-only, so added context cannot ride the stream request — it must be POSTed and persisted first.
- **The detail page renders a fixed 3-panel stack**: `AdvisorPanel` (round 1), `RoundTwoPanel` (round 2), `SynthesisPanel` (`src/pages/sessions/[id].astro:94-112`). `RoundTwoPanel` mounts its streaming child only after the user clicks, so no `EventSource` opens (no LLM cost) until activation (`src/components/advisor-panel/RoundTwoPanel.tsx:47-71`).
- **Ownership pattern is RLS + explicit service-side check** for by-id reads (`session.service.ts:414`, lessons.md:26). Every new by-id/mutation path must keep both.
- **Rate-limit precedent exists**: side-thread uses a DB count over a time window (`countRecentSideThreadMessagesByUser`, repo `:336`; `SIDE_THREAD_RATE_*`, `registry.ts:61-62`). Reuse this shape for resumed rounds.

### Key Discoveries

- Generalizing round two is mostly *parameterization*: `runSecondRoundPanel` already takes `priorHeads` from the caller, so a round-N confrontation is "same runner, prior = round N-1 heads" (`run-panel.ts:181-228`).
- The `session_rounds` table doubles as the **round-limit counter** and the **added-context store** — one table serves both cost-control and the FR-008 "add context" requirement.
- Because `EventSource` is GET-only and added context must be persisted before the LLM runs, the resume flow splits into **POST `/resume` (persist round + reopen + drop synthesis) → GET `/stream?round=N` (run/replay)** — exactly the side-thread persist-then-stream shape.
- Deleting the stale synthesis on reopen means the *existing* `getSynthesis`-returns-null UI path handles the "no current synthesis" state with **no new column or flag** (`SynthesisPanel` already renders the not-yet-generated state).

## Desired End State

A signed-in user opens a saved session at `/sessions/[id]` (reached from history, S-05). Below the existing rounds and synthesis, a **"KOLEJNA RUNDA"** panel offers a textarea for new context and a run button. On submit, the app persists the new context, reopens the session if it was completed (removing the stale synthesis), and streams a fresh confrontation round in which each persona reacts to the others' latest positions and any score change names the peer argument that moved it — with terser output than rounds 1–2. The user can end the session again for a fresh synthesis. Once the session has reached 5 total rounds, the panel is disabled with an explanatory message. A second account can never resume or see another user's session.

Verify: unit tests cover the generalized confrontation runner, the `startResumedRound` guards (cap, empty-context, reopen/delete-synthesis), and the generalized synthesis merge. Manually: run rounds 1→2, resume with new context (round 3), confirm attribution + shorter output, end for a fresh synthesis, hit the 5-round cap, and confirm cross-account isolation + rate limiting.

## What We're NOT Doing

- **No response cache.** Resumed rounds always carry new context, so cache-hit rate is ~zero (user decision); explicitly out of scope.
- **No per-round *isolated* (round-one-style) resume.** Every resumed round is a confrontation round (user decision). No per-round mechanic picker.
- **No synthesis history.** The stale synthesis is *deleted* on reopen, not versioned (user decision); we do not retain prior syntheses or add an `is_current`/superseded flag.
- **No resume action on the history list rows (S-05).** The entry point is a panel on the detail page only (user decision); S-05's list is untouched.
- **No optional/empty-context resume.** New context is required to start a resumed round (user decision).
- **No new synthesis re-run trigger UI** — reuse the existing `SynthesisPanel` "end session → synthesize" affordance, which reappears once the synthesis row is gone.
- **No schema change to `advisor_opinions`** — round ≥ 3 already fits the existing table and unique key.
- **No editing/removing already-added context** — added context is append-only per round.
- **No changes to round 1 / round 2 behavior or output length** — conciseness applies only to rounds > 2.

## Implementation Approach

Five phases, bottom-up by layer so each has a clean verification surface: (1) the `session_rounds` table + repository methods; (2) the provider `maxTokens` plumbing + the generalized confrontation panel runner + constants; (3) the service use cases (`runConfrontationRound`, `startResumedRound`, generalized synthesis merge); (4) the API routes (new POST `/resume`, widened GET `/stream`); (5) the UI (`ResumePanel` + generalized detail page). Phases 1–3 are unit/type-verifiable; Phases 4–5 add the HTTP and human-verifiable surface.

## Critical Implementation Details

- **Round-number assignment is server-authoritative.** `startResumedRound` computes the next round as `max(existing round_number across advisor_opinions) + 1` (or reads it off `session_rounds`), never trusts a client-supplied round. The POST persists the `session_rounds` row for that round *before* returning; the subsequent GET stream reads it. If two resume POSTs race, the `unique(session_id, round_number)` key on `session_rounds` makes the second fail — map that to a 409, do not double-increment.
- **Confrontation seed = round N-1 heads.** `runConfrontationRound(round)` reads `getOpinions(sessionId, round - 1)` as `priorHeads`. For `round === 2` this is round 1 (identical to today's `runSecondRound`); for `round > 2` it's the previous confrontation round. Personas that failed/were absent in round N-1 are simply not participants in round N (same `priorHeads.has()` filter as today — see `session.service.ts:472`).
- **Accumulated context.** The prompt input for round N is `{ decision, context: [original context, ...added contexts for rounds 2..N] joined }`. `runConfrontationRound` fetches `session_rounds` and concatenates added contexts up to and including the target round, so a persona in round 4 sees everything added in rounds 3 and 4. Keep the join delimiter explicit (e.g. blank-line separated, prefixed) so contexts don't blur together.
- **Reopen ordering (mirror `persistSynthesis`'s careful ordering).** In `startResumedRound`: validate → check cap → check rate limit → **delete synthesis → reopen session (status `active`, bump `updated_at`) → insert `session_rounds` row**. Deleting synthesis before reopening avoids a window where a completed session has no synthesis but still shows `completed`. If the `session_rounds` insert fails after reopen, the session is `active` with no new round — acceptable (idempotent retry), but log it.
- **Conciseness for round > 2** is a `concise: boolean` threaded from `runConfrontationRound` (true when `round > 2`) into `runSecondRoundPanel` options and the persona prompt builders. It (a) appends a brevity instruction capping arguments (≤ 2) to the round-two prompt/rationale prompt, and (b) sets a reduced `maxTokens` on the `complete`/`stream` requests. Round 2 stays `concise: false` — byte-for-byte unchanged.
- **Replay-awareness generalizes.** `runConfrontationRound` returns the replay path when `getOpinions(sessionId, round)` already has rows (page reload after a round completed) — same guard as `runSecondRound` at `session.service.ts:480`.

---

## Phase 1: Schema & repository — `session_rounds` table + methods

### Overview

Add per-round context storage (which also serves as the round-limit counter) and the repository methods for reopening a session and clearing a stale synthesis. Pure data layer — verified by types + a repository/service unit test in later phases.

### Changes Required:

#### 1. Migration: `session_rounds` table

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_create_session_rounds.sql` (new)

**Intent**: Store the context a user adds when resuming, one row per resumed round, with per-user RLS isolation matching the established pattern. This table is the source of truth for "which round added what context" and the counter for the round cap.

**Contract**: Table `session_rounds` with `id uuid pk default gen_random_uuid()`, `session_id uuid not null references sessions(id) on delete cascade`, `user_id uuid not null default auth.uid() references auth.users(id) on delete cascade`, `round_number integer not null check (round_number >= 2)` (round 1 never has added context), `added_context text not null`, `created_at timestamptz not null default now()`, `unique (session_id, round_number)`. Enable RLS; four per-op policies for `authenticated` (`select`/`insert`/`update`/`delete`) using `auth.uid() = user_id`, no `anon` policies — copy the exact shape from `20260923140522_...:40-72`. Header comment references `-- FR-008`.

#### 2. Domain type + row schema/mapper

**Files**: `src/types/session.ts`, `src/lib/schemas/session.ts`

**Intent**: Return a typed `SessionRound`, never a raw row (backend.md §4).

**Contract**: `SessionRound` type `{ id; sessionId; userId; roundNumber; addedContext; createdAt }`. Add `SessionRoundRowSchema` (snake_case row) + `toSessionRound` mapper alongside the existing session schemas/mappers. Use `interface` for the object shape (lessons.md: ESLint `stylisticTypeChecked` requires it).

#### 3. Repository methods

**File**: `src/lib/repositories/session.repository.ts`

**Intent**: Provide the queries the resume use case needs, each RLS-scoped to the caller.

**Contract**:
- `createRound(sessionId: string, input: { roundNumber: number; addedContext: string }): Promise<Result<SessionRound, DbError>>` — insert one row, return the typed record (unique-violation surfaces as `DbError`).
- `getRounds(sessionId: string): Promise<Result<SessionRound[], DbError>>` — all `session_rounds` for a session, ordered `round_number asc`.
- `deleteSynthesis(sessionId: string): Promise<Result<void, DbError>>` — delete from `session_syntheses where session_id = …` (RLS-scoped; deleting zero rows is not an error).
- `reopenSession(sessionId: string): Promise<Result<void, DbError>>` — update `sessions set status = 'active', updated_at = now() where id = …`.
- `countRecentRoundsByUser(sinceIso: string): Promise<Result<number, DbError>>` — count `session_rounds` rows with `created_at >= sinceIso` (rate-limit counter; mirror `countRecentSideThreadMessagesByUser` at `:336`).
- `getMaxRoundNumber(sessionId: string): Promise<Result<number, DbError>>` — max `round_number` from `advisor_opinions` for the session (0 when none). Used to compute the next round. (May be implemented as a head/count query or a single `order(...).limit(1)` read.)

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`
- Migration applies cleanly against a local Supabase (`supabase db reset` or the CI smoke boot succeeds)

#### Manual Verification:

- (none — no user-visible surface; exercised by later phases)

**Implementation Note**: After automated verification passes, proceed to Phase 2.

---

## Phase 2: Provider `maxTokens` + generalized confrontation panel + constants

### Overview

Give the LLM port an optional output-token ceiling, thread it through OpenRouter, and turn `runSecondRoundPanel` into a round-agnostic confrontation runner with an optional `concise` mode. Add the cost-control constants. All unit/type-verifiable.

### Changes Required:

#### 1. `maxTokens` on the LLM port

**Files**: `src/lib/adapters/llm-provider.ts`, `src/lib/adapters/openrouter.adapter.ts`

**Intent**: Allow callers to bound output length (cost) without changing behavior when unset.

**Contract**: Add optional `maxTokens?: number` to both `CompleteRequest<T>` and `StreamRequest`. In the adapter, include `max_tokens: req.maxTokens` in both JSON bodies (`complete` `:74-80`, `stream` `:188-193`) — omit the key when `undefined` so existing calls are byte-identical. No behavior change when the field is absent.

#### 2. Generalize `runSecondRoundPanel` with a `concise` option

**File**: `src/lib/advisors/run-panel.ts`

**Intent**: Reuse the exact confrontation fan-out for every round ≥ 2, optionally in a terser mode for rounds > 2.

**Contract**: Extend `RunSecondRoundPanelDeps` (or add a fourth options arg) with `concise?: boolean` and derive `maxTokens` from it (a module constant, e.g. `CONCISE_MAX_TOKENS`). When `concise`, pass `maxTokens` into every persona's `complete`/`stream` request and pass `concise` into the persona prompt builders (below). Default (`concise` falsy) leaves round-two calls unchanged. The `priorHeads` seed is already caller-supplied, so no round number is hard-coded here.

#### 3. Conciseness in persona prompt builders

**Files**: `src/lib/prompts/advisor-{optymista,sceptyk,pragmatyk,analityk}.v1.ts` (via `buildRoundTwoPrompt` / `buildRoundTwoRationalePrompt`), `src/lib/advisors/registry.ts` (`AdvisorStrategy` signature)

**Intent**: In concise mode, instruct the persona to give a shorter opinion (cap arguments at ≤ 2) so terseness is well-formed, not truncated.

**Contract**: Add an optional `concise?: boolean` parameter to `buildRoundTwoPrompt` and `buildRoundTwoRationalePrompt` in the `AdvisorStrategy` interface and all four implementations. When true, append a brevity clause (e.g. "Podaj maksymalnie 2 argumenty; bądź zwięzły."). The schema is unchanged (`arguments.min(1)` still holds; the cap is a soft prompt instruction). Keep the shared clause DRY — a single exported helper string reused by all four builders is acceptable.

#### 4. Constants

**File**: `src/lib/advisors/registry.ts`

**Intent**: Centralize the cost-control knobs next to the existing guardrail constants.

**Contract**: `export const MAX_ROUNDS = 5;` (total rounds per session, including 1 and 2). `export const RESUME_RATE_WINDOW_MS = 60000;` and `export const RESUME_RATE_MAX = <n>;` (per-user resumed-round starts per window — pick a small value, e.g. 5). Documented with a one-line comment referencing FR-008 cost guardrail.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test` (existing `run-panel`, adapter, and prompt tests stay green; round-two output unchanged when `concise` is falsy)
- Adapter test asserts `max_tokens` present when `maxTokens` is set and absent otherwise: `npm run test`
- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`

#### Manual Verification:

- (none — verified by unit tests)

**Implementation Note**: After automated verification passes, proceed to Phase 3.

---

## Phase 3: Service — confrontation generalization, resume use case, synthesis merge

### Overview

Turn the round-two service method into a round-N confrontation use case, add the `startResumedRound` orchestration (guards + reopen + persist), and generalize the synthesis merge to span all rounds. The heart of the change.

### Changes Required:

#### 1. `runConfrontationRound(sessionId, userId, round)`

**File**: `src/lib/services/session.service.ts`

**Intent**: Replace the round-2-specific `runSecondRound` with a round-agnostic confrontation runner that seeds from round N-1, folds in accumulated context, applies conciseness for round > 2, and is replay-aware.

**Contract**: `runConfrontationRound(sessionId: string, userId: string, round: number): Promise<Result<PanelRunView>>`. Ownership check (RLS + explicit `session.userId !== userId → NotFound`, as today). Read `getOpinions(sessionId, round - 1)` as prior heads; require ≥ `MIN_ROUND_TWO_PARTICIPANTS` (else `RoundTwoUnavailableError`). Build `priorHeads`/`priorScores`/`participants` exactly as `runSecondRound` does now. Read `getRounds` and build the accumulated-context `PanelInput` (see Critical Implementation Details). If `getOpinions(sessionId, round)` already has rows → replay via `buildReplayEventsRoundTwo`. Else call `runSecondRoundPanel({ provider, personas: participants, concise: round > 2 }, panelInput, priorHeads)` and persist via `persistRoundTwoAndLogMetrics(sessionId, round, …)`. Keep `runSecondRound` as a thin alias `runConfrontationRound(id, uid, 2)` **or** delete it and update the one caller (stream route) — implementer's choice, but the persist method must take the round number rather than hard-coding `2`.

#### 2. Parameterize `persistRoundTwoAndLogMetrics` by round

**File**: `src/lib/services/session.service.ts`

**Intent**: Persist round-N opinions (currently hard-codes `saveOpinions(sessionId, 2, …)` at `:745`).

**Contract**: Add a `round: number` parameter; call `saveOpinions(sessionId, round, successes)`. Metrics log includes `round`. No other change.

#### 3. `startResumedRound(sessionId, userId, addedContext)`

**File**: `src/lib/services/session.service.ts`

**Intent**: The FR-008 orchestration: validate the request, enforce cost guards, reopen the session, clear the stale synthesis, and persist the new round's context — **without** running the LLM (the GET stream does that, matching persist-then-stream).

**Contract**: `startResumedRound(sessionId: string, userId: string, addedContext: string): Promise<Result<{ round: number }>>`.
1. Ownership check (RLS + explicit).
2. Reject empty/whitespace `addedContext` → `ValidationError` (the route also Zod-validates; defense in depth).
3. `getMaxRoundNumber` → `current`. Require `current >= 2` (can only resume after round 2 exists) else `RoundTwoUnavailableError`. If `current >= MAX_ROUNDS` → a new `RoundLimitReachedError` (see below).
4. Per-user rate limit: `countRecentRoundsByUser(now - RESUME_RATE_WINDOW_MS)`; if `>= RESUME_RATE_MAX` → `RateLimitError`.
5. `nextRound = current + 1`.
6. `deleteSynthesis(sessionId)` → `reopenSession(sessionId)` → `createRound(sessionId, { roundNumber: nextRound, addedContext })` (ordering per Critical Implementation Details). A unique-violation on `createRound` → surface as a conflict (`RoundLimitReachedError` or a dedicated conflict) — do not double-increment.
7. Return `ok({ round: nextRound })`.

#### 4. New error type `RoundLimitReachedError`

**File**: `src/lib/errors.ts`

**Intent**: Distinct code so the route maps the cap to the right status and the UI shows the right message.

**Contract**: `RoundLimitReachedError extends AppError` with a new `ErrorCode.ROUND_LIMIT_REACHED` and HTTP status 409 (conflict) or 422. Register in the `@/lib/http` error mapping so the route needn't build the response by hand (backend.md §6).

#### 5. Generalize the synthesis merge across all rounds

**File**: `src/lib/services/session.service.ts` (`runSynthesis`, `:518-548`)

**Intent**: The synthesis must reflect the *latest* head per persona across every round, not just rounds 1–2.

**Contract**: Replace the round-1/round-2 two-map merge with: read all opinions for the session (or iterate rounds via `getRounds`/`getMaxRoundNumber`), and for each persona in `ADVISOR_REGISTRY` pick the record with the **highest `round_number`**. Build `personaHeads` from those. Behavior for a 2-round session is identical to today. (Prefer a single `getOpinionsForSession` repository read ordered by round, or reuse `getOpinions` per round up to max — avoid N+1 if trivially avoidable.)

#### 6. Unit tests

**File**: `src/lib/services/session.service.test.ts`

**Intent**: Lock the new contracts.

**Contract**: Add cases: (a) `runConfrontationRound(…, 3)` seeds from round-2 heads and persists round-3 rows with `concise` on; (b) replay when round-N rows exist; (c) `startResumedRound` rejects empty context, rejects at `MAX_ROUNDS`, rate-limits, and on success deletes synthesis + reopens + creates the round row in order (assert the mock-repo call sequence); (d) generalized synthesis picks the highest-round head per persona. Follow the mock-repository style at `session.service.test.ts:229`.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test`
- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`

#### Manual Verification:

- (none — verified by unit tests)

**Implementation Note**: After automated verification passes, proceed to Phase 4.

---

## Phase 4: API routes — POST `/resume` + widened GET `/stream`

### Overview

Expose `startResumedRound` over HTTP and let the existing SSE stream serve any round ≥ 2 through the confrontation runner.

### Changes Required:

#### 1. New POST `/api/sessions/[id]/resume`

**File**: `src/pages/api/sessions/[id]/resume.ts` (new)

**Intent**: Persist the resumed round (context + reopen + drop synthesis) and return the new round number for the client to stream. JSON-only (CSRF guard per backend.md §7).

**Contract**: Handler order per backend.md §3: (1) `locals.user` → 401; (2) require `params.id` → 400; (3) enforce `Content-Type: application/json`; (4) Zod-validate body `{ addedContext: string }` with a non-empty/min-length rule (shared schema in `@/lib/schemas`, reused by the form) → 400 with field errors; (5) build `SessionService` (needs only `{ repository }` — no provider; see note); (6) `await service.startResumedRound(id, user.id, addedContext)`; (7) map `Result` → `Response`: `ok` → `json({ round })` 200/201, errors mapped via `@/lib/http` (`ROUND_LIMIT_REACHED` → 409, `RateLimitError` → 429, `ValidationError` → 400, `NotFoundError` → 404). Note: `startResumedRound` does not touch the LLM provider — if the service still requires a provider in its constructor, either make `provider` optional (as S-05's plan does) or construct with a provider here; prefer optional-provider to avoid instantiating the adapter on a non-LLM path.

#### 2. Widen the stream route to round ≥ 2 → confrontation

**File**: `src/pages/api/sessions/[id]/stream.ts`

**Intent**: Serve rounds 3..MAX_ROUNDS through the generalized runner; round 1 unchanged.

**Contract**: Change `RoundParamSchema` to `z.coerce.number().int().min(1).max(MAX_ROUNDS)` (import `MAX_ROUNDS`); update the 400 message. Replace the `round === 2 ? runSecondRound : runFirstRound` branch with `round === 1 ? runFirstRound(id, uid) : runConfrontationRound(id, uid, round)`. Everything else (persistTail via `waitUntil`, SSE framing, abort wiring) is unchanged — `runConfrontationRound` returns the same `PanelRunView`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`
- Production build succeeds: `npm run build`
- Auth/API smoke passes against a running server: `npm run smoke`

#### Manual Verification:

- `POST /api/sessions/{id}/resume` with new context on a round-2 session returns `{ round: 3 }` and creates the `session_rounds` row; the session flips to `active` and its synthesis (if any) is gone.
- `GET /api/sessions/{id}/stream?round=3` streams a confrontation round (score/token/done SSE frames).
- Empty `addedContext` → 400; a 6th round → 409 `ROUND_LIMIT_REACHED`; rapid repeats → 429.
- Another user's session id → 404 (isolation).

**Implementation Note**: After automated verification passes, proceed to Phase 5. Pause for manual confirmation of the HTTP behavior before UI work if convenient.

---

## Phase 5: UI — `ResumePanel` island + generalized detail page

### Overview

Add the add-context-and-run affordance on the session detail page, render rounds beyond 2, and gate the panel at the round cap — all in the dark pixel-retro language, reusing the existing streaming hook/cards.

### Changes Required:

#### 1. Widen `usePanelStream` round type

**File**: `src/components/advisor-panel/usePanelStream.ts`

**Intent**: Allow streaming any round, not just 1 | 2.

**Contract**: Change the `round` param type from `1 | 2` to `number` (default 1). The `?round=${round}` URL and all event handling are unchanged.

#### 2. `ResumePanel` island

**File**: `src/components/advisor-panel/ResumePanel.tsx` (new)

**Intent**: Let the user add context and launch the next confrontation round, then stream it in place. Three explicit states (idle form / submitting / streaming) plus a disabled cap state (frontend.md §8).

**Contract**: Props `{ sessionId: string; personas: { id: string; label: string }[]; nextRound: number; atLimit: boolean; canResume: boolean }` (`canResume` = at least round 2 exists). When `atLimit`, render a disabled panel with copy ("Osiągnięto limit rund"). Otherwise render a textarea (new context, required) + a "URUCHOM KOLEJNĄ RUNDĘ" button (`pixel-btn`, violet=action per §5). On submit: `fetch('/api/sessions/{id}/resume', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ addedContext }) })`; on `ok` read `{ round }` and mount a streaming child that calls `usePanelStream(sessionId, participantIds, round)` (same shape as `RoundTwoStream`, `RoundTwoPanel.tsx:21-45`), rendering `AdvisorCard`s with attribution labels. Map error responses to inline messages (429 → "Zwolnij tempo", 409 → limit copy, 400 → field error). Live region `aria-live="polite"` on streamed text (§6); animations respect `prefers-reduced-motion`. Reuse the Zod schema from Change #1 of Phase 4 for client validation (React Hook Form + Zod per frontend.md §3 — or a single-field manual check, since it is one field).

#### 3. Generalize the detail page to render round history + resume

**File**: `src/pages/sessions/[id].astro`

**Intent**: Show all completed rounds (not just 1 and 2), the added context per resumed round, and the resume panel; compute the cap/next-round props server-side.

**Contract**: In frontmatter, load the max round number and, for rounds ≥ 3, their opinions + the matching `session_rounds` added context. Compute `nextRound = maxRound + 1`, `atLimit = maxRound >= MAX_ROUNDS`, `canResume = maxRound >= MIN_ROUND_TWO_PARTICIPANTS`-eligible (round 2 reached). Render: existing `AdvisorPanel` (round 1) and `RoundTwoPanel` (round 2) unchanged; then a list of round-N (≥3) sections — each showing its added context and an `AdvisorCard` grid fed by `usePanelStream(sessionId, ids, n)` in replay mode (rows already persisted → immediate replay, no LLM cost, mirroring `RoundTwoPanel`'s `hasRoundTwo` behavior); then `SynthesisPanel` (unchanged — reappears in "generate" state when the synthesis was deleted); then `ResumePanel` with the computed props. Keep the pixel-panel layout consistent with the existing sections. Participant ids for round N are the personas present in round N-1.

#### 4. (If needed) round-N replay child component

**File**: `src/components/advisor-panel/RoundStream.tsx` (new, optional)

**Intent**: A small reusable streaming/replay grid for an arbitrary round, so the page and `ResumePanel` share one renderer instead of duplicating `RoundTwoStream`.

**Contract**: Props `{ sessionId; personas; round: number }`; body identical to `RoundTwoStream` but with the round passed through. `RoundTwoPanel` and `ResumePanel` may both delegate to it. Optional consolidation — skip if it doesn't reduce duplication cleanly.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`
- Production build succeeds: `npm run build`

#### Manual Verification:

- On a session with round 2 done, the "KOLEJNA RUNDA" panel shows a context textarea; submitting with text streams round 3 with each persona reacting to peers and attributed score changes, in visibly shorter form than rounds 1–2.
- Submitting with an empty textarea is blocked (client) and rejected (server).
- Ending the session after a resumed round produces a fresh synthesis over the latest rounds; the previously shown synthesis did not persist after resuming.
- After 5 rounds the panel is disabled with the limit message.
- Reloading the page replays all rounds (1..N) with no new LLM calls and shows each resumed round's added context.
- A second account cannot open or resume the session (404); rapid resume attempts surface a rate-limit message.
- Renders at 375px and 1280px; accent text meets AA contrast; keyboard-navigable with visible focus; animations off under `prefers-reduced-motion` (frontend.md §6, §9).

**Implementation Note**: After automated verification passes, pause for human manual confirmation before considering the change done.

---

## Testing Strategy

### Unit Tests:

- `runConfrontationRound`: seeds from round N-1, persists round-N rows, applies `concise` for round > 2, replays when round-N rows exist.
- `startResumedRound`: empty-context rejection, `MAX_ROUNDS` cap, per-user rate limit, and the delete-synthesis → reopen → create-round call ordering.
- Generalized synthesis merge: picks the highest-round head per persona; unchanged for a 2-round session.
- OpenRouter adapter: `max_tokens` present iff `maxTokens` set.
- Round-two output is byte-unchanged when `concise` is falsy (regression guard).

### Integration Tests:

- Auth/API `npm run smoke` covers routing/auth for the new POST route (no LLM assertions). No page-level harness exists; UI covered by manual steps.

### Manual Testing Steps:

1. Sign in; run a session through round 1 and round 2.
2. In "KOLEJNA RUNDA", add new context and run round 3; confirm confrontation + attribution + shorter output.
3. End the session → fresh synthesis reflecting round 3; confirm the earlier synthesis did not linger.
4. Resume again to rounds 4 and 5; confirm the panel disables at 5 with the limit message.
5. Reload mid-history: all rounds replay, added context shown per round, no new LLM calls (watch network).
6. Empty-context submit blocked; rapid resumes rate-limited (429 message).
7. Second account: the session 404s and cannot be resumed.
8. 375px + 1280px; keyboard + focus rings; reduced-motion.

## Performance Considerations

Each resumed round is one confrontation fan-out (same cost profile as round 2), bounded by `MAX_ROUNDS = 5` and the per-user rate limit. Shorter responses for rounds > 2 reduce per-call output tokens. Replay of prior rounds on page load is DB-only (no LLM). Watch for N+1 in the generalized synthesis merge / detail-page round loading — prefer a single session-scoped opinions read ordered by round over per-round queries where trivial.

## Migration Notes

One additive, forward-only migration (`session_rounds`) with RLS + per-op policies. No changes to existing tables. `advisor_opinions` already accommodates round ≥ 3. Reopening a completed session is a status update (`completed` → `active`) plus a synthesis-row delete — both reversible by re-running synthesis.

## References

- Roadmap item S-06: `context/foundation/roadmap.md:172` (Change ID `resume-session-round`, FR-008)
- PRD FR-008 (+ cost-control mitigations) : `context/foundation/prd.md:96-100`
- Prerequisite S-05 plan (history + optional-provider precedent): `context/changes/session-history/plan.md`
- Confrontation mechanic to generalize: `src/lib/services/session.service.ts:440` (`runSecondRound`), `src/lib/advisors/run-panel.ts:181` (`runSecondRoundPanel`), `resolveRoundTwo` `:78`
- Synthesis merge to generalize: `src/lib/services/session.service.ts:518-548`
- Round param + stream route: `src/pages/api/sessions/[id]/stream.ts:12,71-73`
- Persist-before-stream precedent (side thread): `src/lib/services/session.service.ts:642-667`
- Rate-limit precedent: `src/lib/repositories/session.repository.ts:336`; `src/lib/advisors/registry.ts:61-62`
- LLM port (no max_tokens today): `src/lib/adapters/llm-provider.ts:16-39`; adapter body `src/lib/adapters/openrouter.adapter.ts:74-80,188-193`
- Client streaming hook + round-two panel: `src/components/advisor-panel/usePanelStream.ts`, `RoundTwoPanel.tsx`
- RLS pattern to copy: `supabase/migrations/20260923140522_create_sessions_and_advisor_opinions.sql:40-72`
- Ownership lesson (RLS + explicit check): `context/foundation/lessons.md:25`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema & repository — session_rounds table + methods

#### Automated

- [ ] 1.1 Type checking passes: `npx astro check`
- [ ] 1.2 Linting passes: `npm run lint`
- [ ] 1.3 Migration applies cleanly against a local Supabase

### Phase 2: Provider maxTokens + generalized confrontation panel + constants

#### Automated

- [ ] 2.1 Unit tests pass: `npm run test`
- [ ] 2.2 Adapter test asserts `max_tokens` present iff `maxTokens` set: `npm run test`
- [ ] 2.3 Type checking passes: `npx astro check`
- [ ] 2.4 Linting passes: `npm run lint`

### Phase 3: Service — confrontation generalization, resume use case, synthesis merge

#### Automated

- [ ] 3.1 Unit tests pass: `npm run test`
- [ ] 3.2 Type checking passes: `npx astro check`
- [ ] 3.3 Linting passes: `npm run lint`

### Phase 4: API routes — POST /resume + widened GET /stream

#### Automated

- [ ] 4.1 Type checking passes: `npx astro check`
- [ ] 4.2 Linting passes: `npm run lint`
- [ ] 4.3 Production build succeeds: `npm run build`
- [ ] 4.4 Auth/API smoke passes: `npm run smoke`

#### Manual

- [ ] 4.5 POST /resume on a round-2 session returns `{ round: 3 }`, creates the round row, reopens the session, and removes the synthesis
- [ ] 4.6 GET /stream?round=3 streams a confrontation round
- [ ] 4.7 Empty context → 400; 6th round → 409; rapid repeats → 429
- [ ] 4.8 Another user's session id → 404 (isolation)

### Phase 5: UI — ResumePanel island + generalized detail page

#### Automated

- [ ] 5.1 Type checking passes: `npx astro check`
- [ ] 5.2 Linting passes: `npm run lint`
- [ ] 5.3 Production build succeeds: `npm run build`

#### Manual

- [ ] 5.4 Resume panel runs round 3 with confrontation, attribution, and shorter output
- [ ] 5.5 Empty-context submit blocked client + server
- [ ] 5.6 Ending after a resumed round yields a fresh synthesis; the prior synthesis did not linger
- [ ] 5.7 Panel disables at 5 rounds with the limit message
- [ ] 5.8 Page reload replays all rounds with no new LLM calls and shows per-round added context
- [ ] 5.9 Second account 404s; rapid resumes rate-limited
- [ ] 5.10 375px + 1280px, AA contrast, keyboard focus, reduced-motion

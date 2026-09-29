# Advisor Side Thread (FR-007) Implementation Plan

## Overview

Add a **per-persona, multi-turn, persisted side thread** so a user can probe a chosen advisor with follow-up
questions ("dopytać wybraną personę") without touching or interrupting the main debate. Each eligible persona
(one that already has a round-one opinion) exposes a "Dopytaj" chat that is grounded in **that persona's own
latest head** (round-two opinion if present, else round-one), streams its answer live, persists every message,
and replays on reload — bounded by a per-thread message cap, a max input length, and a per-user rate limit.

Serves **FR-007** (must-have), roadmap slice **S-04**, prereq **S-01**.

## Current State Analysis

The core debate loop (S-01→S-03) is shipped and archived. The vertical-slice machinery this feature rides is
fully established and should be mirrored, not reinvented:

- **Streaming round path**: `sessions/[id].astro` (SSR gate + `client:load` islands) → `usePanelStream`
  (`EventSource`) → `GET /api/sessions/[id]/stream?round=N` → `SessionService.runFirstRound/runSecondRound` →
  `PanelRunView` (`AsyncIterable` of `score|token|done|error`) → SSE frames. See `src/pages/api/sessions/[id]/stream.ts`.
- **Two-phase LLM contract**: `LlmProvider.complete()` (Zod-validated structured head) then `LlmProvider.stream()`
  (prose). The side thread needs **only `stream()`** — a conversational answer has no structured head/score.
- **Persona Strategy**: `ADVISOR_REGISTRY` (`src/lib/advisors/registry.ts`) pairs each persona with versioned
  prompt builders (`buildPrompt`, `buildRationalePrompt`, round-two variants) in `src/lib/prompts/advisor-*.v1.ts`.
- **Persistence**: `SessionRepository` (`src/lib/repositories/session.repository.ts`) is the only DB access point;
  row↔domain mapping lives in `src/lib/schemas/session.ts`; domain types in `src/types/session.ts`. Migrations are
  forward-only/additive, RLS + per-op policies, `user_id ... default auth.uid()` (see the three existing migrations).
- **Persist-tail + replay split**: `runSynthesis` (`session.service.ts:450`) shows the exact pattern to copy —
  live path streams while a `persistTail` promise accumulates the text and saves it; the replay path renders the
  already-persisted text without any LLM call. `stream.ts:80` wires the tail through `cfContext.waitUntil`.

**Key gap / novelty**: every existing surface is a one-shot, fan-out structured opinion. A side thread is a
**multi-turn conversation with a single persona** — a new interaction model, and the reason S-04 was flagged as a
"separate data model and UI" scope risk.

## Desired End State

On a session page, each advisor card whose persona has spoken in round one shows a "Dopytaj" control. Expanding it
reveals a chat: the user types a follow-up, the persona answers in-character (grounded in its own stated opinion),
the answer streams token-by-token, and the exchange is saved. The user can keep asking (multi-turn) up to a cap.
Reloading the page restores every thread verbatim. All of this happens while the round-one/round-two panels and
synthesis remain exactly as they were — nothing about the debate is blocked, cancelled, or altered.

Verify: with a session that has round-one opinions, open a persona's thread, ask two questions, see streamed
answers; reload and see both exchanges restored; open round two and confirm asking in a side thread neither blocks
nor disturbs the round-two stream; exceed the cap / rate limit and see a graceful error.

### Key Discoveries:

- `usePanelStream` uses `EventSource`, which is **GET-only** (`usePanelStream.ts:67`). A side-thread question
  carries a `{ personaId, message }` body, so its endpoint must be **POST returning `text/event-stream`**, consumed
  client-side with `fetch` + a `ReadableStream` reader — a new hook, not `EventSource`.
- `AdvisorCard` (`AdvisorCard.tsx:31`) is reused by **both** round one (`AdvisorPanel`) and round two
  (`RoundTwoPanel`). The side-thread affordance belongs only on the round-one card, so it must be an **opt-in prop**
  that `AdvisorPanel` passes and `RoundTwoPanel` does not.
- Client-shared schema files (`schemas/panel.ts`, `schemas/advisor.ts`) deliberately **do not import the registry**
  (it would pull persona prompts into the browser bundle — see `schemas/advisor.ts:22`). The side-thread input
  schema must follow the same rule: enumerate persona ids locally, no registry import.
- Grounding uses the persona's **latest** head: round-two opinion if the persona participated, else round-one —
  the same "latest-per-persona" precedence `runSynthesis` already applies (`session.service.ts:490`).
- Ownership is enforced by RLS **and** an explicit service-side check (lessons.md; backend.md §7) — never RLS alone.

## What We're NOT Doing

- **No cross-persona / "ask the whole panel" thread.** A thread is bound to exactly one persona (session_id + persona_id).
- **No peer or synthesis context in the persona's answer.** Grounding is the persona's own head + the decision only.
- **No structured head / score** for side-thread answers — they are free prose, not opinions, and never feed the
  round-one spread, round-two attribution, or synthesis.
- **No editing or deleting** side-thread messages — the table is append-only.
- **No new LLM provider, model, or KV binding.** Rate limiting uses a DB count (no Cloudflare KV dependency).
- **No thread for personas without a round-one opinion**, and no side thread offered before round one runs.
- **No change** to the round-one/round-two/synthesis flows, schemas, or prompts.

## Implementation Approach

A textbook vertical slice, layered bottom-up so each phase is independently verifiable: data model → repository →
prompts → service → API → UI. The side thread reuses the persist-tail + replay pattern from synthesis, but with a
simpler transport (single `stream()`, no `complete()`) and a POST-SSE endpoint because the request carries a body.
Cost guardrails (per-thread cap, input length, per-user rate limit) are built in from the first phase that can
enforce them, honoring the roadmap's explicit cost concern and backend.md §7.

## Critical Implementation Details

- **POST-SSE transport**: `EventSource` cannot POST. The endpoint returns `text/event-stream` from a POST; the
  client reads `response.body`, decodes chunks, splits on the `\n\n` frame boundary, and parses `event:`/`data:`
  lines by hand. Frames omit `personaId` (a thread is single-persona). This is the one genuinely non-obvious piece.
- **Persist ordering**: persist the **user** message before opening the stream (so a failed answer never loses the
  question), then let the `persistTail` accumulate tokens and save the **advisor** message on `done` — mirroring
  `persistSynthesis` (`session.service.ts:577`). On a stream error, the user message remains and the user can retry.
- **Head resolution precedence**: round-two opinion for the persona if it exists, else round-one; if neither
  exists the thread is unavailable (`SIDE_THREAD_UNAVAILABLE`), which the SSR eligibility gate should already prevent.

## Phase 1: Data model & schemas

### Overview

Create the append-only `advisor_side_thread_messages` table with RLS, its row/domain schema and mapper, the domain
type, and the client-shared input schema plus the bounding constants.

### Changes Required:

#### 1. Migration

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_create_side_thread_messages.sql`

**Intent**: Persist side-thread messages, one row per turn, isolated per user via RLS. Append-only (select + insert
only), mirroring the RLS shape of `advisor_opinions`.

**Contract**: Header comment `-- FR-007`. Table `advisor_side_thread_messages`:
`id uuid pk default gen_random_uuid()`, `session_id uuid not null references sessions(id) on delete cascade`,
`user_id uuid not null references auth.users default auth.uid()`, `persona_id` constrained to the four persona ids
(same representation/`check` as `advisor_opinions.persona_id`), `role text not null check (role in ('user','advisor'))`,
`content text not null`, `created_at timestamptz not null default now()`. Enable RLS; add **select** and **insert**
policies for role `authenticated` scoped `user_id = auth.uid()` (copy the `advisor_opinions` policies). Intentionally
**no** update/delete policies (append-only → deny by default). Add an index on `(session_id, persona_id, created_at)`
for ordered retrieval. Follow the existing migrations' naming/style; never edit an applied migration.

#### 2. Row schema + mapper

**File**: `src/lib/schemas/session.ts`

**Intent**: Validate the DB row boundary and map snake_case → camelCase domain object, in the single place that owns
row mapping.

**Contract**: Add `SideThreadMessageRowSchema` (`id`, `session_id`, `user_id`, `persona_id` = existing `PERSONA_IDS`
enum, `role` = `z.enum(["user","advisor"])`, `content`, `created_at`) and `toSideThreadMessage(row): SideThreadMessage`,
mirroring `AdvisorOpinionRowSchema` / `toAdvisorOpinion`.

#### 3. Domain type

**File**: `src/types/session.ts`

**Intent**: Domain shape returned by the repository.

**Contract**: `export interface SideThreadMessage { id; sessionId; userId; personaId: AdvisorPersonaId;
role: "user" | "advisor"; content: string; createdAt: string }`.

#### 4. Input schema + constants

**File**: `src/lib/schemas/panel.ts`

**Intent**: Validate the POST body at the HTTP boundary and share the same schema with the frontend form. Must not
import the registry (client-bundle rule).

**Contract**: `MAX_SIDE_THREAD_INPUT_CHARS` (e.g. 2000). `SideThreadAskSchema = z.object({ personaId: z.enum([...4 ids]),
message: z.string().min(1).max(MAX_SIDE_THREAD_INPUT_CHARS) })` with `type SideThreadAsk = z.infer<...>`. Enumerate the
four persona ids locally (as `schemas/advisor.ts` does), no `@/lib/advisors/registry` import.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly on a fresh DB: `npx supabase db reset`
- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`
- Schema unit tests pass: `npm run test`

#### Manual Verification:

- In Supabase Studio, `advisor_side_thread_messages` exists with RLS enabled and select+insert policies for `authenticated`.
- A row inserted as one user is not visible to another user (RLS isolation), consistent with `npm run smoke:rls` expectations.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual
confirmation before proceeding.

---

## Phase 2: Repository methods

### Overview

Add the append + ordered-read queries and the two count queries that back the per-thread cap and per-user rate limit.
No Supabase access lives outside the repository.

### Changes Required:

#### 1. Repository methods

**File**: `src/lib/repositories/session.repository.ts`

**Intent**: One place for all `advisor_side_thread_messages` queries, returning typed domain objects via `Result`.

**Contract**: Add a `SaveSideThreadMessageInput { personaId; role: "user" | "advisor"; content: string }` interface and:
- `saveSideThreadMessage(sessionId, input): Promise<Result<SideThreadMessage, DbError>>` — insert one row, map, return.
- `getSideThreadMessagesForSession(sessionId): Promise<Result<SideThreadMessage[], DbError>>` — all personas' messages,
  ordered `persona_id asc, created_at asc, id asc`. Single query for SSR (avoids N+1, backend.md §4).
- `getSideThreadMessages(sessionId, personaId): Promise<Result<SideThreadMessage[], DbError>>` — one thread, ordered
  `created_at asc, id asc` (deterministic tiebreak).
- `countSideThreadUserMessages(sessionId, personaId): Promise<Result<number, DbError>>` — `role = 'user'` count, for the cap.
- `countRecentSideThreadMessagesByUser(sinceIso): Promise<Result<number, DbError>>` — `role = 'user'` and
  `created_at >= sinceIso` count (RLS scopes to the caller), for the rolling-window rate limit. Use a count query
  (`select("*", { count: "exact", head: true })`), not a fetch-and-length.

### Success Criteria:

#### Automated Verification:

- Repository unit tests pass (save + ordered read + both counts, against the mocked client pattern in
  `session.repository.test.ts`): `npm run test`
- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`

#### Manual Verification:

- None beyond the automated tests for this phase.

**Implementation Note**: Pause for manual confirmation after automated verification passes.

---

## Phase 3: Prompt surface

### Overview

Give each persona a versioned side-thread prompt builder that keeps its cognitive lens, grounds the answer in the
persona's own head, and carries the prior turns — then wire the four builders into the registry.

### Changes Required:

#### 1. Strategy interface + turn type

**File**: `src/lib/advisors/registry.ts`

**Intent**: Extend the persona Strategy so every persona can build a side-thread prompt; define the history shape.

**Contract**: Add `export interface SideThreadTurn { role: "user" | "advisor"; content: string }` and to
`AdvisorStrategy`: `buildSideThreadPrompt(input: PanelInput, ownHead: AdvisorOpinion, history: SideThreadTurn[],
question: string): { system: string; user: string }`. Add the four new builders to each `ADVISOR_REGISTRY` entry.

#### 2. Per-persona side-thread prompt (×4)

**Files**: `src/lib/prompts/advisor-optymista.v1.ts`, `advisor-sceptyk.v1.ts`, `advisor-pragmatyk.v1.ts`,
`advisor-analityk.v1.ts`

**Intent**: A `v1` conversational prompt in each persona's voice: this is a side conversation ("wątek poboczny"),
the persona answers the user's follow-up grounded in its own already-stated opinion, stays in character, and does
not re-open a score — flowing prose, no JSON.

**Contract**: `export function buildSideThreadPrompt(input, ownHead, history, question)` returning `{ system, user }`,
following the structure of the existing `buildRationalePrompt` in the same file. System: persona lens + "this is a
side thread, not a new round; you already gave your opinion (score/thesis/arguments); answer the user's follow-up in
character, in prose, no JSON, no markdown lists." User: decision + optional context + the persona's own head +
formatted prior turns (from `history`) + the new `question`. Keep `PROMPT_VERSION = "v1"`.

### Success Criteria:

#### Automated Verification:

- Prompt unit tests pass (each persona returns non-empty system+user, includes the decision, own head, history, and
  question; no JSON instruction), following `advisor-prompts.test.ts`: `npm run test`
- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`

#### Manual Verification:

- Spot-read one persona's generated prompt (e.g. via a test log) and confirm it reads in-character and does not ask for a score.

**Implementation Note**: Pause for manual confirmation after automated verification passes.

---

## Phase 4: Service method & errors

### Overview

Orchestrate one side-thread turn: ownership check, head resolution, cost guards, history load, persist user message,
stream the answer, persist the advisor message on `done`.

### Changes Required:

#### 1. Errors + codes

**File**: `src/lib/errors.ts`

**Intent**: Typed errors for the two new failure modes.

**Contract**: Add `ErrorCode.SIDE_THREAD_UNAVAILABLE` and `ErrorCode.RATE_LIMITED`. Add
`SideThreadUnavailableError` (status 400) and `RateLimitError` (status 429) as `AppError` subclasses, mirroring the
existing subclasses.

#### 2. Limits constants

**File**: `src/lib/advisors/registry.ts` (alongside `MIN_ROUND_TWO_PARTICIPANTS`) or a small `src/lib/config` const —
implementer's choice, kept server-side.

**Intent**: Single source for the cost bounds.

**Contract**: `MAX_SIDE_THREAD_MESSAGES` (per-thread user-message cap, e.g. 20), `SIDE_THREAD_RATE_WINDOW_MS`
(e.g. 60000), `SIDE_THREAD_RATE_MAX` (e.g. 10). `MAX_SIDE_THREAD_INPUT_CHARS` already lives in `schemas/panel.ts`.

#### 3. Service method

**File**: `src/lib/services/session.service.ts`

**Intent**: The one use case, wiring repository + provider, with the persist-tail + live-events split used by
`runSynthesis`.

**Contract**: Add `SideThreadRunEvent = { kind: "token"; text } | { kind: "done" } | { kind: "error"; code; message }`,
`SideThreadRunView { events: AsyncIterable<SideThreadRunEvent>; persistTail?: Promise<void> }`, and
`askSideThread(sessionId, userId, personaId, message): Promise<Result<SideThreadRunView>>`:
1. `getSession` + `session.userId !== userId` → `NotFoundError`.
2. Resolve head: `getOpinions(sessionId, 2)` → persona record if present, else `getOpinions(sessionId, 1)` → record;
   if neither → `err(SideThreadUnavailableError)`.
3. Rate limit: `countRecentSideThreadMessagesByUser(now - WINDOW)` ≥ `SIDE_THREAD_RATE_MAX` → `err(RateLimitError)`;
   `countSideThreadUserMessages(sessionId, personaId)` ≥ `MAX_SIDE_THREAD_MESSAGES` → `err(RateLimitError)`.
4. `getSideThreadMessages(sessionId, personaId)` → map to `SideThreadTurn[]` (history, chronological).
5. `saveSideThreadMessage(sessionId, { personaId, role: "user", content: message })` before streaming; on save failure
   return the error.
6. Look up the persona in `ADVISOR_REGISTRY`; build prompt via `buildSideThreadPrompt`; `provider.stream({... temperature:
   persona.temperature, persona: persona.id, promptVersion: "v1" })`.
7. `persistTail`: accumulate `token` text, log any stream error, and on completion `saveSideThreadMessage(..., role:
   "advisor", content: accumulated)` (skip persist if nothing accumulated). Mirror `persistSynthesis`.
8. Return `ok({ events, persistTail })` where `events` yields `token`/`done`/`error` from the stream.

### Success Criteria:

#### Automated Verification:

- Service unit tests pass (ownership 404; unavailable when no opinion; rate-limit and cap rejections; head precedence
  round-2-over-round-1; user message persisted before stream; advisor message persisted on done), following
  `session.service.test.ts`: `npm run test`
- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`

#### Manual Verification:

- None beyond automated tests for this phase.

**Implementation Note**: Pause for manual confirmation after automated verification passes.

---

## Phase 5: API route (POST-SSE)

### Overview

Expose the service over a thin POST handler that streams the answer as SSE and persists via `waitUntil`.

### Changes Required:

#### 1. Route handler

**File**: `src/pages/api/sessions/[id]/side-thread.ts`

**Intent**: Validate and stream one side-thread turn, mapping `Result` errors to status codes.

**Contract**: `export async function POST({ params, request, cookies, locals })`. Order per backend.md §3:
(1) `locals.user` → 401; (2) `params.id` present → 400; (3) reject non-JSON `Content-Type` (CSRF guard, backend.md §7);
(4) parse body, `SideThreadAskSchema.safeParse` → 400 with field errors; (5) `createClient` + `createLlmProvider`,
null → 503 `NOT_CONFIGURED`; (6) `service.askSideThread(params.id, locals.user.id, personaId, message)`; (7) on
`!ok` → `errorResponse(result.error)` (maps `RateLimitError`→429, `SideThreadUnavailableError`→400, `NotFoundError`→404).
On `ok`: reuse an `sseFrame` helper to stream `view.events` as `event: token|done|error` frames (no `personaId` field);
`locals.cfContext?.waitUntil(view.persistTail)`; wire `request.signal` abort to close the controller (copy the
`try/finally` + abort-listener structure from `stream.ts`); return `new Response(sse, { headers: text/event-stream,
no-cache, keep-alive })`. Factor `sseFrame` into a shared spot or duplicate the 3-line helper — implementer's call.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`
- Production build passes: `npm run build`

#### Manual Verification:

- `curl -N -X POST` with a valid session cookie and JSON body streams `event: token` frames then `event: done`.
- Missing auth → 401; bad body → 400; unknown/foreign session id → 404; exceeding the cap → 429.
- `npm run smoke` (auth/API touched) passes against a running server.

**Implementation Note**: Pause for manual confirmation after automated verification passes.

---

## Phase 6: UI — expander, hook, SSR replay

### Overview

Load existing threads server-side, add the opt-in "Dopytaj" expander to the round-one card, and stream new turns via
a POST-SSE hook — with explicit loading/error/empty states and an accessible transcript.

### Changes Required:

#### 1. SSR data + eligibility

**File**: `src/pages/sessions/[id].astro`

**Intent**: Provide each round-one-eligible persona's saved thread and eligibility to the panel, from a single query.

**Contract**: After computing `roundOneRecords`, call `repository.getSideThreadMessagesForSession(id)`; group into
`initialThreads: Record<personaId, { role; content }[]>`; compute `sideThreadEligible` = persona ids present in
`roundOneRecords`. Pass a serializable `sideThread={{ eligible, initialThreads }}` prop to `<AdvisorPanel>` only
(round-one surface). No functions/Dates across the island boundary (frontend.md §1).

#### 2. Panel prop pass-through

**File**: `src/components/advisor-panel/AdvisorPanel.tsx`

**Intent**: Thread the side-thread data down to each round-one card; round-two panel is untouched.

**Contract**: Add optional `sideThread?: { eligible: string[]; initialThreads: Record<string, { role: "user" |
"advisor"; content: string }[]> }`. For each persona, pass `sessionId`, `sideThreadEnabled = eligible.includes(id)`,
and `initialMessages = initialThreads[id] ?? []` to `AdvisorCard`.

#### 3. Card affordance (opt-in)

**File**: `src/components/advisor-panel/AdvisorCard.tsx`

**Intent**: Show a "Dopytaj" toggle only when enabled; render the thread child when expanded. Keep the card
presentational and unchanged for `RoundTwoPanel` (which passes none of the new props).

**Contract**: Add optional props `sessionId?`, `sideThreadEnabled?: boolean`, `initialMessages?: { role; content }[]`.
When `sideThreadEnabled`, render a pixel-styled toggle button; when expanded, mount `<SideThread sessionId personaId
label initialMessages />`. When the props are absent, render exactly as today.

#### 4. Streaming hook

**File**: `src/components/advisor-panel/useSideThreadStream.ts`

**Intent**: POST a question and consume the streamed answer, exposing chat state. `EventSource` can't POST, so use
`fetch` + a `ReadableStream` reader and parse SSE frames by hand.

**Contract**: `useSideThreadStream(sessionId, personaId, initialMessages)` returns `{ messages: { role; content }[],
status: "idle" | "streaming" | "error", error?: string, send(text): void }`. `send` optimistically appends the user
message + an empty advisor message, POSTs `{ personaId, message }` to `/api/sessions/${sessionId}/side-thread`, reads
`response.body`, decodes, splits on `\n\n`, parses `event:`/`data:` frames, appends `token` text to the in-flight
advisor message, ends on `done`, and on `error` sets error state while **preserving partial text** (frontend.md §8).
Abort in-flight fetch on unmount via `AbortController`.

#### 5. Side-thread component

**File**: `src/components/advisor-panel/SideThread.tsx`

**Intent**: The chat UI: transcript + input, wired to the hook, with the three required async states.

**Contract**: Props `sessionId`, `personaId`, `label`, `initialMessages`. Uses `useSideThreadStream`. Renders the
transcript in an `aria-live="polite"` region (user vs advisor visually distinct), a labelled textarea + send button,
a `streaming` indicator, an `error` state with retry that keeps partial text, and an empty prompt when no messages.
Disable the input while `streaming` and once the per-thread cap is hit (surface the 429 as a friendly message).
Pixel-retro tokens only, `cn()` from `@/lib/utils`, sharp corners, respects `prefers-reduced-motion`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Linting passes (no new `console.*`): `npm run lint`
- Production build passes: `npm run build`

#### Manual Verification:

- On a session with round-one opinions, "Dopytaj" appears on each card; expanding, asking a question streams an
  in-character answer; a second question works (multi-turn) and the persona references the prior turn.
- Reload restores every thread verbatim; personas without a round-one opinion show no "Dopytaj".
- Opening/using a side thread while round two is streaming neither blocks nor disturbs the round-two panel.
- Keyboard + screen-reader pass on the toggle, textarea, and transcript; layout holds at 375px and 1280px; animations
  off under reduced motion; accent text meets WCAG AA on the dark background.
- Round-two card (via `RoundTwoPanel`) shows no side-thread affordance (opt-in prop respected).

**Implementation Note**: Pause for manual confirmation after automated verification passes.

---

## Testing Strategy

### Unit Tests:

- **Schemas**: `SideThreadMessageRowSchema` accept/reject; `SideThreadAskSchema` message min/max, personaId enum.
- **Repository**: save round-trips a row; ordered reads are chronological with `id` tiebreak; both counts return
  exact counts; DB error → `err(DbError)`.
- **Prompts**: each persona's `buildSideThreadPrompt` includes decision, own head, history, and question; no JSON ask.
- **Service**: ownership 404; unavailable when persona has no opinion; head precedence (round-2 over round-1);
  rate-limit and cap rejections; user message persisted before stream; advisor message persisted on `done`; stream
  error leaves the user message intact and skips advisor persist.

### Integration Tests:

- End-to-end via `npm run smoke` (auth/API touched) confirming the POST endpoint authenticates and streams.
- `npm run smoke:rls` still passes — new table's RLS isolates messages per user.

### Manual Testing Steps:

1. Create a session, run round one, expand a persona's "Dopytaj", ask a question → streamed in-character answer.
2. Ask a follow-up → persona reflects the prior turn (multi-turn grounding).
3. Reload → both exchanges restored from the DB.
4. Start round two; while it streams, use a side thread → round two unaffected; side thread streams independently.
5. Exceed `MAX_SIDE_THREAD_MESSAGES` in one thread → 429 surfaced as a friendly cap message; exceed the rolling
   rate limit across threads → 429.
6. A persona with no round-one opinion (e.g. a failed persona) → no "Dopytaj" affordance.

## Performance Considerations

Side-thread turns are single-persona single-`stream()` calls — far lighter than a panel fan-out. The rate limit and
per-thread cap bound worst-case LLM spend. SSR loads all of a session's threads in one query (no N+1); the `persistTail`
runs under `waitUntil` so persistence never blocks the streamed response.

## Migration Notes

Additive, forward-only migration; no existing data touched. `on delete cascade` from `sessions` cleans up threads if a
session is ever deleted. No backfill required.

## References

- Roadmap slice: `context/foundation/roadmap.md` (S-04)
- PRD requirement: `context/foundation/prd.md` FR-007 (line 91); Open Question #4 (missing user story — resolved here)
- Persist-tail + replay pattern: `src/lib/services/session.service.ts:450` (`runSynthesis`), `:577` (`persistSynthesis`)
- SSE endpoint pattern: `src/pages/api/sessions/[id]/stream.ts`
- Repository + row-mapping pattern: `src/lib/repositories/session.repository.ts`, `src/lib/schemas/session.ts`
- Persona Strategy + prompts: `src/lib/advisors/registry.ts`, `src/lib/prompts/advisor-optymista.v1.ts`
- Ownership rule: `context/foundation/lessons.md` ("Enforce ownership with RLS AND an explicit service-side check")

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data model & schemas

#### Automated

- [x] 1.1 Migration applies cleanly on a fresh DB: `npx supabase db reset` — 3acb65d
- [x] 1.2 Type checking passes: `npx astro check` — 3acb65d
- [x] 1.3 Linting passes: `npm run lint` — 3acb65d
- [x] 1.4 Schema unit tests pass: `npm run test` — 3acb65d

#### Manual

- [x] 1.5 `advisor_side_thread_messages` exists with RLS + select/insert policies for `authenticated` — 3acb65d
- [x] 1.6 Row inserted as one user is not visible to another (RLS isolation) — 3acb65d

### Phase 2: Repository methods

#### Automated

- [x] 2.1 Repository unit tests pass (save + ordered read + both counts): `npm run test` — ef77b05
- [x] 2.2 Type checking passes: `npx astro check` — ef77b05
- [x] 2.3 Linting passes: `npm run lint` — ef77b05

### Phase 3: Prompt surface

#### Automated

- [x] 3.1 Prompt unit tests pass (decision + own head + history + question, no JSON ask): `npm run test` — e06485e
- [x] 3.2 Type checking passes: `npx astro check` — e06485e
- [x] 3.3 Linting passes: `npm run lint` — e06485e

#### Manual

- [x] 3.4 Spot-read one persona's generated side-thread prompt reads in-character and asks for no score — e06485e

### Phase 4: Service method & errors

#### Automated

- [x] 4.1 Service unit tests pass (ownership, unavailable, rate-limit/cap, head precedence, persist ordering): `npm run test`
- [x] 4.2 Type checking passes: `npx astro check`
- [x] 4.3 Linting passes: `npm run lint`

### Phase 5: API route (POST-SSE)

#### Automated

- [ ] 5.1 Type checking passes: `npx astro check`
- [ ] 5.2 Linting passes: `npm run lint`
- [ ] 5.3 Production build passes: `npm run build`

#### Manual

- [ ] 5.4 POST with valid cookie streams `token` frames then `done`; 401/400/404/429 as specified
- [ ] 5.5 `npm run smoke` passes against a running server

### Phase 6: UI — expander, hook, SSR replay

#### Automated

- [ ] 6.1 Type checking passes: `npx astro check`
- [ ] 6.2 Linting passes (no new `console.*`): `npm run lint`
- [ ] 6.3 Production build passes: `npm run build`

#### Manual

- [ ] 6.4 "Dopytaj" streams an in-character multi-turn answer on an eligible persona
- [ ] 6.5 Reload restores every thread; ineligible personas show no affordance
- [ ] 6.6 Side thread during a live round-two stream neither blocks nor disturbs the debate
- [ ] 6.7 Keyboard + screen-reader pass; 375px/1280px layout; reduced-motion honored; AA contrast
- [ ] 6.8 Round-two card shows no side-thread affordance (opt-in prop respected)

# First Divergent Round (S-01) Implementation Plan

## Overview

Deliver the north-star slice: a logged-in user describes a decision (with optional context), starts the panel, and watches all four predefined advisors write their opinions in parallel, live — each with a score (1–10), a thesis, and streamed rationale — and the round-one opinions are saved to their account. This is the milestone that measures the Primary success criterion (average round-one score spread > 2 points). It replaces the DEV-only debug streaming route with real authenticated endpoints and ships the first feature UI in the pixel-retro design system.

## Current State Analysis

The two prerequisite foundations are done and archived, and they left clean contracts:

- **F-01 (advisor-llm-adapter):** `runPanel(deps, input, signal)` → `{ scores, stream }` fans out over `ADVISOR_REGISTRY` (optymista/sceptyk/pragmatyk/analityk), calling each persona's `complete()` (structured head) then `stream()` (rationale). Proven working via the DEV-only SSE route `src/pages/api/debug/advisor-stream.ts`, whose own comment says it "will be removed and replaced by S-01's real session/stream endpoint." The `OpenRouterAdapter` implements `complete()` (JSON head, one retry on invalid output) and `stream()` (token-by-token, `[DONE]` terminator, abort/timeout handling).
- **F-02 (session-store-rls):** `sessions` + `advisor_opinions` tables with RLS (per-op/per-role policies, `user_id default auth.uid()`), and `SessionRepository` (`createSession`, `saveOpinions`, `listSessions`, `getSession`) returning typed domain objects via `Result`. `unique(session_id, persona_id, round_number)` on `advisor_opinions`. **There is no method to read persisted opinions yet** — this slice adds one (the replay path depends on it).
- **Auth:** cookie-based Supabase client, `middleware.ts` resolving `locals.user`, `PROTECTED_ROUTES = ["/dashboard"]`.
- **Design system:** fully established in `src/styles/global.css` — tokens (violet `#b388ff` = interactive, cyan `#00e5ff` = scores), self-hosted pixel + mono fonts, `.pixel-panel` / `.pixel-btn` utilities, `blink` / `fade-up` keyframes, `--radius: 0`. `Layout.astro` pins `class="dark"`.

**Key gaps this slice must close:**

1. Nothing assembles `arguments[]` for persistence. `runPanel` currently validates the head against `AdvisorScoreSchema` (score + thesis only), while `saveOpinions` persists a full `AdvisorOpinion` (score + thesis + `arguments[]`). The `advisor_opinions` table has an `arguments jsonb` column but no rationale/prose column.
2. The `stream()` phase currently reuses each persona's JSON-only head prompt — there is no prose rationale prompt yet. The persona prompt files' comments explicitly anticipate "a later, separate call … to `stream()` a fuller rationale — this prompt does not build it yet."
3. No `@/lib/http` helper exists (backend.md §3/§6 reference a `json()` helper).
4. No service layer, no session/stream API routes, no feature UI, no `src/hooks/`.

## Desired End State

- Visiting `/sessions/new` (authenticated) shows a decision form that requires a decision and actively encourages context without blocking submission.
- Submitting creates a persisted session and lands the user on `/sessions/[id]`, where four advisor cards stream their opinions in parallel: score + thesis appear first, rationale types in live, done/error states are explicit.
- Round-one opinions (score + thesis + `arguments[]`) are persisted for each persona that succeeded; a failed persona shows an error card without failing the round.
- Reloading `/sessions/[id]` replays the persisted opinions instantly instead of re-calling the LLM.
- The round-one score spread is computed server-side and logged (structured) for milestone validation.

Verify: `npm run lint && npm run build` pass; unit tests for the upgraded `runPanel`, `SessionService`, and endpoints pass; manual walkthrough of the create → stream → reload flow works against a configured Supabase + OpenRouter.

### Key Discoveries:

- `runPanel` head schema is hardcoded at `src/lib/advisors/run-panel.ts:85` (`schema: AdvisorScoreSchema`) and the `stream()` call reuses the same `system`/`user` (`run-panel.ts:108-116`).
- `AdvisorOpinionSchema` already exists (`src/lib/schemas/advisor.ts:16`) = `AdvisorScoreSchema.extend({ arguments: z.array(z.string().min(1)).min(1) })` — the exact head shape we now want.
- `SessionRepository.saveOpinions(sessionId, roundNumber, opinions)` (`session.repository.ts:65`) already takes `{ personaId, opinion: AdvisorOpinion }[]` — persistence is ready once we produce `AdvisorOpinion` heads.
- The debug route (`api/debug/advisor-stream.ts`) is the working reference for SSE framing (`event: score|token|done|error`, abort listener, `finally` close) — copy its shape into the real endpoint, then delete it.
- Backend layering (`.claude/rules/backend.md` §1, §3): handler ≤ ~30 lines → one service → repository/adapter; services take deps as params, hold no Request/Response types; route file = resource (`api/sessions/index.ts`, `api/sessions/[id]/stream.ts`).
- Lesson: never use a leading-underscore path segment under `src/pages/**` (Astro treats it as private and 404s). Use plain `debug/`, `sessions/` names.
- ESLint `stylisticTypeChecked` requires `interface` for plain object shapes (lesson #2) — use `interface` for new DTOs/props, not `type`.

## What We're NOT Doing

- No round two, attribution, or synthesis (S-02 / S-03).
- No session history list or resume (S-05 / S-06); `/sessions/new` is reached directly or from the dashboard, not from a history index.
- No side-thread advisor questioning (S-04).
- No score-distribution **visualization** in the UI — PRD defers that to v2. The spread is logged only.
- No dedicated per-user rate limiter — replay-on-reload + the `unique(session,persona,round)` constraint are the spend cap for this slice; a real limiter is a recorded gap for a later slice.
- No changes to the auth/onboarding flow — existing sign-in gates the new routes; the onboarding-barrier open question is deferred (non-blocking).
- No new advisor personas or panel-composition selection (v2).
- No `updated_at` trigger or session-status transition — the session stays `active` after round one (round two continues it in S-02).

## Implementation Approach

Work bottom-up through the backend layers before the UI. Phase 1 upgrades the round-one advisor contract so the structured head carries the full opinion and the stream carries prose rationale. Phase 2 adds the HTTP helper and the `SessionService` that orchestrates create → run → persist → log, including the replay and partial-failure paths. Phase 3 exposes the two API routes and retires the debug route. Phases 4–5 build the decision form and the streaming advisor panel on the established design system.

The persistence model (per the planning decisions): the structured `complete()` head returns the full `AdvisorOpinion` (score + thesis + `arguments[]`) and **that** is persisted; the token `stream()` is a prose rendering for the FR-009 "watch it write" effect and is ephemeral. Persisted arguments and streamed prose are two generations of the same opinion — an accepted, documented divergence.

## Critical Implementation Details

- **Head prompt informs the rationale stream.** To keep the streamed prose consistent with the persisted `arguments[]`, build each persona's rationale-stream prompt *after* its head `complete()` resolves, threading the resolved thesis/arguments into it. `runPanel` already awaits `completion` inside the stream `start()` before reading tokens (`run-panel.ts:100`), so the resolved head is available at exactly the point the rationale prompt is built — no restructuring of the fan-out is needed.
- **Persist after the heads resolve, not after the stream ends — and survive a client disconnect on the edge.** The persisted opinion comes entirely from `scores` (the resolved heads). Hook persistence onto `scores.then(...)` in the service, independent of the token stream lifecycle, and persist only the personas whose head `Result` is `ok`. Two edge-runtime facts make "still saves on disconnect" require explicit handling — the naive version does **not** hold:
  - **Don't cancel the heads on client disconnect.** `runPanel` wires its `signal` into a shared `AbortController` that governs both `complete()` and `stream()` (`run-panel.ts:48-65`). If the route forwards the raw `request.signal`, a disconnect before the heads resolve aborts the `complete()` calls → `scores` resolve as errors → nothing persists. The stream route must therefore drive `runPanel` with a signal that is **not** aborted by client disconnect (e.g. an `AbortSignal.timeout(ms)` only, or an internal controller). Client disconnect still stops streaming to the client via the `ReadableStream` `cancel()` path — that only ends the token proxy, not the head completion or persistence.
  - **Keep the Worker alive for the persist tail.** On Cloudflare Workers, work continuing after the response stream ends/aborts is not guaranteed to run. Register the persist-and-log promise with `ctx.waitUntil(...)` in the stream route so the round is saved even when the client is gone. (Confirm the `waitUntil` access path via the Astro/Cloudflare adapter context during Phase 3.)
- **Replay must not re-run the LLM.** `runFirstRound` checks for existing round-one opinions first (`getOpinions(sessionId, 1)`); if present, it emits them as `score`/`done` frames from the DB and never constructs a provider. This is the cost guardrail. The replay check is a TOCTOU read, so it is a best-effort cost cap, **not** a hard idempotency guarantee — two concurrent `/stream` GETs can both pass it. The hard guarantee is the DB: `saveOpinions` is insert-only against `unique(session,persona,round)`, so the loser of a race raises a `DbError`. Treat a unique-violation error from `saveOpinions` as "already persisted by a concurrent run" → swallow it and **fall back to the replay path** (re-read via `getOpinions` and emit the persisted opinions) rather than surfacing a 500. Do not use the service-role key or a broad upsert (would let a second run overwrite a persisted opinion).

## Phase 1: Round-one advisor contract

### Overview

Make the structured head carry the full opinion (so it can be persisted) and give the personas a real prose rationale prompt for the live stream.

### Changes Required:

#### 1. Persona head prompts — emit arguments

**File**: `src/lib/prompts/advisor-{optymista,sceptyk,pragmatyk,analityk}.v1.ts`

**Intent**: Extend each head prompt's required JSON so the structured stage returns the discrete arguments alongside score and thesis, matching `AdvisorOpinionSchema`. Keep the "score before rationale" framing.

**Contract**: The required JSON shape becomes `{"score": <1-10>, "thesis": "<one sentence>", "arguments": ["<point>", …]}` (at least one argument). Prompt version stays `v1` (these prompts are unreleased). Add a second exported builder per persona, `buildRationalePrompt(input, head)`, returning `{ system, user }` for a prose (non-JSON) elaboration of the persona's own thesis/arguments — this is the anticipated "later streaming call."

#### 2. Advisor strategy + registry

**File**: `src/lib/advisors/registry.ts`

**Intent**: Add the rationale-prompt builder to the persona strategy so `runPanel` can prompt the stream phase distinctly from the head phase.

**Contract**: `AdvisorStrategy` gains `buildRationalePrompt(input: PanelInput, head: AdvisorOpinion): { system: string; user: string }`. Each registry entry wires its persona's builder. No change to `id`/`label`/`temperature`/order.

#### 3. runPanel head schema + rationale stream

**File**: `src/lib/advisors/run-panel.ts`

**Intent**: Validate the head against the full opinion schema and drive the stream from the rationale prompt built from the resolved head.

**Contract**: `complete<AdvisorOpinion>({ …, schema: AdvisorOpinionSchema })`; `RunPanelResult.scores` becomes `Promise<Result<AdvisorOpinion, LlmError>[]>`. Inside the stream `start()`, after `await completion`, build the rationale prompt via `persona.buildRationalePrompt(input, result.value)` and pass its `system`/`user` to `provider.stream(...)`. `PanelStreamChunk` unchanged.

#### 4. Update F-01 unit tests

**File**: `src/lib/advisors/run-panel.test.ts`, `src/lib/advisors/registry.test.ts`

**Intent**: Reflect the new head type and rationale-prompt wiring; assert heads validate as `AdvisorOpinion` and the stream call uses the rationale prompt.

**Contract**: Test doubles for `LlmProvider` return `AdvisorOpinion` heads; assert `buildRationalePrompt` is invoked with the resolved head.

#### 5. Relocate `PanelInputSchema` to the shared schema layer

**File**: `src/lib/schemas/panel.ts` (new), `src/lib/advisors/registry.ts`

**Intent**: `PanelInputSchema`/`PanelInput` currently live in `registry.ts`. The decision-form island needs them as its resolver; importing from `registry.ts` would pull the advisor registry (four persona prompts + `parse-score`) into the client bundle. Move them to the shared Zod layer (`src/lib/schemas`, designated "shared with frontend" in backend.md §1).

**Contract**: `PanelInputSchema` + `type PanelInput` move to `src/lib/schemas/panel.ts`; `registry.ts` re-exports (or imports) them from there so existing `@/lib/advisors/registry` importers keep working. Frontend imports the schema from `@/lib/schemas/panel`, never from `registry`.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test` (or the project's vitest invocation)
- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`

#### Manual Verification:

- Against a configured OpenRouter, `runPanel` heads contain non-empty `arguments[]` and the streamed prose reads as rationale, not JSON.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: HTTP helper + SessionService

### Overview

Add the shared JSON/error response helper and the service that orchestrates the round-one use case: create, run, persist successes, log the spread, and replay when opinions already exist.

### Changes Required:

#### 0. Repository read method (prerequisite for replay)

**File**: `src/lib/repositories/session.repository.ts`

**Intent**: Add the only missing data-access method — reading a session's persisted opinions for a round — so the service's replay/idempotency branch has a source. RLS scopes the query to the owner.

**Contract**: `getOpinions(sessionId: string, roundNumber: number): Promise<Result<AdvisorOpinionRecord[], DbError>>` — selects `advisor_opinions` filtered by `session_id` + `round_number`, ordered by persona for stable UI, parses each row via the existing `AdvisorOpinionRowSchema` → `toAdvisorOpinion`. Mirror the existing `listSessions` shape. Add a unit test alongside `session.repository.test.ts`.

#### 1. HTTP helper

**File**: `src/lib/http.ts`

**Intent**: Single place that maps a value to a JSON `Response` and an `AppError` to the canonical error envelope (backend.md §3/§6), so handlers never hand-build error responses.

**Contract**: `json(data, init?)` → `Response`; `errorResponse(error: AppError)` → `Response` with body `{ error: { code, message, details? } }` and `error.status`. Codes come from `@/lib/errors` `ErrorCode`.

#### 2. SessionService

**File**: `src/lib/services/session.service.ts`

**Intent**: Orchestrate the use case with injected `SessionRepository` + `LlmProvider` (no Request/Response types). Owns create, run-with-persist, replay, partial-failure handling, and spread logging.

**Contract**:
- `constructor(deps: { repository: SessionRepository; provider: LlmProvider })`.
- `createSession(input: PanelInput): Promise<Result<Session, AppError>>` — delegates to the repository.
- `runFirstRound(sessionId): Promise<Result<PanelRunView, AppError>>` — loads the session (`NotFoundError` when missing/not owned via RLS-null), then:
  - via `repository.getOpinions(sessionId, 1)`, if round-one opinions already exist → return a **replay** view (a stream that emits each persisted opinion as `score` + `done`, no provider constructed). Iterate the **registry order**, not just the persisted rows: a persona with a persisted row replays `score` + `done`; a registry persona with **no** persisted row (it failed on the first run) replays a single `error` frame so its card resolves instead of hanging. S-01 does **not** retry failed personas — the error state is terminal for the session (retry is a later slice);
  - else run `runPanel`, and on `scores` resolution persist the `ok` heads via `saveOpinions(sessionId, 1, successes)`, compute the spread over successful scores and log `{ msg: "round-one spread", sessionId, spread, personaCount }`, then return the live view (`scores` + `stream`) for the route to frame.
- `PanelRunView` exposes what the SSE route needs: an async source of `{ personaId, kind: "score"|"token"|"done"|"error", … }` domain events. Spread = max(score) − min(score) over successful personas, **guarded for degenerate rounds**: with fewer than 2 successful heads the spread is undefined — log `{ msg: "round-one spread", sessionId, spread: null, personaCount }` (never `-Infinity`/`NaN` from `Math.max()`/`Math.min()` over an empty set). A round where **all** personas fail persists nothing (`saveOpinions` is not called with an empty array), still returns a view that emits the per-persona `error` frames, and logs `spread: null, personaCount: 0`.

#### 3. Service unit tests

**File**: `src/lib/services/session.service.test.ts`

**Intent**: Cover create, live-run persistence, partial failure, replay, and spread logging with mocked repo + provider.

**Contract**: Assert: successful heads are persisted once; a failed persona is excluded from `saveOpinions` but surfaced as an error event; when `getSession`+existing opinions are present the provider is never called; spread is logged with the correct value.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm run test`
- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`

#### Manual Verification:

- Log output shows the `round-one spread` line with a numeric value after a run.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: API endpoints

### Overview

Expose `POST /api/sessions` (create) and `GET /api/sessions/[id]/stream` (SSE), retire the debug route, and protect the `/sessions` path.

### Changes Required:

#### 1. Create endpoint

**File**: `src/pages/api/sessions/index.ts`

**Intent**: Authenticated JSON handler that validates a `PanelInput`, creates the session, and returns its id.

**Contract**: `POST`. Order per backend.md §3: `locals.user` → 401; `Content-Type` JSON check; `PanelInputSchema.safeParse` → 400 with field errors; construct `SessionService` from the cookie Supabase client + `createLlmProvider()` (null client/provider → 503 `NOT_CONFIGURED`); `createSession` → 201 `{ id }` via `@/lib/http`. Handler ≤ ~30 lines.

#### 2. Stream endpoint

**File**: `src/pages/api/sessions/[id]/stream.ts`

**Intent**: Authenticated SSE endpoint that runs (or replays) the first round for a session the caller owns.

**Contract**: `GET`. Auth → 401; ownership enforced by RLS (service returns `NotFoundError` → 404); `runFirstRound(id)`; frame domain events as SSE (`event: score|token|done|error`, `data: JSON`) reusing the debug route's writer pattern (abort listener + `finally` close). Response headers `Content-Type: text/event-stream`, `Cache-Control: no-cache`. `score` frame carries `{ personaId, score, thesis, arguments }`. **Do not forward `request.signal` into `runPanel`'s head/persist path** (see Critical Implementation Details) — client disconnect closes the SSE writer but must not abort head completion or persistence. Register the persist-and-log tail with `ctx.waitUntil(...)` so a mid-stream disconnect still saves the round.

#### 3. Delete debug route

**File**: `src/pages/api/debug/advisor-stream.ts`

**Intent**: Remove the DEV-only proof route now that the real endpoint exists.

**Contract**: File deleted; no remaining imports reference it.

#### 4. Protect the sessions path

**File**: `src/middleware.ts`

**Intent**: Gate `/sessions/**` behind auth like `/dashboard`.

**Contract**: `PROTECTED_ROUTES = ["/dashboard", "/sessions"]`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`
- Production build passes: `npm run build`
- Auth-flow smoke test passes: `npm run smoke` (auth/API routes touched)

#### Manual Verification:

- Unauthenticated `GET /sessions/new` and the API routes redirect/401 appropriately.
- `POST /api/sessions` returns an id; `GET /api/sessions/[id]/stream` emits `score` then `token`/`done` frames; a second GET to the same id replays instantly with no new LLM cost (verify via provider logs).
- A different user cannot stream another user's session id (404).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Decision form

### Overview

The protected entry page and its form island: capture decision + context, create the session, and redirect to the panel.

### Changes Required:

#### 1. shadcn primitives

**File**: `src/components/ui/{input,textarea,label}.tsx`

**Intent**: Add the form primitives via `npx shadcn@latest add input textarea label`; restyle through tokens/`cva` only (no forked internals), per frontend.md §5.

**Contract**: Standard shadcn components under `src/components/ui/`, sharp corners inherited from `--radius: 0`.

#### 2. Decision form island

**File**: `src/components/decision-form/DecisionForm.tsx`

**Intent**: React Hook Form + Zod (reusing `PanelInputSchema`) form with a required decision, an optional context that is actively encouraged (helper text + a gentle warning when empty), and never-blocked submission (soft nudge). On submit, POST `/api/sessions` and redirect to `/sessions/[id]`.

**Contract**: Named export `DecisionForm`; props type declared as an `interface` above the component; three explicit async states (idle/submitting/error) with a visible error + retry on failure. Uses `PanelInputSchema` from `@/lib/schemas/panel` (relocated in Phase 1 #5 — never import it from `@/lib/advisors/registry`, which would bundle advisor internals into the client) as the resolver. Redirect via `window.location.assign(\`/sessions/${id}\`)`.

#### 3. New-session page

**File**: `src/pages/sessions/new.astro`

**Intent**: SSR page (protected by middleware) that renders the form island.

**Contract**: Uses `Layout.astro`; mounts `DecisionForm` with `client:load` (form is inherently interactive). Wraps content in `.pixel-panel`.

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`
- Production build passes: `npm run build`

#### Manual Verification:

- Form renders in the pixel-retro theme at 375px and 1280px; decision-required validation works; empty context shows the nudge but still submits.
- Submitting redirects to `/sessions/[id]`; a failed create shows an error with retry.
- Keyboard + focus-ring pass on all fields and the submit button.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 5: Advisor panel

### Overview

The `/sessions/[id]` page and the streaming panel: four advisor cards rendering the live (or replayed) round-one opinions.

### Changes Required:

#### 1. Panel page

**File**: `src/pages/sessions/[id].astro`

**Intent**: SSR page (protected) that loads the session server-side (ownership enforced) and mounts the panel island with the session and persona metadata.

**Contract**: Frontmatter fetches the session via the repository using `Astro.locals`; a missing/not-owned session renders a not-found state (no island). Passes serializable props only (`sessionId`, `decision`, `context`, and the registry `{ id, label }[]` — no functions/Dates). Mounts `AdvisorPanel` with `client:load`.

#### 2. Panel stream hook

**File**: `src/components/advisor-panel/usePanelStream.ts`

**Intent**: Feature-local hook that opens an `EventSource` to `/api/sessions/[id]/stream` and maintains per-persona state; aborts/closes on unmount.

**Contract**: `usePanelStream(sessionId, personaIds)` → `Record<personaId, { status: "pending"|"streaming"|"done"|"error"; score?; thesis?; arguments?; text: string; error?: string }>`. Handles `score`/`token`/`done`/`error` events; closes the `EventSource` on unmount and on the final `done`. (Feature-local per frontend.md §3; promote to `src/hooks/` only if reused.)

#### 3. Advisor card

**File**: `src/components/advisor-panel/AdvisorCard.tsx`

**Intent**: Render one persona's state: label + avatar area, score badge (cyan), thesis, streamed rationale with typewriter reveal, and explicit loading/error/done states.

**Contract**: Named export; props `interface` with the persona view state. Score shown as number **and** label (color is never the only signal). Streamed rationale in an `aria-live="polite"` region. Stream-interruption error preserves the partial text (frontend.md §8). Uses `.pixel-panel`; animations respect `prefers-reduced-motion`.

#### 4. Advisor panel

**File**: `src/components/advisor-panel/AdvisorPanel.tsx`

**Intent**: Lay out the four cards in a responsive grid and drive them from `usePanelStream`.

**Contract**: Named export; mobile-first grid (1 col → 2 cols at `sm:`+). Maps registry `{ id, label }[]` to `AdvisorCard`s keyed by `personaId`. No shared store needed (single island).

### Success Criteria:

#### Automated Verification:

- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`
- Production build passes: `npm run build`

#### Manual Verification:

- Creating a session streams four cards writing in parallel; score + thesis appear before rationale; rationale types in live.
- A persona failure shows an error card while the others complete; partial round persists.
- Reloading `/sessions/[id]` replays persisted opinions instantly (no live typing needed; no new LLM cost).
- `aria-live` announces streamed text; keyboard/focus pass; 375px and 1280px; animations off under `prefers-reduced-motion`; accent text meets WCAG AA on the dark background.
- Observed round-one spread on a real session exceeds 2 points (Primary criterion sanity check).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful.

---

## Testing Strategy

### Unit Tests:

- `runPanel`: heads validate as `AdvisorOpinion`; rationale prompt built from the resolved head; one persona failing doesn't abort siblings.
- `SessionService`: create; persist only successful heads; replay path constructs no provider; spread logged with the right value; partial-failure event surfaced.
- HTTP helper: error envelope shape and status mapping.

### Integration Tests:

- `POST /api/sessions` → `GET /api/sessions/[id]/stream` end-to-end against a mocked provider: SSE frame order (`score` → `token`* → `done`), replay on second GET, 401 unauthenticated, 404 cross-user.

### Manual Testing Steps:

1. Sign in, go to `/sessions/new`, submit a decision with no context — confirm the nudge appears and submission still proceeds.
2. On `/sessions/[id]`, watch four cards stream in parallel; confirm score+thesis precede rationale.
3. Reload the page — confirm instant replay and no new provider-log entries.
4. Force a persona failure (e.g. temporarily break one prompt/model) — confirm an error card and that the other three persist.
5. Check logs for the `round-one spread` line and confirm > 2 on a substantive decision.

## Performance Considerations

Four parallel `complete()` + `stream()` calls per run on the Cloudflare edge runtime — the known F-01 gotcha (streamed-response limits) is first exercised at real scale here. Persistence is hooked to `scores` (not stream end) so a mid-stream disconnect still saves. Replay avoids all repeat LLM cost. No memoization added preemptively.

## Migration Notes

No new migration — `sessions` and `advisor_opinions` from F-02 are sufficient. Forward-only; nothing to backfill.

## References

- Roadmap slice: `context/foundation/roadmap.md` (S-01, north star)
- PRD: `context/foundation/prd.md` (FR-001, FR-002, FR-003, FR-006, FR-009; Primary success criterion)
- Foundations: `context/archive/2026-09-23-advisor-llm-adapter/`, `context/archive/2026-09-23-session-store-rls/`
- Streaming reference: `src/pages/api/debug/advisor-stream.ts` (to be deleted)
- Backend rules: `.claude/rules/backend.md` §1–5; Frontend rules: `.claude/rules/frontend.md` §1–8
- Lessons: `context/foundation/lessons.md` (underscore paths; `type` vs `interface`)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Round-one advisor contract

#### Automated

- [x] 1.1 Unit tests pass: `npm run test`
- [x] 1.2 Type checking passes: `npx astro check`
- [x] 1.3 Linting passes: `npm run lint`

#### Manual

- [ ] 1.4 `runPanel` heads contain non-empty `arguments[]` and streamed prose reads as rationale

### Phase 2: HTTP helper + SessionService

#### Automated

- [ ] 2.1 Unit tests pass: `npm run test`
- [ ] 2.2 Type checking passes: `npx astro check`
- [ ] 2.3 Linting passes: `npm run lint`

#### Manual

- [ ] 2.4 Log output shows the `round-one spread` line with a numeric value

### Phase 3: API endpoints

#### Automated

- [ ] 3.1 Type checking passes: `npx astro check`
- [ ] 3.2 Linting passes: `npm run lint`
- [ ] 3.3 Production build passes: `npm run build`
- [ ] 3.4 Auth-flow smoke test passes: `npm run smoke`

#### Manual

- [ ] 3.5 Unauthenticated access to `/sessions/new` and the API routes redirects/401s
- [ ] 3.6 Create returns an id; stream emits score then token/done; second GET replays with no new LLM cost
- [ ] 3.7 A different user cannot stream another user's session id (404)

### Phase 4: Decision form

#### Automated

- [ ] 4.1 Type checking passes: `npx astro check`
- [ ] 4.2 Linting passes: `npm run lint`
- [ ] 4.3 Production build passes: `npm run build`

#### Manual

- [ ] 4.4 Form renders in the pixel-retro theme at 375px and 1280px; decision-required validation works; empty context nudges but still submits
- [ ] 4.5 Submitting redirects to `/sessions/[id]`; a failed create shows an error with retry
- [ ] 4.6 Keyboard + focus-ring pass on all fields and the submit button

### Phase 5: Advisor panel

#### Automated

- [ ] 5.1 Type checking passes: `npx astro check`
- [ ] 5.2 Linting passes: `npm run lint`
- [ ] 5.3 Production build passes: `npm run build`

#### Manual

- [ ] 5.4 Four cards stream in parallel; score + thesis precede rationale; rationale types in live
- [ ] 5.5 A persona failure shows an error card while the others complete and persist
- [ ] 5.6 Reloading replays persisted opinions instantly with no new LLM cost
- [ ] 5.7 `aria-live`, keyboard/focus, 375px + 1280px, reduced-motion, and WCAG AA accent contrast all pass
- [ ] 5.8 Observed round-one spread on a real session exceeds 2 points

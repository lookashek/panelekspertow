# Adapter LLM (OpenRouter) + rejestr predefiniowanych doradców — Implementation Plan

## Overview

Build the F-01 foundation for Panel Ekspertów: a minimal, provider-agnostic LLM **port** (`LlmProvider`) with a concrete **OpenRouter adapter**, a **registry of four predefined advisor personas** with deliberately conflicting profiles (optymista, sceptyk, pragmatyk, analityk), and a **`runPanel` orchestrator** that fires all personas in parallel with token-streamed responses. This change also creates the cross-cutting infra the backend rules assume but that does not yet exist (`@/lib/errors`, `@/lib/logger`, a `Result` type) and introduces Vitest as the project's first test runner. It serves FR-003 (parallel independent persona opinions), FR-009 (live token streaming), and the NFR score-spread guardrail (> 2 pkt divergence in round one). It deliberately excludes all round logic, session persistence, and UI — those belong to S-01+.

## Current State Analysis

- The codebase is the `10x-astro-starter` scaffold with only the auth flow wired. `src/lib/` holds `supabase.ts`, `config-status.ts`, `utils.ts` — no services, repositories, adapters, errors, logger, prompts, or schemas.
- `.claude/rules/backend.md` pre-decides the architecture this change must follow: layered handler → service → repository → **adapter**; the exact patterns are named — Adapter/Port (`LlmProvider` with `complete`/`stream`), Strategy (`AdvisorStrategy`: buildPrompt/parseScore), Factory (`createLlmProvider(name)`), `Result<T,E>` instead of throwing across layers, versioned prompt files `src/lib/prompts/<name>.v1.ts`, structured JSON outputs validated with Zod + one retry then `LLM_INVALID_OUTPUT`, mandatory `AbortSignal.timeout` + request-signal cancellation, structured JSON logging that never logs prompt/response bodies at `info`, and the Cloudflare constraint that a handler never awaits more than one round.
- `astro.config.mjs` `env.schema` declares only `SUPABASE_URL` / `SUPABASE_KEY` (server, secret, optional). There is no `OPENROUTER_API_KEY`. The env split (Node/Supabase CLI reads `.env`; Cloudflare local dev reads `.dev.vars`) must be kept in sync — CLAUDE.md §Environment.
- `src/lib/supabase.ts` establishes the null-on-missing-env factory pattern (returns `null` when secrets absent). The LLM factory should mirror this so callers can degrade instead of crashing.
- There is no unit-test framework — only `scripts/smoke.mjs`, a dependency-free node script run via `npm run smoke` against a live server. Zod is **not** yet a dependency (`@supabase/supabase-js` is present but Zod is not in `package.json`).

### Key Discoveries:

- Backend layering + pattern registry: `.claude/rules/backend.md:16-48` — adapters live in `src/lib/adapters/`, cross-cutting in `src/lib/errors.ts` / `src/lib/logger.ts` / `src/lib/schemas/`.
- LLM integration rules: `.claude/rules/backend.md:69-75` — all provider calls behind `LlmProvider`; prompts versioned; structured output validate-retry-once-then-fail; per-call logging fields; mandatory timeout + cancellation.
- Streaming contract shape: `.claude/rules/backend.md:56` — SSE `event: token|score|done|error`, handle `ctx.request.signal` abort, close writer in `finally`.
- Null-env factory precedent: `src/lib/supabase.ts:5-8`.
- Env schema location + `astro:env/server` import style: `astro.config.mjs:17-22`, `src/lib/supabase.ts:3`.
- Zod is required by the rules ("Every boundary … validated with Zod") but is **not installed** — this plan adds it.

## Desired End State

A developer can import `runPanel` (or `createLlmProvider` + a persona from the registry), pass a decision description, and receive four persona opinions produced **in parallel**, each yielding a Zod-validated `{ score, thesis }` **before** a token-streamed rationale. Divergence is real: on a representative decision the four default personas produce scores spanning > 2 points. A throwaway debug SSE route (`/api/_debug/advisor-stream`) demonstrates the streaming path works on the Cloudflare workerd runtime end-to-end. Vitest covers the pure logic (schemas, registry, parseScore, Result mapping, retry) with a mocked provider; a live smoke script exercises one real OpenRouter call when opted in. `npm run lint`, `astro check`, `npm run build`, and `npm run test` all pass.

**How to verify:** `npm run test` (Vitest units green), `npm run build` + `astro check` clean, and manually hitting `/api/_debug/advisor-stream` with a real key streams tokens and shows a > 2 pkt score spread across personas.

## What We're NOT Doing

- No round logic (isolated round one, round two attribution, synthesis) — that is S-01/S-02/S-03.
- No session persistence, no Supabase tables, no RLS — that is F-02 (`session-store-rls`).
- No UI, no React components, no advisor avatars — S-01.
- No real production session/stream endpoint (`src/pages/api/sessions/**`) — the only route here is a clearly-marked `_debug` proof route to be removed/replaced by S-01.
- No multi-provider adapters beyond OpenRouter (the `LlmProvider` interface makes them possible later; only `OpenRouterAdapter` is implemented now).
- No rate limiting, no idempotency keys, no cost counters — those attach to the real endpoints in slices.
- No per-persona model assignment — all personas share one env-overridable default model; divergence comes from prompt + temperature.

## Implementation Approach

Build bottom-up so each layer is verifiable before the next depends on it: (1) cross-cutting infra + config + test runner, (2) the provider port and OpenRouter adapter with the two-phase call contract, (3) the persona registry (Strategy) and versioned prompts that encode divergence, (4) the parallel `runPanel` orchestrator plus a debug SSE route and smoke script that prove parallel streaming on the edge runtime. The two-phase design (`complete()` returns validated `{score, thesis}` first, then `stream()` emits rationale tokens) satisfies "score before rationale" structurally while still streaming prose per FR-009. `runPanel` owns the fan-out (Promise.all + a shared AbortSignal) so S-01 only wires it to a route.

## Critical Implementation Details

- **Two-phase ordering is the load-bearing contract.** The score/thesis must come from a small, JSON-only `complete()` call that is Zod-validated and retried once on invalid output; only after it resolves does the rationale `stream()` run. Other slices depend on `{score, thesis}` existing before any rationale token. Do not collapse the two into one streamed JSON call.
- **Cancellation must compose two signals.** Each provider call combines `AbortSignal.timeout(ms)` with the caller's request signal (use `AbortSignal.any([...])`). In `runPanel`, one persona's failure or the caller aborting must cancel the siblings — do not let orphaned OpenRouter requests run on after the client disconnects.
- **Edge-runtime streaming is the flagged risk (roadmap F-01 §Risk).** The debug route exists specifically to measure whether parallel streamed responses hit Cloudflare workerd response limits now rather than at S-01. Use a `TransformStream`/`ReadableStream` and write SSE frames incrementally; never buffer the whole panel before responding.

## Phase 1: Cross-cutting infra & config

### Overview

Create the error/logger/Result primitives the backend rules reference, register the OpenRouter env vars, and stand up Vitest — the prerequisites every later phase imports.

### Changes Required:

#### 1. Error hierarchy

**File**: `src/lib/errors.ts`

**Intent**: Provide the `AppError` base and the `LlmError` subclass the rules mandate, so layers throw typed errors with stable `code`/`status` instead of raw strings.

**Contract**: `class AppError extends Error { code: string; status: number; cause?: unknown }`. Subclasses include `LlmError` and a `ValidationError`. Export a string-enum-like set of error codes including `LLM_INVALID_OUTPUT`, `LLM_TIMEOUT`, `LLM_PROVIDER_ERROR`, `NOT_CONFIGURED`. No throwing across layers where a `Result` is expected (see below); these types are for the failure arm.

#### 2. Result type

**File**: `src/lib/result.ts`

**Intent**: Add the `Result<T, E>` discriminated union the rules require for cross-layer returns, since thrown errors are easy to lose in Workers/streaming.

**Contract**: `type Result<T, E = AppError> = { ok: true; value: T } | { ok: false; error: E }` plus `ok(value)` / `err(error)` constructors. No dependency on any framework.

#### 3. Structured logger

**File**: `src/lib/logger.ts`

**Intent**: Provide the structured JSON logger the rules reference (`@/lib/logger`), with a `requestId`-aware child logger, so provider calls can log the mandated per-call fields.

**Contract**: `createLogger(base?: { requestId?: string; userId?: string })` returning `{ debug, info, warn, error }` that emit `{ level, msg, ...fields }` as JSON. Guardrail: helper must make it easy to log token counts/latency/model/persona while never logging prompt or response bodies at `info`.

#### 4. Env schema + local vars

**File**: `astro.config.mjs`

**Intent**: Register `OPENROUTER_API_KEY` (server, secret, optional — mirrors Supabase vars so a missing key degrades rather than crashes) and `DEFAULT_ADVISOR_MODEL` (server, non-secret, with a default).

**Contract**: Add to `env.schema`: `OPENROUTER_API_KEY: envField.string({ context: "server", access: "secret", optional: true })` and `DEFAULT_ADVISOR_MODEL: envField.string({ context: "server", access: "public", default: "<chosen default model id>" })`. Update `.dev.vars` and `.env` example/docs so both stay in sync (CLAUDE.md §Environment).

#### 5. Vitest setup

**File**: `package.json`, `vitest.config.ts`

**Intent**: Introduce the project's first unit-test runner for pure logic, resolving the `@/*` alias.

**Contract**: Add `vitest` (dev dep) and Zod (runtime dep) to `package.json`; add `"test": "vitest run"` and `"test:watch": "vitest"` scripts. `vitest.config.ts` resolves `@/*` → `./src/*`. State the new deps + reason in the PR per shared rules.

### Success Criteria:

#### Automated Verification:

- `npm run test` runs and reports zero failures (even with only a trivial placeholder test): `npm run test`
- Type checking passes: `astro check`
- Linting passes: `npm run lint`
- Build passes with the new env fields: `npm run build`

#### Manual Verification:

- `.dev.vars` and `.env` example both document `OPENROUTER_API_KEY` and `DEFAULT_ADVISOR_MODEL`; no secret is committed.

---

## Phase 2: LLM port & OpenRouter adapter

### Overview

Define the provider-agnostic `LlmProvider` interface, implement `OpenRouterAdapter` with the two-phase call contract, and add the factory + Zod I/O schemas with validate-retry-once semantics, timeouts, and cancellation.

### Changes Required:

#### 1. Provider port

**File**: `src/lib/adapters/llm-provider.ts`

**Intent**: Declare the interface all providers implement, exposing the two-phase contract so callers get a validated structured head before a streamed body.

**Contract**: `type LlmProvider = { complete<T>(req: CompleteRequest<T>): Promise<Result<T, LlmError>>; stream(req: StreamRequest): ReadableStream<StreamChunk> }` where `CompleteRequest` carries `{ model, system, user, schema: ZodType<T>, signal?, temperature? }` and `stream` carries `{ model, system, user, signal?, temperature? }`. `StreamChunk` is `{ type: "token"; text: string } | { type: "done" } | { type: "error"; error: LlmError }`. Signatures are a contract other phases depend on — keep stable.

#### 2. OpenRouter adapter

**File**: `src/lib/adapters/openrouter.adapter.ts`

**Intent**: Implement `LlmProvider` against OpenRouter's OpenAI-compatible chat completions API — `complete()` requests JSON and validates it, `stream()` proxies SSE token deltas.

**Contract**: `complete()` sends a non-streaming request asking for JSON matching the schema, parses + Zod-validates; on failure retries **once** with the validation error appended to the prompt, then returns `err(LlmError(LLM_INVALID_OUTPUT))`. `stream()` sends `stream: true`, translates OpenRouter SSE deltas into `StreamChunk` tokens, emits `done`/`error`. Both compose `AbortSignal.timeout(ms)` with the caller's signal via `AbortSignal.any`. Logs the mandated per-call fields (provider, model, persona, prompt version, token counts, latency) — never bodies at `info`. No direct vendor `fetch` escapes this file.

#### 3. Factory

**File**: `src/lib/adapters/create-llm-provider.ts`

**Intent**: Centralize env reading + null-handling for provider construction, mirroring `createClient` in `supabase.ts`.

**Contract**: `createLlmProvider(name?: "openrouter"): LlmProvider | null` — reads `OPENROUTER_API_KEY` from `astro:env/server`, returns `null` when absent (callers map to 503 `NOT_CONFIGURED`), otherwise returns a configured `OpenRouterAdapter`.

#### 4. Shared schemas

**File**: `src/lib/schemas/advisor.ts`

**Intent**: Define the Zod schemas for the structured head and the full opinion, shared between adapter, registry, and (later) frontend.

**Contract**: `AdvisorScoreSchema` = `{ score: number (int 1–10), thesis: string (non-empty) }` with inferred `AdvisorScore`; `AdvisorOpinionSchema` extends it with `arguments: string[]` (or the streamed rationale text) and inferred `AdvisorOpinion`. Score bound enforcement lives here.

### Success Criteria:

#### Automated Verification:

- Unit tests for schema validation, retry-once-then-fail, and Result mapping pass: `npm run test`
- Type checking passes: `astro check`
- Linting passes: `npm run lint`

#### Manual Verification:

- A mocked-provider unit test confirms `complete()` retries exactly once on malformed JSON and then returns `LLM_INVALID_OUTPUT`.
- Code review confirms no vendor `fetch` exists outside `openrouter.adapter.ts` and cancellation composes both signals.

---

## Phase 3: Advisor persona registry & prompts

### Overview

Encode the four divergent personas as `AdvisorStrategy` entries — each with a bias-carrying system prompt (versioned file) and its own temperature — plus `parseScore`, so the same decision input yields deliberately different opinions.

### Changes Required:

#### 1. Strategy type + registry

**File**: `src/lib/advisors/registry.ts`

**Intent**: Provide the `AdvisorStrategy` shape and the ordered registry of the four default personas, so `runPanel` and later slices select a stable panel composition.

**Contract**: `type AdvisorStrategy = { id: "optymista" | "sceptyk" | "pragmatyk" | "analityk"; label: string; buildPrompt(input: PanelInput): { system: string; user: string }; temperature: number; parseScore(raw: unknown): Result<AdvisorScore> }`. `ADVISOR_REGISTRY: AdvisorStrategy[]` exports the four personas in a stable order. Divergence levers: distinct bias prompt + per-persona temperature (e.g. optymista higher, analityk lower). No scoring anchor is baked in — scores must be reasoned, not fixed (avoids "theatre").

#### 2. Versioned persona prompts

**File**: `src/lib/prompts/advisor-optymista.v1.ts`, `advisor-sceptyk.v1.ts`, `advisor-pragmatyk.v1.ts`, `advisor-analityk.v1.ts`

**Intent**: Hold each persona's system prompt as a function of typed input (never string-concatenating raw user text), versioned per the rules, encoding the deliberate bias described in PRD §Business Logic (optymista przeszacowuje szanse, sceptyk szuka powodów do odmowy, pragmatyk redukuje do kosztu i wykonalności, analityk waży dowody).

**Contract**: Each exports `buildPrompt(input: PanelInput): { system: string; user: string }`. The system prompt instructs the persona to output the score-and-thesis JSON first (for `complete()`) and later a rationale (for `stream()`), stays universal (not domain-specific), and communicates the simulated nature per PRD design principle. `PanelInput` = `{ decision: string; context?: string }`, schema-validated before use.

#### 3. parseScore helper

**File**: `src/lib/advisors/parse-score.ts`

**Intent**: Shared, defensive parser mapping raw model JSON to `AdvisorScore` via the Zod schema, returning a `Result` rather than throwing.

**Contract**: `parseScore(raw: unknown): Result<AdvisorScore>` — validates with `AdvisorScoreSchema`, clamps/ rejects out-of-range scores, returns `err(LLM_INVALID_OUTPUT)` on failure.

### Success Criteria:

#### Automated Verification:

- Unit tests confirm all four personas build valid prompts and `parseScore` accepts valid / rejects invalid inputs: `npm run test`
- Registry exports exactly four personas with unique ids and distinct temperatures: `npm run test`
- Type checking + lint pass: `astro check` and `npm run lint`

#### Manual Verification:

- Reading the four prompt files, the biases are clearly distinct and universal (not domain-locked), and each asks for score/thesis JSON before rationale.

---

## Phase 4: Panel orchestrator, proof route & verification

### Overview

Add `runPanel` (parallel fan-out over the registry with shared cancellation), a `_debug` SSE route proving edge streaming, and a live smoke script — then confirm divergence and streaming end-to-end.

### Changes Required:

#### 1. Panel orchestrator

**File**: `src/lib/advisors/run-panel.ts`

**Intent**: Fire all registry personas' two-phase calls in parallel and merge them, so the "parallel, streamed responses" F-01 outcome is proven here and S-01 only wires it to a route.

**Contract**: `runPanel(deps: { provider: LlmProvider; personas?: AdvisorStrategy[] }, input: PanelInput, signal?: AbortSignal): { scores: Promise<Result<AdvisorScore>[]>; stream: ReadableStream<PanelStreamChunk> }` where `PanelStreamChunk` tags each chunk with its `personaId` (`{ personaId, chunk: StreamChunk }`). Uses `Promise.all` for the structured heads and merges per-persona rationale streams; a caller abort or a fatal error cancels siblings via a shared `AbortController`. Service receives `provider` as a parameter (no module-scope singleton import) per backend rules.

#### 2. Debug proof route

**File**: `src/pages/api/_debug/advisor-stream.ts`

**Intent**: A clearly-marked throwaway route that runs `runPanel` for a hardcoded/simple posted decision and streams SSE frames, to measure Cloudflare workerd streaming behavior now (roadmap F-01 risk).

**Contract**: POST handler: 503 `NOT_CONFIGURED` when `createLlmProvider()` is null; else returns `new Response(readable, { headers: { "Content-Type": "text/event-stream" } })` writing SSE frames `event: score|token|done|error` with a `personaId` field; handles `ctx.request.signal` abort and closes the writer in `finally`. File name prefix `_debug` marks it non-production; documented as removed/replaced by S-01.

#### 3. Live smoke script

**File**: `scripts/advisor-smoke.mjs`

**Intent**: Dependency-free node script (matching `scripts/smoke.mjs` convention) that makes one real OpenRouter panel call when opted in, printing per-persona scores and the spread.

**Contract**: Reads `OPENROUTER_API_KEY` from env; skips with a clear message when absent (so CI stays green without the secret). Prints the four scores and the min–max spread; exits non-zero only on a hard error, not on a low spread (spread is observed, not asserted, at foundation stage). Add `"smoke:advisor": "node scripts/advisor-smoke.mjs"` to `package.json`.

### Success Criteria:

#### Automated Verification:

- `runPanel` unit test (mocked provider) confirms parallel dispatch, per-persona tagging, and sibling cancellation on abort: `npm run test`
- Full suite, type check, lint, build all pass: `npm run test` && `astro check` && `npm run lint` && `npm run build`

#### Manual Verification:

- With a real key, hitting `/api/_debug/advisor-stream` streams tokens live (not one buffered blob) on `npm run dev` (workerd runtime).
- `npm run smoke:advisor` against a real key prints four persona scores whose spread exceeds 2 points on a representative decision (NFR divergence signal).
- Aborting the debug request (client disconnect) cancels in-flight OpenRouter calls (no orphaned work in logs).

---

## Testing Strategy

### Unit Tests:

- Zod schema validation: valid/invalid `AdvisorScore` and `AdvisorOpinion`, score-range enforcement.
- Adapter retry: `complete()` retries exactly once on malformed JSON, then returns `LLM_INVALID_OUTPUT` (mocked HTTP).
- Registry: four personas, unique ids, distinct temperatures, each `buildPrompt` returns non-empty system+user.
- `parseScore`: accepts valid, rejects out-of-range and malformed.
- `runPanel`: parallel dispatch, per-persona tagging, sibling cancellation on abort (mocked provider).
- `Result` constructors and error mapping.

### Integration Tests:

- Debug SSE route with a stubbed provider: emits `score` frames before `token` frames per persona, closes with `done`, handles abort. (Kept as a route-level test with a mocked provider; no live network in CI.)

### Manual Testing Steps:

1. Set `OPENROUTER_API_KEY` in `.dev.vars`, run `npm run dev`, POST a decision to `/api/_debug/advisor-stream`, confirm tokens stream live and each persona has a score.
2. Run `npm run smoke:advisor` and read the score spread (> 2 pkt on a representative decision).
3. Disconnect mid-stream and confirm in-flight calls cancel.

## Performance Considerations

Two-phase calling doubles the request count per persona (one structured `complete` + one `stream`); acceptable at foundation stage and revisited if S-01 latency demands it. `runPanel` runs personas concurrently, so wall-clock is bounded by the slowest persona, not the sum. The Cloudflare workerd streaming limit is the known risk — the debug route measures it before S-01 commits to the real endpoint.

## Migration Notes

No data migrations (F-02 owns the schema). The only forward step for consumers: a new `OPENROUTER_API_KEY` must be present in `.env` and `.dev.vars` for live calls; absence degrades to `NOT_CONFIGURED`, never a crash.

## References

- Roadmap item: `context/foundation/roadmap.md` F-01 (§Foundations, `advisor-llm-adapter`)
- Change identity: `context/changes/advisor-llm-adapter/change.md`
- PRD: `context/foundation/prd.md` FR-003, FR-009, NFR (rozrzut ocen > 2 pkt)
- Backend rules (authoritative architecture): `.claude/rules/backend.md` §1–2 (patterns), §5 (LLM integration), §6 (errors/logging), §3 (streaming/SSE)
- Null-env factory precedent: `src/lib/supabase.ts:5-8`
- Env schema: `astro.config.mjs:17-22`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Cross-cutting infra & config

#### Automated

- [x] 1.1 `npm run test` runs and reports zero failures — ae77e65
- [x] 1.2 Type checking passes: `astro check` — ae77e65
- [x] 1.3 Linting passes: `npm run lint` — ae77e65
- [x] 1.4 Build passes with the new env fields: `npm run build` — ae77e65

#### Manual

- [x] 1.5 `.dev.vars` and `.env` example document both new env vars; no secret committed — ae77e65

### Phase 2: LLM port & OpenRouter adapter

#### Automated

- [x] 2.1 Unit tests for schema validation, retry-once-then-fail, Result mapping pass — 1f776c1
- [x] 2.2 Type checking passes: `astro check` — 1f776c1
- [x] 2.3 Linting passes: `npm run lint` — 1f776c1

#### Manual

- [x] 2.4 Mocked-provider test confirms exactly-once retry then `LLM_INVALID_OUTPUT` — 1f776c1
- [x] 2.5 Review confirms no vendor `fetch` outside the adapter and cancellation composes both signals — 1f776c1

### Phase 3: Advisor persona registry & prompts

#### Automated

- [x] 3.1 Unit tests: all four personas build valid prompts; `parseScore` accepts valid / rejects invalid — 0e62cf1
- [x] 3.2 Registry exports exactly four personas with unique ids and distinct temperatures — 0e62cf1
- [x] 3.3 Type checking + lint pass: `astro check` and `npm run lint` — 0e62cf1

#### Manual

- [x] 3.4 Prompt biases are distinct, universal, and ask for score/thesis JSON before rationale — 0e62cf1

### Phase 4: Panel orchestrator, proof route & verification

#### Automated

- [x] 4.1 `runPanel` unit test confirms parallel dispatch, per-persona tagging, sibling cancellation — ac03276
- [x] 4.2 Full suite, type check, lint, build pass — ac03276

#### Manual

- [x] 4.3 Debug route streams tokens live on workerd (`npm run dev`) — a0a44f2
- [x] 4.4 `npm run smoke:advisor` prints four scores with spread > 2 pkt on a representative decision — a0a44f2
- [x] 4.5 Aborting the debug request cancels in-flight OpenRouter calls — a0a44f2

# Adapter LLM (OpenRouter) + rejestr doradców — Plan Brief

> Full plan: `context/changes/advisor-llm-adapter/plan.md`

## What & Why

Build the F-01 foundation for Panel Ekspertów: a provider-agnostic LLM port to OpenRouter capable of parallel, token-streamed responses, plus a registry of four predefined advisor personas with deliberately conflicting profiles (optymista, sceptyk, pragmatyk, analityk). This is the highest-fan-out foundation — S-01 through S-04 all build on it — and it de-risks the product's core hypothesis (that isolated personas produce *real* divergence, NFR > 2 pkt score spread) before any UI or round logic exists.

## Starting Point

The repo is the untouched `10x-astro-starter` with only the auth flow wired. `src/lib/` has no services, adapters, errors, logger, prompts, or schemas — and Zod isn't installed. The architecture is already dictated by `.claude/rules/backend.md` (Adapter/Port, Strategy, Factory, Result, versioned prompts, validate-retry-once, mandatory timeout/abort). There is no test runner, only a live `scripts/smoke.mjs`.

## Desired End State

A developer can call `runPanel(input)` and get four persona opinions produced in parallel, each yielding a Zod-validated `{score, thesis}` **before** a streamed rationale. A `_debug` SSE route proves streaming works on Cloudflare workerd; Vitest covers the pure logic; a live smoke script shows a > 2 pkt score spread. No rounds, no persistence, no UI.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Delivery boundary | Library code + a thin `_debug` proof route | Exercises the Cloudflare edge-streaming risk now instead of deferring it to S-01 | Plan |
| Streaming vs. structured output | Two-phase per persona: `complete()` returns validated `{score,thesis}`, then `stream()` emits rationale | Enforces "score before rationale" structurally while still streaming prose (FR-009) | Plan |
| Parallel fan-out | Include a `runPanel` orchestrator (Promise.all + shared abort) | "Parallel, streamed responses" is the literal F-01 outcome; S-01 just wires it | Plan |
| Verification | Vitest units (mocked provider) + opt-in live smoke script | Fast deterministic contract coverage plus one real end-to-end check | Plan |
| Model config | One shared env-overridable default model | Divergence comes from personas/params, not model mixing; multi-model stays possible | Plan |
| Divergence mechanism | Bias system prompt + per-persona temperature (no baked-in score anchor) | Two independent levers to hit > 2 pkt spread without faking scores | Plan |

## Scope

**In scope:** `LlmProvider` port + `OpenRouterAdapter` + factory; `errors`/`logger`/`Result` infra; Zod schemas; four-persona registry with versioned prompts; `runPanel`; `_debug` SSE route; Vitest + live smoke script; `OPENROUTER_API_KEY`/`DEFAULT_ADVISOR_MODEL` env.

**Out of scope:** round logic, session persistence/RLS (F-02), UI, real session endpoints, additional providers, rate limiting/idempotency, per-persona models.

## Architecture / Approach

Bottom-up in four layers: infra & config → provider port + adapter (two-phase, validate-retry-once, composed abort) → persona registry (Strategy) + versioned prompts → `runPanel` fan-out + debug SSE route + smoke script. All provider calls go through the port; the factory returns `null` on missing key (callers map to 503), mirroring `supabase.ts`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Infra & config | errors/logger/Result, env vars, Vitest + Zod | Introducing first test runner cleanly |
| 2. Port & adapter | `LlmProvider`, `OpenRouterAdapter`, factory, schemas | Retry/validation + composed cancellation correctness |
| 3. Persona registry | Four bias+temperature personas, versioned prompts, `parseScore` | Prompts must yield genuine, not theatrical, divergence |
| 4. Orchestrator & proof | `runPanel`, `_debug` SSE route, smoke script | Cloudflare workerd streaming limits under parallel load |

**Prerequisites:** None (parallel with F-02). Needs an OpenRouter API key for live verification.
**Estimated effort:** ~3–4 focused sessions across 4 phases.

## Open Risks & Assumptions

- Cloudflare workerd may cap parallel streamed responses — the `_debug` route exists to measure this before S-01 (roadmap F-01 §Risk).
- The > 2 pkt divergence NFR is *observed*, not asserted, at foundation stage; if prompts+temperature under-deliver, tuning happens before/at S-01.
- Two-phase calling doubles requests per persona — accepted now, revisited if S-01 latency demands it.
- Assumes OpenRouter's OpenAI-compatible chat/SSE API; a provider change would touch only the adapter.

## Success Criteria (Summary)

- `runPanel` returns four parallel persona opinions, each with a validated score+thesis before streamed rationale.
- The `_debug` route streams tokens live on workerd; aborting cancels in-flight calls.
- A representative decision produces a > 2 pkt score spread across personas.

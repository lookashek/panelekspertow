# Session Synthesis — Plan Brief

> Full plan: `context/changes/session-synthesis/plan.md`

## What & Why

Let the user **explicitly end a session and receive a synthesis** (S-03, FR-005, FR-010, US-01): points of agreement, **at least one real axis of dispute**, risks by weight, and a recommended next step. The mandatory dispute axis is the product's core promise — the synthesis must expose where the panel genuinely disagrees, never collapse into one smoothed "balanced opinion".

## Starting Point

The debate loop is built through round two. Rounds stream over `GET /api/sessions/[id]/stream?round=1|2`; `SessionService` owns round orchestration (ownership check, replay-vs-live, persist-on-`waitUntil`); `SessionRepository` is the sole Supabase caller; `sessions.status` is already `'active'|'completed'` with an UPDATE RLS policy but nothing sets `completed`; `OpenRouterAdapter.complete()` already retries once then returns `LLM_INVALID_OUTPUT`. Round-two attribution (merged days ago) is a near-exact template for every layer here.

## Desired End State

A session with round one complete shows an "END SESSION" trigger. Activating it streams the four structured sections plus a prose narrative, saves the synthesis, and marks the session `completed` (read-only). Reloading replays the persisted synthesis instantly with no further LLM cost. If the model can't produce a dispute axis after the built-in retry, the user sees an error+retry — never a fabricated consensus.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Delivery | Two-phase SSE (structured `synthesis` event + streamed prose) | Reuses the round stream infra and keeps the app's live-conversation identity through the conclusion | Plan |
| Persistence | New `session_syntheses` table (1:1, JSONB content, RLS) | Clean replay + ownership story consistent with `advisor_opinions`; keeps `sessions` lean | Plan |
| Endpoint | New `/api/sessions/[id]/synthesis` | Synthesis isn't a numbered round; a distinct resource keeps the round handler focused | Plan |
| Source opinions | Latest per persona (round 2 if present, else round 1) | Synthesizes the debate's final state while still working off round 1 alone (roadmap prereq) | Plan |
| Risks shape | `{ description, weight: high\|medium\|low }` | Zod-enforceable buckets, unambiguous "by weight", natural severity badge | Plan |
| Dispute-axis guarantee | Schema `disputeAxes.min(1)` + adapter retry-then-fail | Hard-enforces the core guardrail at the boundary using existing machinery; never renders consensus-only | Plan |
| End semantics | Mark `completed`, read-only, idempotent replay | Matches "explicitly end the session", cost-safe, consistent with round replay | Plan |

## Scope

**In scope:** synthesis schema + versioned prompt; `session_syntheses` migration + repository (`getSynthesis`/`saveSynthesis`/`completeSession`); single-generator `run-synthesis` orchestration; `SessionService.runSynthesis` + new SSE endpoint; frontend trigger, hook, and panel rendering the four sections + narrative; session marked `completed`.

**Out of scope:** regenerating/refining a synthesis; new rounds after completion (that's S-06); any fabricated-dispute fallback; per-persona fan-out for synthesis; new LLM model/env var; rate-limiting; changes to round 1/2 behavior or the existing stream endpoint.

## Architecture / Approach

Bottom-up, mirroring round-two-attribution with "single synthesizer" replacing "per-persona fan-out": schema/prompt → migration/repository → `run-synthesis` (one `complete()` + `stream()`, shared abort) → service (ownership, latest-per-persona merge, replay-vs-live, persist-tail that saves synthesis then flips status) → SSE route → island (gated trigger, streamed sections + narrative).

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Schema + prompt | `SynthesisSchema` (dispute `.min(1)`, weighted risks) + `synthesis.v1.ts` | Prompt that produces theatrical/empty dispute |
| 2. Migration + repository | `session_syntheses` table + RLS; `getSynthesis`/`saveSynthesis`/`completeSession` | RLS policy drift from the established pattern |
| 3. Orchestration | `run-synthesis.ts`: single two-phase call + abort | Head-failure vs stream lifecycle handling |
| 4. Service + SSE endpoint | `runSynthesis` + `/api/sessions/[id]/synthesis` | Persist ordering (save before status flip); merge correctness |
| 5. Frontend | Trigger + `useSynthesisStream` + `SynthesisPanel` | Making the dispute axis visually prominent; a11y of risk weights |

**Prerequisites:** S-01 (round one) merged — present. Local Supabase for the migration; a working OpenRouter key for manual verification.
**Estimated effort:** ~3–4 focused sessions across 5 phases (each phase small, patterns already established).

## Open Risks & Assumptions

- **Dispute theater** (PRD Open Q, roadmap S-03 unknown): the model may emit shallow/ritual dispute axes. The `.min(1)` schema guarantees presence, not quality — prompt tuning in Phase 1 and manual review are the controls.
- Assumes round-one-empty is guarded at the endpoint (direct reachability), not just hidden in the SSR page.
- Assumes storing decision-derived synthesis content is covered by the same privacy/retention posture as existing opinions (open roadmap question #3, owner: user) — no new posture introduced here.

## Success Criteria (Summary)

- Ending a session produces a synthesis that always shows ≥1 real axis of dispute, plus agreement points, weighted risks, and a next step — streamed live.
- The synthesis persists and replays identically on reload with no repeat LLM cost; the session is marked `completed` and read-only.
- A model that can't surface dispute fails visibly (error + retry) rather than showing a smoothed consensus.

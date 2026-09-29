# Plan Brief — Resume Session Round (S-06)

> Full plan: [`plan.md`](./plan.md) · Roadmap: S-06 `resume-session-round` · PRD: FR-008

## What & why

Let a signed-in user return to a saved session, **add new context, and run another confrontation round** — then re-synthesize. This closes FR-008 and completes the "return loop" (Stream B). "Another round" reuses the round-two mechanic (peer-aware confrontation + attributed score changes) generalized to an arbitrary round N. Cost is bounded per the roadmap risk ("bez limitu rund funkcja jest nieopłacalna"): a 5-round cap, a per-user rate limit, and shorter output for rounds > 2.

## Starting point

- Rounds are hard-coded to **1 and 2**: the stream route caps `round` at 2 and branches to `runFirstRound`/`runSecondRound`; the client hook types `round: 1 | 2`.
- The confrontation runner (`runSecondRoundPanel`) already takes a caller-supplied `priorHeads` seed — it isn't intrinsically "round 2".
- `advisor_opinions` already allows round ≥ 3 (`round_number >= 1`, unique per session/persona/round). No cap in the schema.
- `context` is a **single, immutable** column — there is nowhere to store per-round added context today.
- Synthesis reads rounds 1 and 2 explicitly and flips the session to `completed`.
- No `max_tokens` is ever sent to the LLM; the port has no token-limit field.
- `EventSource` (the streaming transport) is GET-only, so added context must be persisted before the round runs — matching the existing side-thread persist-then-stream pattern.

## Key decisions

| # | Decision | Choice | Why |
|---|----------|--------|-----|
| 1 | Round-N mechanic | **Generalize round-two confrontation** to round N | Reuses `runSecondRoundPanel`/`resolveRoundTwo` almost verbatim; matches FR-008's debate-continuation intent |
| 2 | Added-context storage | **New `session_rounds` table** (round_number, added_context) | Preserves per-round provenance, matches additive-migration + RLS pattern, doubles as the round-limit counter |
| 3 | Reopening a completed session | **Reopen to `active`, delete stale synthesis, require re-synthesis** | Keeps synthesis truthful; reuses the existing "no synthesis yet" UI path — no flag/column |
| 4 | Round limit | **5 total rounds** (`MAX_ROUNDS = 5`) | Room to iterate while bounding cost; one constant beside existing guardrails |
| 5 | Context required to resume? | **Required** (non-empty) | FR-008 = "dorzucić nowy kontekst"; prevents spending a round on nothing new |
| 6 | Stale synthesis handling | **Delete the row on reopen** | Single source of truth; no versioning/superseded column for an MVP |
| 7 | Entry point | **Panel on the detail page** (`[id].astro`) | Reuses the page that already loads full session state; no new route; S-05 list just links here |
| 8 | Cost controls this slice | **Round limit + per-user rate limit + shorter responses (>2)**; no cache | Rate limit is mandated by backend.md §7; cache is ~useless (new context every round) |
| 9 | "Shorter responses" mechanism | **Lower max-tokens + cap arguments (≤2)** for round > 2 | Bounds cost with well-formed (not truncated) shorter opinions |

## Phases

| Phase | Scope | Verification |
|-------|-------|--------------|
| 1 | `session_rounds` table (+RLS), domain type/mapper, repo methods (`createRound`, `getRounds`, `deleteSynthesis`, `reopenSession`, `countRecentRoundsByUser`, `getMaxRoundNumber`) | types, lint, migration applies |
| 2 | `maxTokens` on LLM port + OpenRouter body; generalize `runSecondRoundPanel` with `concise` option; prompt brevity clause; `MAX_ROUNDS` + `RESUME_RATE_*` constants | `npm run test`, types, lint |
| 3 | Service: `runConfrontationRound(round)`, `startResumedRound` (guards + reopen + persist), generalized synthesis merge, `RoundLimitReachedError` | `npm run test`, types, lint |
| 4 | POST `/api/sessions/[id]/resume`; widen GET `/stream` round param + confrontation branch | types, lint, build, `npm run smoke` |
| 5 | `ResumePanel` island + generalized `[id].astro` round history; widen `usePanelStream` round type | types, lint, build + manual |

- **Prerequisites:** S-05 (session-history, planned) and S-02 (round-two-attribution, done) — both satisfied.
- **Estimated effort:** Medium–large. The confrontation mechanic and rate-limit/persist patterns are reused; the new surface is one table, one POST route, and the round-history/resume UI. Highest-risk pieces: the synthesis-merge generalization and the reopen/delete-synthesis ordering.

## Risks & mitigations

- **Round-number races** → server-authoritative next-round from `max(round)+1`, guarded by `unique(session_id, round_number)` on `session_rounds` (second writer 409s).
- **Reopen leaves a window with no synthesis but `completed` status** → delete synthesis *then* reopen; log a failed round-row insert (session stays `active`, retry-safe).
- **Regressing round 2** → `concise` defaults false; a regression test asserts round-two output is byte-unchanged.
- **N+1 on synthesis/round-history load** → prefer a single session-scoped opinions read ordered by round.

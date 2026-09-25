# First Divergent Round (S-01) — Plan Brief

> Full plan: `context/changes/first-divergent-round/plan.md`

## What & Why

S-01 is the product's north-star slice: a logged-in user describes a decision, starts the panel, and watches four predefined advisors write deliberately divergent opinions in parallel, live (score 1–10, thesis, streamed rationale), with the round saved to their account. It's the milestone that proves the core hypothesis — forced divergence — by measuring the Primary criterion (average round-one score spread > 2 points).

## Starting Point

The two foundations are done and archived: F-01 left a working parallel fan-out (`runPanel` → `{ scores, stream }`) proven via a DEV-only debug SSE route, plus the four-persona registry and OpenRouter adapter; F-02 left the `sessions` + `advisor_opinions` tables with RLS and a `SessionRepository`. Auth, middleware, and the full pixel-retro design system (tokens, fonts, `.pixel-panel`) already exist. What's missing is everything that turns those parts into a round: a service, real endpoints, and the UI — plus the wiring that makes an opinion persistable.

## Desired End State

`/sessions/new` shows a decision form; submitting creates a session and lands on `/sessions/[id]`, where four cards stream their opinions in parallel and the round-one opinions (score + thesis + arguments) are saved. Reloading replays the saved opinions instantly. The round-one score spread is logged for milestone validation. The debug route is gone.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| How an opinion is persisted | Structured head carries score+thesis+`arguments[]`; token stream is ephemeral prose | Table has an `arguments jsonb` column but no rationale column, and S-02 attribution needs discrete arguments | Plan |
| Create → stream flow | `POST /api/sessions` then `GET /api/sessions/[id]/stream` (EventSource) | Session persists before any LLM spend; RLS-by-id; reload/replay-friendly; fits the edge "one round per request" rule | Plan |
| Reload behavior | Replay persisted opinions, don't re-run the LLM | Honors the `unique(session,persona,round)` constraint and caps cost | Plan |
| Context input (FR-002) | Soft nudge — required decision, encouraged-but-optional context, never blocked | Honors "actively asks for context" without gating the PRD's open-domain trivial decisions | Plan |
| Partial failure | Persist the personas that succeeded; show an error card for the one that failed | Partial results are useful (runPanel's own design) and spread still measures on 3+ | Plan |
| Cost guardrail | Lean on replay + unique constraint; defer a per-user rate limiter | Keeps the critical-path validation slice lean within the 3-week budget | Plan |
| Spread measurement | Compute and log server-side; no UI | Gives the milestone signal without the score-distribution viz the PRD defers to v2 | Plan |

## Scope

**In scope:** round-one contract upgrade (head returns full opinion + prose rationale prompt); `@/lib/http` helper; `SessionService` (create, run+persist, replay, spread log); `POST /api/sessions` + `GET /api/sessions/[id]/stream`; delete debug route; protect `/sessions`; decision form page + island; advisor panel page + island + stream hook + cards.

**Out of scope:** round two / attribution / synthesis (S-02/S-03); session history + resume (S-05/S-06); side threads (S-04); score-distribution visualization; per-user rate limiter; onboarding changes; new personas; DB migrations.

## Architecture / Approach

Bottom-up through the backend layers, then UI. Handler → `SessionService` → `SessionRepository` / `LlmProvider` per backend.md layering. The structured `complete()` head (validated against the existing `AdvisorOpinionSchema`) is the persisted source of truth; the `stream()` phase gets a new per-persona rationale prompt built from the resolved head for the live FR-009 effect. Persistence hooks onto the resolved heads (not stream end) so a mid-stream disconnect still saves. The UI mounts one React island per page over the established pixel-retro design system, consuming the SSE stream via an `EventSource` hook.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Round-one advisor contract | Head returns full opinion; personas gain a prose rationale prompt | Touches the "done" F-01 foundation; prose vs stored-arguments divergence |
| 2. HTTP helper + SessionService | Create/run/persist/replay/spread-log orchestration | Persisting from resolved heads while a stream is live |
| 3. API endpoints | `POST /api/sessions`, `GET …/stream`; debug route deleted | SSE + abort handling on the edge runtime; RLS ownership |
| 4. Decision form | `/sessions/new` page + form island | Soft-nudge UX that honors FR-002 without blocking |
| 5. Advisor panel | `/sessions/[id]` page, panel, cards, stream hook | Parallel edge streaming limits; a11y of live text; replay rendering |

**Prerequisites:** F-01 and F-02 (done); a configured Supabase + OpenRouter for manual verification.
**Estimated effort:** ~3–5 focused sessions across 5 phases (backend-heavy phases 1–3, UI phases 4–5).

## Open Risks & Assumptions

- Parallel four-persona streaming on the Cloudflare edge runtime is first exercised at real scale here — the known F-01 gotcha (streamed-response limits) could surface.
- Stored `arguments[]` and streamed prose are two generations of the same opinion; building the rationale prompt from the resolved head keeps them consistent but not identical (accepted).
- No rate limiter means a user creating many distinct sessions rapidly is uncapped this slice (recorded gap).
- The onboarding-barrier open question (PRD #1) is deferred; existing auth gates the new routes.

## Success Criteria (Summary)

- A user can describe a decision and watch four advisors stream divergent opinions in parallel, then see the round saved to their account.
- Reloading the session replays the saved opinions with no new LLM cost.
- On a substantive decision, the logged round-one score spread exceeds 2 points (Primary criterion).

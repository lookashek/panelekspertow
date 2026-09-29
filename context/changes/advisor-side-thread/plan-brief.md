# Advisor Side Thread (FR-007) — Plan Brief

> Full plan: `context/changes/advisor-side-thread/plan.md`

## What & Why

Let a user probe a chosen advisor with follow-up questions in a side thread — "dopytać wybraną personę w wątku
pobocznym, nie przerywając debaty" (FR-007, must-have). The main debate (round one/two, synthesis) has shipped;
this adds the one PRD requirement the core loop doesn't cover: a private, in-character Q&A with a single persona
that runs alongside — never interrupts — the panel.

## Starting Point

The full vertical-slice machinery exists and is reused wholesale: SSR page + `client:load` islands, an SSE streaming
path (`GET /stream` → `SessionService` → `PanelRunView` → `usePanelStream`), the two-phase `LlmProvider`, versioned
per-persona Strategy prompts, and a `SessionRepository` + row-mapping layer with RLS-isolated tables. No side-thread
data, prompt, service, route, or UI exists yet.

## Desired End State

Each advisor card whose persona spoke in round one shows a "Dopytaj" chat. The user asks; the persona answers
in-character, grounded in its own latest opinion, streamed live; the exchange is saved and multi-turn. Reloading
restores every thread. The round panels and synthesis are entirely unaffected.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Conversation model | Multi-turn chat | "Dopytać" means probing until satisfied; persona sees the running thread each turn. |
| Persona grounding | Own head + decision only | Probing *that* advisor's stated position; no peer leakage keeps voices divergent. |
| Persistence | Persist + replay | Consistent with the whole app (FR-006), feeds session-history, nothing lost on reload. |
| Thread scope | One thread per persona | Clean model keyed by (session, persona); matches "wybraną personę". |
| UI surface | Per-card expander | Thread stays bound to the persona and the debate stays on screen — "without interrupting" by construction. |
| Availability | Any persona with a round-1 opinion | Earliest useful moment (S-01 prereq); available through round two and after synthesis. |
| Cost bounds | Rate-limit + msg cap, independent surface | Satisfies backend.md §7 and the roadmap's cost risk; never blocks a live round stream. |
| Transport | POST returning SSE (fetch reader) | `EventSource` is GET-only, but a question carries a body — new hook, not `usePanelStream`. |
| LLM shape | `stream()` only, no `complete()` | A conversational answer has no structured head/score. |

## Scope

**In scope:** append-only `advisor_side_thread_messages` table (RLS); repository save/read/count methods; a `v1`
side-thread prompt per persona; `SessionService.askSideThread` with ownership check, head resolution, cap + rate
limit, persist-tail; a `POST /api/sessions/[id]/side-thread` SSE route; SSR replay + a "Dopytaj" expander, hook,
and chat component.

**Out of scope:** cross-persona / whole-panel threads; peer or synthesis context in answers; any score/structured
head; editing/deleting messages; new provider/model/KV binding; threads before round one; any change to the
existing debate flows.

## Architecture / Approach

Bottom-up vertical slice: **data → repository → prompts → service → API → UI**. The service copies the synthesis
persist-tail + replay split (live stream while a `waitUntil` tail accumulates and saves the text; reload renders the
saved text with no LLM call). The only genuinely new mechanic is the POST-SSE transport, because the request carries
`{ personaId, message }`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Data model & schemas | Migration + row/domain/input schemas + constants | RLS policy shape must match `advisor_opinions` |
| 2. Repository methods | save / ordered read / cap + rate-limit counts | Deterministic ordering; count-only queries (no N+1) |
| 3. Prompt surface | `buildSideThreadPrompt` on the Strategy + 4 personas | Staying in-character without re-opening a score |
| 4. Service & errors | `askSideThread`: guards, persist ordering, stream | Head precedence + persist-before-stream correctness |
| 5. API route | POST-SSE endpoint with abort + `waitUntil` | Error→status mapping (429/404/400) and CSRF guard |
| 6. UI | SSR replay, opt-in expander, POST-SSE hook, chat | Manual SSE parsing; opt-in prop so round two stays clean |

**Prerequisites:** S-01 shipped (round-one opinions exist and are persisted) — satisfied.
**Estimated effort:** ~3–5 focused sessions across 6 phases (MEDIUM, leaning HIGH due to the new conversational model).

## Open Risks & Assumptions

- **Scope pressure**: the roadmap flags S-04 as a parking candidate against the 3-week budget; multi-turn + persistence
  is the richer end of the design and the largest slice — if time tightens, the ephemeral single-exchange variant is
  the fallback cut.
- **Manual SSE parsing** on the client (POST can't use `EventSource`) is the one novel bit of plumbing; frame handling
  must match the server's `\n\n` framing exactly.
- **Rate limit is a DB count**, not KV — simple and dependency-free, but a rough global-per-user guard, not precise.
- Assumes `advisor_opinions.persona_id` representation can be mirrored directly for the new table's `persona_id`.

## Success Criteria (Summary)

- A user can ask an eligible persona a follow-up and get a streamed, in-character answer that reflects that persona's
  own opinion and prior turns — while the debate panels stay untouched.
- Threads survive reload (persisted + replayed); ineligible personas offer no side thread.
- Cost is bounded: per-thread cap, max input length, and per-user rate limit all enforced, with graceful 429s.

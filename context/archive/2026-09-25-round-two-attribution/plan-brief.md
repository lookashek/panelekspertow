# Round Two — Attribution (S-02) — Plan Brief

> Full plan: `context/changes/round-two-attribution/plan.md`

## What & Why

S-02 adds a user-triggered **second debate round** to a session: each advisor that opined in round one
now sees the others' round-one positions, reacts, and emits a fresh opinion — and **when its score
changes it must name the single peer whose argument convinced it and quote that argument**. This is
FR-004 and the evidence for the PRD Secondary criterion (≥1 persona changes its score and points to
the author who convinced it). It also carries the "run another round" half of FR-010. Attribution
quality — not the mechanic — is the flagged risk (PRD Open Question #2, "attribution theater").

## Starting Point

Round one (S-01) is done and archived. It left a parallel two-phase fan-out (`runPanel` → head then
streamed rationale, partial-failure tolerant), a four-persona strategy registry, a round-aware
`advisor_opinions` table (`unique(session_id, persona_id, round_number)`), a `SessionService` with
replay-by-unique-constraint, an SSE stream endpoint, and the pixel-retro panel UI. What's missing:
peer-aware prompts, any place to store attribution, a round-two service path, and the UI to trigger
and show it.

## Desired End State

On `/sessions/[id]`, once round one has ≥2 opinions a "Runda 2" trigger appears. Activating it streams
a second card set below round one: each advisor shows its new score with a delta vs round one
(`6 → 8 ▲`), streamed reaction prose, and — when the score moved — a "Przekonał: Sceptyk" badge with
the quoted peer argument. Round two persists and replays on reload with no new LLM cost. The session
stays `active` (ending → synthesis is S-03).

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Attribution model | One author, only when the score changes; nullable | Matches FR-004 literally and gives the Secondary criterion a clean, falsifiable signal | Plan |
| Round-two latitude | Full fresh opinion (score, thesis, arguments) + attribution | A genuine second position after seeing peers is the point of confrontation; reuses `AdvisorOpinionSchema` | Plan |
| Anti-"theater" control | Prompt honesty (no-change allowed) + must quote the peer argument + server-enforced invariant + metrics log | Attacks OQ#2 at prompt and data layers and makes it measurable | Plan |
| FR-010 context-add | Deferred to S-06; S-02 ships a plain "run round two" trigger | Keeps the slice focused within the 3-week budget; S-06 owns context injection | Plan |
| Round-two UX | New section below round one; delta + author badge | Preserves before/after contrast that makes attribution meaningful | Plan |
| Backend trigger | Reuse `GET …/stream?round=2` | One SSE contract; honors the edge "one round per request" + replay rules | Plan |
| Availability / partial failure | Enable at ≥2 persisted round-one opinions; skip personas that failed round one | Round two always has real peers to react to; degrades gracefully | Plan |
| Session lifecycle | Stays `active`; no synthesis, no completion | Clean boundary against S-03/S-06 | Plan |

## Scope

**In scope:** additive attribution migration + schemas; peer-aware round-two prompts (×4) + registry;
`runSecondRoundPanel`; `SessionService.runSecondRound` with attribution persistence + metrics;
`?round=2` endpoint routing; round-two trigger + panel + delta/attribution UI.

**Out of scope:** synthesis / session end (S-03); mid-session context add (S-06); rounds beyond two;
retrying failed personas; multi-author attribution; charted round-over-round viz (v2); rate limiting.

## Architecture / Approach

Bottom-up through handler → service → repository → adapter, mirroring S-01. The round-two structured
head is the persisted source of truth; the LLM returns `attribution` (null or
`{convincedByPersonaId, quotedPeerArgument}`), and the **server** derives `previousScore` and is the
authority on the "attribution present iff score changed" invariant. `runSecondRoundPanel` reuses the
existing shared-controller / partial-failure / merge machinery, injecting peers' round-one heads. The
endpoint branches on a validated `round` param; the UI reuses `usePanelStream` (parameterized by round)
and `AdvisorCard` (extended with delta + badge), reading attribution straight off the `score` frame.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Data model | Additive attribution columns + round-two schema | CHECK-constraint co-presence invariant |
| 2. Prompts + registry | Peer-aware round-two builders per persona | Prompt honesty ≠ guarantee against theater |
| 3. Fan-out | `runSecondRoundPanel` peer-aware parallel run | Reusing controller/merge without duplication |
| 4. Service + persistence | `runSecondRound`, attribution derivation, metrics | Server-side invariant enforcement correctness |
| 5. Endpoint | `?round=2` routing + attribution frame | Param validation; not re-triggering LLM cost |
| 6. Frontend | Trigger + round-two panel + delta/badge | Deferred connect (no eager round-two LLM call); a11y |

**Prerequisites:** S-01, F-01, F-02 (done); configured Supabase + OpenRouter for manual verification.
**Estimated effort:** ~3–5 focused sessions (backend-heavy phases 1–5, UI phase 6).

## Open Risks & Assumptions

- Attribution genuineness is guarded by prompt design + a server invariant + metrics, but not
  hard-guaranteed — the Secondary criterion is judged manually on real sessions (PRD OQ#2).
- Parallel four-persona streaming re-exercises the known Cloudflare edge streamed-response limit (F-01).
- The round-two structured head and its streamed prose are two generations of the same opinion; the
  rationale prompt is built from the resolved head to keep them consistent, not identical (accepted).
- No rate limiter this slice; replay + unique constraint cap per-session cost.

## Success Criteria (Summary)

- After round one, a user can run round two and watch ≥1 advisor change its score and name + quote the
  peer that convinced it.
- Reloading replays both rounds with no new LLM cost; the session stays active.
- Server logs round-two change/attribution/spread metrics for evaluating attribution quality.

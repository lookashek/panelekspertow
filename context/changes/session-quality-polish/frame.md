# Frame Brief: Session quality polish (S-07 / FR-011)

> Framing step before /10x-plan. This document captures what is *actually*
> at issue, separated from what was initially assumed.

## Reported Observation

After a manual MVP test: advisor texts are too long; the session "cuts off"
after synthesis with no further action; and, in the user's words, "brakuje
przycisków, pierwsza sesja, klikam drugą, klikam podsumowanie" — the session
should be generally more user-friendly (`prd.md:117-121`, OQ#6 `prd.md:161`).

## Initial Framing (preserved)

- **User's stated cause or approach**: answers are too long; there is no clear action at the end of the session.
- **User's proposed direction**: make advisor answers shorter in all rounds; add a clear action at the bottom of the screen after synthesis.
- **Pre-dispatch narrowing**:
  - Length = "the prose paragraph is long" **and** "too much on screen" (not "same points twice").
  - Ending = "Nothing / haven't rechecked". The complaint predates the user re-checking the `NOWA DECYZJA` link added in `8648c01` (2026-09-29).
  - "Generally better" = **missing buttons along the whole flow** (round 1 → round 2 → synthesis); the user delegated the UX shape ("sam przemyśl jak to powinno wyglądać").

## Dimension Map

1. **Prose prompt wording** — rationale prompts ask the model to expand ("rozbuduj", "pełniejsze"), so each paragraph runs long. ← initial framing (length)
2. **Page density / layout** — 4 cards × N rounds + synthesis, all expanded, each card restating the position 3×.
3. **Forward actions between steps** — the round-2 / synthesis buttons are missing or out of reach at some point in the lifecycle.
4. **End-of-session action** — nothing after synthesis. ← initial framing (ending)

## Hypothesis Investigation

| Hypothesis | Evidence | Verdict |
| --- | --- | --- |
| 1. Prompt wording inflates prose | All 4 persona files say "rozbuduj … dodaj niuanse i przykłady" / "pełniejsze, płynne uzasadnienie" (`advisor-sceptyk.v1.ts:41`, `:52`, `:120`, `:140`); no `max_tokens` anywhere (`openrouter.adapter.ts:74-80`, `:188-193`); see research.md §1 | STRONG |
| 2. Density / layout | No collapse anywhere; finished rounds stay fully expanded; round 2 is appended below round 1 (`RoundTwoPanel.tsx:55-58`); each card renders thesis + prose + argument list unconditionally (`AdvisorCard.tsx:84`, `:98-109`); 2-col only from `sm`, ~490px columns of monospace prose; synthesis = 5 stacked blocks with the narrative last (`SynthesisPanel.tsx:69-134`) | STRONG |
| 3. Forward actions missing in the flow | `roundTwoAvailable` / `synthesisAvailable` are computed **once in SSR** from persisted round-1 opinions (`sessions/[id].astro:38-52`). Opinions are saved only at the end of the SSE stream (`session.service.ts:847`), which opens after hydration. `DecisionForm.tsx:63` navigates to the page right after creation, so SSR sees 0 opinions → both panels `return null` (`RoundTwoPanel.tsx:50-52`, `SynthesisPanel.tsx:161-163`). Nothing re-evaluates on the client; islands share no state. **On a fresh session, round 1 ends in a dead end; the buttons appear only after F5.** After a reload, both buttons stack below all cards with no auto-scroll (no `scrollIntoView` in `src/`). `ZAKOŃCZ SESJĘ` is not gated on round 2 finishing. A total round-1 failure leaves no retry. | STRONG |
| 4. Nothing after synthesis | `NOWA DECYZJA` exists (`SynthesisPanel.tsx:145-152`, `8648c01`) and shows on revisit via replay. Gaps that remain: left-aligned `self-start`, it is the only action, there is no in-flow link to history, and `recommendedNextStep` is inert text (`:121-124`). Reaching synthesis at all requires the reload from dim. 3. | WEAK (partly stale complaint) |

## Narrowing Signals

- The user's own description of the walk-through ("first session, I click two, I click summary" + "buttons are missing") matches dim. 3's dead end exactly: on a first session the forward buttons only exist after a reload.
- The user has not re-tested the ending since `8648c01`; FR-011 was written on 2026-10-09 (`e4dc32f`), so dim. 4 is at least partly about what was there before.
- The user picked "too much on screen" alongside "prose too long", which confirms dim. 2 is a separate origin from dim. 1.

## Cross-System Convention

- Prior plans' manual verification always included a reload step (`archive/2026-09-25-round-two-attribution/plan.md:546`, `:649`; `first-divergent-round/plan-brief.md:15`), which masked the SSR-gated dead end. That is why no review caught it.
- frontend.md §3 already prescribes the convention this flow violates: when two islands must share state, use `nanostores`. The availability of round 2 / synthesis is cross-island state (it is derived from round 1's stream), but it is passed as one-shot SSR props.
- S-06 (`resume-session-round`, planned) adds a resume panel at the same tail of `[id].astro`; if it follows the same SSR-gated pattern, it inherits the same dead end.

## Reframed (or Confirmed) Problem Statement

> **The actual problem to plan around is**: on a fresh session the step-to-step flow has no live progression — the next action never appears in the same page load (round 1 → round 2 → synthesis), and when it does appear it sits unannounced below a long, fully expanded wall of near-duplicate advisor text.

The initial framing named two symptoms (long answers, no end action). The evidence shows three separable problems of different weight:
- **Flow (dim. 3)** is a functional defect, and it is the most likely cause of "the session cuts off" and "buttons are missing".
- **Length** is real, but it is two problems: prompt wording (dim. 1) and layout density/duplication (dim. 2). Shortening prompts alone will not fix "too much on screen".
- **End action (dim. 4)** mostly exists; what is left is making it fit, not creating it.

## Confidence

**HIGH** for dim. 3 being the primary, previously unknown problem: code-verified, and it matches the user's own walk-through and the reload-masked test history.
**MEDIUM** for the relative weight of dims. 1 and 2. Which one dominates the "too long" feeling is a judgement call that a screenshot or a timed read-through would settle.

## What Changes for /10x-plan

The plan should lead with live step progression on `/sessions/[id]`: availability that reacts to stream completion, visible or auto-scrolled next actions, and correct gating. The plan should then cover brevity as **both** prompt rewording and card/round density, and treat the end-of-session action as refinement of the existing CTA, designed to survive S-06 reopening a completed session. Coordinate with S-06 (shared `maxTokens` port, `concise` mode for rounds > 2, same page tail) and with S-08 (same `AdvisorCard`/`SynthesisPanel` visuals).

## References

- Source files: `src/pages/sessions/[id].astro:38-52`, `:94-112`; `src/components/advisor-panel/RoundTwoPanel.tsx:47-72`; `SynthesisPanel.tsx:121-124`, `:145-152`, `:161-186`; `AdvisorCard.tsx:84-143`; `AdvisorPanel.tsx:19`; `src/components/decision-form/DecisionForm.tsx:63`; `src/lib/services/session.service.ts:775`, `:847`; `src/lib/prompts/advisor-*.v1.ts`
- Related research: `context/changes/session-quality-polish/research.md`
- Investigation: 2 Explore sub-agents (flow-actions trace, page-density audit) + direct code verification of the SSR gating

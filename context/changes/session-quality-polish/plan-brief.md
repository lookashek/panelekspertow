# Session quality polish (S-07 / FR-011) — Plan Brief

> Full plan: `context/changes/session-quality-polish/plan.md`
> Frame brief: `context/changes/session-quality-polish/frame.md`
> Research: `context/changes/session-quality-polish/research.md`

## What & Why

> **The actual problem to plan around is**: on a fresh session the step-to-step flow has no live progression — the next action never appears in the same page load (round 1 → round 2 → synthesis), and when it does appear it sits unannounced below a long, fully expanded wall of near-duplicate advisor text.

FR-011's "answers too long" and "session cuts off" are real, but the dominant cause is a functional dead end. Length is two separate problems: prompt wording and on-screen density.

## Starting Point

`[id].astro` computes round-2/synthesis availability and side-thread eligibility once in SSR, before round 1 streams, so on a fresh session the forward buttons and DOPYTAJ only appear after F5. The stream hooks hang on connection failures. Prompts tell advisors to "rozbuduj", no `max_tokens` is sent, and every card shows thesis + prose + the same arguments again. `NOWA DECYZJA` exists but is a left-aligned link with no route back to history.

## Desired End State

A user walks round 1 → round 2 → synthesis → next decision without reloading. After each step settles, a full-width action bar at the tail scrolls into view with the next action. When synthesis is done it offers NOWA DECYZJA + HISTORIA SESJI. Finished rounds fold to score + thesis rows. Advisors write 2–3 sentences beside 1–3 arguments that sit behind a toggle. Failures show PONÓW instead of hanging.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Primary focus | Live step progression first | Code-verified dead end that matches the user's walk-through | Frame |
| Cross-island state | One `SessionFlow` island (no nanostores) | No new dependency; gating, scroll and retry live in one place; S-06 plugs in | Plan |
| Gating | R2 primary + synthesis as skip after R1; synthesis locked while R2 runs; PONÓW on total R1 failure | Keeps optional round 2 and removes the synthesize-mid-R2 race | Plan |
| Brevity levers | Prompt caps (2–3 sentence prose, 1–3 args) in R1/R2 + `maxTokens` on prose `stream()` only | Shapes length at the source; JSON heads never truncated | Plan / Research |
| Brevity scope | Side thread and synthesis untouched | FR-011 names advisor answers; avoids S-04 rebase conflict | Plan |
| Density | Fold finished rounds + ARGUMENTY toggle in cards | Prompts alone don't fix "too much on screen" | Plan / Frame |
| Next action | Inline full-width action bar, auto-scrolled on live transitions | One component per step; derived from state, so it survives S-06 reopen | Plan |
| End CTA | NOWA DECYZJA (primary) + HISTORIA SESJI (secondary) | Adds the missing route back to history | Plan |
| Prompt versioning | Edit `.v1.ts` in place, bump `PROMPT_VERSION` to `v2` | Renaming files would collide with S-04's in-flight edits | Plan |

## Scope

**In scope:**
- `SessionFlow` island, pure `deriveSessionStep()` with unit tests, live side-thread eligibility
- Connection-failure handling in `usePanelStream` / `useSynthesisStream`
- `StepActionBar` with auto-scroll and the end CTA
- Round fold (`RoundSummary`) and ARGUMENTY toggle
- `StreamRequest.maxTokens` + adapter + `run-panel` ceiling; shared `brevity.ts` clauses in 4 personas; prompt tests; S-06 note

**Out of scope:** nanostores, per-persona retry inside a partial round, side-thread/synthesis prompts, Zod `.max()` on arguments, `max_tokens` on `complete()`, sticky viewport bar, shadcn `Button` migration (S-08), actionable `recommendedNextStep`, S-06 itself.

## Architecture / Approach

The page passes SSR facts (`hasRoundOne/Two`, `hasSynthesis`, `minRoundTwoParticipants`, thread history) into one `SessionFlow` root. Round components report `{ settled, scoredPersonaIds }` upward. `deriveSessionStep()` turns that into a step, and `StepActionBar` renders it. Folding hides finished cards and never unmounts them, so no stream reopens. On the backend, a single `RATIONALE_MAX_TOKENS` on the shared R1/R2 prose call plus reworded prompts.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. SessionFlow + live gating | No-reload progression, retry, no hanging streams | Round-2 participant list must be frozen once; replay vs live parity |
| 2. Step action bar + end CTA | One full-width next-action bar, auto-scroll, history link | Auto-scroll firing on revisit replay |
| 3. Density | Folded rounds, argument toggle | Unmounting would reopen EventSource / lose side-thread input |
| 4. Brevity | 2–3 sentence prose, 1–3 args, `max_tokens` guard | Prompt change weakening divergence/attribution; test churn |

**Prerequisites:** S-03 done (synthesis). Coordinate with S-04 (same persona files) and S-08 (same card/synthesis visuals).
**Estimated effort:** ~3–4 sessions across 4 phases.

## Open Risks & Assumptions

- Persistence of round-1 heads (`waitUntil`) is assumed to finish before a user clicks "next". A rare race yields a server error, which now surfaces as PONÓW instead of hanging.
- `RATIONALE_MAX_TOKENS = 350` is a guard. If a model ignores the prompt cap, prose can be cut mid-sentence (checked manually).
- S-06's plan still says rounds 1–2 are unchanged. The coordination note asks it to reuse `brevity.ts` / `maxTokens`.
- Relative weight of prompt vs density in the "too long" feeling is MEDIUM confidence (frame). Both are addressed.

## Success Criteria (Summary)

- A first-time user finishes a full session with no reload and always sees the next action without searching for it.
- The page after round 2 fits mostly in view: folded round 1, short prose, arguments on demand.
- After synthesis the user has a clear next step: a new decision or the history.

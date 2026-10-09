---
date: 2026-10-09T10:09:02+02:00
researcher: lstepien (Claude Code, Opus 5.5)
git_commit: d7be262469030b46ac6079339c7fe3bd11405274
branch: main
repository: panelekspertow
topic: "S-07 session-quality-polish — what drives advisor answer length, and what the user sees after a session ends"
tags: [research, codebase, prompts, openrouter-adapter, advisor-card, synthesis-panel, fr-011]
status: complete
last_updated: 2026-10-09
last_updated_by: lstepien (Claude Code, Opus 5.5)
---

# Research: S-07 session-quality-polish

**Date**: 2026-10-09T10:09:02+02:00
**Researcher**: lstepien (Claude Code, Opus 5.5)
**Git Commit**: d7be262
**Branch**: main
**Repository**: panelekspertow

## Research Question

For roadmap slice S-07 / PRD FR-011 (`context/foundation/prd.md:117-121`, US-02 `prd.md:56-62`, Open Question #6 `prd.md:161`):

1. What currently decides how long advisor answers are, in every round, and what can be changed without breaking the output contract?
2. What does the user see at the end of a session, and what action is offered there today?
3. Which prior decisions or in-flight changes constrain or collide with this slice?
4. Is there evidence that defines the vague "the session should be generally better" scope?

The codebase questions (1–3) are answered. Question 4 has no evidence in the repo; it stays a product decision for the user (see Open Questions).

## Summary

- **Length is driven by prompt wording and by how the card is laid out. No hard cap exists.** On the inspected adapter path, OpenRouter requests send only `model`, `messages`, `temperature`, `stream` (plus `response_format` for `complete`). They never send `max_tokens` (`src/lib/adapters/openrouter.adapter.ts:74-80`, `:188-193`). A grep for `max_tokens|maxTokens` under `src/` returns 0 hits. The second stage of every advisor turn is a streamed prose "rationale". In all 4 persona files, its prompt explicitly asks the model to *expand*: "rozbuduj swoje argumenty, dodaj niuanse i przykłady" / "Rozwiń … w pełniejsze, płynne uzasadnienie prozą" (e.g. `src/lib/prompts/advisor-sceptyk.v1.ts:41`, `:52`, `:120`, `:140`).
- **The card repeats the content.** `AdvisorCard` renders the thesis (`AdvisorCard.tsx:84`), then the full streamed prose (`:98-101`), then the argument list (`:103-109`). The prose was told to expand on those same arguments, so they appear twice.
- **Shortening the prose is schema-safe; shortening the JSON head is not.** The rationale is free text forwarded straight to SSE `token` events with no validation (`src/lib/advisors/run-panel.ts:118-122`). The structured head is validated by Zod. `arguments` needs `.min(1)` and has no `.max()` (`src/lib/schemas/advisor.ts:9-20`). In round 2 the `attribution` null-vs-set rule exists only in the prompt (`advisor-sceptyk.v1.ts:80`).
- **A "next action" already exists, but it is minimal.** When the synthesis stream reaches `done`, `SynthesisPanel` renders one `<a href="/sessions/new">NOWA DECYZJA</a>` (`src/components/advisor-panel/SynthesisPanel.tsx:145-152`). This link came in commit `8648c01` (2026-09-29, "add missing adashboard buttons"). That is after the session-synthesis plan-brief that says nothing renders below synthesis, so that brief is stale on this point. The synthesis also has a `recommendedNextStep` field, but it is rendered as inert text (`SynthesisPanel.tsx:121-124`). The page has no "back to history" action and no link tied to the next step.
- **S-06 collides with S-07 in two places.** (a) The S-06 plan (`resume-session-round`, status `planned`) already adds `maxTokens` to the LLM port and a `concise` prompt mode. That mode applies **only to rounds > 2**, and the plan keeps rounds 1–2 "byte-for-byte unchanged" (`context/changes/resume-session-round/plan.md:44`, `:56`, `:119-151`). FR-011 asks for shorter answers in **all** rounds. (b) S-06 reopens completed sessions and deletes the synthesis (`plan.md:38`, `:56`). An end-of-session action therefore cannot treat "completed + synthesized" as permanent.

## Detailed Findings

### 1. Advisor answer length — the levers

**Two calls per advisor turn.** Each round-1 and round-2 turn is a `complete()` call (JSON head: score, thesis, arguments[, attribution]) followed by a `stream()` call (prose rationale) (`src/lib/adapters/llm-provider.ts:6-9`; `run-panel.ts:108`, `:155`, `:212`). The side thread is a single `stream()` with no JSON stage (`src/lib/services/session.service.ts:684-689`).

**Prompt wording (identical structure in the 4 files `advisor-{optymista,sceptyk,pragmatyk,analityk}.v1.ts`; line numbers below are from `advisor-sceptyk.v1.ts`):**

| Builder | Lines | Length-relevant instruction |
|---|---|---|
| `buildPrompt` (R1 head) | 21-24 | one-sentence thesis ("jednozdaniowa teza"); "co najmniej jeden argument", with no upper bound |
| `buildRationalePrompt` (R1 prose) | 41, 52 | "rozbuduj swoje argumenty, dodaj niuanse i przykłady"; "pełniejsze, płynne uzasadnienie prozą" |
| `buildRoundTwoPrompt` (R2 head) | 82-85 | same as R1 head + attribution; "co najmniej jeden argument" |
| `buildRoundTwoRationalePrompt` (R2 prose) | 120, 140 | "rozwinąć zaktualizowane stanowisko w płynnej prozie"; "pełniejsze, płynne uzasadnienie" |
| `buildSideThreadPrompt` | 163, 178 | "płynną prozą"; no length guidance |

The grep for `rozbuduj|pełniejsze|pełniejszego|max_tokens|maxTokens` under `src/` finds 5 matches in each of the 4 persona files (20 total) and 0 elsewhere. None of these builders contain a sentence, word or argument cap.

**Synthesis.** `synthesis.v1.ts:47` asks for unbounded `agreementPoints`, `disputeAxes`, and `risks` arrays. `recommendedNextStep` must be "jeden konkretny, wykonalny … krok" (`:53`). The schema enforces `disputeAxes.min(1)` and `positions.min(2)`, with no `.max()` (`src/lib/schemas/synthesis.ts:12-31`). FR-011 names "odpowiedzi doradców (wszystkie rundy)", so whether synthesis counts as an "advisor answer" is a scope call (Open Questions).

**Input length grows with verbosity.** `buildRoundTwoPrompt` embeds the advisor's own full R1 head and every peer's full R1 head (`formatPeerHead`, `advisor-sceptyk.v1.ts:57-60`, `:88-99`). `buildRoundTwoRationalePrompt` embeds the peer blocks again (`:124`, `:137-138`). Shorter R1 `arguments` would shrink every R2 input in proportion.

**Other parameters.** One model for all personas and synthesis: `DEFAULT_ADVISOR_MODEL`, default `openai/gpt-4o-mini`, read via `defaultAdvisorModel()` (`src/lib/adapters/create-llm-provider.ts:20-22`; declared in `astro.config.mjs` env schema). Per-persona temperatures 0.9/0.7/0.5/0.3 (`src/lib/advisors/registry.ts:119`, `:130`, `:141`, `:152`) affect variance, not length. OpenRouter's or the upstream model's default output limit when `max_tokens` is omitted was **not verified** (it lives outside the repo).

**Prompt versioning.** The version is a hard-coded string used only for logging: `PROMPT_VERSION = "v1"` (`run-panel.ts:18`, `run-synthesis.ts:18`) and `SIDE_THREAD_PROMPT_VERSION = "v1"` (`session.service.ts:42`). It is not persisted to the DB. backend.md §5 says prompts live in `<name>.v1.ts` files. No code forces a new file when the wording changes. A `v2` bump means new files (or in-place edits) plus changing those constants.

**Tests pinned to prompt wording.** Rewording will break these if the matched phrases change:
- `src/lib/prompts/advisor-prompts.test.ts:60-72` (voice label, decision, score, thesis, arguments present), `:80-83` (rationale prompts must not mention JSON / `{"score"`), `:90-91`, `:96-97` (`/TYLKO/`, `/null/` attribution rule), `:107-108`.
- `src/lib/prompts/synthesis-prompts.test.ts:47-91` (`/nie uśredniaj/i`, field names, `/NIE zmieniasz/`, `/bez JSON/`).

### 2. Advisor card layout (why it reads long)

For each advisor, `AdvisorCard.tsx` renders, in order: score/delta (`:70-83`), thesis in bold (`:84`), attribution box in R2 (`:85-94`), the streamed prose in an `aria-live` region (`:98-101`), the argument list (`:103-109`), and the status line "Gotowe." (`:117`). With an "expand your arguments" prompt, the prose and the list cover the same material. One option is a UI-only fix (collapse the prose, or drop the list) without touching prompts. Choosing it is a product/UX decision. A UI change would also overlap S-08 (see §4).

### 3. End of session — what the user sees today

- **Page structure.** `src/pages/sessions/[id].astro:94-112` server-renders three islands in fixed order: `AdvisorPanel` (R1), `RoundTwoPanel` (gated by `roundTwoAvailable`), `SynthesisPanel` (gated by `synthesisAvailable`).
- **Synthesis states.** `SynthesisPanel` shows a "ZAKOŃCZ SESJĘ" button until started (`SynthesisPanel.tsx:176-186`). If the session already has a synthesis (`useState(hasSynthesis)`, `:158`), it mounts the stream directly. The stream goes pending → streaming → done/error (`useSynthesisStream.ts`). After it, the panel renders agreement points, dispute axes, risks, the "REKOMENDOWANY NASTĘPNY KROK" box (`:121-124`), the narrative "PODSUMOWANIE" (`:128-134`), and, only when `status === "done"`, the "NOWA DECYZJA" link (`:145-152`), placed with `self-start` (left-aligned, not a full-width footer).
- **Revisit is a cheap replay.** When a synthesis row exists, `runSynthesis` returns `buildReplaySynthesisEvents(existing)` with no LLM call (`session.service.ts:534-540`). So the CTA also appears on revisit, after a brief pending state.
- **Session status.** `SessionStatus = "active" | "completed"` (`src/types/session.ts:9`; `src/lib/schemas/session.ts:21`). It is set to `completed` by `completeSession` (`session.repository.ts:236-239`), which is called from the synthesis persistence path (`session.service.ts:824`). On the inspected page, `[id].astro` does **not** branch on `session.status`. "Ended" is inferred client-side from synthesis `done`. The status shows up only as the "ZAKOŃCZONA" badge in `SessionList.astro:13`, `:18`.
- **Navigation already present.** On every page, `Topbar.astro:5-38` (mounted by `Layout.astro:28`) links to `/dashboard`, `/sessions/new`, and `/sessions`. On the session page itself, the only bottom-of-flow action is "NOWA DECYZJA". No in-flow link goes back to history.
- **Button styling.** Every CTA in this flow uses the hand-rolled class set `pixel-btn font-pixel bg-primary text-primary-foreground hover:border-accent hover:bg-accent px-6 py-4 text-xs transition-colors` (`SynthesisPanel.tsx:148`, `:182`; `RoundTwoPanel.tsx:60-68`; `[id].astro:80-85`). The shadcn `Button` (`src/components/ui/button.tsx:7-33`) is not used in this flow. That is an existing inconsistency, which belongs to S-08 / `/10x-ui` rather than here.
- **Side thread after the end.** `SideThread` is mounted per R1 card when `sideThreadEnabled` (`AdvisorPanel.tsx:27-28`). In the inspected `SideThread.tsx` there is no check that disables it after synthesis. This matches S-04's intent ("available … after synthesis", `context/changes/advisor-side-thread/plan-brief.md:34`). `useSideThreadStream.ts` was not opened.

### 4. Collisions with in-flight / planned work

- **S-06 `resume-session-round`** (`context/changes/resume-session-round/change.md`: `status: planned`, not implemented in the inspected tree):
  - Adds optional `maxTokens` to `CompleteRequest`/`StreamRequest` and sends `max_tokens` in the adapter (`plan.md:119-128`). This is the same plumbing S-07 would need for a hard cap.
  - Adds a `concise: boolean` prompt mode ("Podaj maksymalnie 2 argumenty; bądź zwięzły.") for rounds > 2 only (`plan.md:56`, `:135-145`). It explicitly declares "No changes to round 1 / round 2 behavior or output length" (`plan.md:44`). FR-011 contradicts that boundary. Whichever slice lands second must reconcile: either S-07 makes brevity the default for all rounds (S-06's `concise` flag then becomes redundant or a stricter tier), or S-07 builds on S-06's flag.
  - Reopens a completed session: deletes the synthesis, sets status to `active`, adds a round (`plan.md:38`, `:56`). It reuses the existing "ZAKOŃCZ SESJĘ" affordance for re-synthesis (`plan.md:41`). An S-07 end-of-session action must coexist with S-06's resume panel at the same tail of `[id].astro`, and must not assume the session stays completed.
- **S-04 `advisor-side-thread`** (in progress): a side-thread prompt change (`buildSideThreadPrompt`) for brevity would touch S-04's surface. No logical conflict was found. Expect rebase friction in the persona prompt files.
- **S-08 `ui-visual-refactor`**: no change folder exists yet. The roadmap calls S-07 and S-08 independent (`context/foundation/roadmap.md:65`), but both would touch `AdvisorCard` and `SynthesisPanel` visuals.

### 5. "Session should be generally better"

These sources contain no concrete complaint beyond the two named items: `prd.md:62`, `:118-121`, `:161`; `roadmap.md:191`, `:196-201`; `lessons.md` (3 unrelated entries); the archived plans; and the in-flight `change.md`. The roadmap itself marks S-07 as not ready for `/10x-plan` until the user resolves scope (`roadmap.md:201`). The CTA was added on 2026-09-29 15:16 (`8648c01`). The repo does not show whether the "session cuts off after synthesis" complaint (`prd.md:118-120`) was made before or after that commit.

## Code References

- `src/lib/adapters/openrouter.adapter.ts:74-80`, `:188-193` — request bodies; no `max_tokens`
- `src/lib/adapters/llm-provider.ts:6-9`, `:16-39` — two-phase contract; request types have no length field
- `src/lib/prompts/advisor-sceptyk.v1.ts:21-24`, `:41`, `:52`, `:57-60`, `:80`, `:82-99`, `:120`, `:140`, `:163` — prompt wording (same structure in the other 3 personas)
- `src/lib/prompts/synthesis.v1.ts:47`, `:53` — synthesis JSON shape, next-step rule
- `src/lib/schemas/advisor.ts:9-20`, `src/lib/schemas/synthesis.ts:12-31` — `.min()` only, no `.max()`
- `src/lib/advisors/run-panel.ts:18`, `:108-122`, `:155`, `:212`; `run-synthesis.ts:18` — prompt version constants, call sites, unvalidated prose → SSE
- `src/lib/advisors/registry.ts:60`, `:119-152` — side-thread cap, temperatures
- `src/components/advisor-panel/AdvisorCard.tsx:84-117` — thesis + prose + argument list
- `src/components/advisor-panel/SynthesisPanel.tsx:121-124`, `:145-152`, `:158`, `:176-186` — next-step box, existing CTA, start button
- `src/lib/services/session.service.ts:534-540`, `:824` — synthesis replay, completion
- `src/pages/sessions/[id].astro:80-85`, `:94-112` — page composition
- `src/components/Topbar.astro:5-38` — global nav
- `src/lib/prompts/advisor-prompts.test.ts:60-108`, `src/lib/prompts/synthesis-prompts.test.ts:47-91` — tests pinned to wording

## Architecture Insights

- Prompts are Strategy implementations per persona (`AdvisorStrategy` in `registry.ts`; backend.md §2). Any brevity clause must be added to all 4 persona files, plus synthesis if in scope. The S-06 plan suggests one shared exported clause string (`plan.md:145`).
- "Score before rationale" is enforced structurally, by the `complete()` → `stream()` split, not by text order. So the prose can be shortened freely without touching the forced-divergence mechanics (FR-002/FR-003).
- A hard `max_tokens` on the **JSON** `complete()` call risks truncated JSON. The adapter retries once and then fails with `LLM_INVALID_OUTPUT` (`openrouter.adapter.ts:124`, `:139-142`). A cap is safer on the prose `stream()` call, with the prompt doing the shaping (S-06 reaches the same conclusion: "terseness is well-formed, not truncated", `plan.md:143`).

## Historical Context (from prior changes)

- `context/archive/2026-09-25-session-synthesis/plan.md:36` — completing a session locks it; resume deferred to S-06. **Still supported** (no reopen path in code yet).
- `context/archive/2026-09-25-session-synthesis/plan-brief.md:15`, `:61` — nothing rendered below synthesis. **Contradicted** for the current tree: "NOWA DECYZJA" was added later in `8648c01`.
- `context/archive/2026-09-23-advisor-llm-adapter/plan.md:49`, `:287`; `context/archive/2026-09-25-first-divergent-round/plan.md:385` — Cloudflare streaming-duration risk flagged as "measure it", with no numeric limit recorded. Shorter output reduces this risk.
- `context/changes/resume-session-round/plan.md:14` — states no `max_tokens` is sent today. **Supported** by the current adapter code.

## Related Research

Not applicable. None of the archived or in-flight change folders checked contain a `research.md` or `frame.md`, per the prior-decisions sweep.

## Open Questions

Product decisions for the user (they block `/10x-plan`, per `roadmap.md:196-201`):

1. **How to shorten.** Pick one or more: (a) rewrite the rationale prompts from "expand" to an explicit cap (e.g. N sentences); (b) cap `arguments` (e.g. ≤ 2–3) in the R1/R2 heads; (c) a `max_tokens` safety ceiling on the prose `stream()` (shared plumbing with S-06); (d) a UI-only change: remove the duplication between prose and argument list in `AdvisorCard`. Also: does the side thread and/or the synthesis count as "advisor answers" under FR-011?
2. **End-of-session action.** "NOWA DECYZJA" already exists (`SynthesisPanel.tsx:145-152`). Is the ask to make it more prominent (a full-width bottom bar), to add a second action (back to history, export), to turn `recommendedNextStep` into the action, or something else? How should it behave once S-06 can reopen the session?
3. **"Generally better".** No evidence defines it. The user must list concrete items or drop it from S-07.
4. **S-06 ordering.** Should S-07 land the `maxTokens` port plumbing first (and S-06 reuse it), or wait for S-06? And should brevity be the default for all rounds (making S-06's `concise` a stricter tier for rounds > 2)?

Unverified facts (non-blocking): OpenRouter's or gpt-4o-mini's default output limit when `max_tokens` is omitted; `useSideThreadStream.ts` and `usePanelStream.ts` were not opened.

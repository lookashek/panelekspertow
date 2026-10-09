# Session quality polish (S-07 / FR-011) Implementation Plan

## Overview

Make the `/sessions/[id]` flow progress live within one page load (round 1 → round 2 → synthesis → next decision), present the next action at the tail of the flow and scroll it into view, then cut what is on screen (fold finished rounds, hide the duplicated argument list) and what the advisors write (prompt caps + a `max_tokens` ceiling on the prose stream).

## Current State Analysis

The frame (`frame.md`) reframed FR-011: the primary defect is that the session has **no live step progression**.

- `roundTwoAvailable` / `synthesisAvailable` are computed once in SSR from persisted round-1 opinions (`src/pages/sessions/[id].astro:38-52`). On a fresh session the page is rendered before the round-1 stream opens, so both panels `return null` (`RoundTwoPanel.tsx:50-52`, `SynthesisPanel.tsx:161-163`) and nothing re-evaluates on the client — the three islands share no state. Buttons appear only after F5.
- The same SSR snapshot gates the side thread: `sideThreadEligible` is the persisted round-1 persona list (`[id].astro:54`), so **DOPYTAJ** is also missing on a fresh session.
- Both stream hooks ignore connection-level `error` events (`usePanelStream.ts:139-142`, `useSynthesisStream.ts:63-66`). A non-200 response (409 race, 503, 404) leaves the UI in "Oczekiwanie…" forever.
- Length: rationale prompts in all 4 personas ask the model to expand ("rozbuduj swoje argumenty, dodaj niuanse i przykłady", "pełniejsze, płynne uzasadnienie" — e.g. `advisor-sceptyk.v1.ts:41`, `:52`, `:120`, `:140`); heads ask for "co najmniej jeden argument" with no upper bound; no `max_tokens` is sent (`openrouter.adapter.ts:74-80`, `:188-193`).
- Density: every card renders thesis + prose + argument list (`AdvisorCard.tsx:84`, `:98-109`); finished rounds stay expanded; round 2 is appended below round 1.
- End of session: `NOWA DECYZJA` exists but is a left-aligned link inside `SynthesisPanel` (`:145-152`); no route back to history from the flow.

## Desired End State

On a fresh session, without any reload: round 1 streams; when it settles a full-width action bar below the flow offers **URUCHOM RUNDĘ 2** (primary) and **ZAKOŃCZ SESJĘ** (secondary) and scrolls into view; starting round 2 folds round 1 into compact score + thesis rows; when round 2 settles the bar offers **ZAKOŃCZ SESJĘ**; starting synthesis folds round 2; when synthesis is done the bar offers **NOWA DECYZJA** + **HISTORIA SESJI**. DOPYTAJ appears as soon as an advisor's round-1 head arrives. A failed connection shows an error with **PONÓW** instead of hanging. Advisor prose is 2–3 sentences that do not restate the 1–3 arguments, which sit behind an **ARGUMENTY** toggle.

Verify: create a session, walk the whole flow with no F5; reload at each step and confirm the same state is reconstructed.

### Key Discoveries:

- One prose `provider.stream()` call site serves both rounds (`src/lib/advisors/run-panel.ts:107-115`) — a single `maxTokens` there covers R1 + R2 without touching side thread (`session.service.ts:684-689`) or synthesis (`run-synthesis.ts:88`).
- Round-1 heads are persisted when `scores` resolve (before prose finishes) via `persistTail` + `waitUntil` (`session.service.ts:444-452`, `stream.ts:76-78`), so a user click after round 1 settles normally finds persisted rows; the server stays the authority (`runSecondRound` re-checks `MIN_ROUND_TWO_PARTICIPANTS`, `session.service.ts:470-475`).
- Round 1 with zero persisted opinions re-runs on reconnect (`session.service.ts:440-452`) — a round-1 retry is just a stream remount.
- `MIN_ROUND_TWO_PARTICIPANTS` lives in `registry.ts:53`, which must not be imported client-side (pulls prompts into the bundle, `usePanelStream.ts:1-6`) — the page passes it as a prop.
- `/sessions` (history) exists (`src/pages/sessions/index.astro`).
- Prompt tests pin wording (`advisor-prompts.test.ts:60-108`); synthesis tests are untouched by this plan.
- No component-test runner (vitest runs node-side `src/lib/**` tests only) — step derivation is extracted to a pure function so it can be unit-tested.

## What We're NOT Doing

- No `nanostores` / new runtime dependency — the three islands merge into one root instead.
- No re-run of individual failed personas inside a partially failed round (partial round 1 replays as today; round-2 failures do not block synthesis).
- No change to side-thread prompts (S-04 in flight) or the synthesis prompt/schema/layout beyond moving its CTA into the action bar.
- No Zod `.max()` on `arguments` — a model returning 4 arguments must not become `LLM_INVALID_OUTPUT`; the cap is prompt-shaped.
- No `max_tokens` on `complete()` (truncated JSON risk, `openrouter.adapter.ts:124`, `:139-142`).
- No turning `recommendedNextStep` into an action; no export.
- No sticky/fixed viewport bar; no migration to shadcn `Button` (S-08).
- No renaming prompt files to `.v2.ts` (would collide with S-04's in-flight edits to the same files).
- No implementation of S-06; only a coordination note.

## Implementation Approach

Flow first (functional defect), then the action bar that consumes the flow's step state, then density (which depends on knowing when a step started), then backend brevity (independent, lowest risk). A pure `deriveSessionStep()` function is the single source of truth for which actions are offered; components only render it.

## Critical Implementation Details

- **Fold by hiding, never unmounting.** `usePanelStream` lives in the round components; unmounting a finished round reopens its `EventSource` (replay) and discards an open `SideThread`'s local input. Folding must keep the cards mounted (`hidden` attribute) and render the compact summary alongside.
- **Round-2 participant list is frozen once.** `usePanelStream` treats `personaIds` as stable for its lifetime (`usePanelStream.ts:166`). Derive the round-2 participants (round-1 personas that received a `score` event) at the moment round 1 settles and don't recompute; on reload with `hasRoundTwo`, mount the round-2 stream only after the round-1 replay has settled.
- **Auto-scroll only on live transitions.** Scrolling on a revisit's instant replay would yank the user to the bottom on load. Scroll the action bar into view only when the page loaded with work still to stream (`hasRoundOne === false`) or after the user triggered an action in this page load; `block: "nearest"`, `behavior: "auto"` under `prefers-reduced-motion: reduce`. Never move focus — announce via `aria-live="polite"` status text in the bar.
- **Connection failure ≠ reconnect.** EventSource auto-reconnects on transient drops (`readyState === CONNECTING`); only `readyState === EventSource.CLOSED` on a payload-less `error` event is fatal (that is what a non-200 response produces).

## Phase 1: SessionFlow island and live gating

### Overview

Replace the three SSR-gated islands with one `SessionFlow` React root that owns step state, derives availability from the live streams, adds round-1 retry, and makes connection failures visible.

### Changes Required:

#### 1. Step derivation (pure)

**File**: `src/lib/session-flow.ts` (+ `src/lib/session-flow.test.ts`)

**Intent**: One pure function decides the current step and which actions are offered, so gating rules are unit-tested instead of scattered across panels.

**Contract**: `deriveSessionStep(input): SessionStep` where input = `{ roundOne: RoundOutcome; roundTwoStarted: boolean; roundTwo: RoundOutcome; synthesisStarted: boolean; synthesisStatus: "idle" | "pending" | "streaming" | "done" | "error"; minRoundTwoParticipants: number }`, `RoundOutcome = { settled: boolean; scoredPersonaIds: string[] }`. `SessionStep` is a discriminated union: `round-one-running` · `round-one-failed` (settled, 0 scored → retry) · `round-one-settled` (`canRunRoundTwo` = scored ≥ min; synthesis always offered) · `round-two-running` (no actions — synthesis locked) · `round-two-settled` · `synthesis-running` · `synthesis-failed` · `finished`. Rules: synthesis needs ≥ 1 round-1 scored persona (today's rule); round 2 needs ≥ `minRoundTwoParticipants`.

#### 2. Stream hooks report connection failure

**File**: `src/components/advisor-panel/usePanelStream.ts`, `src/components/advisor-panel/useSynthesisStream.ts`

**Intent**: A payload-less `error` with `eventSource.readyState === EventSource.CLOSED` marks every non-terminal persona (or the synthesis) as `error` with a generic Polish message, so the round settles instead of hanging.

**Contract**: No signature change; existing named-`error` frame handling unchanged.

#### 3. SessionFlow root

**File**: `src/components/advisor-panel/SessionFlow.tsx` (new); `AdvisorPanel.tsx`, `RoundTwoPanel.tsx`, `SynthesisPanel.tsx` (become children)

**Intent**: Lift step state into one island. Round panels report their outcome upward; SessionFlow feeds `deriveSessionStep` and decides what mounts. Round-1 retry remounts the round-1 stream (key bump). Side-thread eligibility becomes live: a persona is eligible once its round-1 `score` event arrived (SSR `initialThreads` still seed history).

**Contract**: `SessionFlow` props (serializable): `{ sessionId; personas: {id,label}[]; minRoundTwoParticipants: number; hasRoundOne: boolean; hasRoundTwo: boolean; hasSynthesis: boolean; initialThreads: Record<string, {role,content}[]> }`. Children receive an `onOutcome(outcome: RoundOutcome)` / `onStatus(status)` callback (in-island function props). `RoundTwoPanel` / `SynthesisPanel` lose `available`, their own start buttons, and `NOWA DECYZJA` — starting is driven by SessionFlow (`started` flags initialised from `hasRoundTwo` / `hasSynthesis`). Synthesis keeps its in-panel PONÓW for stream errors.

#### 4. Page

**File**: `src/pages/sessions/[id].astro`

**Intent**: Mount `<SessionFlow client:load … />` in place of the three islands; compute `hasRoundOne`, `hasRoundTwo`, `hasSynthesis`, `initialThreads`; drop `roundTwoAvailable`, `synthesisAvailable`, `roundTwoPersonas`, `sideThreadEligible`. Ownership check unchanged.

**Contract**: Interim (until Phase 2) the forward buttons are rendered by SessionFlow from `SessionStep` with the existing `pixel-btn` styling.

### Success Criteria:

#### Automated Verification:

- `deriveSessionStep` unit tests cover: 0 scored → `round-one-failed`; 1 scored → synthesis only; ≥2 scored → round 2 + synthesis; round 2 running → no actions; round 2 settled → synthesis; synthesis done → `finished`: `npm test`
- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- Build passes: `npm run build`

#### Manual Verification:

- Fresh session, no reload: after round 1 settles URUCHOM RUNDĘ 2 and ZAKOŃCZ SESJĘ appear; DOPYTAJ appears per card as heads arrive
- While round 2 streams ZAKOŃCZ SESJĘ is not offered; it appears when round 2 settles; synthesis completes in the same page load
- Reload at each step (after R1, during/after R2, after synthesis) reconstructs the same state with no duplicate LLM call (replay)
- Forcing a stream failure (e.g. stop the dev server mid-stream, or an invalid session id via devtools) shows an error with PONÓW instead of an endless "Oczekiwanie…"

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Step action bar and end-of-session CTA

### Overview

One full-width action bar at the tail of the flow, rendered from `SessionStep`, scrolled into view on live transitions; replaces the scattered per-panel buttons and the left-aligned `NOWA DECYZJA` link.

### Changes Required:

#### 1. StepActionBar

**File**: `src/components/advisor-panel/StepActionBar.tsx` (new)

**Intent**: Presentational bar: a short status line (`aria-live="polite"`, e.g. "Runda 1 zakończona.") plus a primary and optional secondary action, full-width, stacked on 375px and side-by-side from `sm`. Uses tokens + `cn()`; primary keeps the `pixel-btn bg-primary` look, secondary `bg-secondary`; visible focus ring.

**Contract**: `StepActionBarProps = { status: string; primary?: Action; secondary?: Action }`, `Action = { label: string } & ({ onClick: () => void } | { href: string })`. Mapping from step: `round-one-settled` → primary URUCHOM RUNDĘ 2 (if `canRunRoundTwo`) + secondary ZAKOŃCZ SESJĘ, else primary ZAKOŃCZ SESJĘ; `round-one-failed` → primary PONÓW; `round-two-settled` → primary ZAKOŃCZ SESJĘ; `finished` → primary NOWA DECYZJA (`/sessions/new`) + secondary HISTORIA SESJI (`/sessions`); running/failed-synthesis steps → status text only.

#### 2. Wire into SessionFlow with auto-scroll

**File**: `src/components/advisor-panel/SessionFlow.tsx`

**Intent**: Render the bar once, after the last panel; scroll it into view per the auto-scroll rule in Critical Implementation Details. Because the bar is derived from state (not from `session.status`), an S-06 reopen naturally replaces the end CTA.

**Contract**: Scroll gate = `!hasRoundOne || userActedThisLoad`; `scrollIntoView({ block: "nearest", behavior: reducedMotion ? "auto" : "smooth" })`.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- Build passes: `npm run build`
- No `NOWA DECYZJA` / `URUCHOM RUNDĘ 2` / `ZAKOŃCZ SESJĘ` button markup remains inside `RoundTwoPanel.tsx` / `SynthesisPanel.tsx` (grep)

#### Manual Verification:

- Fresh session: each settled step scrolls the bar into view; with OS "reduce motion" the jump is instant
- Revisit of a finished session does not auto-scroll on load; the bar at the bottom shows NOWA DECYZJA + HISTORIA SESJI and both links work
- Keyboard-only walk through the whole flow; screen reader announces the status line
- 375px and 1280px: bar is full-width, buttons legible, no horizontal scroll

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Density — fold finished rounds, argument toggle

### Overview

A finished round collapses to compact rows once the next step starts; the argument list inside each card moves behind a toggle so prose and list no longer repeat on screen.

### Changes Required:

#### 1. Round fold

**File**: `src/components/advisor-panel/RoundSummary.tsx` (new); `AdvisorPanel.tsx`, `RoundTwoPanel.tsx`, `SessionFlow.tsx`

**Intent**: Round 1 folds when round 2 or synthesis starts; round 2 folds when synthesis starts (also on reload, e.g. a finished session shows both rounds folded). Folded = one row per persona (label, score/delta, thesis) plus a **ROZWIŃ RUNDĘ N** / **ZWIŃ RUNDĘ N** toggle (`aria-expanded`, `aria-controls`). The full cards stay mounted with `hidden`.

**Contract**: Round components accept `folded: boolean`; `RoundSummary` props `{ round: 1 | 2; rows: { personaId; label; score?; previousScore?; thesis? }[]; expanded; onToggle }`. Score shown as number + label (color never the only signal).

#### 2. Argument toggle in the card

**File**: `src/components/advisor-panel/AdvisorCard.tsx`

**Intent**: Replace the always-rendered `<ul>` with an **ARGUMENTY (n)** toggle button, collapsed by default, revealing the same list.

**Contract**: Local `useState` in the card; `aria-expanded`; list markup unchanged when open.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- Build passes: `npm run build`

#### Manual Verification:

- Starting round 2 folds round 1 to 4 compact rows; expanding shows the full cards with prose intact and no new network request (devtools: no second round-1 `EventSource`)
- An open DOPYTAJ thread survives fold → expand with its input preserved
- ARGUMENTY toggle works by keyboard; default collapsed
- Finished session on reload: both rounds folded, synthesis visible near the top of the scroll

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Brevity — prompt caps and prose `max_tokens`

### Overview

Shape length at the source in round 1 and round 2, with a hard safety ceiling on the prose stream only.

### Changes Required:

#### 1. LLM port + adapter

**File**: `src/lib/adapters/llm-provider.ts`, `src/lib/adapters/openrouter.adapter.ts`, `src/lib/adapters/openrouter.adapter.test.ts`

**Intent**: Optional output ceiling for streamed prose; sent only when set so existing callers are byte-identical.

**Contract**: `StreamRequest.maxTokens?: number`; adapter `stream()` body adds `max_tokens` only when defined. Test: body contains `max_tokens` when set, omits it when not. `CompleteRequest` unchanged (S-06 may extend it).

#### 2. Prose call site

**File**: `src/lib/advisors/run-panel.ts`

**Intent**: Pass a ceiling on the shared R1/R2 rationale `stream()` call (`:107`); bump the logging tag so log lines distinguish the new wording.

**Contract**: `const RATIONALE_MAX_TOKENS = 350` (prompt targets ~2–3 sentences ≈ 100–150 tokens; the ceiling is a guard, not the shaper). `PROMPT_VERSION = "v2"` (file names stay `.v1.ts` — see What We're NOT Doing).

#### 3. Shared brevity clauses + persona prompts

**File**: `src/lib/prompts/brevity.ts` (new); `src/lib/prompts/advisor-{optymista,sceptyk,pragmatyk,analityk}.v1.ts`

**Intent**: One exported wording reused by all 4 personas (the shape S-06 proposed, `resume-session-round/plan.md:145`). Heads (`buildPrompt`, `buildRoundTwoPrompt`): replace "co najmniej jeden argument" with 1–3 short one-sentence arguments, and drop the "pełniejszego uzasadnienia" teaser. Rationales (`buildRationalePrompt`, `buildRoundTwoRationalePrompt`): replace "rozbuduj … dodaj niuanse i przykłady" / "pełniejsze, płynne uzasadnienie" with 2–3 sentences that add what the arguments don't (one concrete example or consequence) and do not restate them. `buildSideThreadPrompt` untouched.

**Contract**: `export const ARGUMENTS_LIMIT_CLAUSE: string`, `export const RATIONALE_BREVITY_CLAUSE: string` (Polish). All existing invariants kept: voice label, "score before rationale", attribution `TYLKO`/`null` rule, "bez JSON" in rationale.

#### 4. Prompt tests

**File**: `src/lib/prompts/advisor-prompts.test.ts`

**Intent**: Pin the new behavior: every head prompt contains `ARGUMENTS_LIMIT_CLAUSE`; every R1/R2 rationale prompt contains `RATIONALE_BREVITY_CLAUSE` and matches none of `/rozbuduj|pełniejsze/`; existing assertions still pass.

#### 5. S-06 coordination note

**File**: `context/changes/resume-session-round/change.md` (Notes)

**Intent**: Record that S-07 made brevity the default for rounds 1–2 and owns `StreamRequest.maxTokens`; S-06's `concise` flag becomes a stricter tier for rounds > 2 and should reuse `brevity.ts` and `maxTokens` rather than re-add them.

### Success Criteria:

#### Automated Verification:

- Unit tests pass (adapter `max_tokens`, prompt clauses): `npm test`
- No expansion wording left in R1/R2 builders: `grep -rn "rozbuduj\|pełniejsze" src/lib/prompts` returns 0 hits
- Lint passes: `npm run lint`
- Build passes: `npm run build`

#### Manual Verification:

- Real session (OpenRouter): each advisor's prose is ~2–3 sentences, does not repeat its argument bullets, and no prose is cut mid-sentence by the ceiling
- Heads return 1–3 arguments; no increase in `LLM_INVALID_OUTPUT` in logs across 3 sessions
- Round 2 still produces attribution on score change and the forced-divergence spread is visibly preserved

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- `deriveSessionStep`: every step transition, boundary at `minRoundTwoParticipants - 1` / `minRoundTwoParticipants`, synthesis locked during round 2, retry on 0 scored.
- Adapter: `max_tokens` present/absent.
- Prompts: clauses present, expansion wording gone, existing invariants intact.

### Integration Tests:

- None automated (no component/E2E runner); covered by the manual walk-through and `npm run smoke` (auth regression, page renders).

### Manual Testing Steps:

1. Create a session; without reload walk R1 → R2 → synthesis → NOWA DECYZJA.
2. Create a session; skip R2 via ZAKOŃCZ SESJĘ after R1.
3. Reload at each step; confirm state, folds and no auto-scroll on load.
4. Simulate a failed stream; confirm PONÓW recovers.
5. 375px + 1280px, keyboard only, reduced motion.

## Performance Considerations

Shorter prose shrinks R2 inputs (peer heads embedded in every R2 prompt) and stream duration, which also eases the Cloudflare streaming-duration risk noted in earlier plans. One merged island hydrates the same components as before; no extra requests.

## Migration Notes

No schema/data migration. Existing sessions replay unchanged (persisted text is not regenerated).

## References

- Frame: `context/changes/session-quality-polish/frame.md`
- Research: `context/changes/session-quality-polish/research.md`
- Page: `src/pages/sessions/[id].astro:38-112`
- Panels: `src/components/advisor-panel/{AdvisorPanel,RoundTwoPanel,SynthesisPanel,AdvisorCard}.tsx`, hooks `usePanelStream.ts:139-142`, `useSynthesisStream.ts:63-66`
- LLM: `src/lib/adapters/llm-provider.ts:29-39`, `openrouter.adapter.ts:188-193`, `src/lib/advisors/run-panel.ts:18`, `:107`
- Prompts: `src/lib/prompts/advisor-*.v1.ts`, tests `advisor-prompts.test.ts`
- S-06 plan: `context/changes/resume-session-round/plan.md:44`, `:119-151`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: SessionFlow island and live gating

#### Automated

- [x] 1.1 deriveSessionStep unit tests cover all step transitions — f4208c4
- [x] 1.2 Lint passes — f4208c4
- [x] 1.3 Type check passes — f4208c4
- [x] 1.4 Build passes — f4208c4

#### Manual

- [x] 1.5 Fresh session shows round-2/synthesis actions and DOPYTAJ without reload — f4208c4
- [x] 1.6 Synthesis locked while round 2 streams, completes in same page load — f4208c4
- [x] 1.7 Reload at each step reconstructs state with replay only — f4208c4
- [x] 1.8 Stream failure shows error with PONÓW instead of hanging — f4208c4

### Phase 2: Step action bar and end-of-session CTA

#### Automated

- [x] 2.1 Lint passes — 4e70e2d
- [x] 2.2 Type check passes — 4e70e2d
- [x] 2.3 Build passes — 4e70e2d
- [x] 2.4 No per-panel forward buttons remain in RoundTwoPanel/SynthesisPanel — 4e70e2d

#### Manual

- [x] 2.5 Settled steps scroll the bar into view; instant under reduced motion — 4e70e2d
- [x] 2.6 Revisit does not auto-scroll; NOWA DECYZJA + HISTORIA SESJI work — 4e70e2d
- [x] 2.7 Keyboard walk-through and screen-reader status announcement — 4e70e2d
- [x] 2.8 Bar layout correct at 375px and 1280px — 4e70e2d

### Phase 3: Density — fold finished rounds, argument toggle

#### Automated

- [x] 3.1 Lint passes — 6beb31d
- [x] 3.2 Type check passes — 6beb31d
- [x] 3.3 Build passes — 6beb31d

#### Manual

- [x] 3.4 Round 1 folds on round-2 start; expand reopens no stream — 6beb31d
- [x] 3.5 Open side thread survives fold and expand — 6beb31d
- [x] 3.6 ARGUMENTY toggle keyboard-accessible, collapsed by default — 6beb31d
- [x] 3.7 Finished session on reload shows both rounds folded — 6beb31d

### Phase 4: Brevity — prompt caps and prose max_tokens

#### Automated

- [x] 4.1 Unit tests pass for adapter max_tokens and prompt clauses — 1a24cf4
- [x] 4.2 No expansion wording left in R1/R2 builders — 1a24cf4
- [x] 4.3 Lint passes — 1a24cf4
- [x] 4.4 Build passes — 1a24cf4

#### Manual

- [x] 4.5 Prose is 2–3 sentences, not restating arguments, not truncated — 1a24cf4
- [x] 4.6 Heads return 1–3 arguments without more LLM_INVALID_OUTPUT — 1a24cf4
- [x] 4.7 Round-2 attribution and score divergence preserved — 1a24cf4

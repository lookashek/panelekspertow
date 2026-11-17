# Plan: ui-pixel-refresh

## Overview

Re-value the global design tokens (lighter, less-saturated graphite base, desaturated arcade
accents, fixed advisor/status color collision, Pixelify Sans pixel font) and bring the
`/sessions/[id]` view (advisor panel + synthesis) up to the new, richer visual contract: pixel-art
advisor avatars, a `score-pop` reveal animation, and a one-shot `synthesis-complete` moment with a
simple mascot. Visual-only — no logic, API, or data-flow changes. Sharp corners (`--radius: 0`)
and the hard pixel-shadow convention stay unchanged. Other views are explicitly out of scope and
will inherit this contract in follow-on changes.

Grounded in `context/changes/ui-pixel-refresh/research.md` (exact file:line anchors) and the
precedent `context/changes/ui-visual-refactor/` (the change that created the current system).

## Current State Analysis

- All tokens live in `src/styles/global.css` `:root` (94-144) + `@theme inline` (146-223);
  zero light theme, zero per-component overrides — a pure value swap in one file drives most of
  the visual change automatically.
- `src/components/advisor-panel/AdvisorCard.tsx` and `src/pages/sessions/[id].astro` already
  score 0 hits on the hardcoded-value scanner — fully token-driven, so no literal cleanup needed,
  only new token values and new markup.
- `advisor-2`/`advisor-3` are byte-identical to `success`/`warning` today (`global.css:124,113`
  and `126,115`) — an unintentional collision this change fixes.
- `Welcome.astro` already prototypes the exact "pixel-grid SVG, fill via `var(--token)`" technique
  this change needs for avatars/mascot — extracting it into a shared component removes duplication
  it would otherwise create a third time.
- `SynthesisPanel.tsx` has no `"done"`-specific render branch today; the existing
  `reportedStatusRef` pattern (lines 58-66) can detect the one-shot transition without new
  architecture.
- `scripts/ui-scan.mjs`'s regex (line 16) does not match `var()`/JSX-expression `fill` values —
  confirmed safe for all new sprite/icon/mascot work, no allowlist entry needed.

## What We're NOT Doing

- No changes to `/`, `/sessions`, `/sessions/new`, `/auth/*`, `/dashboard` — deferred to follow-on
  changes once this one lands the token contract and shared components they'll reuse.
- No change to `--radius` or the hard pixel-shadow convention (`--shadow-pixel*`).
- No new runtime dependencies (no animation library, no icon library, no font package) — all new
  graphics are hand-authored inline SVG using the existing `Welcome.astro` technique; font is
  vendored the same way Silkscreen already is.
- No decorative background ornaments and no mascot presence outside the synthesis-completion
  moment (confirmed scope: simple, one-pose mascot, one appearance).
- No persistent-chrome (Topbar) mascot placement.
- No change to `AdvisorCard`'s streaming/data logic, `usePanelStream`, `useSynthesisStream`'s wire
  format, or any `src/pages/api/**` route.

## Phase 1: Tokens, font, and new keyframes

### Overview
Re-value every color role in `global.css`, fix the advisor/status collision, vendor Pixelify Sans
in place of Silkscreen, add two decoration-adjacent tokens (unused until later phases introduce
ornaments — included now only if needed; see note below) and two new keyframes.

### Changes Required

#### 1. `src/styles/global.css` — re-value color roles (lines 96-129)
**Intent:** Lighten the graphite base and desaturate every accent per the user-approved direction
("less dark/neon, still arcade"); eliminate the advisor-2/success and advisor-3/warning collision.
**Contract:** Same token names, new values:
```
--background: #1f2230;        /* was #12141c */
--foreground: #f3f1e8;        /* was #eef0f6 */
--card: #2a2e40;              /* was #1b1e2a */
--popover: #2a2e40;           /* was #1b1e2a */
--secondary: #363b52;         /* was #252a3a */
--muted: #363b52;             /* was #252a3a */
--muted-foreground: #aab0c9;  /* was #9aa3b8 — recomputed for new surfaces */
--primary: #f2b84f;           /* was #ffcc33 */
--accent: #5cc9e0;            /* was #33d6ff */
--info: #5cc9e0;              /* was #33d6ff */
--success: #7fd99a;           /* was #5cf28a */
--warning: #e8a05a;           /* was #ff9f43 */
--destructive: #e8637a;       /* was #ff4f6d */
--ring: #5cc9e0;              /* was #33d6ff */
--advisor-1: #e37aa8;         /* was #ff5fa2 */
--advisor-2: #6fb8e8;         /* was #5cf28a (== success) — new distinct sky-blue hue */
--advisor-3: #c9a227;         /* was #ff9f43 (== warning) — new distinct mustard-gold hue */
--advisor-4: #9b8bd4;         /* was #a78bfa */
```
All `*-foreground` tokens stay `#12141c`-family — recheck contrast of `#12141c`-style dark text
against each new, lighter accent in the manual verification step (dark-on-bright pairs generally
gain contrast as the accent lightens, but confirm, don't assume). `chart-1..5` and `sidebar-*`
mirror the same re-valued roles per their existing `var()` references — no separate edit needed
beyond the primary role values above (`global.css:131-143`).

#### 2. `src/styles/global.css` — Pixelify Sans font swap (lines 10-45, 152)
**Intent:** Replace Silkscreen with Pixelify Sans for the pixel-font role (nicer letterforms, same
self-hosted/OFL vendoring pattern), closing the inherited-but-never-closed Polish-diacritics check.
**Contract:** Vendor `src/assets/fonts/pixelify-sans-{latin,latin-ext}-{400,700}.woff2` from
Fontsource via jsDelivr (same mechanism as the existing Silkscreen comment at lines 6-9
describes); replace the 4 Silkscreen `@font-face` blocks (lines 10-45) with 4 Pixelify Sans
blocks, same `unicode-range` values (they already cover the Latin/Latin-ext blocks needed for
Polish diacritics); change `--font-pixel: "Silkscreen", monospace;` (line 152) to
`--font-pixel: "Pixelify Sans", monospace;`. Delete the now-unused Silkscreen `.woff2` files from
`src/assets/fonts/`. `--font-mono` (JetBrains Mono, line 153) is unchanged.

#### 3. `src/styles/global.css` — new keyframes (after line 252)
**Intent:** Provide the two signature-moment animations without touching any existing keyframe.
**Contract:**
```css
@keyframes score-pop {
  0% { transform: scale(0.6); opacity: 0; }
  60% { transform: scale(1.1); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes synthesis-complete {
  0% { box-shadow: var(--shadow-pixel); }
  40% { box-shadow: 6px 6px 0 0 var(--shadow-pixel-color); }
  100% { box-shadow: var(--shadow-pixel); }
}
```
Register in `@theme inline` next to lines 221-222:
```css
--animate-score-pop: score-pop 0.45s ease-out both;
--animate-synthesis-complete: synthesis-complete 0.6s ease-out both;
```
Both consumed only via `motion-safe:animate-score-pop` / `motion-safe:animate-synthesis-complete`
in later phases — never unguarded.

### Success Criteria

#### Automated Verification
- `npm run lint:ui` passes (no literal values introduced).
- `npm run lint` passes.
- `npm run build` succeeds.

#### Manual Verification
- Open `/dev/kitchen-sink`: palette swatches visibly lighter/less neon, no two swatches (across
  surfaces, accents, advisors) look identical.
- Recompute WCAG contrast for every text/surface pair that changed (foreground/muted-foreground
  on background/card; each `*-foreground` on its own bright token) and record the table in a new
  `context/changes/ui-pixel-refresh/palette.md` (mirrors `ui-visual-refactor/palette.md`'s shape)
  — confirm all ≥ 4.5:1 (text) / ≥ 3:1 (large/bold), note any that need a further nudge.
  Pixelify Sans Polish-diacritic check listed in that same `palette.md` as **closed** (confirm by
  eye on the kitchen sink "Polish glyph check" paragraph, `kitchen-sink.astro:64-67`).
- No regression: existing `Button`/`Field`/`Badge`/`Alert`/`Skeleton`/`Panel` catalog sections on
  kitchen sink still read correctly against the new surfaces (borders/shadows still visible).

## Phase 2: Shared pixel-sprite primitive + advisor sprite data

### Overview
Extract the pixel-grid-SVG technique already prototyped in `Welcome.astro` into a reusable
component and a shared advisor-sprite data module, so Phase 3/4 (and `Welcome.astro` itself) have
one source instead of a second copy.

### Changes Required

#### 1. `src/components/ui/pixel-sprite.tsx` (new)
**Intent:** One shared renderer for any hand-authored pixel-grid sprite (advisor avatars now,
icons/mascot in this and later phases) — replaces the inline SVG-building JSX duplicated today
only in `Welcome.astro`.
**Contract:** `PixelSprite({ grid: string[], fills: Record<string, string>, size, className })`
renders the exact `<svg viewBox="0 {grid.length} ..." shape-rendering="crispEdges" aria-hidden="true">`
+ `flatMap`/`rect` pattern from `Welcome.astro:140-151`, parameterized instead of hardcoded. `size`
controls the Tailwind size classes (keeps the existing vector-scaling approach — not integer
raster multiples; this is a deliberate decision, not an oversight, since there's no raster
pixelation risk for vector rects). `fills` values are always `var(--token)` strings, consumed via
inline `style`, confirmed scanner-safe per `scripts/ui-scan.mjs:16`.

#### 2. `src/lib/advisors/advisor-sprites.ts` (new)
**Intent:** Central 4-advisor sprite data, keyed the same way as `advisor-accent.ts`, so
`AdvisorCard` and `Welcome.astro` (and `RoundSummary` for its smaller row, Phase 3) read one
source instead of three.
**Contract:** `Record<"optymista"|"sceptyk"|"pragmatyk"|"analityk", { grid: string[] }>` — reuse
the 4 existing 12×12 grids from `Welcome.astro:33-46,52-65,71-84,90-103` verbatim (same ids
confirmed at `src/lib/schemas/advisor.ts:27`); fill legend stays `PIXEL_FILL`-shaped but moves
alongside this data (or into `advisor-accent.ts` if that's a cleaner single import for consumers —
implementer's call, no product decision here). A `neutralAdvisorSprite` fallback grid for unknown
ids, mirroring `advisor-accent.ts:18`'s `NEUTRAL_ACCENT` pattern.

#### 3. `src/components/Welcome.astro` — consume the shared primitive
**Intent:** Remove the duplicated inline sprite-building JSX now that it has a shared home;
pure refactor, no visual change on `/` (which is out of scope for this change's visible-page
list, but this file is touched as a side effect of the extraction).
**Contract:** Replace the local `PIXEL_FILL` map + inline `<svg>`/`flatMap` block
(`Welcome.astro:13-19, 140-151`) with `<PixelSprite grid={advisor.grid} fills={...} />` sourced
from the new `advisor-sprites.ts`. No change to `Welcome.astro`'s surrounding layout/copy.

#### 4. `src/components/ui/mascot.tsx` (new)
**Intent:** The one simple mascot sprite for the synthesis-completion moment (Phase 4) — single
pose, no variants, per the confirmed "simple start" scope.
**Contract:** `Mascot({ className })`, a fixed `PixelSprite` with a small hand-authored grid (e.g.
16×16) and a fill legend drawn from existing tokens (`primary`/`accent`/`foreground`) — no new
color tokens. Grid content is a creative/placeholder choice at implementation time (e.g. a simple
arcade-coin or face-like sprite); exact pixel art is not a product decision blocking this plan.

### Success Criteria

#### Automated Verification
- `npm run lint:ui` passes (inline `fill: var(--token)` confirmed not flagged).
- `npm run lint` passes (new files pass type-check, `PixelSprite` props fully typed, no `any`).
- `npm run build` succeeds.

#### Manual Verification
- `/` (Welcome page) renders identically to before the refactor (same 4 advisor sprites, same
  layout) — confirms the extraction didn't change `Welcome.astro`'s output.
- New `Mascot` component renders a recognizable, token-colored sprite when temporarily mounted
  anywhere for a visual check (not yet wired into the app — that's Phase 4).

## Phase 3: AdvisorCard avatar + score-pop reveal

### Overview
Give each advisor a pixel-art avatar next to their name, and animate the score glyph's first
appearance each round. Bring `RoundSummary`'s independent identity row to the same avatar, for
parity. Fix the pre-existing missing `motion-safe:` on both files' entrance animations while
touching them.

### Changes Required

#### 1. `src/components/advisor-panel/AdvisorCard.tsx` — avatar slot (header, lines 45-50)
**Intent:** Make the 4 personas visually distinguishable at a glance, not just by accent
color/text.
**Contract:** Add a `<PixelSprite>` (from `advisor-sprites.ts`, keyed by `personaId`) as a sibling
before the `<h3>` inside the existing `<header className="flex items-center justify-between gap-2">`
(line 45) — small size (e.g. matching the `text-pixel-sm` line height), `aria-hidden` (name text
remains the accessible label, avatar is decorative reinforcement only).

#### 2. `src/components/advisor-panel/AdvisorCard.tsx` — score-pop animation (line 54) + motion-safe fix (line 53)
**Intent:** Give the round score reveal the "fun accent" the user asked for, once per new score;
fix the pre-existing reduced-motion gap on the containing block.
**Contract:** Change line 53's class from `"animate-fade-up flex flex-col gap-1"` to
`"motion-safe:animate-fade-up flex flex-col gap-1"`. Add `motion-safe:animate-score-pop` to line
54's `<p className="text-info text-pixel-md" aria-hidden="true">{scoreGlyph(state.score)}</p>` —
applied unconditionally on this element (it only renders once per round per the existing
`state.score !== undefined && delta` guard, so no new key/ref logic is needed to make it fire
once per round).

#### 3. `src/components/advisor-panel/RoundSummary.tsx` — avatar parity (lines 33-44)
**Intent:** The folded/summary row independently renders advisor identity (does not compose
`AdvisorCard`) — give it the same small avatar so collapsing a round doesn't lose the visual
identity just added.
**Contract:** Add a small `<PixelSprite>` (smaller size than the full-card version) before the
existing `<span className="font-pixel text-pixel-micro uppercase ...">{row.label}</span>` at
line ~36, keyed by `row.personaId` (already available, used at line 34 for `advisorAccent`).

### Success Criteria

#### Automated Verification
- `npm run lint:ui` passes.
- `npm run lint` passes.
- `npm run build` succeeds.

#### Manual Verification
- On a live session at `/sessions/[id]`, round 1: each of the 4 advisor cards shows a distinct
  avatar next to its name.
- Triggering a score for an advisor shows a brief, noticeable "pop" on the score glyph — confirm
  it does not repeat/re-trigger on every re-render of the same round (only on first appearance).
- With OS/browser "reduce motion" enabled, confirm both the score-pop and the (now
  `motion-safe:`-gated) card entrance fade no longer animate.
- Folded round-2 summary rows show the matching smaller avatar per advisor.

## Phase 4: Synthesis completion moment + mascot

### Overview
Add the one-shot "synthesis complete" animation on the recommended-next-step panel and the
mascot's single appearance, firing exactly once when the stream transitions into `"done"`.

### Changes Required

#### 1. `src/components/advisor-panel/SynthesisPanel.tsx` — detect the one-shot `done` transition (lines 58-66)
**Intent:** Reuse the existing status-change-tracking effect to derive a boolean that's true
exactly once, without introducing a new state machine.
**Contract:** Add `const [justCompleted, setJustCompleted] = useState(false);` near the existing
`reportedStatusRef` declaration. Inside the existing `useEffect` (lines 58-66), before
`reportedStatusRef.current` is overwritten, check
`if (reportedStatusRef.current !== "done" && state.status === "done") setJustCompleted(true);` —
one extra line in the existing effect body, no new effect, no new dependency array entry needed
(the check reads the ref's pre-update value synchronously).

#### 2. `src/components/advisor-panel/SynthesisPanel.tsx` — apply the animation + mascot (lines 98, 148-151)
**Intent:** Give the single most important moment in the flow (final recommendation) visible
weight, plus the mascot's one scoped appearance; fix the pre-existing missing `motion-safe:` on
the outer wrapper while touching this file.
**Contract:** Change line 98's `className="animate-fade-up flex flex-col gap-4"` to
`"motion-safe:animate-fade-up flex flex-col gap-4"`. On the "Rekomendowany następny krok" panel
(lines 148-151), conditionally add `motion-safe:animate-synthesis-complete` to the
`panelVariants({ padding: "card", tone: "primary" })` className when `justCompleted` is true
(e.g. `cn(panelVariants({ padding: "card", tone: "primary" }), justCompleted && "motion-safe:animate-synthesis-complete")`).
Render `<Mascot />` (from Phase 2, small size) adjacent to this panel's heading only when
`justCompleted` is true — the mascot's sole appearance in this change.

### Success Criteria

#### Automated Verification
- `npm run lint:ui` passes.
- `npm run lint` passes.
- `npm run build` succeeds.

#### Manual Verification
- On a live session, reaching synthesis completion shows the next-step panel "pop" once and the
  mascot appear once — re-rendering the same completed state (e.g. navigating away and back within
  the same loaded page, if applicable) does not re-trigger the animation.
- With "reduce motion" enabled, the completion pop and the (now `motion-safe:`-gated) outer fade
  no longer animate; the mascot still appears (static), since its appearance is a content change,
  not an animation.
- Mascot sprite reads as a recognizable, deliberate shape (not visual noise) at its placed size.

## Phase 5: States, visual gate, and guard

### Overview
Update `/dev/kitchen-sink` for every new/changed shared piece, update `.claude/rules/frontend.md`
to match the new token values and font, and confirm the full `/sessions/[id]` flow end to end.

### Changes Required

#### 1. `src/pages/dev/kitchen-sink.astro` — palette + font + new components
**Intent:** Keep the visual gate authoritative for the new system.
**Contract:** Update the `swatches` array (lines 22-35) and rendered swatches (69-79) to the new
hex values. Update the Polish-glyph check paragraph (64-67) to use Pixelify Sans and confirm it
renders correctly — this closes the inherited open item from `ui-visual-refactor/palette.md`.
Add a new, dedicated section (not inside AdvisorCard's existing blanket-N/A entry at lines
440-448, since these are static/non-stream-dependent) showing: the 4 advisor avatars via
`PixelSprite` at both sizes used (full-card, summary-row), the `Mascot` sprite, and a static
"replay" button that toggles a class to demo `score-pop` and `synthesis-complete` without a live
session.

#### 2. `.claude/rules/frontend.md` — reconcile token table and font
**Intent:** Keep the agent rules file authoritative for the next session/agent, same discipline
`ui-visual-refactor` followed at its own Phase 9.
**Contract:** Rewrite the token table (lines 66-74) with the new hex values; update every mention
of "Silkscreen" (grep the file during implementation — research flagged this needs a full-file
grep, not just the §5 table) to "Pixelify Sans". No structural change to the rule — same roles,
same table shape, same section numbering.

#### 3. `context/changes/ui-pixel-refresh/palette.md` (new, if not already written in Phase 1's manual step)
**Intent:** Deposit the final values + contrast table in the repo, same shape as the precedent
`ui-visual-refactor/palette.md`, so the next change (or next agent) has a source of truth instead
of re-deriving values from chat.
**Contract:** Font source section (Pixelify Sans, Fontsource/jsDelivr, OFL, vendored weights),
token value table, contrast table, and an explicit "Polish diacritics: confirmed" line closing the
inherited open item.

### Success Criteria

#### Automated Verification
- `npm run lint:ui` clean.
- `npm run lint` clean.
- `npm run build` succeeds.
- Re-run the hardcoded-value scan from the `/10x-ui` pre-audit on
  `src/components/advisor-panel/*.tsx`, `src/pages/sessions/[id].astro`, and the 3 new
  `src/components/ui/pixel-sprite.tsx` / `mascot.tsx` files + `advisor-sprites.ts`: 0 hits.

#### Manual Verification
- Full flow walkthrough: `/sessions/new` → `/sessions/[id]` round 1 → round 2 → synthesis,
  confirming avatars, score-pop, and the synthesis-complete + mascot moment all appear correctly
  and only once each where "once" is expected.
- `/dev/kitchen-sink` 7-state matrix: every new/touched component cell is either shown or marked
  N/A with a stated reason (none silently skipped).
- Desktop (1280px) and mobile (375px) pass for `/sessions/[id]` — avatars and mascot don't break
  layout or overflow at either width.
- `frontend.md` read-through: no remaining mention of Silkscreen, token table matches
  `global.css` exactly.

## Progress

### Phase 1: Tokens, font, and new keyframes
#### Automated
- [x] 1.1 `npm run lint:ui` passes — 401fa95
- [x] 1.2 `npm run lint` passes — 401fa95
- [x] 1.3 `npm run build` succeeds — 401fa95
#### Manual
- [ ] 1.4 Kitchen-sink swatches visibly lighter/less neon, no identical swatches (PENDING — dev server would not start in this environment; needs your live check at `/dev/kitchen-sink`)
- [x] 1.5 Contrast table recomputed and recorded in `palette.md`, all pairs ≥ AA — 401fa95
- [ ] 1.6 Existing component catalog sections still read correctly against new surfaces (PENDING — same live-render blocker as 1.4)

### Phase 2: Shared pixel-sprite primitive + advisor sprite data
#### Automated
- [x] 2.1 `npm run lint:ui` passes — 21c9e67
- [x] 2.2 `npm run lint` passes — 21c9e67
- [x] 2.3 `npm run build` succeeds — 21c9e67
#### Manual
- [x] 2.4 `/` renders identically to before the `Welcome.astro` refactor (PixelSprite output is byte-identical to the prior inline SVG for the same grid/fills — same viewBox, same rect-per-cell, same fill values; verified by code inspection, no dev server available in this environment) — 21c9e67
- [x] 2.5 `Mascot` component renders a recognizable token-colored sprite (verified by code inspection — same PixelSprite primitive, token-driven fills) — 21c9e67

### Phase 3: AdvisorCard avatar + score-pop reveal
#### Automated
- [x] 3.1 `npm run lint:ui` passes — 180772c
- [x] 3.2 `npm run lint` passes — 180772c
- [x] 3.3 `npm run build` succeeds — 180772c
#### Manual
- [ ] 3.4 Each of the 4 advisor cards shows a distinct avatar (PENDING — needs your live check on a real session at `/sessions/[id]`; dev server doesn't start in this environment)
- [ ] 3.5 Score-pop fires once per round, not on every re-render (PENDING — same live-session blocker; by code inspection it's applied unconditionally on an element that only mounts once per round per the existing `state.score !== undefined && delta` guard, so it should not re-trigger on unrelated re-renders, but this needs live confirmation)
- [ ] 3.6 Reduced-motion disables score-pop and card entrance fade (PENDING — same blocker; both are `motion-safe:`-gated by code)
- [ ] 3.7 Folded round-2 summary rows show matching avatars (PENDING — same blocker)

### Phase 4: Synthesis completion moment + mascot
#### Automated
- [x] 4.1 `npm run lint:ui` passes — fdfb1f8
- [x] 4.2 `npm run lint` passes — fdfb1f8
- [x] 4.3 `npm run build` succeeds — fdfb1f8
#### Manual
- [ ] 4.4 Completion pop + mascot appear exactly once on synthesis done (PENDING — needs your live check; by code inspection `justCompleted` is set only on the `!== "done" -> "done"` transition inside the existing once-per-status-change effect, so it should not re-fire on re-renders)
- [ ] 4.5 Reduced-motion disables the pop/fade; mascot still appears (static) (PENDING — same live-session blocker; both animations are `motion-safe:`-gated by code, mascot render itself isn't gated)
- [ ] 4.6 Mascot sprite reads as deliberate, not visual noise (PENDING — subjective call, needs your eyes on the actual pixel art)

### Phase 5: States, visual gate, and guard
#### Automated
- [x] 5.1 `npm run lint:ui` clean — cc6c480
- [x] 5.2 `npm run lint` clean — cc6c480
- [x] 5.3 `npm run build` succeeds — cc6c480
- [x] 5.4 Hardcoded-value re-scan: 0 hits across touched + new files — cc6c480
#### Manual
- [ ] 5.5 Full flow walkthrough confirms all new visuals, correct "once" behavior (PENDING — needs your live check; no dev server available in this environment)
- [ ] 5.6 Kitchen-sink 7-state matrix: every cell shown or N/A-with-reason (PENDING — new pixel-art section added with explicit N/A reasoning for all 7 cells; needs your visual confirmation)
- [ ] 5.7 Desktop (1280px) + mobile (375px) pass, no layout breaks (PENDING — same live-render blocker)
- [x] 5.8 `frontend.md` fully reconciled (no Silkscreen mentions, token table matches) — confirmed by grep: only historical change-folder docs mention Silkscreen, no live code/rules reference remains — cc6c480

# S-08 UI Visual Refactor — "Neon arcade on graphite" Implementation Plan

## Overview

A full visual reskin of the whole app (PRD FR-012, US-03, roadmap S-08), done through the existing design-system
contract rather than around it. The token **names** (`src/styles/global.css` `:root` + `@theme inline`), shadcn
(`src/components/ui/`) and `cva` stay; the token **values** are replaced with a new graphite + multicolour neon palette,
the pixel font becomes Silkscreen, and a real pixel component layer (Button, Panel, Field, Badge, Alert, Skeleton,
heading scale) replaces the hand-copied class strings. Views then move onto that layer one per phase, each gated by
screenshots and the hardcoded-value scan. The change ends with a 7-state kitchen sink and a rewritten agent rule.

No functional change, except the four incidental fixes the user explicitly pulled in (blink no-op, focus ring on pixel
buttons, auth pending spinner, round-1 "(bez zmian)" announcement) and the presentational step indicator.

## Current State Analysis

Full inventory: `context/changes/ui-visual-refactor/research.md` (charges C1–C5). In short:

- **Two visual systems.** Pixel-retro on tokens (`/`, `/sessions`, `/sessions/new`, `/sessions/[id]`) and the untouched
  starter "cosmic glass" on `/auth/*`, `/dashboard`, `src/components/auth/*`, `Banner.astro` (palette classes,
  `rounded-2xl`, `backdrop-blur-xl`, undefined `bg-cosmic`, English copy, hex in a scoped `<style>`).
- **Tokens exist but are incomplete** (`global.css:67-141`): violet/cyan palette, no status colours, no hard-shadow
  token (duplicated at `global.css:163,171`), no pixel type scale (4 arbitrary micro sizes in 12 places), no callout
  surfaces.
- **No component layer.** `ui/button.tsx:7-33` has no pixel variant; the primary pixel button recipe is copied 7×, small
  secondary 4×; raw `.pixel-btn` elements have no `focus-visible` ring; `.pixel-panel` has 5 padding/width recipes; the
  bordered tag is implemented twice with two colour maps; 3 field recipes; 6 error recipes; 0 skeletons; `ui/LibBadge.astro`
  is dead.
- **Shell.** `Topbar.astro:5-39` is one non-wrapping `justify-between` row with no home link and no active state;
  `Layout.astro:27` wraps it full-width so it doesn't align with page content; 5 different page widths.
- **Bugs riding along.** `motion-safe:animate-blink` generates nothing (`.animate-blink` is a plain class inside a media
  query, `global.css:199-206`); `SubmitButton.tsx:12` uses `useFormStatus`, which never reports pending on the native
  `method="POST"` forms (`SignInForm.tsx:43`, `SignUpForm.tsx:66`); round-1 cards announce " (bez zmian)" and render "▬"
  with no previous round (`AdvisorCard.tsx:32-33,76-77`).
- **Rules vs code.** `frontend.md` §5 says violet = interactive, gradients never on backgrounds; the code uses violet
  borders on static panels, a gradient grid background, and cyan hover on every action. Decision: **the rule's semantics
  win** — the code changes. The rule's palette hex values are rewritten to the new palette in the final phase.

## Desired End State

Every route — `/`, `/auth/signin`, `/auth/signup`, `/auth/confirm-email`, `/dashboard`, `/sessions`, `/sessions/new`,
`/sessions/[id]` — renders in one "neon arcade on graphite" style, in Polish, built only from `global.css` tokens and
components in `src/components/ui/`. No violet-tinted surfaces remain. Action colour (yellow `primary`) is reserved for
interactive elements; static panels use neutral borders; info/scores use cyan; status uses success/warning/destructive
tokens, always paired with text. Each advisor carries its own identity accent. The session view shows a "RUNDA 1"
heading and a step indicator. A dev-only kitchen sink at `/dev/kitchen-sink` shows every shared component in all 7
states. `frontend.md` describes the shipped contract, and `npm run lint:ui` fails on literal colours/arbitrary values in
views.

Verify: run the hardcoded-value scan (count 0 in views), open the kitchen sink at 1280px and 375px, walk each route at
both widths.

### Key Discoveries:

- `buttonVariants` is already exported (`ui/button.tsx:50`) — `.astro` files can use `class={buttonVariants({...})}`,
  giving one button source for React and Astro. The same pattern works for a `panelVariants` cva.
- `--radius-sm…xl` are already 0 (`global.css:104-107`) — only `rounded-2xl` and `rounded-full` actually render rounded.
- `Layout.astro:6-7,22-23` preloads the Press Start 2P woff2 files — must switch to Silkscreen with the font swap.
- `SessionFlow.tsx:140-147` already derives `step.kind` via `deriveSessionStep` (`src/lib/session-flow.ts`); the step
  indicator only needs a pure mapping from that, and `session-flow.ts` must stay free of Polish strings (comment at
  `SessionFlow.tsx:46-51`).
- Advisor ids are stable: `optymista`, `sceptyk`, `pragmatyk`, `analityk` (`src/lib/advisors/registry.ts:112-146`).
- `scripts/smoke.mjs` asserts only statuses/redirect locations (`:40-58`), not copy — translating auth copy is smoke-safe.
- Repo has Vitest, no Playwright — the visual gate is the kitchen sink + manual screenshots (do not install a tool).
- Lesson: no leading underscore under `src/pages/**` (`context/foundation/lessons.md`) → kitchen sink at
  `src/pages/dev/kitchen-sink.astro`.
- `roadmap.md:54,215` already has S-08 at `planning`.

## What We're NOT Doing

- No change to routes, API, data, streaming, fold logic or `SessionFlow` state (S-07 structure is the baseline).
- `/dashboard` keeps its current role and links (not retired, not redirected) — only reskinned and translated.
- No hamburger/mobile menu — the Topbar wraps instead.
- No light theme, no theme toggle — still a single dark theme with `class="dark"` permanent.
- Not raising core synthesis/argument text from `text-xs`, not capping narrative line length, not fixing the thesis/prose
  emphasis inversion (declined in planning; revisit in the review loop if it hurts).
- No `whitespace-pre-wrap` / markdown rendering of LLM output (declined; research marked it needs real-output check).
- The `[id]` h1 stays generic ("TWOJA DECYZJA"); the decision text is not promoted to the title (declined).
- No new runtime dependencies (Silkscreen woff2 files are vendored, like Press Start 2P today); no Playwright.
- No new advisor personas; only the 4 existing ones get accent colours.

## Implementation Approach

`/10x-ui` order: **tokens → shared components → shell → one view per phase → states/gate/guard.** Because every
pixel view already reads tokens, Phase 1 re-colours them immediately; the view phases then remove literals and
duplicates. After each visual phase: screenshot at 1280px and 375px, and run the scan on that phase's files — the count
must only go down.

Hardcoded-value scan (from `/10x-ui`; run on view files, never on `global.css`):

```bash
grep -nE '#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|oklch\(|-\[[0-9.]+(px|rem)\]|\b(bg|text|border|ring|outline|from|via|to|fill|stroke|shadow|divide)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)\b' <files>
```

Colour semantics (the rule that wins, applied everywhere):

| Role | Token | Used for |
|---|---|---|
| Action | `primary` (yellow) | buttons, links, focus-adjacent emphasis — interactive only |
| Info / scores | `accent` / `info` (cyan) | scores, informational headings, hover/focus feedback ring (`ring`) |
| Structure | `border`, `card`, `secondary` (neutral graphite) | static panels, dividers — never `primary` |
| Status | `success` / `warning` / `destructive` | badges, alerts, risk levels — always with text |
| Identity | `advisor-1…4` | advisor name/marker only — never buttons or status |

## Critical Implementation Details

- **`motion-safe:` needs a real utility.** Declare the blink animation through `@theme` (`--animate-blink`) or
  `@utility animate-blink`, not a plain class in a media query; then `motion-safe:animate-blink` compiles. Keep the
  `Welcome` usage reduced-motion-safe too (switch it to `motion-safe:`). Verify in the built CSS
  (`dist/client/_astro/*.css` contains a `motion-safe\:animate-blink` rule).
- **Cascade: shadcn base vs pixel look.** Today `DecisionForm.tsx:113-118` fights `h-9`/`shadow-xs` in the base string.
  Put the pixel look **in** the cva (base + variants), remove `shadow-xs`, `rounded-md`, `dark:` from `button.tsx`,
  `input.tsx`, `textarea.tsx` — don't layer overrides via `className`.
- **Silkscreen + Polish glyphs.** Before switching, confirm the vendored latin-ext woff2 renders ą ć ę ł ń ó ś ź ż (and
  uppercase) — e.g. a line in the kitchen sink. If any glyph is missing, **stop and report to the user** before
  continuing; do not silently mix fonts.

## Phase 1: Tokens & fonts

### Overview

Replace the palette values, add the missing token roles, swap the pixel font, and fix the blink utility. Every token
view re-colours from this phase alone.

### Changes Required:

#### 1. Palette values + new roles

**File**: `src/styles/global.css`

**Intent**: Re-value `:root` to the accepted "neon arcade on graphite" palette and add the roles research found missing,
publishing each through `@theme inline`. Remove every violet value (including `border`, `input`, `chart-*`, `sidebar-*`,
which are retuned to the new palette rather than deleted, for shadcn compatibility). Update the header comment to the new
semantics.

**Contract**: Baseline values (from the planning decision; tune only for contrast, record final values in `palette.md`):
`background #12141c`, `card #1b1e2a`, `secondary`/`muted #252a3a`, `foreground #eef0f6`, `muted-foreground #9aa3b8`,
`primary #ffcc33` (+ dark foreground), `accent`/`info #33d6ff`, `success #5cf28a`, `warning #ff9f43`,
`destructive #ff4f6d`, `ring` = cyan, `border` = neutral (foreground mixed low), advisor identity
`advisor-1…4` = pink `#ff5fa2`, lime `#5cf28a`, orange `#ff9f43`, lilac `#a78bfa` (the accepted advisor set minus
yellow/cyan, which are already the action/info colours). New roles, each with a `-foreground` where text
sits on it: `success`, `warning`, `info`, `advisor-1…4`. New tokens: `--shadow-pixel` (hard 4px offset, published so
`shadow-pixel` exists) and a small hover/pressed variant if needed; a pixel type scale in `@theme`
(`--text-pixel-micro`, `-sm`, `-md`, `-lg`, `-xl`, `-2xl`, mapping the 6 roles: micro label, button/label, card title,
section heading, page heading, hero); a subtle placeholder role (replaces `text-muted-foreground/70`).

#### 2. Remove the grid background and rebuild helpers

**File**: `src/styles/global.css`

**Intent**: Delete `@utility bg-pixel-grid` (rule: no gradient backgrounds) — the page background becomes flat
`background`. Keep `.pixel-panel`/`.pixel-btn` temporarily so un-migrated views keep rendering, but re-point them at
`--shadow-pixel` and neutral/primary per the semantics table; they are deleted in Phase 9 once nothing uses them.

**Contract**: `bg-pixel-grid` callers (pages) temporarily render flat — acceptable; each view phase removes the class.

#### 3. Blink utility fix

**File**: `src/styles/global.css`

**Intent**: Make `animate-blink` (and `animate-fade-up`) real Tailwind utilities so `motion-safe:` variants compile —
fixes the static "waiting" labels in the session view.

**Contract**: see Critical Implementation Details.

#### 4. Silkscreen font

**Files**: `src/assets/fonts/silkscreen-{latin,latin-ext}-{400,700}.woff2` (new), `src/styles/global.css`,
`src/layouts/Layout.astro`, remove `src/assets/fonts/press-start-2p-*.woff2`

**Intent**: Vendor Silkscreen woff2 (latin + latin-ext, 400 + 700; source e.g. Fontsource via jsDelivr — no npm
dependency), replace the Press Start 2P `@font-face` blocks and `--font-pixel`, and switch the preload links in
`Layout.astro`.

**Contract**: `--font-pixel: "Silkscreen", monospace`; same `unicode-range` split as today.

#### 5. Deposit the values

**File**: `context/changes/ui-visual-refactor/palette.md` (new)

**Intent**: Record the final token values, the type-scale px values, the font source URL/licence (OFL), and a contrast
table (each foreground/accent on `background` and `card`, target WCAG AA for text). Add a one-line source pointer next to
the `:root` block in `global.css`.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npm run build` passes
- Built CSS contains a `motion-safe\:animate-blink` rule and utilities `shadow-pixel`, `bg-success`, `text-pixel-micro`
- `grep -c "b388ff\|bg-pixel-grid" src/styles/global.css` returns 0
- `context/changes/ui-visual-refactor/palette.md` exists with the contrast table

#### Manual Verification:

- Polish glyphs (ą ć ę ł ń ó ś ź ż, upper and lower) render in Silkscreen
- All text/accent pairs in `palette.md` meet WCAG AA on `background` and `card`
- `/sessions/[id]` and `/` render in the new colours at 1280px with no violet surfaces left on token-driven elements
- Waiting labels in the session view visibly blink (and stop under `prefers-reduced-motion: reduce`)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual
confirmation from the human before proceeding.

---

## Phase 2: Shared component layer + kitchen sink

### Overview

Build the pixel component layer every view will use, through shadcn + `cva`, and a dev-only kitchen sink to see it.

### Changes Required:

#### 1. Button

**File**: `src/components/ui/button.tsx`

**Intent**: Put the pixel look into `buttonVariants`: 2px border, `shadow-pixel`, pressed translate, pixel font,
uppercase, token-driven hover, `focus-visible` ring on `ring`; remove `rounded-md`, `shadow-xs`, `dark:` and the
`ring-[3px]` arbitrary value (use a ring-width token/standard utility). Fixes the missing focus ring on every pixel action
once callers migrate.

**Contract**: `variant`: `default` (primary/yellow, the main action), `secondary` (neutral outline), `ghost`,
`destructive`, `link`; `size`: `sm`, `default`, `lg`, `icon`. `asChild` kept (links rendered as buttons). Astro callers use
`class={buttonVariants({ variant, size })}` on `<a>`/`<button>`.

#### 2. Form primitives

**Files**: `src/components/ui/input.tsx`, `src/components/ui/textarea.tsx`, `src/components/ui/label.tsx`,
`src/components/ui/field.tsx` (new, local wrapper)

**Intent**: Restyle Input/Textarea to 2px borders, no `shadow-xs`/`rounded`/`dark:`, token focus and `aria-invalid`
states; Label in pixel label size. Add a small `Field` wrapper (label + control slot + hint + error) that wires
`aria-describedby`/`aria-invalid` — replaces the three unrelated field recipes.

**Contract**: `Field({ id, label, hint?, error?, children })`; error rendered with `destructive` token and text, id
`${id}-error` referenced by the control.

#### 3. Badge, Alert, Skeleton (shadcn)

**Files**: `src/components/ui/{badge,alert,skeleton}.tsx` via `npx shadcn@latest add badge alert skeleton`

**Intent**: Add through the stack's path, then restyle through tokens + cva only: Badge variants for status
(`success`, `warning`, `destructive`, `info`, `neutral`) — replaces `STATUS_CLASS` (`SessionList.astro:16-19`) and
`RISK_WEIGHT_CLASS` (`SynthesisPanel.tsx:23-27`); Alert variants `error`/`warning`/`info`/`success` with optional action
slot (error + retry) — replaces the 6 error recipes and tinted callouts; Skeleton as a pixel block (no rounding, stepped
blink under `motion-safe`).

**Contract**: no `rounded-*`, no palette classes; Badge text always present (colour never the only signal).

#### 4. Panel + heading scale

**Files**: `src/components/ui/panel.ts` (new: `panelVariants` cva), `src/components/ui/heading.tsx` (new, or a
`headingVariants` cva in the same style)

**Intent**: One panel recipe for React and Astro: neutral 2px border, `card` surface, `shadow-pixel`; replaces the 5
`.pixel-panel` recipes and the callout surfaces. Heading recipe for the 4 recurring roles (page h1, section h2, panel h3,
micro label) so the ~9 ad-hoc size steps collapse onto the type scale.

**Contract**: `panelVariants({ padding: "card" | "page" | "none", tone: "default" | "inset" | "info" | "primary", interactive?: boolean })`
(`interactive` adds the hover lift + primary border for clickable panels). `headingVariants({ level: "page" | "section" | "panel" | "label" })`.

#### 5. Advisor accent map

**File**: `src/lib/advisors/advisor-accent.ts` (new) + test

**Intent**: Map each persona id to its identity token class set (text/border/bg), with a neutral fallback for an unknown
id, so every advisor surface (card, summary, side thread) reads one source.

**Contract**: `advisorAccent(id: string): { text: string; border: string; bg: string }`; static class strings (Tailwind
must see them literally — no string interpolation of token names).

#### 6. Kitchen sink + dead code

**Files**: `src/pages/dev/kitchen-sink.astro` (new), delete `src/components/ui/LibBadge.astro`

**Intent**: Dev-only page (returns 404 when `!import.meta.env.DEV`) rendering every shared component, the type scale,
the palette swatches with names, and the Polish glyph line. Phase 9 extends it to the full 7-state matrix.

**Contract**: route `/dev/kitchen-sink`; no underscore in the path (lessons.md).

### Success Criteria:

#### Automated Verification:

- `npm run lint` and `npm run build` pass
- `npm test` passes, including the new `advisor-accent` test (known ids + fallback)
- Hardcoded-value scan on `src/components/ui/**` returns 0 hits
- `grep -rn "rounded-\|shadow-xs\|dark:" src/components/ui/` returns 0 hits
- `src/components/ui/LibBadge.astro` no longer exists
- Production build: `/dev/kitchen-sink` returns 404 (`npm run preview` + request)

#### Manual Verification:

- Kitchen sink at 1280px and 375px shows Button (all variants/sizes), Field (with error), Badge, Alert, Skeleton, Panel,
  headings and swatches in the new style
- Keyboard Tab through the sink: every button/control shows the token focus ring

**Implementation Note**: Pause for manual confirmation before proceeding.

---

## Phase 3: Shell (Layout, Topbar, Banner)

### Overview

Fix the frame every page shares: aligned container, a Topbar that works at 375px, and a tokenised Banner.

### Changes Required:

#### 1. Layout container + page widths

**File**: `src/layouts/Layout.astro`

**Intent**: Align the Topbar with page content (same max width + gutter as pages) and stop `min-h-screen` below the bar
from forcing scroll on every page. Define the page-width scale pages will use (`narrow` for forms/auth ≈ `max-w-xl`,
`default` ≈ `max-w-3xl`, `wide` ≈ `max-w-5xl`) — 3 widths instead of 5.

**Contract**: a shared container class recipe (cva or a small `Container.astro` in `src/components/layout/`) with
`width: narrow | default | wide`; pages adopt it in their view phase.

#### 2. Topbar

**File**: `src/components/Topbar.astro`

**Intent**: Add a logo/home link ("PANEL EKSPERTÓW" wordmark in the pixel font → `/`), mark the current page with
`aria-current="page"` + a visible token style (from `Astro.url.pathname`), let links wrap to a second row on mobile and
truncate the email. Links use the action colour; hover/focus feedback via `ring`/accent per the semantics table. No menu.

**Contract**: same links and signout form as today (`Topbar.astro:10-35`); structure becomes `flex-wrap`; no JS.

#### 3. Banner

**File**: `src/components/Banner.astro`

**Intent**: Replace the scoped hex `<style>` (`Banner.astro:15-41`) with the Alert recipe / status tokens (`error` →
destructive, `warning`, `info`), 2px border.

**Contract**: same `variant` prop and slot; no `<style>` block.

### Success Criteria:

#### Automated Verification:

- `npm run lint` and `npm run build` pass
- Hardcoded-value scan on `Layout.astro`, `Topbar.astro`, `Banner.astro` returns 0 hits

#### Manual Verification:

- At 375px the Topbar has no horizontal overflow with a long email (e.g. 40 chars); links wrap, email truncates
- At 1280px the Topbar edges align with page content on `/sessions`
- The active page link is visibly marked on `/sessions`, `/sessions/new`, `/dashboard`
- Banner (unset `SUPABASE_URL` locally) renders in the new style and is readable

**Implementation Note**: Pause for manual confirmation before proceeding.

---

## Phase 4: View — `/sessions/[id]` (core flow)

### Overview

Move the advisor panel onto the component layer, add per-advisor identity, the RUNDA 1 heading, the step indicator, and
skeletons; fix the round-1 announcement.

### Changes Required:

#### 1. Page

**File**: `src/pages/sessions/[id].astro`

**Intent**: Wide container, flat background (drop `bg-pixel-grid`), decision panel and not-found/error panel via
`panelVariants` + heading recipe, CTA via `buttonVariants`.

**Contract**: no change to data loading or props passed to `SessionFlow`.

#### 2. Step indicator

**Files**: `src/lib/session-flow.ts` (+ `session-flow.test.ts`), `src/components/advisor-panel/StepIndicator.tsx` (new),
`src/components/advisor-panel/SessionFlow.tsx`

**Intent**: Show "Runda 1 → Runda 2 → Synteza" above round one, highlighting the active step, marking done steps, and
marking Runda 2 as skipped when synthesis started without it. The mapping is a pure, string-free function in
`session-flow.ts`; Polish labels live in the component.

**Contract**: `deriveStepProgress(step: SessionStep, roundTwoStarted: boolean): Record<"roundOne" | "roundTwo" | "synthesis", "pending" | "active" | "done" | "failed" | "skipped">`.
Rendered as `<ol aria-label="Postęp sesji">` with `aria-current="step"` on the active item; state conveyed by text/glyph,
not colour alone. `SessionFlow` renders it once at the top; no change to its state.

#### 3. Round panels

**Files**: `src/components/advisor-panel/AdvisorPanel.tsx`, `RoundTwoPanel.tsx`, `RoundSummary.tsx`

**Intent**: Add the "RUNDA 1" section h2 matching "RUNDA 2" (`RoundTwoPanel.tsx:113`); headings, fold toggles and
summaries on the heading/button/panel recipes; advisor identity via `advisorAccent`; micro text via `text-pixel-micro`;
`motion-safe:animate-blink` now works.

**Contract**: fold behaviour and props unchanged.

#### 4. Advisor card

**File**: `src/components/advisor-panel/AdvisorCard.tsx`

**Intent**: Card on `panelVariants`, advisor name/marker in its identity accent, score in `info`/cyan with a larger
pixel size, buttons via `Button` (`secondary`/`sm`), tinted callout via Alert/panel tone; pending state shows Skeleton
lines (keep the blinking status label). Fix: with no `previousScore`, render no delta glyph and no " (bez zmian)" SR text
(`AdvisorCard.tsx:31-37,76-77`). Shared score glyph/delta helper extracted to `src/lib/` if `RoundSummary` needs the same
logic (`RoundSummary.tsx:25-33`).

**Contract**: props unchanged; delta rendered only when a previous score exists.

#### 5. Synthesis + side thread + action bar

**Files**: `src/components/advisor-panel/SynthesisPanel.tsx`, `SideThread.tsx`, `StepActionBar.tsx`

**Intent**: Synthesis sections on heading/panel recipes; risk badges via `Badge` status variants (removes the template-
string class and `RISK_WEIGHT_CLASS`); next-step callout via Alert/panel tone (not violet); pending state shows Skeleton
blocks; RetryButton via `Button`. SideThread: user/advisor bubbles on panel tones with advisor identity accent, 9px label
→ `text-pixel-micro`, textarea via `Textarea`/`Field`, error via Alert with the existing retry where one exists.
StepActionBar: delete the private `ActionButton` + PRIMARY/SECONDARY strings; use `Button`/`buttonVariants` (`asChild`
for href actions).

**Contract**: section order, `aria-live` regions and handlers unchanged.

### Success Criteria:

#### Automated Verification:

- `npm run lint`, `npm run build` and `npm test` pass (incl. new `deriveStepProgress` tests: each `SessionStep` kind,
  skipped round two, failed states)
- Hardcoded-value scan on `src/pages/sessions/[id].astro` and `src/components/advisor-panel/**` returns 0 hits
- `grep -rn "pixel-btn\|pixel-panel\|bg-pixel-grid" src/components/advisor-panel src/pages/sessions/[id].astro` returns 0

#### Manual Verification:

- Full session run (round 1 → round 2 → synthesis) at 1280px and 375px: step indicator advances, skeletons appear while
  waiting with no layout jump when text arrives, waiting labels blink
- Session that skips round two shows Runda 2 as skipped
- Each of the 4 advisors is distinguishable by accent + name; scores read as number + label
- Screen reader (or accessibility tree) on a round-1 card: no "(bez zmian)"
- Keyboard: every action (fold toggles, retry, side-thread send, action bar) shows the focus ring

**Implementation Note**: Pause for manual confirmation before proceeding.

---

## Phase 5: View — `/sessions/new`

### Overview

Move the decision form onto Field/Button/Alert.

### Changes Required:

#### 1. Page + form

**Files**: `src/pages/sessions/new.astro`, `src/components/decision-form/DecisionForm.tsx`

**Intent**: Narrow container, flat background, page panel + heading recipe. Fields via `Field` (labels in pixel label
size, `aria-invalid` + `aria-describedby` on every validated field, not just the decision field), the cyan "warning" at
`DecisionForm.tsx:101` via `warning` token/Alert, submit via `Button` default/lg with no className overrides
(`DecisionForm.tsx:113-118`); label text stays as-is, button keeps its text (casing comes from the variant).

**Contract**: form behaviour, validation and submission unchanged.

### Success Criteria:

#### Automated Verification:

- `npm run lint` and `npm run build` pass
- Hardcoded-value scan on `new.astro` and `src/components/decision-form/**` returns 0 hits

#### Manual Verification:

- 1280px + 375px: form readable, fields share the 2px border weight with the side thread textarea
- Submitting empty shows the error next to the field in `destructive` + text; Tab order and focus rings intact
- Submit disabled/pending state visible while the request runs

**Implementation Note**: Pause for manual confirmation before proceeding.

---

## Phase 6: View — `/sessions`

### Overview

Move session history onto Badge/Panel/Button with real empty and error states.

### Changes Required:

#### 1. Page + list

**Files**: `src/pages/sessions/index.astro`, `src/components/session-history/SessionList.astro`

**Intent**: Default container, flat background, heading recipe; each entry an interactive `panelVariants` panel; status
via `Badge` (delete `STATUS_CLASS`, `text-[0.6rem]`); empty state panel with message + `buttonVariants` CTA; load-error
state via Alert (replaces the muted panel at `sessions/index.astro:38`).

**Contract**: data loading and links unchanged.

### Success Criteria:

#### Automated Verification:

- `npm run lint` and `npm run build` pass
- Hardcoded-value scan on `sessions/index.astro` and `src/components/session-history/**` returns 0 hits

#### Manual Verification:

- 1280px + 375px with several sessions, with zero sessions (empty state), and with a forced load error
- Status badges readable by text alone; list items show hover + focus

**Implementation Note**: Pause for manual confirmation before proceeding.

---

## Phase 7: View — `/` (Welcome)

### Overview

Restyle the landing hero and sections in the new palette.

### Changes Required:

#### 1. Welcome

**Files**: `src/pages/index.astro`, `src/components/Welcome.astro`

**Intent**: Wide container (fix the double mobile gutter), flat background; hero h1 gradient stays on accents only
(primary → accent, now yellow → cyan); sprite colours re-pointed at the new tokens (inline `fill` via `var()` stays —
runtime per-pixel, allowed); score glyph bar uses the shared helper; CTAs via `buttonVariants`; section h3s at
`Welcome.astro:199` onto the heading recipe; `text-[0.65rem]` → `text-pixel-micro`; plain `animate-blink` →
`motion-safe:animate-blink`.

**Contract**: copy and links unchanged.

### Success Criteria:

#### Automated Verification:

- `npm run lint` and `npm run build` pass
- Hardcoded-value scan on `index.astro` and `Welcome.astro` returns 0 hits

#### Manual Verification:

- 1280px + 375px: hero, sprite and sections render crisp (sprite pixels not blurred), no horizontal scroll
- Logged-out and logged-in visits both show sensible CTAs

**Implementation Note**: Pause for manual confirmation before proceeding.

---

## Phase 8: Views — `/auth/*` and `/dashboard`

### Overview

Replace the starter "cosmic glass" theme with the pixel system, translate copy to Polish, and make the submit pending
state real.

### Changes Required:

#### 1. Auth + dashboard pages

**Files**: `src/pages/auth/signin.astro`, `signup.astro`, `confirm-email.astro`, `src/pages/dashboard.astro`

**Intent**: Narrow container, page panel + heading recipe; remove `bg-cosmic`, `rounded-2xl`, `backdrop-blur-xl`,
palette gradients and `text-purple-300` links (links via `buttonVariants({ variant: "link" })`). Translate all copy to
Polish (headings, helper text, links). Dashboard keeps its two buttons and links, via `buttonVariants`, in Polish.

**Contract**: routes, form actions, redirects and `?error=` handling unchanged (smoke asserts only these).

#### 2. Auth form components

**Files**: `src/components/auth/{FormField,SubmitButton,ServerError,PasswordToggle,SignInForm,SignUpForm}.tsx`

**Intent**: `FormField` becomes a thin use of `Field` + `Input` (keeps icon/endContent slots); `ServerError` → Alert
`error`; `PasswordToggle` → `Button` `ghost`/`icon` with an accessible Polish label; validation and placeholder copy in
Polish. Fix the pending state: the forms set a local `submitting` flag in `onSubmit` once validation passes (the native
POST still proceeds) and pass it to `SubmitButton`, which drops `useFormStatus`, disables itself and shows a pixel
loading indicator (no `rounded-full` spinner) with Polish pending text.

**Contract**: `SubmitButton({ pending, pendingText, icon, children })`; native `method="POST"` submission unchanged;
`submitting` resets if the page is restored from bfcache (`pageshow` with `persisted`), so Back doesn't leave a stuck
disabled button.

### Success Criteria:

#### Automated Verification:

- `npm run lint` and `npm run build` pass
- Hardcoded-value scan on `src/pages/auth/**`, `dashboard.astro`, `src/components/auth/**` returns 0 hits
- `grep -rn "bg-cosmic\|useFormStatus\|backdrop-blur" src/` returns 0 hits
- `npm run smoke` passes against a running server

#### Manual Verification:

- 1280px + 375px: signin, signup, confirm-email, dashboard look like the same product as `/sessions`; all copy Polish
- Wrong password shows the server error in the Alert; empty submit shows field errors with text
- Submitting shows the disabled pending button until navigation; browser Back restores an enabled button
- Password toggle reachable by keyboard with a visible focus ring and Polish accessible name

**Implementation Note**: Pause for manual confirmation before proceeding.

---

## Phase 9: States, visual gate, guard

### Overview

Prove the 7-state matrix, remove the legacy helpers, and leave the rule + check that keep the next agent on the contract.

### Changes Required:

#### 1. 7-state matrix in the kitchen sink

**File**: `src/pages/dev/kitchen-sink.astro`

**Intent**: For each shared component and the key view components (AdvisorCard, StepIndicator, SessionList item,
DecisionForm field, auth form), render default, hover, focus-visible, disabled, error, empty, loading side by side — or
mark a cell **N/A with a reason** (e.g. Badge has no hover/disabled). Hover/focus cells may be demonstrated with forced
state classes or a note to interact.

**Contract**: every cell shown or N/A-with-reason; no layout jump between loading and loaded variants.

#### 2. Remove legacy helpers

**File**: `src/styles/global.css`

**Intent**: Delete `.pixel-panel` and `.pixel-btn` once a grep shows no callers.

**Contract**: `grep -rn "pixel-panel\|pixel-btn" src/` returns 0 before deletion.

#### 3. Hardcoded-value check

**Files**: `scripts/ui-scan.mjs` (new, dependency-free), `package.json` (`lint:ui` script + lint-staged entry),
`.github/workflows/ci.yml`

**Intent**: Run the `/10x-ui` scan over `src/components/**` and `src/pages/**/*.astro` (excluding `src/styles/`) and exit
non-zero on any hit, with an allowlist for the `Welcome` sprite `var()` fills if the regex catches them. Wire it into
lint-staged for `src/{components,pages}/**/*.{tsx,astro}` and as a CI step next to lint.

**Contract**: `npm run lint:ui` → exit 0 on a clean tree, prints `file:line` on hits.

#### 4. Agent rules

**Files**: `.claude/rules/frontend.md`, `CLAUDE.md`, `.claude/rules/backend.md` (restore)

**Intent**: `frontend.md` §4–6, §8–9 were already rewritten to the target contract at planning time (2026-10-09) so
implementing agents follow it from Phase 1. Here, reconcile it with what shipped: replace the §5 "Baseline" palette
column with the final `palette.md` values, fix any component/variant name that changed during implementation, repoint the
`palette.md` path to its archive location if the change is archived, and delete the §4 "Migration note" (legacy helpers
are gone). In `CLAUDE.md`, replace the stale "untouched `10x-astro-starter` scaffold … no
panel features yet" line and add the kitchen sink + `lint:ui` to Commands; write outside any 10x-cli managed block.
Restore `.claude/rules/backend.md` from HEAD (`git restore --staged --worktree .claude/rules/backend.md`) so the
references in `CLAUDE.md` and `lessons.md` resolve.

**Contract**: `frontend.md` contains no `#b388ff`/`#00e5ff`/Press Start 2P references and no "Migration note"; every
component, variant and token it names exists in the code.

#### 5. Close out charges

**File**: `context/changes/ui-visual-refactor/research.md` (`## Charges`)

**Intent**: Mark C1–C5 as addressed (phase refs) and keep the declined items (text sizes/line length, pre-wrap/markdown,
decision-as-title) listed as deferred with the planning decision as reason.

### Success Criteria:

#### Automated Verification:

- `npm run lint`, `npm run lint:ui`, `npm run build`, `npm test` pass
- `grep -rn "pixel-panel\|pixel-btn\|bg-pixel-grid\|rounded-" src/` returns 0 hits
- `.claude/rules/backend.md` exists; `grep -n "b388ff\|Press Start\|Migration note" .claude/rules/frontend.md` returns 0

#### Manual Verification:

- Kitchen sink at 1280px and 375px: every 7-state cell shown or N/A with a reason
- Screenshots of all 8 routes at 1280px and 375px attached to the review (one visual system, no violet, Polish copy)
- Keyboard-only walk of `/sessions/new` → `/sessions/[id]` → `/sessions`: focus always visible
- `/10x-impl-review` run; UI findings triaged by user impact (fixed or deferred with reason)

**Implementation Note**: Pause for manual confirmation before closing the change.

---

## Testing Strategy

### Unit Tests:

- `advisorAccent`: each of the 4 persona ids returns its class set; unknown id returns the neutral fallback.
- `deriveStepProgress`: every `SessionStep` kind; round two skipped (synthesis started, round two never started);
  `round-one-failed` and `synthesis-failed` produce `failed` on the right step.
- Score delta helper (if extracted): no previous score → no delta; up/down/equal.

### Integration Tests:

- `npm run smoke` after Phase 8 (auth routes touched).

### Manual Testing Steps:

1. After each visual phase: screenshot that phase's routes at 1280px and 375px; run the scan on its files.
2. Full session run with a skipped round two and with round two; watch the step indicator and skeletons.
3. Keyboard-only pass of every route; confirm focus ring on every control.
4. Sign in with a wrong password, then correctly; sign up; press Back after submitting.
5. Under `prefers-reduced-motion: reduce`, confirm no blink/fade animations run.

## Performance Considerations

Font swap keeps two preloaded woff2 files (latin + latin-ext); adding the 700 weight adds files that load only when used
— preload only the 400 weights. No new JS beyond the step indicator (rendered inside the existing island) and the
`submitting` flag.

## Migration Notes

None — no data or route changes. Rollback is a revert of the change's commits; the token rename is additive (old roles
keep their names, only values change), so a partial revert of later phases still renders.

## References

- Research + charges: `context/changes/ui-visual-refactor/research.md`
- Scope decisions: `context/changes/ui-visual-refactor/change.md`
- `/10x-ui` contract and checklist: `.claude/skills/10x-ui/SKILL.md`, `.claude/skills/10x-ui/references/ui-quality-checklist.md`
- Token source: `src/styles/global.css:67-141`; button cva: `src/components/ui/button.tsx:7-33`
- Step state: `src/lib/session-flow.ts`, `src/components/advisor-panel/SessionFlow.tsx:140-199`
- S-07 hand-off of button unification: `context/changes/session-quality-polish/plan.md:42`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Tokens & fonts

#### Automated

- [x] 1.1 `npm run lint` passes — 20895e8
- [x] 1.2 `npm run build` passes — 20895e8
- [x] 1.3 Built CSS contains a `motion-safe\:animate-blink` rule and utilities `shadow-pixel`, `bg-success`, `text-pixel-micro` — 20895e8
- [x] 1.4 `grep -c "b388ff\|bg-pixel-grid" src/styles/global.css` returns 0 — 20895e8
- [x] 1.5 `context/changes/ui-visual-refactor/palette.md` exists with the contrast table — 20895e8

#### Manual

- [ ] 1.6 Polish glyphs (ą ć ę ł ń ó ś ź ż, upper and lower) render in Silkscreen
- [ ] 1.7 All text/accent pairs in `palette.md` meet WCAG AA on `background` and `card`
- [ ] 1.8 `/sessions/[id]` and `/` render in the new colours at 1280px with no violet surfaces left on token-driven elements
- [ ] 1.9 Waiting labels in the session view visibly blink (and stop under `prefers-reduced-motion: reduce`)

### Phase 2: Shared component layer + kitchen sink

#### Automated

- [x] 2.1 `npm run lint` and `npm run build` pass — 4e23d33
- [x] 2.2 `npm test` passes, including the new `advisor-accent` test (known ids + fallback) — 4e23d33
- [x] 2.3 Hardcoded-value scan on `src/components/ui/**` returns 0 hits — 4e23d33
- [x] 2.4 `grep -rn "rounded-\|shadow-xs\|dark:" src/components/ui/` returns 0 hits — 4e23d33
- [x] 2.5 `src/components/ui/LibBadge.astro` no longer exists — 4e23d33
- [x] 2.6 Production build: `/dev/kitchen-sink` returns 404 (`npm run preview` + request) — 4e23d33

#### Manual

- [ ] 2.7 Kitchen sink at 1280px and 375px shows Button (all variants/sizes), Field (with error), Badge, Alert, Skeleton, Panel, headings and swatches in the new style
- [ ] 2.8 Keyboard Tab through the sink: every button/control shows the token focus ring

### Phase 3: Shell (Layout, Topbar, Banner)

#### Automated

- [x] 3.1 `npm run lint` and `npm run build` pass — 0709eb6
- [x] 3.2 Hardcoded-value scan on `Layout.astro`, `Topbar.astro`, `Banner.astro` returns 0 hits — 0709eb6

#### Manual

- [ ] 3.3 At 375px the Topbar has no horizontal overflow with a long email (e.g. 40 chars); links wrap, email truncates
- [ ] 3.4 At 1280px the Topbar edges align with page content on `/sessions`
- [ ] 3.5 The active page link is visibly marked on `/sessions`, `/sessions/new`, `/dashboard`
- [ ] 3.6 Banner (unset `SUPABASE_URL` locally) renders in the new style and is readable

### Phase 4: View — `/sessions/[id]` (core flow)

#### Automated

- [x] 4.1 `npm run lint`, `npm run build` and `npm test` pass (incl. new `deriveStepProgress` tests: each `SessionStep` kind, skipped round two, failed states) — be75667
- [x] 4.2 Hardcoded-value scan on `src/pages/sessions/[id].astro` and `src/components/advisor-panel/**` returns 0 hits — be75667
- [x] 4.3 `grep -rn "pixel-btn\|pixel-panel\|bg-pixel-grid" src/components/advisor-panel src/pages/sessions/[id].astro` returns 0 — be75667

#### Manual

- [ ] 4.4 Full session run (round 1 → round 2 → synthesis) at 1280px and 375px: step indicator advances, skeletons appear while waiting with no layout jump when text arrives, waiting labels blink
- [ ] 4.5 Session that skips round two shows Runda 2 as skipped
- [ ] 4.6 Each of the 4 advisors is distinguishable by accent + name; scores read as number + label
- [ ] 4.7 Screen reader (or accessibility tree) on a round-1 card: no "(bez zmian)"
- [ ] 4.8 Keyboard: every action (fold toggles, retry, side-thread send, action bar) shows the focus ring

### Phase 5: View — `/sessions/new`

#### Automated

- [x] 5.1 `npm run lint` and `npm run build` pass — fcddc83
- [x] 5.2 Hardcoded-value scan on `new.astro` and `src/components/decision-form/**` returns 0 hits — fcddc83

#### Manual

- [ ] 5.3 1280px + 375px: form readable, fields share the 2px border weight with the side thread textarea
- [ ] 5.4 Submitting empty shows the error next to the field in `destructive` + text; Tab order and focus rings intact
- [ ] 5.5 Submit disabled/pending state visible while the request runs

### Phase 6: View — `/sessions`

#### Automated

- [x] 6.1 `npm run lint` and `npm run build` pass
- [x] 6.2 Hardcoded-value scan on `sessions/index.astro` and `src/components/session-history/**` returns 0 hits

#### Manual

- [ ] 6.3 1280px + 375px with several sessions, with zero sessions (empty state), and with a forced load error
- [ ] 6.4 Status badges readable by text alone; list items show hover + focus

### Phase 7: View — `/` (Welcome)

#### Automated

- [ ] 7.1 `npm run lint` and `npm run build` pass
- [ ] 7.2 Hardcoded-value scan on `index.astro` and `Welcome.astro` returns 0 hits

#### Manual

- [ ] 7.3 1280px + 375px: hero, sprite and sections render crisp (sprite pixels not blurred), no horizontal scroll
- [ ] 7.4 Logged-out and logged-in visits both show sensible CTAs

### Phase 8: Views — `/auth/*` and `/dashboard`

#### Automated

- [ ] 8.1 `npm run lint` and `npm run build` pass
- [ ] 8.2 Hardcoded-value scan on `src/pages/auth/**`, `dashboard.astro`, `src/components/auth/**` returns 0 hits
- [ ] 8.3 `grep -rn "bg-cosmic\|useFormStatus\|backdrop-blur" src/` returns 0 hits
- [ ] 8.4 `npm run smoke` passes against a running server

#### Manual

- [ ] 8.5 1280px + 375px: signin, signup, confirm-email, dashboard look like the same product as `/sessions`; all copy Polish
- [ ] 8.6 Wrong password shows the server error in the Alert; empty submit shows field errors with text
- [ ] 8.7 Submitting shows the disabled pending button until navigation; browser Back restores an enabled button
- [ ] 8.8 Password toggle reachable by keyboard with a visible focus ring and Polish accessible name

### Phase 9: States, visual gate, guard

#### Automated

- [ ] 9.1 `npm run lint`, `npm run lint:ui`, `npm run build`, `npm test` pass
- [ ] 9.2 `grep -rn "pixel-panel\|pixel-btn\|bg-pixel-grid\|rounded-" src/` returns 0 hits
- [ ] 9.3 `.claude/rules/backend.md` exists; `grep -n "b388ff\|Press Start\|Migration note" .claude/rules/frontend.md` returns 0

#### Manual

- [ ] 9.4 Kitchen sink at 1280px and 375px: every 7-state cell shown or N/A with a reason
- [ ] 9.5 Screenshots of all 8 routes at 1280px and 375px attached to the review (one visual system, no violet, Polish copy)
- [ ] 9.6 Keyboard-only walk of `/sessions/new` → `/sessions/[id]` → `/sessions`: focus always visible
- [ ] 9.7 `/10x-impl-review` run; UI findings triaged by user impact (fixed or deferred with reason)

---
date: 2026-10-09T15:17:30+02:00
researcher: lstepien (Claude Code, Opus 5.5)
git_commit: 2a024b2
branch: main
repository: panelekspertow
topic: "S-08 ui-visual-refactor — design-token gaps, duplicated UI patterns, and layout/hierarchy inconsistencies across the whole app"
tags: [research, codebase, design-tokens, global-css, shadcn, pixel-retro, advisor-panel, auth, fr-012]
status: complete
last_updated: 2026-10-09
last_updated_by: lstepien (Claude Code, Opus 5.5)
---

# Research: S-08 ui-visual-refactor

**Date**: 2026-10-09T15:17:30+02:00
**Researcher**: lstepien (Claude Code, Opus 5.5)
**Git Commit**: 2a024b2
**Branch**: main
**Repository**: panelekspertow

## Research Question

For roadmap slice S-08 / PRD FR-012 (`context/foundation/prd.md:122`, US-03 `prd.md:64-68`, roadmap `context/foundation/roadmap.md:204-216`) — "a purely visual refactor, without changing existing functionality". The user set the scope to the **whole app** and the goals to **design tokens, consistency, look & hierarchy** (dark mode / a11y was not selected as a goal):

1. Where does UI code bypass the design-token contract (`.claude/rules/frontend.md` §4–5, `src/styles/global.css`), and which tokens are missing?
2. Which UI patterns are duplicated or implemented inconsistently and should become shared components or `cva` variants?
3. How is each view laid out, and where are page structure, heading hierarchy, rhythm, long-text readability and responsiveness inconsistent?

**Method / limits.** Everything was read from the code: `src/components/**`, `src/layouts/Layout.astro`, and every non-API page under `src/pages/**`. Nothing was rendered. Visual judgments (overflow, cascade wins, seams) are marked *(inferred)*. Two claims were checked against the compiled CSS in `dist/client/_astro/Layout.BlxfCBxD.css`, which was built 2026-10-09 11:54, before HEAD 2a024b2 (12:12). No `global.css` change after that build was observed. WCAG contrast was not measured.

## Summary

The app has **two visual systems**:

- **Pixel-retro, on tokens.** Applied to `/`, `/sessions`, `/sessions/new` and `/sessions/[id]`. It is mostly token-clean, but recipes are copied by hand rather than shared.
- **The untouched starter "cosmic glass" theme.** Covers `/dashboard`, `/auth/signin`, `/auth/signup`, `/auth/confirm-email`, all of `src/components/auth/*` and `Banner.astro`. It uses raw palette colours, `rounded-2xl`, `backdrop-blur-xl`, a blue gradient h1, English copy, and an undefined `bg-cosmic` class.

On the pixel side the main problems are:

1. **Missing tokens.**
   - A pixel micro type size: 4 arbitrary sizes between 9 and 10.4px, used in 12 places.
   - A hard-shadow token.
   - Status colours (success, warning, info).
   - Tinted callout surfaces.
   - Panel padding and button size scales.
2. **No shared button.**
   - `ui/button.tsx` has no pixel variant.
   - The primary pixel-button class string is copied 7 times and the small secondary 4–5 times.
   - Raw `.pixel-btn` elements have no `focus-visible` ring.
3. **No shared Panel, Badge, Heading, ErrorMessage or Field.**
   - 6 error recipes and 3 input recipes.
   - 0 skeletons, against frontend.md §8.
4. **Hierarchy.**
   - About 9 heading size steps in two font families.
   - Round 1 has no section heading.
   - Core synthesis and side-thread content is set at 12px (`text-xs`).
   - The synthesis narrative has no line-length limit.
   - 5 different page widths.
   - The Topbar has no mobile handling.

Several rules in `frontend.md` §5 contradict the shipped helpers: the `.pixel-panel` violet border, `bg-pixel-grid` as a background gradient, and cyan hover on every action. The plan has to settle which side wins.

## Detailed Findings

### 1. Design-token contract

**Two visual systems** *(token audit and consistency audit agree)*
- Starter glass: `signin.astro:9-17`, `signup.astro:9-17`, `confirm-email.astro:22-29`, `dashboard.astro:8-16`, `auth/FormField.tsx:6,37,41,53,59`, `auth/SubmitButton.tsx:18,22`, `auth/ServerError.tsx:11`, `auth/PasswordToggle.tsx:13`, `auth/SignUpForm.tsx:59`.
- `bg-cosmic` is used on those 4 pages (`signin.astro:9`, `signup.astro:9`, `confirm-email.astro:22`, `dashboard.astro:8`). A grep of `src/` found no definition anywhere, so it is a dead class.
- `Banner.astro:15-41` uses a scoped `<style>` with 9 light-mode hex colours (`:28-40`) and a 1px border (`:20`). It renders on every page when config is missing (`Layout.astro:31`).

**Arbitrary values**
- Pixel micro text, 12 occurrences:
  - `text-[10px]` appears 9 times: `AdvisorCard.tsx:88,113,145`, `RoundSummary.tsx:41,55`, `SynthesisPanel.tsx:38,126`, `SideThread.tsx:57,84`. In 8 of them it is a pixel label.
  - `text-[9px]` at `SideThread.tsx:48`.
  - `text-[0.6rem]` at `SessionList.astro:47`.
  - `text-[0.65rem]` at `Welcome.astro:144`.
- shadcn focus ring:
  - `focus-visible:ring-[3px]` at `ui/button.tsx:8`, `ui/input.tsx:11`, `ui/textarea.tsx:9`.
  - `SideThread.tsx:78` uses `ring-2` instead.
- Inline style: `Welcome.astro:140` sets the sprite `fill` per pixel, but only to token `var()`s.

**`rounded-*`, blurred shadows and `dark:`**
- `rounded-*` appears 15 times. `global.css:104-107` zeroes only `--radius-sm` through `--radius-xl`, so 6 of them actually render rounded:
  - `rounded-2xl`, 4 times, on the auth and dashboard cards.
  - `rounded-full` at `LibBadge.astro:12` and on the spinner at `SubmitButton.tsx:22`.
- `shadow-xs` appears at `ui/button.tsx:12,14,16,17`, `ui/input.tsx:10` and `ui/textarea.tsx:9`. It is Tailwind's soft `0 1px 2px` shadow (`node_modules/tailwindcss/theme.css:407`).
- `dark:` variants: 11 in `ui/button.tsx`, `ui/input.tsx` and `ui/textarea.tsx`. They are live because `Layout.astro:17` sets `class="dark"`.
- Borders under 2px: 10 occurrences, including the shadcn Input and Textarea. That means the main `DecisionForm` fields are 1px while `SideThread.tsx:78` is 2px.

**Colour meaning** *(judgement where marked)*
- frontend.md §5 says "violet = interactive, cyan = informational". Against that rule:
  - Every action uses cyan on hover (`hover:bg-accent`, `hover:border-accent`, `hover:text-accent`) in about 20 places. Examples: `StepActionBar.tsx:17,19`, `Topbar.astro:10-33`, `DecisionForm.tsx:117`.
  - Violet is used on non-interactive content:
    - the "medium" risk badge, `SynthesisPanel.tsx:25`;
    - the next-step callout, `:139`;
    - the user bubble, `SideThread.tsx:44`;
    - the `.pixel-panel` border itself, `global.css:161`.
- Cyan as a warning: `DecisionForm.tsx:101`.
- Cyan used correctly: scores (`AdvisorCard.tsx:67,73`, `RoundSummary.tsx:44`) and headings.

**Typography**
- No pixel font on long text was found.
- Headings, labels and buttons that are missing `font-pixel`:
  - the h3s at `Welcome.astro:199`;
  - the auth and dashboard h1s;
  - the `DecisionForm` `<Label>`s, which use the shadcn default `text-sm font-medium` (`ui/label.tsx:10`);
  - `SubmitButton`.
- `DecisionForm.tsx:120` is the only mixed-case pixel button ("Zbierz panel").
- The pixel font is used at 13 different size classes. They cluster into 6 roles that no token names: micro label, button, card title, section heading, page heading and hero.

**Gradients**
- The only compliant one is the hero h1 at `Welcome.astro:124` (`from-primary to-accent`).
- 4 starter gradients use `from-blue-200 to-purple-200`.
- `bg-pixel-grid` (`global.css:143-147`) is a background gradient, which arguably breaks "never on backgrounds" *(inferred)*.

**Unused tokens**
- `chart-1`, `chart-2`, `chart-4`, `chart-5`. `chart-3` is used only via `var()` as a sprite colour (`Welcome.astro:9`).
- All 8 `sidebar-*` tokens.
- `popover*` and `card-foreground`.
- `bg-muted`.
- `--radius`: `@theme` hardcodes 0 per size, so nothing reads it.

**Missing tokens** (each backed by repeated literals)
1. **Pixel type scale**, at least a micro label size of about 10px. See the arbitrary sizes above.
2. **Hard shadow `--shadow-pixel`.** It is duplicated at `global.css:163` and `:171`, and there is no `shadow-*` utility for it.
3. **Status colours** success, warning and info, plus their foregrounds:
   - `Banner.astro:27-40`
   - `DecisionForm.tsx:101`
   - `SynthesisPanel.tsx:24-26`
   - `SessionList.astro:18`
   - `chart-4` (`#4de8b8`) is the theme's only green.
4. **Tinted callout surfaces.** `accent/10` and `primary/10` with matching borders, plus `/30`, `/40` and `/50` variants: `AdvisorCard.tsx:87,137`, `SynthesisPanel.tsx:103,139`, `SideThread.tsx:35,44,45,78`.
5. **Subtle placeholder text** `text-muted-foreground/70`, used 3 times: `AdvisorCard.tsx:101`, `SideThread.tsx:37`, `SynthesisPanel.tsx:150`.
6. **Panel padding scale.**
   - `p-4 sm:p-5` (card): 9 sites.
   - `p-6 sm:p-8` (page panel): 2 sites.
7. **Focus ring width.** 3px in shadcn, 2px in `SideThread`.

### 2. Duplicated and inconsistent patterns

**Buttons** — 15 `.pixel-btn` uses, 2 shadcn `<Button>` uses, 8 text links. No caller passes `variant` or `size`.
- **R1, primary large pixel button**, 7 copies: `StepActionBar.tsx:16-17`, `DecisionForm.tsx:117`, `Welcome.astro:161,172`, `SessionList.astro:28`, `dashboard.astro:20`, `[id].astro:72`.
- **R2, secondary large**, 3 different recipes: `StepActionBar.tsx:18-19`, `dashboard.astro:26`, `Welcome.astro:181`.
- **R3, secondary small `text-[10px]`**, 4 copies: `AdvisorCard.tsx:113,145`, `RoundSummary.tsx:55`, `SynthesisPanel.tsx:42` (which lacks `hover:text-accent-foreground`).
- **R4, primary small**: `SideThread.tsx:84`.
- **Starter text links** (`text-purple-300`): `signin.astro:17`, `signup.astro:17`, `confirm-email.astro:29`.
- **`ui/button.tsx:7-33` has no pixel variant.**
  - `DecisionForm.tsx:113-118` forces the pixel look onto `<Button>` through className.
  - In Tailwind 4 the base `shadow-xs` (utilities layer) should beat `.pixel-btn` (`@layer components`), and `h-9` clashes with `py-4` *(inferred, not rendered)*.
- **Focus rings.** None of the raw `.pixel-btn` elements has a `focus-visible` ring; only `<Button>` gets one. This is a partial a11y regression against frontend.md §6. A11y was not a selected goal, but a shared button would fix it for free.
- **Only local abstraction.** `ActionButton` at `StepActionBar.tsx:21-35` is the only button abstraction, and it is private to that file.
- S-07 explicitly deferred "migration to shadcn `Button`" to S-08 (`context/changes/session-quality-polish/plan.md:42`).

**Panels**
- `.pixel-panel` comes in 5 padding and width recipes:
  - P1 `p-4 sm:p-5`, 9 sites;
  - P2 `p-6 sm:p-8`, 2 sites;
  - P3, a centred message panel with `max-w-xl`, 4 sites: `SessionList.astro:24`, `[id].astro:67`, `sessions/index.astro:34,38`;
  - P4, an interactive panel: `SessionList.astro:39`, `Welcome.astro:131`;
  - P5, the Topbar bar.
- Callouts without the stepped shadow (`border-2 border-{accent,primary} bg-*/10`): `AdvisorCard.tsx:87`, `SynthesisPanel.tsx:103,139`.
- Inset and bubble surfaces: `SideThread.tsx:35,42-45`.

**Badges and labels**
- The bordered pixel tag is implemented twice, with different sizes and two separate colour maps:
  - `SessionList.astro:47`, with `STATUS_CLASS` at `:16-19`;
  - `SynthesisPanel.tsx:126`, with `RISK_WEIGHT_CLASS` at `:23-27`. This one builds its class with a template string instead of `cn()`.
- Score display is duplicated:
  - the glyph bar: `AdvisorCard.tsx:19-22` and `Welcome.astro:147-149`;
  - the delta/format logic: `AdvisorCard.tsx:31-37` and `RoundSummary.tsx:25-33`.
- `ui/LibBadge.astro` is imported nowhere (grep of `src/`). It is dead.

**Headings**
- Four recurring recipes:
  - page h1: `font-pixel text-lg sm:text-xl text-accent`, 4 sites;
  - section h2: `text-sm sm:text-base text-accent`, 4 sites, one of them on an h3 (`SynthesisPanel.tsx:104`);
  - panel title h3: `text-xs sm:text-sm`, 5 sites;
  - starter gradient h1, 4 sites.
- Off-system: `Welcome.astro:199`, a mono bold h3.

**Async states** (frontend.md §8)
- Skeletons: 0.
- Loading:
  - blinking text in 4 places;
  - 1 spinner, `SubmitButton.tsx:22`. That spinner is driven by `useFormStatus` (`SubmitButton.tsx:12`), but the auth forms submit natively with `method="POST" action="/api/…"` (`SignInForm.tsx:43`, `SignUpForm.tsx:66`). So its pending state is probably never true *(inferred from React semantics)*.
- Error: 6 recipes.
  - `text-destructive text-sm` ×5
  - `SideThread` `text-xs`, which says "you can try again" but has no retry button (`SideThread.tsx:61`)
  - `ServerError` red box
  - `FormField` red-300
  - muted panel (`sessions/index.astro:38`)
  - Banner hex
- **`motion-safe:animate-blink` is a no-op.**
  - It is used at `AdvisorCard.tsx:61`, `RoundTwoPanel.tsx:118`, `SynthesisPanel.tsx:68` and `SideThread.tsx:57`.
  - `.animate-blink` is a plain class inside `@media (prefers-reduced-motion: no-preference)` (`global.css:199-206`), not a Tailwind utility, so the `motion-safe:` variant generates nothing.
  - Verified: the compiled CSS contains `.animate-blink{` and `motion-safe\:hover\:-translate-y-1`, but no `motion-safe\:animate-blink` rule.
  - The waiting labels in the session view therefore never blink, while `Welcome`'s plain `animate-blink` does.

**Form fields** — 3 unrelated recipes:
- `auth/FormField.tsx`: a raw input with the starter style and English copy.
- `DecisionForm.tsx:75-98`: unmodified shadcn Input, Textarea and Label with a 1px border. `aria-invalid` is set only on the decision field (`:79`), and nothing uses `aria-describedby`.
- `SideThread.tsx:66-79`: a bespoke 2px textarea.

### 3. Layout and hierarchy, per view

| View | Wrapper | Max width | Top pad | Background | System |
|---|---|---|---|---|---|
| `/` | `p-4 sm:p-8` (`Welcome.astro:121`), plus `px-4` per section | `max-w-5xl` | `pt-16 sm:pt-24` | `bg-pixel-grid` | pixel |
| `/dashboard` | centred `min-h-screen p-4` (`dashboard.astro:8`) | none | centred | `bg-cosmic` (undefined) | starter |
| `/auth/*` (3) | centred `p-4` | `max-w-sm` | centred | `bg-cosmic` (undefined) | starter |
| `/sessions` | `p-4 sm:p-8` (`sessions/index.astro:29`) | `max-w-3xl` | `pt-12 sm:pt-16` | grid | pixel |
| `/sessions/new` | `p-4 sm:p-8` (`new.astro:7`) | `max-w-xl` | `pt-12 sm:pt-20` | grid | pixel |
| `/sessions/[id]` | `p-4 sm:p-8` (`[id].astro:64`) | `max-w-5xl` | `pt-12 sm:pt-16` | grid | pixel |

**Page shell**
- Every page goes through `Layout.astro`.
- The Topbar wrapper is full-width `p-4 pb-0 sm:p-8 sm:pb-0` (`Layout.astro:27`), so it does not align with the centred content at 1280px *(inferred)*.
- Each page puts `min-h-screen` below the Topbar, so every page scrolls *(inferred)*.
- The hero on `/` has a double mobile gutter.

**Heading hierarchy**
- About 9 size steps (0.65rem to 4xl) in two families: pixel, and mono bold.
- Round 1 has no h2: `AdvisorPanel.tsx:38`, `SessionFlow.tsx:203`. Card h3s therefore sit straight under the h1, while "RUNDA 2" and "SYNTEZA" do have h2s (`RoundTwoPanel.tsx:113`, `SynthesisPanel.tsx:175`).
- "OSIE SPORU" is an h3 at h2 size (`SynthesisPanel.tsx:104`).
- On `[id]` the h1 is the generic "TWOJA DECYZJA". The decision itself is a `text-sm` `<p>` (`[id].astro:80-81`).

**Rhythm.** `mb-*` and `mt-*` are mixed for section spacing. The only consistent value is the 8-unit section gap; inside cards the spacing is ad hoc.

**Long-text readability** — nothing uses markdown, `whitespace-pre-wrap`, `prose` or a max line length.
- Advisor prose is `text-sm text-muted-foreground` (`AdvisorCard.tsx:99`), but the thesis above it is bold foreground (`:85`), which inverts the emphasis.
- Arguments: `text-xs` (`:119`).
- `RoundSummary` truncates the thesis to one line (`RoundSummary.tsx:45`).
- Synthesis agreement points, dispute positions and risks are all `text-xs` (`SynthesisPanel.tsx:93,109,124`).
- The narrative is `text-sm` at the full `max-w-5xl` width, about 110+ mono characters per line at 1280px *(inferred)*. It also comes last, after the recommendation (`SynthesisPanel.tsx:90-152`).
- Side thread: `text-xs` content, a 9px pixel speaker label (`SideThread.tsx:36-51`) and a `max-h-48` scroll box.
- Whether LLM output contains newlines or markdown that is being collapsed was **not checked**.

**Responsive**
- Grids are mobile-first and fine: `AdvisorPanel.tsx:58`, `RoundTwoPanel.tsx:78`, `SessionList.astro:39`, `StepActionBar.tsx:39,45`.
- The likeliest break at 375px is the **Topbar** (`Topbar.astro:5-24`):
  - one non-wrapping `justify-between` row;
  - the email plus 4 links at `gap-4 text-sm`;
  - no mobile menu;
  - it will overflow or wrap with a long email *(inferred)*.

**Session view flow** (`SessionFlow.tsx:203-227`)
- Order: decision panel, round 1 grid (no heading), RUNDA 2, SYNTEZA, then the StepActionBar.
- Folding is the only signal that separates finished rounds from the current one (`:209,219`).
- The active section gets no emphasis and there is no step indicator. Status text appears only in the bottom bar (`StepActionBar.tsx:40`, `aria-live`).
- The key score number is `text-accent text-xs` (`AdvisorCard.tsx:73`).
- For a round 1 card with no `previousScore`, the screen reader announces " (bez zmian)" ("no change") (`AdvisorCard.tsx:76-77`), and `scoreDelta` returns "▬" (`:32-33`). That is misleading when there is no earlier round. It is a copy/a11y detail, not a visual one.

**Navigation**
- Topbar links are mono `text-sm`, with no active-page indicator and no logo or home link (`Topbar.astro:8-33`).
- `/dashboard` is still the starter page in English. Its two pixel buttons only duplicate Topbar links (`dashboard.astro:13-29`).
- A running session has no back link to the history list until it finishes (`SessionFlow.tsx:195-196`).

## Code References

- `src/styles/global.css:65-140` — tokens (`:root` + `@theme inline`); `:143-147` `bg-pixel-grid`; `:158-176` `.pixel-panel` / `.pixel-btn`; `:199-206` reduced-motion-gated animation classes
- `src/components/ui/button.tsx:7-33` — `buttonVariants` cva, no pixel variant, `rounded-md`/`shadow-xs`/`dark:`
- `src/components/advisor-panel/StepActionBar.tsx:16-35` — the only button abstraction (local `ActionButton`, PRIMARY/SECONDARY class strings)
- `src/components/advisor-panel/AdvisorCard.tsx:19-37,53-145` — score glyph/delta, card layout, R3 buttons, callout
- `src/components/advisor-panel/SynthesisPanel.tsx:23-27,38-42,67-175` — risk badge map, RetryButton, section order
- `src/components/advisor-panel/SideThread.tsx:35-84` — bubbles, 9px label, bespoke textarea
- `src/components/session-history/SessionList.astro:16-19,24-47` — status badge map, empty panel
- `src/components/Topbar.astro:5-35` — nav, no mobile handling
- `src/layouts/Layout.astro:17,27,31` — `dark` class, Topbar wrapper, Banner mount
- `src/pages/{dashboard,auth/signin,auth/signup,auth/confirm-email}.astro` — starter glass theme, `bg-cosmic`
- `src/components/auth/{FormField,SubmitButton,ServerError,PasswordToggle}.tsx` — starter-styled form parts
- `src/components/Banner.astro:15-41` — hex light-mode styles
- `src/components/ui/LibBadge.astro` — unused

## Architecture Insights

- The design-system contract is **half built**:
  - Tokens and fonts exist (`global.css`), and two helper classes exist (`.pixel-panel`, `.pixel-btn`).
  - The component layer the rules call for does not exist. frontend.md §4 says to use "Variants via `cva`" and "restyle shadcn through tokens and `cva`".
  - So each slice (S-01…S-07) re-typed class strings, and the drift grew by feature.
- `buttonVariants` is exported. Once it has a pixel variant, `.astro` files can use it as `class={buttonVariants(...)}`, which gives one button source for both React and Astro.
- `--radius*` is already 0 for sm–xl. Removing the 15 `rounded-*` classes therefore changes only the 6 that render (`2xl`, `full`), and the rest is rule hygiene.
- **Rules contradict the shipped helpers:**
  - frontend.md §5 "violet = interactive" vs the violet `.pixel-panel` border on static panels;
  - "gradients never on backgrounds" vs `bg-pixel-grid`;
  - "violet = action" vs cyan hover on every action.
  - The plan should decide whether to amend the rule or the code. /10x-ui asks to "leave a rule", so a rule edit is in scope for this kind of change.
- `CLAUDE.md` says "The codebase is currently the untouched `10x-astro-starter` scaffold … no panel features yet". This is **stale**: the panel features S-01…S-07 exist. The statement is literally true only for the auth and dashboard pages.

## Historical Context (from prior changes)

- `context/archive/2026-09-25-first-divergent-round/plan-brief.md:11`: "the full pixel-retro design system (tokens, fonts, `.pixel-panel`) already exist[ed]" before S-01. Every later slice built on it without adding a component layer. **Supported**: the code matches.
- `context/archive/2026-09-25-session-history/plan-brief.md:60` assumed `LibBadge.astro` could style the status badge, "else fall back to a token-styled `<span>`". **Supported**: the fallback was taken (`SessionList.astro:47`), and `LibBadge` is now dead.
- `context/changes/session-quality-polish/plan.md:42` and `plan-brief.md:44` say "no migration to shadcn `Button` (S-08)". The button unification was explicitly handed to this slice.
- `context/changes/session-quality-polish/frame.md:66` and `plan-brief.md:59` say "coordinate with S-08 (same `AdvisorCard`/`SynthesisPanel` visuals)". S-07 is complete (HEAD commits `1f277e5`, `2a024b2`), so its card and fold structure is the baseline to restyle, not to restructure.
- `context/foundation/roadmap.md:213-214`: the scope unknown ("which screens, which elements") is non-blocking, to be settled in `/10x-plan`. This research answers it with an inventory.

## Related Research

- `context/changes/session-quality-polish/research.md` — S-07, covers the `AdvisorCard`/`SynthesisPanel` density and end-of-session CTA that this slice will restyle.

## Charges

Input for `/10x-plan` (per /10x-ui). Scope is the whole app (user decision, see `change.md`). Every charge must map to a plan
phase or stay here marked **deferred** with a reason. Line numbers are as of `2a024b2`; re-verify before editing.

**C1 — Missing tokens: two visual systems (starter "cosmic glass" vs pixel-retro).**
- Evidence: `src/pages/auth/signin.astro:9-17`, `signup.astro:9-17`, `confirm-email.astro:22-29`, `dashboard.astro:8-16`
  (palette classes `from-blue-200 to-purple-200`, `text-purple-300`, `rounded-2xl`, `backdrop-blur-xl`, undefined `bg-cosmic`);
  `src/components/auth/FormField.tsx:6,37,41,53,59`, `SubmitButton.tsx:18,22`, `ServerError.tsx:11`;
  `src/components/Banner.astro:20,28-40` (9 hex literals, 1px border).
- Should be covered by: existing `global.css` roles (`background`, `card`, `primary`, `accent`, `destructive`, `border`) +
  `.pixel-panel`.
- User effect: signing in looks like a different product from the app behind it, and the page background silently renders
  nothing (`bg-cosmic` is defined nowhere).

**C2 — Missing tokens: the pixel layer has no names for what it repeats.**
- Evidence: micro type `text-[10px]` ×9 (`AdvisorCard.tsx:88,113,145`, `RoundSummary.tsx:41,55`, `SynthesisPanel.tsx:38,126`,
  `SideThread.tsx:57,84`), `text-[9px]` `SideThread.tsx:48`, `text-[0.6rem]` `SessionList.astro:47`, `text-[0.65rem]`
  `Welcome.astro:144`; hard shadow duplicated `global.css:163,171`; status colours improvised (`SynthesisPanel.tsx:24-26`,
  `SessionList.astro:18`, `DecisionForm.tsx:101`); tinted callouts `accent/10`, `primary/10` (+`/30`,`/40`,`/50`) at
  `AdvisorCard.tsx:87,137`, `SynthesisPanel.tsx:103,139`, `SideThread.tsx:35,44,45,78`.
- Should be covered by: new tokens in `global.css` — pixel type scale (≥ micro label), `--shadow-pixel`, status
  `success`/`warning`/`info` (+ foregrounds), callout surface(s), panel padding scale.
- User effect: labels jump between four tiny sizes and "warning"/"risk" colours mean different things on different screens,
  so the user can't learn the visual language.

**C3 — Missing shared component: Button.**
- Evidence: `src/components/ui/button.tsx:7-33` has no pixel variant; primary pixel-button recipe copied 7× (`StepActionBar.tsx:16-17`,
  `DecisionForm.tsx:117`, `Welcome.astro:161,172`, `SessionList.astro:28`, `dashboard.astro:20`, `[id].astro:72`), secondary
  3 recipes, small secondary 4×; `DecisionForm.tsx:113-118` forces the look onto `<Button>` via className (fights `h-9`,
  `shadow-xs`); `StepActionBar.tsx:21-35` private `ActionButton`.
- Fix: pixel `variant`/`size` in `buttonVariants` (usable from `.astro` as `class={buttonVariants(...)}`). S-07 handed this here
  (`context/changes/session-quality-polish/plan.md:42`).
- User effect: keyboard users get no visible focus on any raw `.pixel-btn` action (most of the app), and same-rank buttons
  differ in size and hover from screen to screen.

**C4 — Missing shared components: Panel, Badge, Heading, Field, ErrorMessage, Skeleton.**
- Evidence: `.pixel-panel` in 5 padding/width recipes; bordered tag implemented twice with two colour maps
  (`SessionList.astro:16-19,47`, `SynthesisPanel.tsx:23-27,126`, the latter via template string); 4 heading recipes + off-system
  `Welcome.astro:199`; 3 unrelated field recipes (`auth/FormField.tsx`, `DecisionForm.tsx:75-98` 1px shadcn, `SideThread.tsx:66-79`
  2px bespoke); 6 error recipes; 0 skeletons; dead `ui/LibBadge.astro`.
- Fix: `cva` variants on shadcn primitives (`npx shadcn@latest add badge skeleton` etc.) + small local wrappers where needed.
- User effect: an error looks different on every screen (sometimes just grey text), and form fields change border weight
  between the new-decision form and the side thread.

**C5 — Accidental architecture: shell, entry points and dead states.**
- Evidence: `/dashboard` is still the starter page in English and only duplicates Topbar links (`dashboard.astro:13-29`);
  Topbar is one non-wrapping row with email + 4 links and no mobile handling, no home link, no active state
  (`Topbar.astro:5-35`), and its wrapper doesn't align with page content (`Layout.astro:27`); `motion-safe:animate-blink` is a
  no-op (`AdvisorCard.tsx:61`, `RoundTwoPanel.tsx:118`, `SynthesisPanel.tsx:68`, `SideThread.tsx:57` vs `global.css:199-206`);
  auth spinner driven by `useFormStatus` never fires on native form POST (`SubmitButton.tsx:12,22`).
- User effect: after login the user lands on a redundant English page; at 375px the top bar overflows; while advisors are
  thinking the "waiting" label is static and the sign-in button gives no feedback, so the app looks frozen.

**Layout / hierarchy (judge after C1–C4 land, in the review loop — not a charge yet):** Round 1 has no h2
(`AdvisorPanel.tsx:38`); synthesis core content at `text-xs` (`SynthesisPanel.tsx:93,109,124`); narrative has no max line
length; inverted emphasis thesis vs prose (`AdvisorCard.tsx:85,99`); 5 page widths; no active-step indicator.

**Deferred**
- " (bez zmian)" announced for round-1 cards (`AdvisorCard.tsx:76-77`) — copy/a11y, not visual; separate fix.
- Markdown / newline rendering of LLM output — needs a check of real output first; not decidable from code.
- Translating auth/dashboard copy to Polish and deciding what `/dashboard` is for — content/product change, FR-012 says
  "no functional change"; plan must decide in or out explicitly.

## Open Questions

These are product and design choices for `/10x-plan`. None is a missing fact.

1. **Auth and dashboard in scope?**
   - PRD US-03 names "the new-decision form, the advisor panel, session history", while the user chose "whole app".
   - Reskinning `/auth/*` to pixel style is visual.
   - Translating English copy to Polish, and deciding what `/dashboard` is for (it is redundant with the Topbar), border on functional or content changes. FR-012 says "without changing functionality".
2. **Rule vs code conflicts.** Amend frontend.md §5 or change the code?
   - violet panel borders;
   - `bg-pixel-grid`;
   - cyan hover on actions.
3. **Long-text rendering.**
   - Should advisor and synthesis text preserve newlines (`whitespace-pre-wrap`) or render markdown? This needs a check of actual LLM output first.
   - Whether to raise core synthesis content from `text-xs`.
4. **Session view emphasis.** Add a Round 1 heading and an active-step indicator. This is purely visual; it was not decided in S-07.
5. **Topbar on mobile.** Wrap, compress, or use a menu? A menu adds interaction, which is arguably beyond a visual refactor.
6. **Incidental fixes noticed** (bugs, not refactor). Include them, or split them into a separate change?
   - The no-op `motion-safe:animate-blink`.
   - The dead `useFormStatus` spinner.
   - Missing `focus-visible` on `.pixel-btn`.
   - The round 1 " (bez zmian)" announcement.
7. **Skeletons** (frontend.md §8). Add them in this visual slice, or leave the blinking text?

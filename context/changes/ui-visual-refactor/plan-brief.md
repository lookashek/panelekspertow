# S-08 UI Visual Refactor — Plan Brief

> Full plan: `context/changes/ui-visual-refactor/plan.md`
> Research: `context/changes/ui-visual-refactor/research.md`

## What & Why

A full reskin of the whole app (FR-012, US-03) to a "neon arcade on graphite" look: still retro, but more modern
and more colourful, with the violet palette gone. The research found two visual systems (pixel-retro vs the untouched
starter "cosmic glass" on auth/dashboard) and no component layer, so every slice re-typed class strings and the UI
drifted. This change fixes the contract first (tokens, then components), then moves each view onto it.

## Starting Point

`src/styles/global.css` holds a violet/cyan token set; shadcn lives in `src/components/ui/`, but `buttonVariants` has
no pixel variant. Raw `.pixel-btn`/`.pixel-panel` recipes are copied across views, and auth/dashboard still use the
English starter glass theme. There are 0 skeletons, the blink animation is a no-op, and the Topbar breaks at 375px.

## Desired End State

All 8 routes look like one product, in Polish, built only from tokens and `src/components/ui/` components. Yellow
means action, cyan means info and scores, structure is neutral graphite, status uses dedicated tokens, and each advisor
has its own accent. The session view has a "RUNDA 1" heading and a Runda 1 → Runda 2 → Synteza step indicator. A
dev-only kitchen sink shows the 7-state matrix, `frontend.md` describes the new contract, and `npm run lint:ui` blocks
literal colours in views.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Scope | Whole app, global layer first, then one view per gated phase | User wanted everything; gates contain the risk | Research (change.md) |
| Contract | Same token names, shadcn and cva; new values | Extend the existing system, don't fork it | Research + Plan |
| Palette | Graphite base; yellow action, cyan info, lime/orange/red status, 4 advisor accents | User: "no violet, retro but modern and colourful" | Plan |
| Pixel font | Silkscreen replaces Press Start 2P (vendored woff2) | Lighter and more modern, legible at label sizes | Plan |
| Rule vs code (§5) | Rule semantics win: no violet on static panels, no gradient background, action colour only on actions | User chose code-to-rule | Plan |
| Auth & dashboard | Full pixel reskin and Polish copy; `/dashboard` keeps its role | Remove the "different product" seam without changing behaviour | Plan |
| Incidental fixes | Blink no-op, focus ring on pixel buttons, auth pending spinner, round-1 "(bez zmian)" | All four pulled in by the user | Plan |
| Loading state | shadcn Skeleton in pending advisor cards and synthesis, blink label kept | Satisfies frontend.md §8, no layout jump | Plan |
| Session hierarchy | Round-1 h2 and a step indicator only | Text size, line length, pre-wrap and decision-as-title declined | Plan |
| Topbar mobile | Logo/home link, active state, wraps at 375px, no menu | Stays purely visual, no new interaction | Plan |
| Visual gate | Dev-only `/dev/kitchen-sink` and manual screenshots; no Playwright | No new dependency; no `_` in the path (lessons.md) | Research + Plan |
| Guard | `scripts/ui-scan.mjs` as `npm run lint:ui`, run by lint-staged and CI; restore backend.md | /10x-ui "make it stick"; repo already has lint hooks | Plan |
| Agent rule timing | `frontend.md` rewritten to the target contract **now** (at planning); Phase 9 only reconciles it with final values | Implementing agents follow the new contract from Phase 1 | Plan (user) |

## Scope

**In scope:** token values and new roles, Silkscreen, pixel Button/Field/Badge/Alert/Skeleton/Panel/heading, advisor
accent map, Layout/Topbar/Banner, all 8 routes, the step indicator, the 4 incidental fixes, the kitchen sink, the
`lint:ui` scan, and the frontend.md/CLAUDE.md updates.

**Out of scope:** routes, API, data or `SessionFlow` state; retiring `/dashboard`; a mobile menu; a light theme; larger
text sizes and line-length caps; markdown/pre-wrap rendering; decision-as-h1; new dependencies or Playwright.

## Architecture / Approach

Tokens (`global.css` `:root` → `@theme inline`) → cva components in `src/components/ui/`, used from React directly and
from Astro via `class={buttonVariants(...)}` / `panelVariants(...)` → views. Phase 1 alone re-colours every token view;
the view phases then remove literals and duplicates. The scan count must only go down from phase to phase.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Tokens & fonts | New palette and roles, Silkscreen, blink fix, `palette.md` | Silkscreen missing Polish glyphs (stop and ask) |
| 2. Component layer + sink | Pixel Button/Field/Badge/Alert/Skeleton/Panel, advisor map, kitchen sink | shadcn base classes fighting the pixel look |
| 3. Shell | Aligned container, 3 page widths, mobile Topbar, tokenised Banner | Topbar overflow with long emails |
| 4. `/sessions/[id]` | Core flow on components, step indicator, skeletons, advisor accents | Largest surface; streaming states |
| 5. `/sessions/new` | DecisionForm on Field/Button/Alert | Button className overrides |
| 6. `/sessions` | Badge/Panel list, empty and error states | — |
| 7. `/` | Welcome restyle | Sprite crispness |
| 8. Auth + dashboard | Pixel reskin, Polish copy, real pending state | Stuck disabled button after Back (bfcache) |
| 9. States, gate, guard | 7-state matrix, legacy helpers removed, `lint:ui`, rules | Matrix cells skipped as "cosmetic" |

**Prerequisites:** S-07 complete (it is); a running dev server with Supabase for the session and auth checks.
**Estimated effort:** ~5–7 sessions across 9 phases (phases 5–7 are small).

## Open Risks & Assumptions

- Silkscreen latin-ext has to cover ą ć ę ł ń ó ś ź ż. If it doesn't, implementation stops for a user decision.
- The accent colours may need small tweaks to reach WCAG AA on `card`. The final values will be recorded in `palette.md`.
- The full reskin will change every screenshot. That's intended; each phase's screenshots are the review evidence.

## Success Criteria (Summary)

- A user moving from sign-in through a full session to history sees one consistent, colourful retro product, in Polish.
- Every control shows a visible focus ring, and loading, error and empty states are real in every view.
- `npm run lint:ui` reports 0 literals in views, and the next agent finds the contract in frontend.md.

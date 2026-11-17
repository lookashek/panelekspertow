---
change_id: ui-pixel-refresh
title: Lighten and richen the pixel-art arcade theme, starting with the session detail view
status: implementing
created: 2026-11-17
updated: 2026-11-17
archived_at: null
---

## Notes

Visual-only refresh of the "neon arcade on graphite" design system. Scope for THIS change:
global tokens (`src/styles/global.css`) + the single view `/sessions/[id]` (advisor panel /
round 1 / round 2 / synthesis — the core flow, richest in charges). Other views (`/`,
`/sessions`, `/auth/*`, `/dashboard`) are deliberately deferred to follow-on changes once this
one lands the token contract and new shared components.

Confirmed direction (user sign-off, see full plan at
`C:\Users\lstepien\.claude\plans\mamy-plugin-do-robienia-async-hickey.md`):
- Lighter, less saturated/neon surfaces and accents — still dark "arcade cabinet", not light mode.
- Fix the accidental color collision: `advisor-2` == `success` and `advisor-3` == `warning`
  today (both literally identical hex) — give all 4 advisors unique hues distinct from status colors.
- Swap pixel font Silkscreen → Pixelify Sans (OFL, self-hosted, same vendoring pattern). Keep
  JetBrains Mono for body text.
- Keep `--radius: 0` (sharp corners) and the hard pixel-shadow convention (`--shadow-pixel`)
  unchanged — design new work around this geometry, don't soften it.
- Add pixel-art advisor avatars (AdvisorCard), one signature "fun" animation moment at round
  score reveal (`score-pop`), and one signature moment + simple one-pose mascot at synthesis
  completion (`synthesis-complete`) — no mascot elsewhere yet, no decorative background
  ornaments in this change (those are for the other-views follow-ons touching `/` etc.).
- All new graphics are hand-authored inline SVG "pixel-grid" sprites (same technique already
  prototyped in `Welcome.astro`'s placeholder avatars) — zero new runtime dependencies.
- Every value change lands as a named role token in `global.css` (no literals in components),
  `npm run lint:ui` must stay clean, `/dev/kitchen-sink` 7-state matrix updated for every new/
  touched shared component.

Audit charges from `/10x-ui` pre-audit (hardcoded-value scan on this view: 0 hits — already
fully token-driven, so charges are value-level, not literal-in-view):
1. Token values too dark/saturated (`global.css` surfaces + accents).
2. Color collision: advisor-2/3 identical to success/warning (`global.css`).
3. Missing shared component: no advisor avatar (`AdvisorCard.tsx`).
4. Missing shared component: no signature treatment on synthesis completion (`SynthesisPanel.tsx`).
5. Font: Silkscreen → Pixelify Sans, must close the inherited-but-never-closed Polish
   diacritics check from the prior `ui-visual-refactor` change.

Precedent: `context/changes/ui-visual-refactor/` (archived) — the change that created the
current "neon arcade on graphite" system; same `palette.md` shape, same phased plan shape to
reuse here.

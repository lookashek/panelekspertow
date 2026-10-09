---
change_id: ui-visual-refactor
title: Ui visual refactor
status: implemented
created: 2026-10-09
updated: 2026-10-09
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

### /10x-ui scope (2026-10-09)

- **Views: all of them, in one change** — user decision, deliberately overriding /10x-ui's "one view per change" default.
  Mitigation: the plan runs **global layer first** (tokens → shared components), then **one view per phase**, each phase
  gated by desktop + 375px screenshots and the hardcoded-value scan on that view's files. Order (core flow first):
  `/sessions/[id]` → `/sessions/new` → `/sessions` → `/` → `/auth/*` + `/dashboard` + `Banner`.
- **Contract variant: existing design system — extend, don't fork.**
  - Values: `src/styles/global.css` — `:root` holds the pixel-retro palette, `@theme inline` publishes it. Single dark theme
    (`Layout.astro` sets `class="dark"` permanently).
  - Components: `src/components/ui/` (shadcn "new-york", `components.json`); add missing ones with `npx shadcn@latest add <name>`.
    No second `shadcn init`, no second palette.
  - Helpers today: `.pixel-panel`, `.pixel-btn`, `bg-pixel-grid` in `global.css` — to be absorbed into `cva` variants.
- **Agent rules:** `.claude/rules/frontend.md` + `shared.md` restored (`backend.md` still deleted). They are updated **after**
  the UI is settled — the "Make it stick" step rewrites `frontend.md` §4–5/§8 to match the shipped contract (and resolves the
  rule-vs-code conflicts listed in research.md). `CLAUDE.md` still lists `backend.md` — fix or restore it.
- **Kitchen sink:** a dev-only page under `src/pages/` — no leading underscore (see lessons.md, Astro private folders).

### /10x-plan update (2026-10-09)

- **Contract refined: same token names/shadcn/cva, new values.** User rejected the violet palette — total reskin to
  "neon arcade on graphite" (yellow action, cyan info, status + 4 advisor accents), Silkscreen replaces Press Start 2P.
  `frontend.md` §5 semantics win over the shipped code; its palette hex values are rewritten in the final phase.
  Details + all decisions: `plan-brief.md`.
- **Agent rule updated at planning time** (user request, supersedes "after the UI is settled" above): `frontend.md`
  §4–6, §8–9 now describe the target contract; Phase 9 only reconciles final values and drops the migration note.

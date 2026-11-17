# Plan Brief: ui-pixel-refresh

Full plan: `context/changes/ui-pixel-refresh/plan.md` · Research: `context/changes/ui-pixel-refresh/research.md`

## What this is

Visual-only refresh of the "neon arcade on graphite" theme → a lighter, less-neon pixel-art
arcade look. Scope: global tokens (`src/styles/global.css`) + one view, `/sessions/[id]` (the
advisor panel / round 1 / round 2 / synthesis flow). Other views are deliberately deferred to
follow-on changes. No logic, API, or data changes anywhere.

## Starting Point

The current system ("neon arcade on graphite") is itself the product of a prior change
(`context/changes/ui-visual-refactor/`, archived) — a mature, fully token-driven system, not
legacy drift. `/sessions/[id]` already scores 0 hits on the hardcoded-value scanner, so this
change is about re-valuing tokens and adding new shared graphics/animation, not cleaning up
literals. One real pre-existing bug found during research: `advisor-2`/`advisor-3` are today
byte-identical to `success`/`warning` — an unintended color collision this change fixes.

## Key Decisions

| Decision | Choice | Why |
|---|---|---|
| Palette direction | Lighten background/card/foreground, desaturate every accent; keep dark "arcade cabinet" (no light mode) | User rejected current palette as "too dark/neon"; still wants retro arcade, not SaaS |
| Advisor/status collision | Give advisor-2 (sky blue) and advisor-3 (mustard-gold) new hues distinct from success/warning | Pre-existing accidental collision found in research; violates "advisor color ≠ status signal" |
| Pixel font | Silkscreen → Pixelify Sans (OFL, self-hosted, same vendoring pattern) | User wants "nicer," more legible pixel-art letterforms; closes a diacritics check left open since the prior change |
| Sharp corners / hard shadows | Unchanged (`--radius: 0`, `--shadow-pixel`) | Explicit user sign-off — core identity, design new work around this geometry |
| New graphics | 100% hand-authored inline SVG pixel-grid sprites, zero new dependencies | `Welcome.astro` already prototypes this exact technique; confirmed scanner-safe |
| Mascot scope | One simple sprite, one pose, one appearance (synthesis completion only) | User confirmed "simple start" — no topbar/persistent presence yet |
| Signature animations | `score-pop` (round score reveal) + `synthesis-complete` (final recommendation panel) | The two moments user called out as worth a "fun" accent; everything else stays at current subtle level |
| Sprite scaling | Vector SVG sized via Tailwind classes, not integer-pixel raster multiples | No raster pixelation risk for vector rects; explicit decision, not an oversight |

## Starting Point → Target

| Area | Today | After this change |
|---|---|---|
| Background/card | `#12141c` / `#1b1e2a` (very dark) | `#1f2230` / `#2a2e40` (lighter graphite) |
| Accents | Highly saturated neon (`#ffcc33`, `#33d6ff`, …) | Desaturated arcade tones (`#f2b84f`, `#5cc9e0`, …) |
| Advisor colors | 2 of 4 collide with status colors | 4 unique hues, no collision |
| Pixel font | Silkscreen | Pixelify Sans |
| Advisor identity | Accent-colored name text only | + pixel-art avatar per persona |
| Round score reveal | Plain fade-in | Fade-in + `score-pop` |
| Synthesis completion | Same fade-in as every other panel | One-shot `synthesis-complete` pop + mascot |

## Implementation Phases

1. **Tokens, font, and new keyframes** — re-value `global.css`, vendor Pixelify Sans, add
   `score-pop`/`synthesis-complete` keyframes.
2. **Shared pixel-sprite primitive + advisor sprite data** — extract `Welcome.astro`'s prototype
   into `ui/pixel-sprite.tsx` + `lib/advisors/advisor-sprites.ts`; add `ui/mascot.tsx`.
3. **AdvisorCard avatar + score-pop reveal** — wire avatars into `AdvisorCard`/`RoundSummary`,
   animate the score glyph, fix a pre-existing missing `motion-safe:` guard.
4. **Synthesis completion moment + mascot** — one-shot animation + mascot on the
   recommended-next-step panel, fix the same pre-existing `motion-safe:` gap in this file.
5. **States, visual gate, and guard** — update kitchen-sink, reconcile `frontend.md`, write
   `palette.md`, re-run the scanner, full manual flow check.

**Prerequisites:** none (no new dependencies, no schema/migration). **Estimated effort:**
5 phases, each independently shippable/revertable; roughly a half-day to a day of focused work
given the scope is one view + global tokens.

## References

- `context/changes/ui-pixel-refresh/research.md` — exact file:line anchors for every edit above.
- `context/changes/ui-visual-refactor/` (archived) — precedent change, same phase shape, same
  `palette.md` format.
- `.claude/rules/frontend.md` §4-6 — the non-negotiable contract this plan stays inside.

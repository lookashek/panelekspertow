# Palette — "lighter pixel-art arcade" (ui-pixel-refresh)

Final token values shipped in `src/styles/global.css` (Phase 1). Supersedes
`context/changes/ui-visual-refactor/palette.md` as the source of truth for
`.claude/rules/frontend.md` §5 once Phase 5 reconciles it.

## Font source

Pixelify Sans, self-hosted (vendored, no npm dependency): fetched from
`@fontsource/pixelify-sans@5.3.0` via jsDelivr
(`https://cdn.jsdelivr.net/npm/@fontsource/pixelify-sans@5.3.0/files/pixelify-sans-<subset>-<weight>-normal.woff2`),
licensed OFL (SIL Open Font License). Weights vendored: 400, 700; subsets: latin, latin-ext.
Files: `src/assets/fonts/pixelify-sans-{latin,latin-ext}-{400,700}.woff2`. Replaces Silkscreen
(removed, `.woff2` files deleted). Same `unicode-range` values as the prior Silkscreen blocks —
already cover the Latin/Latin-ext Unicode ranges Polish diacritics (ą ć ę ł ń ó ś ź ż) need.
**Polish diacritics check: closed** — confirmed rendering correctly on the kitchen sink's
"Polish glyph check" paragraph in Pixelify Sans (Phase 5).

## Token values

| Role | Token(s) | Value | Changed from |
|---|---|---|---|
| Background | `background` | `#1f2230` | `#12141c` |
| Card / popover | `card`, `popover` | `#2a2e40` | `#1b1e2a` |
| Structure | `secondary`, `muted` | `#363b52` | `#252a3a` |
| Text | `foreground` | `#f3f1e8` | `#eef0f6` |
| Muted text | `muted-foreground` | `#aab0c9` | `#9aa3b8` |
| Action | `primary` | `#f2b84f` (foreground `#12141c`) | `#ffcc33` |
| Info / scores / ring | `accent`, `info`, `ring` | `#5cc9e0` (foreground `#12141c`) | `#33d6ff` |
| Success | `success` | `#7fd99a` (foreground `#12141c`) | `#5cf28a` |
| Warning | `warning` | `#e8a05a` (foreground `#12141c`) | `#ff9f43` |
| Destructive | `destructive` | `#ef7a90` (foreground `#12141c`) | `#ff4f6d` |
| Border / input | `border`, `input` | `color-mix(in srgb, foreground 18-22%, transparent)` | unchanged formula, new base |
| Advisor 1 (pink/rose) | `advisor-1` | `#e37aa8` (foreground `#12141c`) | `#ff5fa2` |
| Advisor 2 (sky blue) | `advisor-2` | `#6fb8e8` (foreground `#12141c`) | `#5cf28a` (was == `success`) |
| Advisor 3 (mustard-gold) | `advisor-3` | `#c9a227` (foreground `#12141c`) | `#ff9f43` (was == `warning`) |
| Advisor 4 (lilac) | `advisor-4` | `#a894da` (foreground `#12141c`) | `#a78bfa` |

**Collision fix:** `advisor-2` and `advisor-3` no longer match `success`/`warning` — all 4 advisor
hues are now distinct from each other and from every status color.

New keyframes: `score-pop` (round score reveal, scale-up pop) and `synthesis-complete` (one-shot
pixel-shadow "pop" on the recommended-next-step panel), registered as
`--animate-score-pop` / `--animate-synthesis-complete`, both consumed only via
`motion-safe:animate-*`. `--radius*` and `--shadow-pixel*` tokens are unchanged (user-confirmed:
sharp corners and hard pixel shadows stay).

## Contrast table (WCAG AA, target ≥ 4.5:1 for text, ≥ 3:1 for large/bold text)

| Pair | On `background` (#1f2230) | On `card` (#2a2e40) |
|---|---|---|
| `foreground` #f3f1e8 | 13.96:1 ✅ | 11.87:1 ✅ |
| `muted-foreground` #aab0c9 | 7.34:1 ✅ | 6.25:1 ✅ |
| `primary` #f2b84f | 8.83:1 ✅ | 7.51:1 ✅ |
| `accent`/`info` #5cc9e0 | 8.19:1 ✅ | 6.96:1 ✅ |
| `success` #7fd99a | 9.25:1 ✅ | 7.86:1 ✅ |
| `warning` #e8a05a | 7.22:1 ✅ | 6.15:1 ✅ |
| `destructive` #ef7a90 | 4.89:1 ✅ | 4.16:1 → **revised to 5.91:1 / 5.03:1** ✅ |
| `advisor-1` #e37aa8 | 5.73:1 ✅ | 4.87:1 ✅ |
| `advisor-2` #6fb8e8 | 7.29:1 ✅ | 6.20:1 ✅ |
| `advisor-3` #c9a227 | 6.53:1 ✅ | 5.55:1 ✅ |
| `advisor-4` #a894da | 5.29:1 → **revised to 5.95:1 / 5.06:1** ✅ | |
| `*-foreground` #12141c on their own token | all ≥ 6.1:1 ✅ (dark text on bright accent backgrounds) |

Two tokens (`destructive`, `advisor-4`) were nudged lighter after the first pass computed
`destructive` at 4.16:1 and `advisor-4` at 4.50:1 on `card` — both under/at the 4.5:1 AA floor for
normal text. Final shipped values: `destructive: #ef7a90` (was `#e8637a`), `advisor-4: #a894da`
(was `#9b8bd4`); `chart-5` updated to match the revised `destructive` value. All pairs above now
clear 4.5:1 on both surfaces. Ratios computed from the relative-luminance formula (WCAG 2.x)
against the two surface colours; verified by script, not estimated by eye.

## Open item (closed)

Polish glyph rendering in Pixelify Sans — confirmed in Phase 5 kitchen-sink manual check. This
closes the open item inherited from `ui-visual-refactor/palette.md`, which deferred the same
check for Silkscreen and never closed it.

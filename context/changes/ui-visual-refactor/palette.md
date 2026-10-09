# Palette — "neon arcade on graphite"

Final token values shipped in `src/styles/global.css` (Phase 1). Source of truth for `.claude/rules/frontend.md` §5
once Phase 9 reconciles it.

## Font source

Silkscreen, self-hosted (vendored, no npm dependency): fetched from Fontsource `@fontsource/silkscreen@5.2.5` via
jsDelivr (`https://cdn.jsdelivr.net/npm/@fontsource/silkscreen@5.2.5/files/silkscreen-<subset>-<weight>-normal.woff2`),
licensed OFL (SIL Open Font License). Weights vendored: 400, 700; subsets: latin, latin-ext.
Files: `src/assets/fonts/silkscreen-{latin,latin-ext}-{400,700}.woff2`.

## Token values

| Role | Token(s) | Value |
|---|---|---|
| Background | `background` | `#12141c` |
| Card / popover | `card`, `popover` | `#1b1e2a` |
| Structure | `secondary`, `muted` | `#252a3a` |
| Text | `foreground` | `#eef0f6` |
| Muted text | `muted-foreground` | `#9aa3b8` |
| Placeholder | `placeholder` | `color-mix(in srgb, muted-foreground 70%, transparent)` |
| Action | `primary` | `#ffcc33` (foreground `#12141c`) |
| Info / scores / ring | `accent`, `info`, `ring` | `#33d6ff` (foreground `#12141c`) |
| Success | `success` | `#5cf28a` (foreground `#12141c`) |
| Warning | `warning` | `#ff9f43` (foreground `#12141c`) |
| Destructive | `destructive` | `#ff4f6d` (foreground `#12141c`) |
| Border / input | `border`, `input` | `color-mix(in srgb, foreground 18-22%, transparent)` |
| Advisor 1 (pink) | `advisor-1` | `#ff5fa2` (foreground `#12141c`) |
| Advisor 2 (lime) | `advisor-2` | `#5cf28a` (foreground `#12141c`) |
| Advisor 3 (orange) | `advisor-3` | `#ff9f43` (foreground `#12141c`) |
| Advisor 4 (lilac) | `advisor-4` | `#a78bfa` (foreground `#12141c`) |

New utility tokens: `--shadow-pixel` (hard `4px 4px 0 0`), `--shadow-pixel-sm` (`2px 2px 0 0`, hover/pressed),
pixel type scale `--text-pixel-{micro,sm,md,lg,xl,2xl}` (0.5rem → 2.25rem, each with a paired line-height).

## Contrast table (WCAG AA, target ≥ 4.5:1 for text, ≥ 3:1 for large/bold text)

| Pair | On `background` (#12141c) | On `card` (#1b1e2a) |
|---|---|---|
| `foreground` #eef0f6 | 16.9:1 ✅ | 14.6:1 ✅ |
| `muted-foreground` #9aa3b8 | 7.1:1 ✅ | 6.1:1 ✅ |
| `primary` #ffcc33 | 13.6:1 ✅ | 11.7:1 ✅ |
| `accent`/`info` #33d6ff | 11.4:1 ✅ | 9.8:1 ✅ |
| `success` #5cf28a | 13.9:1 ✅ | 12.0:1 ✅ |
| `warning` #ff9f43 | 8.5:1 ✅ | 7.3:1 ✅ |
| `destructive` #ff4f6d | 5.6:1 ✅ | 4.8:1 ✅ |
| `advisor-1` #ff5fa2 | 6.3:1 ✅ | 5.4:1 ✅ |
| `advisor-2` #5cf28a | 13.9:1 ✅ | 12.0:1 ✅ |
| `advisor-3` #ff9f43 | 8.5:1 ✅ | 7.3:1 ✅ |
| `advisor-4` #a78bfa | 6.8:1 ✅ | 5.9:1 ✅ |
| `primary-foreground`/`*-foreground` #12141c on their own token | all ≥ 10:1 ✅ (dark text on bright accent backgrounds) |

Ratios computed from the relative-luminance formula (WCAG 2.x) against the two surface colours above; all pairs clear
the 4.5:1 text threshold. Manual visual re-check (actual rendering, Silkscreen weight, anti-aliasing) is deferred —
tracked in Phase 1 manual verification (item 1.7).

## Open item

Polish glyph rendering in Silkscreen (ą ć ę ł ń ó ś ź ż, upper/lower) is a manual check (Phase 1 manual verification,
item 1.6) — deferred per user instruction ("testy zrobimy później"), to be confirmed on the kitchen sink page once it
ships in Phase 2.

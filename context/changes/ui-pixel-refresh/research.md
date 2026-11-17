---
status: complete
---

# Research — ui-pixel-refresh

## Question

Ground the plan for "neon arcade on graphite" → lighter pixel-art arcade (view `/sessions/[id]`
+ global tokens) in exact, current file:line facts: every token to re-value, the font-swap
mechanics, the advisor-avatar insertion point, the synthesis-completion animation hook, the
scanner's tolerance for inline SVG `fill: var(--token)`, and the precedent plan's phase shape.

## Findings

### 1. Tokens — `src/styles/global.css` (253 lines total)

All color roles live in `:root` (lines 94-144), republished 1:1 in `@theme inline` (146-223) as
`--color-*`. Exact current values and line numbers:

| Role | Line | Value |
|---|---|---|
| `--radius` | 95 | `0rem` |
| `--background` | 96 | `#12141c` |
| `--foreground` | 97 | `#eef0f6` |
| `--card` / `--card-foreground` | 98-99 | `#1b1e2a` / `#eef0f6` |
| `--popover` / `-foreground` | 100-101 | `#1b1e2a` / `#eef0f6` |
| `--primary` / `-foreground` | 102-103 | `#ffcc33` / `#12141c` |
| `--secondary` / `-foreground` | 104-105 | `#252a3a` / `#eef0f6` |
| `--muted` / `-foreground` | 106-107 | `#252a3a` / `#9aa3b8` |
| `--placeholder` (undocumented extra token, not in frontend.md table) | 108 | `color-mix(in srgb, var(--muted-foreground) 70%, transparent)` |
| `--accent` / `-foreground` | 109-110 | `#33d6ff` / `#12141c` |
| `--info` / `-foreground` | 111-112 | `#33d6ff` / `#12141c` |
| `--success` / `-foreground` | 113-114 | `#5cf28a` / `#12141c` |
| `--warning` / `-foreground` | 115-116 | `#ff9f43` / `#12141c` |
| `--destructive` / `-foreground` | 117-118 | `#ff4f6d` / `#12141c` |
| `--border` | 119 | `color-mix(in srgb, var(--foreground) 18%, transparent)` |
| `--input` | 120 | `color-mix(in srgb, var(--foreground) 22%, transparent)` |
| `--ring` | 121 | `#33d6ff` |
| `--advisor-1` / `-foreground` | 122-123 | `#ff5fa2` / `#12141c` |
| `--advisor-2` / `-foreground` | 124-125 | `#5cf28a` / `#12141c` **(= `--success`, confirmed collision)** |
| `--advisor-3` / `-foreground` | 126-127 | `#ff9f43` / `#12141c` **(= `--warning`, confirmed collision)** |
| `--advisor-4` / `-foreground` | 128-129 | `#a78bfa` / `#12141c` |
| `--shadow-pixel-color` | 130 | `color-mix(in srgb, var(--foreground) 25%, transparent)` |
| `--chart-1..5` | 131-135 | mirror primary/accent/success/warning/destructive |
| `--sidebar-*` | 136-143 | mirror card/primary/secondary tokens |

`@theme inline` also holds: radius utilities 148-151 (all `0`), font vars 152-153
(`--font-pixel: "Silkscreen", monospace`; `--font-mono: "JetBrains Mono", ui-monospace, monospace`),
color republishing 154-200, shadow tokens 202-204 (`--shadow-pixel: 4px 4px 0 0 var(--shadow-pixel-color)`;
`--shadow-pixel-sm: 2px 2px 0 0 var(--shadow-pixel-color)`), pixel type scale 206-218 (micro 0.5rem →
2xl 2.25rem, each with paired line-height), animate registrations 220-222.

Base layer (`@layer base`, 225-232): `* { border-border outline-ring/50 }` (226-228),
`body { bg-background font-mono text-foreground }` (229-231).

**Font-face mechanics** (lines 10-81): 8 blocks total — Silkscreen 400/700 × latin/latin-ext
(10-45), JetBrains Mono 400/700 × latin/latin-ext (46-81), each `src: url("../assets/fonts/<name>-<subset>-<weight>.woff2")`. Only weights 400/700 exist for either family — a Pixelify Sans swap must vendor the same 4-file pattern (latin/latin-ext × 400/700, or more weights if the chosen Pixelify Sans weights differ) into `src/assets/fonts/` and only change the `src:` paths + the `--font-pixel` value at line 152; `unicode-range` values can be reused verbatim (same Latin/Latin-ext split already covers Polish diacritics' Unicode blocks).

**Keyframes** (234-252): `blink` (234-242, opacity 1↔0 flicker) and `fade-up` (243-252,
translateY 8px + opacity). Registered as `--animate-blink: blink 1.1s steps(1, end) infinite`
and `--animate-fade-up: fade-up 0.4s ease-out both` (221-222). New `score-pop` and
`synthesis-complete` keyframes go in this same block + two new `@theme inline` registrations.

### 2. Advisor identity — ids, accents, avatar insertion point

Canonical 4 ids: `optymista`, `sceptyk`, `pragmatyk`, `analityk` —
`src/lib/schemas/advisor.ts:27` (`ROUND_TWO_PERSONA_IDS`, intentionally duplicated from the
server-only `src/lib/advisors/registry.ts` per that file's own comment at lines 22-26, to keep
persona prompts out of the client bundle).

Accent map — `src/lib/advisors/advisor-accent.ts:11-16`:
```ts
const ADVISOR_ACCENTS: Record<string, AdvisorAccent> = {
  optymista: { text: "text-advisor-1", border: "border-advisor-1", bg: "bg-advisor-1" },
  sceptyk: { text: "text-advisor-2", border: "border-advisor-2", bg: "bg-advisor-2" },
  pragmatyk: { text: "text-advisor-3", border: "border-advisor-3", bg: "bg-advisor-3" },
  analityk: { text: "text-advisor-4", border: "border-advisor-4", bg: "bg-advisor-4" },
};
```
Fallback `NEUTRAL_ACCENT` at line 18, `advisorAccent(id)` lookup at 21-23. A new
`advisor-sprites.ts` should live next to this file, same `Record<string,T>` + lookup + fallback
shape, keyed by the same 4 ids.

**AdvisorCard.tsx** — header block (45-50):
```tsx
<header className="flex items-center justify-between gap-2">
  <h3 className={cn("font-pixel text-pixel-sm tracking-wide uppercase", accent.text)}>{label}</h3>
  {state.status === "pending" && (
    <span className="motion-safe:animate-blink text-muted-foreground text-pixel-micro">Oczekiwanie…</span>
  )}
</header>
```
This `<header>` is the avatar-slot insertion point (sibling before the `<h3>`).

Score block (52-79), delta computed at line 36 (`scoreDelta(state.score, state.previousScore)`):
```tsx
<div className="animate-fade-up flex flex-col gap-1">
  <p className="text-info text-pixel-md" aria-hidden="true">{scoreGlyph(state.score)}</p>
  <p className="text-info text-pixel-sm">OCENA {delta.text}{delta.glyph && (...)}</p>
  ...
```
Line 54 (`<p className="text-info text-pixel-md" aria-hidden="true">{scoreGlyph(state.score)}</p>`)
is the exact element to attach a `score-pop` animation class to.

**Bug flag (pre-existing, not introduced by this research):** `AdvisorCard.tsx:53`'s wrapping
`animate-fade-up` lacks the `motion-safe:` prefix used everywhere else in this codebase
(`Welcome.astro:129,164,172`, `RoundTwoPanel.tsx:121` all use `motion-safe:animate-*`). Same bug
at `SynthesisPanel.tsx:98`. Per `frontend.md:80` ("every animation respects
`prefers-reduced-motion: reduce` — use the `motion-safe:` variant"), these two existing lines are
non-compliant. Fixing both to `motion-safe:animate-fade-up` is in scope for this change since
it's touching both files anyway for the new animations.

**RoundSummary.tsx does NOT delegate to AdvisorCard** — it independently calls
`advisorAccent(row.personaId)` and renders its own compact identity row (lines 33-44). Any
avatar added to `AdvisorCard`'s header has a second call site here needing the same (smaller)
sprite for parity. **RoundTwoPanel.tsx composes both** (`AdvisorCard` for full view at 87-96,
`RoundSummary` for the folded view at 62-77) — no duplicate markup of its own.

### 3. Pixel-sprite authoring pattern — `Welcome.astro` (existing placeholder, to be extracted)

Fill legend (13-19), `Record<string,string>` keyed by uppercase letters → `var(--token)` strings
(not raw colors): `V: "var(--primary)"`, `D: "var(--chart-3)"`, `C: "var(--accent)"`,
`W: "var(--foreground)"`, `B: "var(--background)"`, `.` = transparent (undocumented in map).

Grid data format: `grid: string[]`, one string per row, 12×12, in an `Advisor` interface
(21-26); 4 concrete grids at lines 33-46/52-65/71-84/90-103.

SVG wrapper (140-151):
```tsx
<svg viewBox="0 0 12 12" shape-rendering="crispEdges" class="mb-4 h-16 w-16 sm:h-20 sm:w-20" aria-hidden="true">
  {advisor.grid.flatMap((row, y) =>
    Array.from(row).map((px, x) =>
      px === "." ? null : <rect x={x} y={y} width="1" height="1" style={`fill: ${PIXEL_FILL[px]}`} />,
    ),
  )}
</svg>
```
Crispness via `shape-rendering="crispEdges"` (SVG-specific, not `image-rendering: pixelated`
which is the raster-sprite convention named in `frontend.md` §5 — doesn't strictly apply to
vector rect-grids). Scaling is via Tailwind size classes on the `<svg>`, not integer multiples of
the grid — a minor divergence from `frontend.md`'s literal wording for pixel-art graphics in
general; acceptable to keep as-is for vector SVG (no raster pixelation risk), should be stated
explicitly as a decision in the plan rather than silently carried over.

**No shared `pixel-sprite` component exists today** — confirmed, this is a genuine extraction.

### 4. Synthesis completion — exact hook

Two status types exist: the hook's own narrower `SynthesisViewState.status` (`useSynthesisStream.ts:12-17`,
`"pending" | "streaming" | "done" | "error"`, no `"idle"`) and the wider
`SynthesisStreamStatus` (`src/lib/session-flow.ts:12`, adds `"idle"`) used by `SessionFlow`/`SynthesisPanel`.

**No `status === "done"`-specific render branch exists.** `SynthesisPanel.tsx` renders the same
tree for `"streaming"` and `"done"` once `synthesis` is set — the single `animate-fade-up` at
line 98 fires once, as soon as `synthesis` first populates (already during `"streaming"`, per
`useSynthesisStream.ts:49-52`), not on the `done` transition specifically.

Target panel — "Rekomendowany następny krok" (148-151):
```tsx
<div className={panelVariants({ padding: "card", tone: "primary" })}>
  <h3 className={headingVariants({ level: "panel" })}>Rekomendowany następny krok</h3>
  <p className="text-foreground mt-2 text-sm font-bold">{synthesis.recommendedNextStep}</p>
</div>
```
`tone: "primary"` → `"border-primary shadow-pixel"` (`src/components/ui/panel.ts:18`, existing
cva variant — no new variant needed, just a new animation class added alongside it).

**Fire-once-on-done mechanism, reusable without new render state:** existing ref pattern at
`SynthesisPanel.tsx:58-66`:
```tsx
const reportedStatusRef = useRef<SynthesisStreamStatus | null>(null);
useEffect(() => {
  if (reportedStatusRef.current === state.status) return;
  reportedStatusRef.current = state.status;
  onStatus(state.status);
}, [state.status, onStatus]);
```
At the point this effect runs, `reportedStatusRef.current` still holds the *previous* status.
A guard `reportedStatusRef.current !== "done" && state.status === "done"` checked before the ref
is overwritten detects the one-shot transition. If the animation only needs an imperative
`classList` toggle (not a conditional render), a second `useRef<boolean>` flag suffices — no new
`useState` required. If the plan wants the animation class driven by JSX (simpler, more in
keeping with existing `cn()`-based styling), a `useState<boolean>` set once inside this same
effect is the minimal addition.

### 5. Scanner tolerance — `scripts/ui-scan.mjs` (63 lines)

Exact pattern (line 16):
```js
/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|oklch\(|-\[[0-9.]+(px|rem)\]|\b(bg|text|border|ring|outline|from|via|to|fill|stroke|shadow|divide)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)\b/g
```
**Confirmed: `style={{ fill: 'var(--token)' }}` / `fill={someVar}` does NOT trip the scanner** —
none of the 4 branches matches a bare `var(` call or a JSX expression; `fill-<name>` only matches
when followed by an enumerated Tailwind palette-color name. This is also the named exception in
`frontend.md:54` ("no inline `style` unless the value is runtime-computed... per-pixel sprite
`fill` via a token `var()`") and explicit precedent in `ui-visual-refactor/plan.md:531-532,
640-641`. `ALLOWLIST` (`ui-scan.mjs:13`) is empty and does not need an entry for this change —
new pixel-sprite/icon/mascot components using this exact pattern are safe by construction.

### 6. `frontend.md` — exact sections to reconcile at the end of this change

- §4 "Styling — the design-system contract": lines 44-59 (no literals rule 53, lint:ui 53,
  kitchen-sink visual-gate requirement 59).
- §5 "Design language": lines 61-81, **token table at 66-74** (this is what must be rewritten
  once new hex values are chosen — current table already matches `palette.md` exactly, so it's
  one coherent edit, not a reconciliation of drift). Animation rules live at **line 80** inside
  §5 (not a separate §6 — §6 is Accessibility, 83-88).
- Font line to edit: `frontend.md`'s prose naming Silkscreen (not yet located precisely by line
  in this pass beyond the token table rows — grep for "Silkscreen" in frontend.md during
  implementation to catch every mention, not just §5).

### 7. Kitchen sink — current state, what must be added

`src/pages/dev/kitchen-sink.astro`, 525 lines. Palette swatches (69-79, 12 entries including all
4 advisor colors as static swatches — these values must be updated alongside `global.css`).
AdvisorCard's 7-state-matrix entry (440-448) is **blanket N/A with a stated reason** (depends on
live `EventSource`/`usePanelStream`, verify on `/sessions/[id]` instead) — AdvisorCard is not
imported or rendered anywhere in this file today. This blanket-N/A pattern is acceptable to keep,
but the new avatar/sprite element should get its *own* dedicated section (static, since it's pure
markup/SVG, not stream-dependent) so its states aren't swept into AdvisorCard's N/A excuse —
same for the new `score-pop`/`synthesis-complete` keyframes (demonstrable with a static
replay-trigger button, independent of the live stream dependency that makes AdvisorCard itself
N/A).

### 8. Precedent plan shape — `ui-visual-refactor/plan.md` (9 phases)

1. Tokens & fonts (118) 2. Shared component layer + kitchen sink (207) 3. Shell (304)
4. View `/sessions/[id]` (360) 5. View `/sessions/new` (448) 6. View `/sessions` (484)
7. View `/` (518) 8. Views `/auth/*` + `/dashboard` (554) 9. States/gate/guard (607).
Each phase: Overview → Changes Required (file-by-file Intent/Contract) → Success Criteria
(Automated/Manual) → pause-for-confirmation gate. `## Progress` tracks completion with
commit-sha annotations (728+). `change.md` terminal state: `status: implemented`,
`archived_at: null` until archived.

## Open decisions for `/10x-plan` (not resolved by research — product/design choices)

1. **Exact new hex values** for all re-valued tokens — research above gives current values and
   structure; final hex is a design choice for the plan/implementation, with contrast
   recomputation mandatory (existing ratios for `destructive` 5.6:1/4.8:1 and `advisor-1`
   6.3:1/5.4:1 are close to the 4.5:1 AA floor and must be re-checked, not assumed, once the
   background lightens).
2. **Advisor-2/3 replacement hues** — must differ from `success`/`warning` (and from each
   other and from `advisor-1`/`advisor-4`) — exact hex chosen during implementation against the
   new lighter surfaces.
3. **Pixelify Sans exact weights/subsets to vendor** — confirm which static weights exist for
   this family (at minimum match today's 400/700) and verify Polish diacritics render correctly
   before closing the inherited open item from `ui-visual-refactor/palette.md`.
4. **Sprite scaling convention** (vector SVG `h-16/h-20` sizing vs. strict integer multiples of
   the grid) — recommend keeping the existing vector approach (no raster pixelation risk) but
   state this explicitly in the plan rather than leaving it implicit.
5. **Fire-once mechanism for `synthesis-complete`**: `useState<boolean>` (if class needs to be in
   JSX, recommended — simplest, consistent with existing `cn()` styling) vs. imperative DOM ref
   toggle. Recommend the `useState` approach unless the plan has a specific reason to avoid an
   extra render.

## Gaps

- Real Polish display labels for the 4 advisor ids were not located in the files read (likely in
  `src/lib/advisors/registry.ts`, not opened in this pass since it's server-only/out of visual
  scope) — not needed for this change (labels are already passed in as props; only the avatar
  sprite is new), but flagged in case the plan wants to cross-check persona names against sprite
  design concepts.
- `frontend.md`'s exact line(s) naming "Silkscreen" outside the §5 token table were not
  enumerated — grep during implementation rather than relying solely on this document's line
  numbers, since prose mentions may exist in multiple places.

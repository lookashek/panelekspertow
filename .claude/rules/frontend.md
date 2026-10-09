---
paths:
  - "src/components/**"
  - "src/layouts/**"
  - "src/hooks/**"
  - "src/styles/**"
  - "src/pages/**/*.astro"
---

# Frontend rules (Astro 7 SSR + React 19 islands + Tailwind 4 + shadcn/ui)

## 1. Astro first, React only for interactivity

- Static or server-rendered content → `.astro` component. Interactive state → React island.
- Choose the smallest hydration directive that works: `client:visible` > `client:idle` > `client:load`. `client:only` only when the component cannot SSR (e.g. uses `window` at module scope).
- One island per interactive region. Do not wrap a whole page in a React root.
- Pass data into islands as serializable props (no functions, no class instances, no Dates — pass ISO strings).
- No Next.js-isms: no `"use client"`, no `next/*` imports, no `getServerSideProps`.

## 2. Component structure

```
src/components/
  ui/                 # shadcn/ui only — added via `npx shadcn@latest add <name>`, never hand-edited beyond styling
  <feature>/          # e.g. advisor-panel/, session-history/, decision-form/
    AdvisorCard.tsx
    AdvisorCard.test.tsx   # (once a test runner exists)
    useAdvisorStream.ts    # feature-local hook; promote to src/hooks/ only when reused across features
  layout/             # Header, Footer, Shell — .astro
```

- Feature folders, not type folders (`components/buttons/`). A feature folder is deleted as a unit.
- Component file = one exported component. Helpers that are not components go to `src/lib/`.
- Props: `type AdvisorCardProps = { … }` declared above the component; destructure in the signature; no `React.FC`.
- Default export only for Astro pages/layouts. React components use named exports.

## 3. State & data flow

- Server-derived state comes from the `.astro` page (via `Astro.locals`, fetch in frontmatter) and flows down as props.
- Client state: `useState`/`useReducer` local to the island. Reach for a store only when two islands must share state, and then use `nanostores` (Astro-native) — not Redux, not Context spanning islands (it can't).
- Streaming LLM output (FR-009): consume `ReadableStream` / SSE in a hook (`useStreamedResponse`), expose `{ text, status, error, abort }`. Always support `AbortController` on unmount.
- Forms: React Hook Form + Zod resolver for anything beyond one field. Reuse the same Zod schema the API route validates with (`@/lib/schemas`).

## 4. Styling — the design-system contract

- **Values:** `src/styles/global.css` only — `:root` holds the values, `@theme inline` publishes them as utilities (`bg-primary`, `text-pixel-micro`, `shadow-pixel`). Tokens are named by **role**, never by colour. Need a new value? Add a role token there first, then use it.
- **Components:** `src/components/ui/` — check it before creating any component; add missing primitives with `npx shadcn@latest add <name>`, then restyle through tokens + `cva`. Never a second `Button`/panel/field built from `div` + classes, never a second `shadcn init` or palette.
  - Button: `Button` / `buttonVariants` (`default` = primary action, `secondary`, `ghost`, `destructive`, `link`; sizes `sm`/`default`/`lg`/`icon`). In `.astro` use `class={buttonVariants({ … })}` on `<a>`/`<button>`.
  - Surfaces: `panelVariants` (padding `card`/`page`/`none`, tone `default`/`inset`/`info`/`primary`, `interactive`). Headings: the heading recipe (`page`/`section`/`panel`/`label`).
  - Forms: `Field` (label + control + hint + error, wires `aria-describedby`/`aria-invalid`) with `Input`/`Textarea`/`Label`.
  - Status & feedback: `Badge` (status variants), `Alert` (`error`/`warning`/`info`/`success`, optional retry action), `Skeleton`.
  - Advisor identity colours: `advisorAccent(id)` from `@/lib/advisors/advisor-accent` — never pick an advisor colour inline.
- **No literals in views:** no hex/rgb/oklch, no Tailwind palette classes (`bg-purple-500`, `text-white`), no arbitrary values (`text-[10px]`, `ring-[3px]`). `npm run lint:ui` enforces this on `src/components/**` and `src/pages/**`.
- Tailwind utilities only; `cn()` from `@/lib/utils` to merge. No template-string class concatenation, no inline `style` unless the value is runtime-computed (e.g. progress width, per-pixel sprite `fill` via a token `var()`).
- Variants via `cva` (already used by shadcn). Don't build a parallel variant system, and don't override a variant's look through `className` — add or fix the variant.
- Single dark theme only (see §5) — the `dark` class stays permanently on `<html>`; do not write `dark:` variants or light-mode styles.
- Page widths: the shared container (`narrow` forms/auth, `default` lists, `wide` session/landing) — no per-page `max-w-*` inventions.
- Responsive: mobile-first (`sm:` up). Test at 375px and 1280px.
- **Visual gate:** every shared component and its 7 states live on the dev-only kitchen sink, `src/pages/dev/kitchen-sink.astro` (`/dev/kitchen-sink`). A new or changed shared component is added there in the same change.
- *Migration note (S-08 `ui-visual-refactor`, remove when Phase 9 lands):* legacy `.pixel-panel`, `.pixel-btn` and `bg-pixel-grid` still exist while views are migrated — never add new uses.

## 5. Design language — "neon arcade on graphite" (single dark theme)

- The app has ONE visual style: modern 8-bit arcade — neutral graphite surfaces, multicolour neon accents. No light mode, no theme toggle. Final values and contrast table: `context/changes/ui-visual-refactor/palette.md` (archived with the change).
- Palette roles (tokens in `global.css`, never hardcoded) and their fixed meaning:

  | Role | Token(s) | Baseline | Meaning — use only for |
  |---|---|---|---|
  | Surfaces | `background`, `card`, `secondary`/`muted` | graphite `#12141c` / `#1b1e2a` / `#252a3a` | page, panels, insets |
  | Text | `foreground`, `muted-foreground` | `#eef0f6` / `#9aa3b8` | body, secondary text |
  | Structure | `border` | neutral (foreground, low mix) | static panel borders, dividers |
  | Action | `primary` | arcade yellow `#ffcc33` | buttons, links, other interactive elements — **never** static structure |
  | Info / scores | `accent`, `info`, `ring` | cyan `#33d6ff` | scores, informational emphasis, focus ring |
  | Status | `success`, `warning`, `destructive` | lime `#5cf28a`, orange `#ff9f43`, red `#ff4f6d` | badges, alerts, risk levels — always with text |
  | Advisor identity | `advisor-1…4` | pink `#ff5fa2`, lime `#5cf28a`, orange `#ff9f43`, lilac `#a78bfa` | advisor name/marker only — never buttons or status |

- Gradients only on accents (hero/headings, primary buttons), never on body text or backgrounds — page backgrounds are flat `background`.
- Pixel aesthetic: sharp corners everywhere — `--radius` and `--radius-*` are `0`, never add `rounded-*`. Shadows are hard-edged offsets via `shadow-pixel`, never blurred (`shadow-xs`/`shadow-md`, `backdrop-blur-*` are banned). Borders `2px` solid.
- Pixel-art graphics (advisor avatars, icons, decorations): sprites rendered with `image-rendering: pixelated`, scaled only by integer multiples so pixels stay crisp.
- Typography: pixel font **Silkscreen** (self-hosted in `src/assets/fonts/`) for headings, buttons, badges, and short labels ONLY, sized only from the pixel type scale (`text-pixel-micro` / `-sm` / `-md` / `-lg` / `-xl` / `-2xl`). Body text and advisor output use **JetBrains Mono**. Never set long-form text in the pixel font.
- Animations — subtle and purposeful: hover/focus transitions on interactive elements, typewriter reveal for streamed advisor text (pairs with `useStreamedResponse`), short entrance transition when a panel or opinion appears. No permanent full-viewport effects (scanlines, flicker, CRT filters). Every animation respects `prefers-reduced-motion: reduce` — use the `motion-safe:` variant on the theme animations (`motion-safe:animate-blink`, `motion-safe:animate-fade-up`).
- Restyle shadcn components through tokens and `cva` variants; do not fork component internals to force the style.

## 6. Accessibility (non-negotiable)

- Every interactive element is keyboard reachable and has a visible focus ring on the `ring` token (built into `buttonVariants` and the form primitives; don't remove `focus-visible:`, don't hand-roll actions that bypass them).
- Live-updating advisor text goes in an `aria-live="polite"` region.
- Color is never the only signal (scores: number + label, not just red/green).
- The last two are PRD guardrails for the advisor panel, not generic a11y advice — keep them through future rule audits.

## 7. Performance

- No `useEffect` for data that can be fetched server-side in the Astro frontmatter.
- Add `React.memo`/`useMemo` only when a re-render problem was observed (React DevTools profiler or visible jank) and say so in the PR description — never by default.
- Lazy-load heavy islands (`client:visible`). Keep third-party UI deps out unless shadcn already wraps them.
- Images through Astro's `<Image />` component.

## 8. Error & loading states

Every async UI has three explicit states: loading (`Skeleton` shaped like the content, so nothing jumps when data arrives; a blinking status label may accompany it), error (`Alert` `error` with message + retry action where a retry exists), empty (a real empty-state panel with a next action). No silent failure. LLM stream interruption is an error state with the partial text preserved.

## 9. Done checklist for a frontend task

- [ ] Renders via SSR without hydration warnings in `npm run dev`
- [ ] Works with JS disabled where the feature is not inherently interactive
- [ ] Keyboard + screen reader pass on new interactive elements
- [ ] 375px and 1280px; accent text (yellow/cyan/status/advisor) meets WCAG AA contrast on `background` and `card`
- [ ] Built from tokens + `src/components/ui/` only; new/changed shared components shown on `/dev/kitchen-sink` in all 7 states (default, hover, focus-visible, disabled, error, empty, loading — or N/A with a reason)
- [ ] Animations disabled under `prefers-reduced-motion`
- [ ] `npm run lint` and `npm run lint:ui` clean, no new `console.*`
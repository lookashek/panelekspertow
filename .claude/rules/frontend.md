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

## 4. Styling

- Tailwind utilities only; `cn()` from `@/lib/utils` to merge. No template-string class concatenation, no inline `style` unless the value is runtime-computed (e.g. progress width).
- Design tokens live in `src/styles/global.css` (`@theme`). No hardcoded hex/px outside that file.
- Variants via `cva` (already used by shadcn). Don't build a parallel variant system.
- Single dark theme only (see §5) — the `dark` class stays permanently on `<html>`; do not write `dark:` variants or light-mode styles.
- Responsive: mobile-first (`sm:` up). Test at 375px and 1280px.

## 5. Design language — dark pixel-retro (single theme)

- The app has ONE visual style: dark 8-bit pixel-art arcade. No light mode, no theme toggle.
- Palette (declared as tokens in `src/styles/global.css` `@theme`, never hardcoded): background deep violet-navy `#120826`, surfaces one step lighter, accents violet `#b388ff` and cyan `#00e5ff`. Meaning is fixed: violet = interactive/action, cyan = informational/scores. Gradients only on accents (headings, primary buttons), never on body text or backgrounds.
- Pixel aesthetic: sharp corners everywhere — set shadcn's `--radius` to `0`, never add `rounded-*`. Shadows are hard-edged offsets (`box-shadow: 4px 4px 0`), never blurred. Borders `2px` solid.
- Pixel-art graphics (advisor avatars, icons, decorations): sprites rendered with `image-rendering: pixelated`, scaled only by integer multiples so pixels stay crisp.
- Typography: pixel font (`"Press Start 2P"` or `"Silkscreen"`, self-hosted in `src/assets/fonts/`) for headings, buttons, badges, and short labels ONLY. Body text and advisor output use a readable monospace (`"JetBrains Mono"`). Never set long-form text in the pixel font.
- Animations — subtle and purposeful: hover/focus transitions on interactive elements, typewriter reveal for streamed advisor text (pairs with `useStreamedResponse`), short entrance transition when a panel or opinion appears. No permanent full-viewport effects (scanlines, flicker, CRT filters). Every animation respects `prefers-reduced-motion: reduce`.
- Restyle shadcn components through tokens and `cva` variants; do not fork component internals to force the style.

## 6. Accessibility (non-negotiable)

- Every interactive element is keyboard reachable and has a visible focus ring (shadcn defaults; don't remove `focus-visible:`).
- Live-updating advisor text goes in an `aria-live="polite"` region.
- Color is never the only signal (scores: number + label, not just red/green).
- The last two are PRD guardrails for the advisor panel, not generic a11y advice — keep them through future rule audits.

## 7. Performance

- No `useEffect` for data that can be fetched server-side in the Astro frontmatter.
- Add `React.memo`/`useMemo` only when a re-render problem was observed (React DevTools profiler or visible jank) and say so in the PR description — never by default.
- Lazy-load heavy islands (`client:visible`). Keep third-party UI deps out unless shadcn already wraps them.
- Images through Astro's `<Image />` component.

## 8. Error & loading states

Every async UI has three explicit states: loading (skeleton, not spinner-on-white), error (message + retry), empty. No silent failure. LLM stream interruption is an error state with the partial text preserved.

## 9. Done checklist for a frontend task

- [ ] Renders via SSR without hydration warnings in `npm run dev`
- [ ] Works with JS disabled where the feature is not inherently interactive
- [ ] Keyboard + screen reader pass on new interactive elements
- [ ] 375px and 1280px; accent text (violet/cyan) meets WCAG AA contrast on the dark background
- [ ] Animations disabled under `prefers-reduced-motion`
- [ ] `npm run lint` clean, no new `console.*`
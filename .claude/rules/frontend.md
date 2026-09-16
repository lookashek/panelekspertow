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
- Never mutate props. Never derive state that can be computed in render.
- Forms: React Hook Form + Zod resolver for anything beyond one field. Reuse the same Zod schema the API route validates with (`@/lib/schemas`).

## 4. Styling

- Tailwind utilities only; `cn()` from `@/lib/utils` to merge. No template-string class concatenation, no inline `style` unless the value is runtime-computed (e.g. progress width).
- Design tokens live in `src/styles/global.css` (`@theme`). No hardcoded hex/px outside that file.
- Variants via `cva` (already used by shadcn). Don't build a parallel variant system.
- Dark mode: class strategy as configured by shadcn; every new component must render correctly in both.
- Responsive: mobile-first (`sm:` up). Test at 375px and 1280px.

## 5. Accessibility (non-negotiable)

- Semantic elements before ARIA: `<button>`, `<nav>`, `<dialog>`, `<ul>`.
- Every interactive element is keyboard reachable and has a visible focus ring (shadcn defaults; don't remove `focus-visible:`).
- Images: `alt`. Icon-only buttons: `aria-label`. Live-updating advisor text: `aria-live="polite"` region.
- Color is never the only signal (scores: number + label, not just red/green).

## 6. Performance

- No `useEffect` for data that can be fetched server-side in the Astro frontmatter.
- Memoize only on measured need (`React.memo`/`useMemo`), not by default.
- Lazy-load heavy islands (`client:visible`). Keep third-party UI deps out unless shadcn already wraps them.
- Images through Astro's `<Image />` component.

## 7. Error & loading states

Every async UI has three explicit states: loading (skeleton, not spinner-on-white), error (message + retry), empty. No silent failure. LLM stream interruption is an error state with the partial text preserved.

## 8. Done checklist for a frontend task

- [ ] Renders via SSR without hydration warnings in `npm run dev`
- [ ] Works with JS disabled where the feature is not inherently interactive
- [ ] Keyboard + screen reader pass on new interactive elements
- [ ] Both color modes, 375px and 1280px
- [ ] `npm run lint` clean, no new `console.*`
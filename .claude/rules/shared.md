# Shared conventions (every agent, every file)

Loads unconditionally. Keep this file short — anything domain-specific goes in
`frontend.md` / `backend.md` (path-scoped).

## Naming

| Thing | Convention | Example |
|---|---|---|
| Directories | kebab-case | `src/components/advisor-panel/` |
| React components (file + export) | PascalCase | `AdvisorCard.tsx` → `export function AdvisorCard` |
| Astro pages/layouts | kebab-case | `src/pages/sessions/[id].astro` |
| Hooks | `use` prefix, camelCase | `src/hooks/useStreamedResponse.ts` |
| Services / repositories | `<domain>.service.ts` / `<domain>.repository.ts` | `src/lib/services/session.service.ts` |
| Types | PascalCase, no `I` prefix | `Session`, `AdvisorOpinion` |
| Zod schemas | `<Name>Schema`, inferred type next to it | `SessionInputSchema`, `type SessionInput = z.infer<…>` |
| Constants | UPPER_SNAKE only for true constants | `MAX_ADVISORS` |
| Env vars | UPPER_SNAKE, declared in `astro.config.mjs` `env.schema` | `OPENROUTER_API_KEY` |
| Supabase migrations | `YYYYMMDDHHmmss_short_description.sql` | `20260916120000_create_sessions.sql` |
| DB tables/columns | snake_case, plural tables | `advisor_opinions.session_id` |

## Imports

- Always `@/…` alias, never `../../`.
- Order: node/builtin → external packages → `@/` internal → relative → types (`import type`).
- No barrel `index.ts` re-export chains deeper than one level (tree-shaking + circular imports on Workers).

## TypeScript

- `strict` is on and stays on. No `any`; use `unknown` + narrowing.
- Prefer `type` over `interface` unless declaration merging is needed.
- Every boundary (HTTP body, env, LLM output, DB row) is validated with Zod before use.
- Never throw raw strings. Throw `Error` subclasses from `@/lib/errors`.

## Style & tooling

- Prettier + ESLint decide formatting; do not hand-format. Run `npm run lint` before declaring a task done.
- `no-console` warns: use the logger from `@/lib/logger`, not `console.log`.
- Comments explain *why*, never *what*. Delete commented-out code.
- No `TODO` without an owner and a reason: `// TODO(marcin): remove after FR-009 ships`.

## Git / PR discipline

- Branch: `feat/<short>`, `fix/<short>`, `chore/<short>`.
- Commits: Conventional Commits (`feat(api): stream advisor round one`). One logical change per commit.
- Before opening a PR: `npm run lint && npm run build`, and if the change touches auth or API routes, `npm run smoke` against a running server.
- Every PR description states: what changed, why, how it was verified, and which PRD requirement (FR-xxx) it serves.
- Never commit `.env`, `.dev.vars`, or anything under `context/archive/`.

## What agents must NOT do

- Do not add new runtime dependencies without stating the reason in the PR. Prefer the platform (Web APIs, Astro, Supabase client) over a package.
- Do not "simplify" ESLint config (see `eslint.config.js` comments).
- Do not write to `context/archive/`.
- Do not disable RLS, weaken a policy, or use the Supabase service-role key in request handlers.
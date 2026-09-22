# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Panel Ekspertów** — a web app where a user submits a decision/problem and a panel of LLM advisor personas debates it with forced
divergence (isolated first-round opinions, numeric scores before rationale, attributed score changes in round two, synthesis with at least
one axis of dispute). Product requirements: `@context/foundation/prd.md`; stack rationale: `@context/foundation/tech-stack.md`. The codebase
is currently the untouched `10x-astro-starter` scaffold (auth flow only — no panel features yet).

`AGENTS.md` is a pointer to this file (Windows checkout can't materialize the symlink). This file is the single source of truth for agent
rules.

## Commands

- `npm run dev` — dev server (Cloudflare workerd runtime)
- `npm run build` — production build (SSR via `@astrojs/cloudflare`)
- `npm run preview` — preview production build
- `npm run lint` / `npm run lint:fix` — ESLint with type-checked rules
- `npm run format` — Prettier (astro + tailwindcss plugins)
- `npm run smoke` — dependency-free auth-flow smoke test (`scripts/smoke.mjs`) against a running server; `BASE_URL` env, default
  `http://localhost:4321`. Needs a reachable Supabase with email confirmation disabled. There is no unit test suite yet.

Pre-commit: husky + lint-staged runs `eslint --fix` on `*.{ts,tsx,astro}` and `prettier --write` on `*.{json,css,md}`.

## Architecture

Astro 7 SSR app (`output: "server"` — every page is server-rendered; API routes are plain exports, no `prerender` flag needed) with React 19
islands, Tailwind 4, shadcn/ui, Supabase auth, deployed to Cloudflare Workers (`wrangler.jsonc`).

### Auth flow (the one multi-file path worth knowing)

- `src/lib/supabase.ts` — builds a `@supabase/ssr` cookie-based server client from `astro:env/server` secrets (`SUPABASE_URL`,
  `SUPABASE_KEY`, declared in `astro.config.mjs` `env.schema`, server-only). **Returns `null` when env vars are missing** — every caller
  must handle that (the scaffold degrades to a "not configured" state instead of crashing).
- `src/middleware.ts` — runs on every request, resolves the user onto `context.locals.user`, and redirects unauthenticated requests on paths
  in `PROTECTED_ROUTES` to `/auth/signin`. Add new protected paths to that array.
- API endpoints `src/pages/api/auth/{signin,signup,signout}.ts` are form-POST handlers that redirect back with `?error=` query params rather
  than returning JSON.

## GitHub issues (roadmap sync)

GitHub issues mirror `context/foundation/roadmap.md` one-to-one, joined by the Roadmap ID title prefix (`F-01 · …`, `S-03 · …`),
grouped under a milestone per `M-NN`, labelled `roadmap:foundation|slice` + `stream:A|B|C`. When `roadmap.md` is edited, the
`.claude/hooks/roadmap-sync-reminder.mjs` PostToolUse hook (wired in `.claude/settings.json`) reminds the session to **ask the user first**,
then — only on confirmation — delegate to the `github-issue-manager` subagent (`.claude/agents/github-issue-manager.md`), which reconciles
issues and writes rich progress comments. The agent is scoped to `Read` + `gh`/read-only `git`; it reconstructs state from the roadmap + live
issues, so it needs no conversation context. Hand-edited roadmaps (outside a Claude session) don't fire the hook — invoke the agent manually.

## Conventions

- Path alias `@/*` → `./src/*` (tsconfig).
- Astro components for static content; React only where interactivity is needed. No Next.js directives (`"use client"` etc.).
- Merge Tailwind classes with `cn()` from `@/lib/utils` — never concatenate class strings manually.
- shadcn/ui components live in `src/components/ui/` ("new-york" style, see `components.json`); add new ones with
  `npx shadcn@latest add <name>`.
- Services/helpers go in `src/lib/`; extracted React hooks in `src/hooks/` (the `components.json` alias target).
- Supabase migrations: `supabase/migrations/` named `YYYYMMDDHHmmss_short_description.sql`; always enable RLS with per-operation, per-role
  policies — per-user session isolation is a PRD guardrail, RLS is what enforces it.
- ESLint is strict-type-checked and `no-console` warns; `eslint-plugin-react` is wrapped with `fixupPluginRules` for ESLint 10 — don't
  "simplify" that away (see comments in `eslint.config.js`).
- Rules & agents Cross-cutting conventions (naming, imports, git) live in .claude/rules/shared.md and load every session. Domain rules load
only when their paths are touched: .claude/rules/frontend.md (src/components, src/layouts, src/hooks, src/styles, *.astro pages) and
.claude/rules/backend.md (src/pages/api, src/lib, src/middleware.ts, src/types, supabase/). Run /memory to confirm what's loaded. Before
opening a PR, delegate to the code-reviewer subagent (.claude/agents/code-reviewer.md) and resolve all Blockers. Backend layering is
handler → service → repository → adapter; see backend.md §1–2 for the patterns that are in scope (Repository, Adapter/Port, Strategy,
Factory, Result, Pipeline) and the ones that are not (DI containers, event buses, CQRS).

## Environment

- Node v22.14.0 (`.nvmrc`). Setup, Supabase config, and deploy steps: `@README.md`. The one split the README scatters: Node/Supabase CLI
  reads secrets from `.env`, Cloudflare local dev reads `.dev.vars` (gitignored) — keep both in sync.
- CI (`.github/workflows/ci.yml`): lint + `astro check` + build on push/PR, plus a smoke job that boots a local Supabase and runs
  `npm run smoke` against the production preview.

## Foundation docs (10xDevs workflow)

`context/foundation/` holds the PRD, shape notes, and tech-stack decision consumed by the `/10x-*` skills; `context/changes/` holds
in-flight change docs. `context/archive/` is immutable — never write there. Lesson courseware (10x-cli managed block) lives in
`context/foundation/lesson-4-toolkit.md`, not here.
<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 2, Lesson 1

Move from sprint-zero setup to project orchestration with the **roadmap chain**:

```
(Module 1 foundation docs) -> /10x-roadmap -> backlog-ready roadmap items
```

`/10x-roadmap` is the lesson focus. `/10x-new` is intentionally introduced in Module 2, Lesson 2, when a selected roadmap item becomes an implementation change folder.

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| **Roadmap (lesson focus)** | |
| `/10x-roadmap` | You have `context/foundation/prd.md` and a scaffolded project baseline, and you need a vertical-first MVP roadmap. The skill reads the PRD, inspects the code baseline, uses available foundation docs such as `tech-stack.md`, `infrastructure.md`, and `deploy-plan.md`, then writes `context/foundation/roadmap.md`. Use it BEFORE creating per-change folders or implementation plans. |
| **Re-run upstream if needed** | |
| `/10x-shape` / `/10x-prd` / `/10x-tech-stack-selector` / `/10x-bootstrapper` / `/10x-agents-md` / `/10x-infra-research` | Bundled from Module 1 so foundation contracts can be fixed before roadmap sequencing. If roadmap generation exposes a PRD gap, repair the PRD before pretending the backlog is ready. |

### How the chain hands off

- `/10x-roadmap` bridges product and implementation. It does not choose frameworks, design schemas, or write a per-change implementation plan.
- The output is `context/foundation/roadmap.md`: ordered milestones, vertical slices, bounded foundations, dependencies, unknowns, risk, and backlog handoff fields.
- Roadmap items should receive stable human-readable identifiers in backlog tools. The actual `context/changes/<change-id>/` folder is created in Lesson 2 with `/10x-new`.

### Roadmap boundaries

- Default to vertical slices: user-visible outcomes that cross UI, data, business logic, and integrations.
- Horizontal work is allowed only as a bounded enabler that names the downstream vertical milestone it unlocks.
- Avoid orphan horizontal work such as "build the whole database", "build all API endpoints", or "design the whole UI" before the first user-visible flow.
- Roadmap is not a calendar estimate. Do not invent dates, story points, or sprint velocity unless the user explicitly asks for a separate planning artifact.

### Foundation paths used by this lesson

- `context/foundation/prd.md` - input
- `context/foundation/tech-stack.md` - optional input
- `context/foundation/infrastructure.md` - optional input
- `context/deployment/deploy-plan.md` - optional input
- `context/foundation/roadmap.md` - output
- `context/foundation/lessons.md` - recurring rules and pitfalls
- `docs/reference/contract-surfaces.md` - load-bearing names registry

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->
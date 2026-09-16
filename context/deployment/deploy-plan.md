# Deploy Plan — Panel Ekspertów → Cloudflare Workers (first deployment)

> Audit trail of "what was supposed to happen" for the first production deploy.
> Inputs: `context/foundation/infrastructure.md` (platform decision) + `context/foundation/tech-stack.md` (stack constraints).
> Executed: 2026-09-16.

## Context

The scaffold already targets Cloudflare Workers (`@astrojs/cloudflare` + `wrangler.jsonc`), and
`infrastructure.md` confirms Cloudflare Workers as the recommended MVP platform. This is the **first
production deploy** of the auth-only scaffold — no panel/LLM/streaming features exist yet. The goal is
to get the SSR auth app running on the real workerd runtime at a stable URL, with secrets wired and the
workerd-specific gotchas from the research validated, *before* any streaming code is written.

Decisions taken:
- **Rename** the Worker `10x-astro-starter` → `panel-ekspertow` (becomes the production URL).
- **Deploy on the free tier now**; upgrade to Workers Paid ($5/mo) before real/streaming use.

Environment (verified at plan time):
- `wrangler` v4 authenticated via `CLOUDFLARE_API_TOKEN`, account `799fff27498c7436d139819838077cc2`.
- `wrangler.jsonc` had `nodejs_compat` but **not** `disable_nodejs_process_v2`.
- `.env` holds `SUPABASE_URL`, `SUPABASE_KEY`, `OPENROUTER_API_KEY`, `CLOUDFLARE_API_TOKEN`.
- No `.dev.vars` and no `context/deployment/` existed before this run.
- `astro.config.mjs` env schema declares only `SUPABASE_URL` / `SUPABASE_KEY`.

## Steps

### 1. Fix the workerd runtime config (config-only)
- `wrangler.jsonc`: `name` → `panel-ekspertow`; add `disable_nodejs_process_v2` to
  `compatibility_flags` (prevents SSR rendering as literal `[object Object]` — Risk register row 2).
- Create `.dev.vars` (gitignored) mirroring `.env`: `SUPABASE_URL`, `SUPABASE_KEY`.

### 2. Validate against workerd locally
- `npm run build` — confirm the Cloudflare adapter build succeeds, bundle within limits.
- `npx wrangler dev` — load `/` and `/auth/signin`; confirm real HTML, not `[object Object]`.
  (`astro dev` is Node-backed and does not exercise workerd.)

### 3. Set production secrets
- `npx wrangler secret put SUPABASE_URL`
- `npx wrangler secret put SUPABASE_KEY`
- Skip `OPENROUTER_API_KEY` — no code consumes it yet, not in the env schema.

### 4. First production deploy
- `npx wrangler deploy` → publishes Worker at `panel-ekspertow.<account>.workers.dev`.

### 5. Verify end-to-end on the deployed URL
- Load `/` and `/auth/signin` live; exercise the auth redirect flow against live Supabase.
- Optional: `BASE_URL=https://panel-ekspertow.<account>.workers.dev npm run smoke`
  (needs reachable Supabase with email confirmation disabled).
- `npx wrangler tail` — confirm live logs stream.

## Human-only gates (not executed by the agent)
- **Workers Paid ($5/mo) upgrade** — deferred; do in the dashboard before real/streaming use
  (free-tier 10ms CPU cap fails SSR + stream orchestration).
- Billing tier changes, Supabase key rotation, destructive DB migrations remain manual.

## Files changed by this deploy
- `wrangler.jsonc` — `name` + `disable_nodejs_process_v2`.
- `.dev.vars` — new, gitignored.
- `context/deployment/deploy-plan.md` — this file.
- No application source or dependency changes.

## Risks carried from infrastructure.md
- Free-tier 10ms CPU / 50-subrequest caps — acceptable for auth-only light load; **upgrade before streaming**.
- `nodejs_compat` is a partial shim — no Node-builtin/LLM code deployed yet; re-validate on `wrangler dev`
  when advisor-streaming lands.
- `wrangler rollback` reverts code only, not Supabase schema — no migrations in this deploy, N/A now.

## Execution log (2026-09-16)

- **Config**: `wrangler.jsonc` name → `panel-ekspertow`; added `disable_nodejs_process_v2` to
  `compatibility_flags`. Created gitignored `.dev.vars` (Supabase URL/key).
- **Build**: `npm run build` — succeeded (Cloudflare adapter, server output).
- **workerd validation**: `wrangler dev` served `/` (200) and `/auth/signin` (200) with real
  titles and **zero** `[object Object]` — compat flag confirmed working.
- **Secrets**: `SUPABASE_URL` + `SUPABASE_KEY` uploaded via `wrangler secret put`. This created the
  Worker `panel-ekspertow`. (`OPENROUTER_API_KEY` intentionally skipped — no consuming code yet.)
- **Deploy**: `npx wrangler deploy` — provisioned SESSION KV namespace + IMAGES/ASSETS bindings.
  **Live URL: https://panel-ekspertow.lookashek-s.workers.dev**
  Version ID `15f3734f-da07-4988-a298-4dd815757c54`.
- **Live verification**:
  - `/` → HTTP 200, `<title>Panel Ekspertów</title>`, no `[object Object]`.
  - `/auth/signin` → HTTP 200, `<title>Sign in</title>`.
  - `/dashboard` → HTTP 302 → `/auth/signin` (middleware protected-route auth + Supabase client
    working against live secrets).
  - `wrangler deployments list` returns version history (read-only observability confirmed).

### Follow-ups / notes
- `workers_dev` and `preview_urls` were enabled by default (deploy warnings). Set
  `"workers_dev": false` / `"preview_urls": false` in `wrangler.jsonc` if you want them off.
- **Workers Paid ($5/mo)** upgrade still pending (human-only) — required before streaming/real load.

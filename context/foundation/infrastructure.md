---
project: Panel Ekspertów
researched_at: 2026-09-16
recommended_platform: Cloudflare Workers
runner_up: Vercel
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 7 (SSR) + React 19 islands
  runtime: Cloudflare Workers (workerd, nodejs_compat)
---

## Recommendation

**Deploy on Cloudflare Workers.**

Cloudflare is the only researched platform that passes all five agent-friendly criteria *and* satisfies every one of this project's weighted constraints at once: it is edge-native (global low-latency reach), costs $0–5/month (cost-first preference), is the platform the developer already knows and holds an account on, and — decisively for this app — imposes **no wall-clock limit on streamed HTTP responses**, so the live token-by-token multi-advisor debate (FR-009) can run for as long as the client stays connected. The scaffold already targets it (`@astrojs/cloudflare` + `wrangler.jsonc`), so there is zero adapter-migration cost. Supabase stays external, exactly as the current setup and the interview answer intend.

The one non-negotiable operational note: **budget the $5/month Workers Paid plan from day one.** The free tier's 10 ms CPU-per-invocation cap is too tight for Astro SSR plus LLM-stream orchestration — this is a known constraint, not a surprise, and it is folded into the risk register below.

## Platform Comparison

| Platform | CLI-first | Managed / Serverless | Agent-readable docs | Stable deploy API | MCP / Integration | Score |
|---|---|---|---|---|---|---|
| **Cloudflare Workers** | Pass | Pass | Pass (best-in-class) | Pass | Pass | **5 Pass** |
| Vercel | Pass | Pass | Pass | Pass | Pass | 5 Pass* |
| Netlify | Pass | Pass | Pass | Pass | Pass | 5 Pass* |
| Fly.io | Pass | Partial | Pass | Partial | Partial | 3 Pass / 3 Partial |
| Railway | Pass | Pass | Pass | Partial | Partial | 3 Pass / 2 Partial |
| Render | Pass | Pass | Pass | Partial | Pass | 4 Pass / 1 Partial |

\* Vercel and Netlify tie Cloudflare on the raw criteria but lose on this project's *weighted* constraints — see notes.

**Cloudflare Workers** — `wrangler deploy / versions / rollback / tail` are all GA; docs are the best of any platform researched (`llms.txt` per product, `/index.md` markdown on any doc URL, official MCP server with a Claude Code setup guide); streaming has no wall-clock cap. Free tier's 10 ms CPU cap is the only real gap, closed by the $5 plan.

**Vercel** — Equal on criteria, strong DX and MCP. Loses on weighting: the free Hobby tier **forbids commercial use** (would force $20/mo Pro), and deploying here means swapping away the already-configured Cloudflare adapter. Streaming caps at 300 s (adequate). No WebSockets.

**Netlify** — Equal on criteria, `llms.txt` docs, GA MCP server. Its **60-second cap on streamed function responses** is a genuine risk for long multi-advisor LLM streams — the single reason it is not the runner-up despite otherwise matching.

**Fly.io** — Unlimited streaming duration (persistent Node process — technically the best fit for very long streams), but the **free tier was removed** (card required day one, conflicts with cost-first), it is single-region by default (conflicts with global reach), and containers add operational surface (Dockerfile debugging) an agent can trip on.

**Railway** — Clean DX and managed services, but single-region (no global edge), SSE capped at 15 min / 5 min idle, and arbitrary-deployment rollback is dashboard-only (agent can't script it). MCP is preview.

**Render** — Real CLI and GA MCP server, but single-region only and free-tier cold starts of 30–60 s badly hurt an SSE app; no-spin-down costs $7/mo. Rollback is REST-only and doesn't disable autodeploy.

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

Wins on every weighted axis simultaneously — edge/global, cost, developer familiarity, zero migration, and unlimited stream duration — while also scoring a clean 5-Pass on the agent-friendly criteria. Best-in-class agent-readable docs and an official MCP server with a documented Claude Code setup make it the strongest platform for an agent-driven, AI-assisted build.

#### 2. Vercel

The closest substitute that preserves both global edge reach and solid HTTP streaming (300 s), with excellent agent tooling and an official MCP server. The gap versus Cloudflare is economic and practical: the Hobby tier's commercial-use prohibition pushes a real project toward the $20/mo Pro plan, and adopting it throws away the already-wired Cloudflare adapter. Pick it only if Cloudflare's CPU/streaming model proves unworkable.

#### 3. Fly.io

The escape hatch if the workload ever needs a genuinely long-lived process — Fly runs a real Node server with no streaming time limits at all, ideal if multi-round LLM sessions outgrow any serverless streaming model. The costs are the loss of the free tier (card from day one), single-region-by-default deployment (undercutting global reach), and the extra container/Dockerfile surface a solo dev and an agent both have to maintain.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. **The 10 ms free-tier CPU cap will silently fail SSR.** Astro SSR rendering plus assembling/coordinating LLM stream chunks routinely exceeds 10 ms of CPU per request. On the free plan this returns `Error 1102 (Worker exceeded CPU)` intermittently under load — a confusing, load-dependent failure. Mitigation is simply the $5 plan, but a developer who assumes "free tier is fine for an MVP" gets burned.
2. **`nodejs_compat` is a partial shim, not Node.** Any advisor/LLM SDK or utility that reaches for a Node builtin outside the supported subset (`fs`, raw `net`, some `crypto`/`stream` internals) breaks at runtime on workerd, not at build time. The OpenRouter/LLM client and Supabase SSR client must be verified against the Workers runtime, not assumed to "just work" because they work in `astro dev`.
3. **The `disable_nodejs_process_v2` flag is a live footgun.** Without it, newer workerd's process-v2 emulation makes Astro's internal `isNode` check return true, producing async-iterable response bodies workerd can't serialize — SSR pages render as literal `[object Object]`. This is a real, currently-open Astro/Cloudflare interaction that will not appear until deploy.
4. **Rollback restores code but not bound-resource state.** `wrangler rollback` reverts the Worker script only. If a release also ran a Supabase migration or changed a KV/D1/Durable Object binding, rolling back the code leaves the data layer on the new shape — a partial, inconsistent revert.
5. **50 subrequests per invocation on the free tier.** If a panel round fans out one `fetch()` per advisor plus retries plus Supabase calls, a busy round can brush against the free-tier subrequest ceiling. Paid raises it to 10,000, but it is another reason the free tier is a trap for this specific fan-out workload.

### Pre-Mortem — How This Could Fail

Six months in, the panel feature works in `astro dev` but is flaky in production. The team shipped on the free tier to "keep costs at zero," and under real use Workers throw intermittent 1102 CPU-exceeded errors whenever a session renders while several advisor streams are being coordinated — reproducible only under load, so it survived every manual test. Chasing it, they discover the LLM client library quietly depended on a Node stream internal that `nodejs_compat` only partially implements; streams truncate mid-response for certain payloads. Meanwhile an early deploy rendered every SSR page as `[object Object]` for an afternoon before someone found the `disable_nodejs_process_v2` flag buried in a blog post. The deeper miscalculation was treating "the scaffold already targets Cloudflare" as proof the runtime was validated, when in fact no advisor-streaming code had ever run on workerd — only on the Node-backed dev server. The edge runtime's constraint on long-running work, flagged as "the one gotcha" back in the tech-stack doc, turned out to be the central integration risk, not a footnote.

### Unknown Unknowns

- **`astro dev` does not run on workerd.** The local dev server is Node-backed, so a feature can pass every local test and still break in production on the real Workers runtime. Test against `wrangler dev` (workerd) *before* trusting a streaming feature — the general Astro docs won't stress this.
- **"No wall-clock limit on responses" is not "no limit."** The generous streaming behavior holds only while the client stays connected and time is spent *awaiting* `fetch()` (which doesn't count as CPU). Actual token-assembly work still burns the CPU-ms budget; a stream that does heavy per-chunk computation can still hit the CPU cap even though it "isn't taking wall-clock time."
- **Cloudflare Pages is in maintenance mode.** New full-stack features (Workflows, Containers, Secrets Store) ship Workers-only, and Cloudflare steers new Astro projects to Workers-with-static-assets. Any tutorial that says "deploy Astro to Cloudflare Pages" is now the legacy path — follow the Workers path (which the repo already uses).
- **Hyperdrive exists for a reason you'll eventually hit.** Calling Supabase Postgres directly from many concurrent Worker invocations can exhaust the connection pool. Supabase-over-HTTP (`@supabase/ssr`) sidesteps this today, but if any code ever opens a direct Postgres connection from a Worker, Hyperdrive (GA) becomes mandatory, not optional.
- **Bundle-size and cold-start behavior differ from Node.** Workers isolates start fast but the 64 MiB bundle ceiling and 128 MB memory are fixed; a heavy dependency tree (or bundling a Node-only lib that should have been dynamically imported) fails at deploy, not locally.

## Operational Story

- **Preview deploys**: `wrangler versions upload` publishes a preview (versioned) URL without promoting to production; `wrangler versions deploy` promotes. Gradual/percentage rollouts are supported (GA). Git-connected preview URLs are available via the Workers Builds integration; protect them with Cloudflare Access if they must not be public.
- **Secrets**: `SUPABASE_URL`, `SUPABASE_KEY`, and the LLM/OpenRouter key live in Workers Secrets (`wrangler secret put <NAME>`), declared server-only in `astro.config.mjs` `env.schema`. Local dev reads them from `.dev.vars` (gitignored); the Node/Supabase CLI reads `.env` — keep both in sync (per CLAUDE.md). Never commit either. Rotation: `wrangler secret put` overwrites; redeploy not required for the new value to take effect on the next invocation.
- **Rollback**: `wrangler rollback [<version-id>]` reverts the Worker to a previous version, typically in seconds. **Caveat:** this reverts *code only* — Supabase migrations and any KV/D1/DO state are not rolled back. If a release included a DB migration, plan a matching down-migration separately.
- **Approval**: An agent may run `wrangler deploy`, `wrangler tail`, `wrangler versions upload`, and read-only status commands unattended. **Human-only:** rotating the Supabase primary/service-role key, dropping or destructively migrating Supabase tables, changing the Cloudflare account's billing tier, and any resource-binding deletion. Use a Workers-scoped API token (that one project, no DNS, no unrelated Secrets, no billing), stored in an env var — never committed to the repo or `.mcp.json`.
- **Logs**: `wrangler tail` streams live runtime logs (JSON-parseable, filterable by status/method) for read-only agent inspection. Workers Observability (dashboard) and the official Cloudflare MCP server (`observability` server, OAuth) expose logs and metrics as structured tools for agent queries when CLI parsing gets tedious.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Free-tier 10 ms CPU cap fails SSR + stream orchestration under load (Error 1102) | Devil's advocate / Research finding | H | H | Subscribe to the $5/mo Workers Paid plan before launch; set `cpu_ms` higher if needed (raisable to 5 min on paid). |
| `disable_nodejs_process_v2` flag not set → SSR pages render as `[object Object]` | Unknown unknowns / Research finding | M | H | Add the compatibility flag to `wrangler.jsonc` and verify with `wrangler dev` before first production deploy. |
| LLM/Supabase client depends on a Node builtin not covered by `nodejs_compat` → runtime break or truncated stream | Pre-mortem / Devil's advocate | M | H | Validate the advisor-streaming path against `wrangler dev` (workerd), not `astro dev`, before trusting it; guard/dynamically import Node-only code. |
| `astro dev` (Node) hides workerd-only failures until production | Unknown unknowns | M | M | Make `wrangler dev` the pre-deploy smoke target for any streaming feature; run `npm run smoke` against a wrangler-served build. |
| Code rollback leaves Supabase schema on the newer migration → inconsistent state | Devil's advocate | L | M | Pair every forward migration with a tested down-migration; treat DB rollback as a separate manual step from `wrangler rollback`. |
| Free-tier 50-subrequest ceiling hit by a fan-out panel round | Devil's advocate | L | M | Paid plan raises to 10,000; batch/limit per-round LLM calls; enforce the PRD's round limit. |
| Direct Supabase Postgres connections from Workers exhaust the pool at scale | Unknown unknowns / Research finding | L | M | Stay on `@supabase/ssr` (HTTP); adopt Hyperdrive (GA) if any direct Postgres connection is ever introduced. |

## Getting Started

The scaffold already ships `@astrojs/cloudflare` and `wrangler.jsonc`, so these are validation-and-wire steps, not a fresh setup:

1. **Confirm the runtime flag.** Ensure `wrangler.jsonc` sets `nodejs_compat` **and** the `disable_nodejs_process_v2` compatibility flag, then run `npx wrangler dev` and load an SSR page to confirm it renders (not `[object Object]`). This validates the workerd runtime, which `astro dev` does not exercise.
2. **Set secrets against the live project:** `npx wrangler secret put SUPABASE_URL`, `... SUPABASE_KEY`, and the LLM/OpenRouter key. Mirror them into `.dev.vars` (gitignored) for local `wrangler dev`.
3. **Subscribe to the Workers Paid ($5/mo) plan** before real use — the free tier's 10 ms CPU cap will not carry SSR + streaming.
4. **First deploy:** `npm run build && npx wrangler deploy`. Then verify the streamed advisor path end-to-end against the deployed URL (not just local), since streaming is the runtime-specific risk.
5. **Wire read-only observability:** confirm `npx wrangler tail` streams logs; optionally connect the official Cloudflare observability MCP server for structured log/metric queries from the agent.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup
- Production-scale architecture (multi-region failover, HA, DR)

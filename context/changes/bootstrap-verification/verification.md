---
bootstrapped_at: 2026-09-15T11:03:08Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: panel-ekspertow
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: panel-ekspertow
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: true
  has_ai: true
  has_background_jobs: false
```

### Why this stack (verbatim from hand-off)

Panel Ekspertów is a solo, after-hours web app with a 3-week MVP budget that needs
accounts with per-user session isolation (FR-001), persisted session history
(FR-006/FR-008), and live token-streamed LLM advisor responses (FR-009). The
recommended default for a JS/TS web app — Astro + React + TypeScript + Tailwind
CSS + Supabase + Cloudflare — covers auth, PostgreSQL, and storage out of the box
via Supabase
(with row-level security backing the per-user isolation guardrail), while Astro
API routes on Cloudflare Workers handle streamed LLM responses at the edge. The
starter clears all four agent-friendly gates (typed, convention-based, popular in
training data, well-documented), which matters for a short solo timeline built
with AI agents. Scaffolding confidence is first-class: expected to work, with
occasional manual steps possible. Deployment lands on Cloudflare Pages (the
starter default); CI runs on GitHub Actions with auto-deploy on merge. Payments
and background jobs are out of scope per the PRD; the edge runtime's constraint
on long-running tasks is the one gotcha to watch if multi-round LLM sessions ever
outgrow streaming-response limits.

## Pre-scaffold verification

| Signal      | Value                                                              | Severity | Notes                                                          |
| ----------- | ------------------------------------------------------------------ | -------- | -------------------------------------------------------------- |
| npm package | not run                                                             | —        | cmd_template starts with `git clone`; no npm CLI package to check |
| GitHub repo | przeprogramowani/10x-astro-starter last pushed 2026-09-12T21:16:08Z | fresh    | from card.docs_url; checked via public GitHub API (`gh` was unauthenticated) |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 22 top-level entries (.env.example, .github/, .gitignore, .husky/, .nvmrc, .prettierrc.json, .vscode/, AGENTS.md, astro.config.mjs, CLAUDE.md → CLAUDE.md.scaffold, components.json, eslint.config.js, node_modules/, package.json, package-lock.json, public/, scripts/, src/, supabase/, tsconfig.json, wrangler.jsonc, README.md)
**Conflicts (.scaffold siblings)**: CLAUDE.md.scaffold
**.gitignore handling**: moved silently (absent in cwd)
**.bootstrap-scaffold cleanup**: deleted (cloned `.git/` removed before move-up; empty dir removal required a retry due to a transient Windows file-handle lock)

Notes: `npm install` completed with 654 packages added and 0 vulnerabilities at install time. Two non-fatal `EBADENGINE` warnings: `astro-eslint-parser@3.1.0` and `eslint-plugin-astro@3.1.0` request node `^22.22.3 || ^24.16.0 || >=26.3.0`; local node is v22.22.2 (one patch behind). Consider a node upgrade to silence the warnings.

## Post-scaffold audit

**Tool**: npm audit --json
**Summary**: 0 CRITICAL, 0 HIGH, 0 MODERATE, 0 LOW
**Direct vs transitive**: no findings to split (804 total dependencies: 377 prod, 269 dev, 167 optional)

No advisories reported. Clean tree.

## Hints recorded but not acted on

| Hint                    | Value            |
| ----------------------- | ---------------- |
| bootstrapper_confidence | first-class      |
| quality_override        | false            |
| path_taken              | standard         |
| self_check_answers      | null             |
| team_size               | solo             |
| deployment_target       | cloudflare-pages |
| ci_provider             | github-actions   |
| ci_default_flow         | auto-deploy-on-merge |
| has_auth                | true             |
| has_payments            | false            |
| has_realtime            | true             |
| has_ai                  | true             |
| has_background_jobs     | false            |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Review any `.scaffold` siblings the conflict policy created and decide which version of each file to keep.
- Address audit findings per your project's risk tolerance — the full breakdown is in this log.

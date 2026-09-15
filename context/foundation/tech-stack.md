---
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
---

## Why this stack

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

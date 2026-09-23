# Trwałość sesji + RLS izolacji per użytkownik (F-02) — Plan Brief

> Full plan: `context/changes/session-store-rls/plan.md`

## What & Why

Build the data-persistence foundation for Panel Ekspertów: the first Supabase migration (`sessions` + `advisor_opinions` with RLS), the first domain types + repository, and an automated proof that RLS isolates users. It exists to satisfy FR-001/FR-006 (a user saves sessions to their account and sees only their own) and the product's core privacy guardrail — and to establish the migration/RLS and Repository patterns every later data slice reuses.

## Starting Point

`supabase/` has only `config.toml` — no migrations, no tables. `src/lib/` has the F-01 LLM layer but no `repositories/` and no `src/types/`. The shapes to persist already exist in code: `PanelInput = { decision, context? }` and `AdvisorOpinion = { score 1–10, thesis, arguments[] }` across four persona ids. Backend rules (`.claude/rules/backend.md` §4/§7) already fix most schema mechanics.

## Desired End State

`supabase db reset` yields two RLS-protected tables; `SessionRepository` creates a session, saves a round's opinions, and lists/fetches the caller's own sessions as typed domain objects; `npm run smoke:rls` proves user B cannot touch user A's data. Lint/check/build stay green and the RLS proof runs in CI.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Round modeling | `round_number` column on `advisor_opinions` (default 1) | S-02 inserts round-2 rows with no schema change — minimal now, additive-friendly | Plan |
| Session lifecycle | `status` enum (`active`/`completed`), default `active` | S-03 flips to `completed` at synthesis with no migration | Plan |
| Opinion storage | Typed columns (`score int`, `thesis text`) + `arguments jsonb` | Scores stay queryable for the >2pkt spread metric; arguments stay flexible | Plan |
| F-02 layer scope | Migration + domain types + repository (no service, route, or UI) | Mirrors how F-01 built the lib layer without endpoints; S-01 wires the route | Plan |
| RLS verification | Dependency-free node script vs local Supabase, wired into CI | Exercises real Postgres policies end-to-end, matching the existing smoke convention | Plan |
| Delete/retention (OQ#3) | Cascade from `auth.users`, hard-delete, user may delete own sessions | Account deletion self-cleans and users control their decision data — privacy-aligned MVP stance | Plan |

## Scope

**In scope:**
- Migration: `sessions` + `advisor_opinions`, RLS enabled, per-op policies for `authenticated`, cascades, CHECK constraints.
- `src/types/session.ts` domain types + Zod row schemas + mappers.
- `SessionRepository` (create / saveOpinions / listSessions / getSession) returning typed domain objects via `Result`.
- `scripts/rls-smoke.mjs` + `smoke:rls` script + CI wiring.

**Out of scope:**
- Round-two/attribution/synthesis modeling (S-02/S-03), any API route or service (S-01), any UI.
- Soft-delete, audit trail, retention automation; pagination cursor; rate limiting; the CI `master`/`main` trigger mismatch.

## Architecture / Approach

Bottom-up, each layer independently verifiable: migration (schema+RLS) → domain types + repository (rows mapped to typed objects, RLS-aware via the cookie client) → RLS isolation proof (two real users against local Postgres). `round_number` and `status` are the only forward hooks so S-02/S-03 extend by inserting/updating, never by editing the applied migration.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Migration — schema + RLS | Two RLS-protected tables with per-op policies + cascades | A missing `WITH CHECK` on `update` leaves a `user_id`-reassign hole |
| 2. Types + repository | Domain types, row schemas, `SessionRepository` returning typed objects | Row→domain mapping drift from column definitions |
| 3. RLS proof + verification | `smoke:rls` script proving isolation, wired into CI | Script must hit real Postgres, not a mock, to be meaningful |

**Prerequisites:** Local Supabase CLI running for schema apply + RLS proof; `.env`/`.dev.vars` in sync. Parallel to F-01 (no dependency on it).
**Estimated effort:** ~2–3 sessions across 3 phases.

## Open Risks & Assumptions

- **Privacy/retention (roadmap + PRD OQ#3, Owner: user, non-blocking):** MVP commits to hard-delete + cascade; a formal retention policy may later require soft-delete/audit — an additive migration if so.
- **Assumption:** F-02's isolation rests on RLS alone; the defense-in-depth service-level ownership check arrives with S-01's endpoint. The smoke test is what makes RLS-alone trustworthy here.
- **Assumption:** local email confirmation stays off (`config.toml`), so the two-user smoke script can sign in without inbox steps.

## Success Criteria (Summary)

- A user's sessions and opinions are readable/writable only by that user — proven by `npm run smoke:rls` exiting 0.
- The migration applies cleanly from scratch and the repository returns typed domain objects with no raw rows leaking.
- `npm run test`, `astro check`, `npm run lint`, `npm run build` all pass; RLS proof runs in CI.

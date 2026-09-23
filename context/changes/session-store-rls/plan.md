# Trwałość sesji + RLS izolacji per użytkownik (F-02) — Implementation Plan

## Overview

Build the F-02 data-persistence foundation for Panel Ekspertów: the project's **first Supabase migration** (two tables — `sessions` and `advisor_opinions` — with RLS enabled and one policy per operation per role), the project's **first domain types + repository** (`src/types/session.ts`, `SessionRepository` in `src/lib/repositories/`), and an **automated RLS-isolation proof** (`scripts/rls-smoke.mjs`, wired into CI). It establishes the two reusable patterns every later data slice depends on: the migration/RLS convention and the Repository pattern. It serves FR-001 (user sees only their own sessions), FR-006 (session saved to account, returnable), and the per-user isolation guardrail. It deliberately excludes round-two/attribution/synthesis modeling, any API route, any service, and any UI — those belong to S-01+.

## Current State Analysis

- `supabase/` holds only `config.toml` and `.gitignore` — **zero migrations, zero tables**. This is the first migration in the repo, so it sets the template every later data slice copies. Local config has `enable_confirmations = false` (`supabase/config.toml:209`), `[db.migrations] enabled = true`, and `major_version = 17`.
- `src/lib/` has the F-01 lib layer (adapters, advisors, prompts, schemas, errors, logger, result) but **no `src/lib/repositories/` and no `src/types/`** — F-02 creates both.
- The domain shape to persist already exists in code from F-01: `PanelInput = { decision: string; context?: string }` (session input, FR-002) at `src/lib/advisors/registry.ts:19-24`, and `AdvisorOpinion = { score: 1–10 int; thesis: string; arguments: string[] }` per persona at `src/lib/schemas/advisor.ts:9-20`. The four persona ids are `"optymista" | "sceptyk" | "pragmatyk" | "analityk"` (`src/lib/advisors/registry.ts:26`).
- `.claude/rules/backend.md` §4 + §7 pre-decide the schema mechanics: RLS enabled, one policy per op per role, `user_id uuid references auth.users not null default auth.uid()`, `created_at timestamptz default now()`, migrations forward-only + additive with a `-- FR-xxx` header comment, repositories return typed domain objects (mapping in the repo, never raw rows), and defense-in-depth = RLS + explicit ownership check in the service (the ownership check lands in S-01's service; F-02's repo trusts RLS + the anon cookie client).
- Supabase client factory returns `null` when env is missing (`src/lib/supabase.ts:5-8`) — the null-degradation pattern the repository's callers (S-01) will honor.
- `@supabase/supabase-js` is already a dependency (`package.json:25`), so the RLS smoke script needs no new packages.
- CI (`.github/workflows/ci.yml`) has a `smoke` job that boots local Supabase (`supabase start …`) and captures `API_URL`/`ANON_KEY` into `.env`/`.dev.vars` before running `npm run smoke`. An `smoke:rls` step can reuse that same booted instance.

### Key Discoveries:

- Schema conventions (authoritative): `.claude/rules/backend.md:60-66` — RLS + per-op/per-role policies, `user_id` default `auth.uid()`, `created_at` default `now()`, forward-only additive migrations with `-- FR-xxx` header, typed domain objects from repositories.
- Migration naming: shared rules + CLAUDE.md — `supabase/migrations/YYYYMMDDHHmmss_short_description.sql`.
- Domain types to persist: `src/lib/schemas/advisor.ts:9-20` (`AdvisorScore`, `AdvisorOpinion`), `src/lib/advisors/registry.ts:19-26` (`PanelInput`, `AdvisorPersonaId`).
- Repository pattern precedent for the null-env client: `src/lib/supabase.ts:5-8`.
- Smoke-script convention (dependency-free node, cookie/HTTP against a live target): `scripts/smoke.mjs:1-36`. The RLS script differs — it talks to Supabase directly via `@supabase/supabase-js`, not the app.
- CI local-Supabase boot + env capture: `.github/workflows/ci.yml:35-47`.
- Pre-existing mismatch (noted, **not fixed here**): CI triggers on `master` (`ci.yml:5-7`) but the default branch is `main`.

## Desired End State

A developer can run `supabase db reset` (or `supabase migration up`) and get a `sessions` table and an `advisor_opinions` table, both RLS-protected so a user can read/write only their own rows. `src/types/session.ts` exports the `Session` and `AdvisorOpinionRecord` domain types, and `SessionRepository` (constructed from the cookie-based Supabase client) can create a session, save a round's advisor opinions, list the caller's sessions, and fetch one by id — returning typed domain objects, never raw rows. `npm run smoke:rls` proves, against local Supabase, that user B cannot select/update/delete user A's session or opinions. `npm run lint`, `astro check`, and `npm run build` stay green; the new script is wired into CI's smoke job.

**How to verify:** `supabase db reset` applies the migration cleanly; `npm run smoke:rls` exits 0 (all cross-access attempts denied, all own-access attempts allowed); `astro check` + `npm run lint` + `npm run build` pass.

## What We're NOT Doing

- No round-two, attribution, or synthesis columns/tables — S-02/S-03 add those via forward-only additive migrations (the `round_number` column and `status` enum are the only forward hooks placed now).
- No API route, no `src/pages/api/sessions/**` — S-01 wires repository → service → route and owns the persistence endpoint.
- No `SessionService` and no explicit ownership check in a service — that defense-in-depth layer lands in S-01 alongside the endpoint that needs it. F-02 relies on RLS (proven by the smoke test) for isolation.
- No UI, no React components, no advisor avatars — S-01+.
- No soft-delete, audit trail, or retention automation — hard-delete with cascade is the MVP stance (roadmap OQ#3); revisit if a retention policy is later defined.
- No rate limiting, idempotency keys, or pagination cursor implementation — the repository's list method takes a `limit` from day one (per backend rules §4 "any list endpoint is paginated"), but cursor pagination attaches when S-05 (history) needs it.
- No changes to the CI trigger branch mismatch (`master` vs `main`) — out of scope, flagged for a separate chore.

## Implementation Approach

Build bottom-up so each layer is verifiable before the next depends on it: (1) the migration (schema + RLS) as the foundation of record, verified by applying it locally; (2) the domain types + Zod row schemas + `SessionRepository` that map rows to typed objects, verified by unit tests with a mocked Supabase client; (3) the RLS isolation proof that exercises real Postgres policies with two real users, verified by the script exiting 0 and wired into CI. The `round_number` column (default 1) and `status` enum (default `'active'`) are the only concessions to future slices — both let S-02/S-03 insert new data without editing the applied migration, honoring the forward-only rule.

## Critical Implementation Details

- **RLS `USING` vs `WITH CHECK` must both be set correctly.** `select`/`delete` policies use `USING (auth.uid() = user_id)`; `insert` uses `WITH CHECK (auth.uid() = user_id)`; `update` needs **both** `USING` (which existing rows are visible to update) and `WITH CHECK` (the new row still belongs to the caller). A missing `WITH CHECK` on update would let a user reassign a row's `user_id` — exactly the isolation hole this foundation exists to close, so the smoke test must cover the update-reassign attempt.
- **`advisor_opinions` isolation is transitive through `sessions`.** Opinions have their own `user_id` (denormalized, `default auth.uid()`) so each table's RLS is self-contained and the smoke test can assert per-table — do not rely solely on the FK to `sessions` for the opinion policies, or a direct query on `advisor_opinions` would bypass session-level checks.
- **`anon` role gets no policies (deny-by-default).** With RLS enabled and no `anon` policy, the anon role is denied every operation — which is the intended per-role outcome. State this explicitly in the migration comment rather than writing permissive-then-restrictive policies; backend rules §4 asks for per-op/per-role coverage, and "no policy = denied" is that coverage for `anon`.

## Phase 1: Migration — schema + RLS policies

### Overview

Author the first Supabase migration: `sessions` and `advisor_opinions` tables with the mandated column conventions, CHECK constraints, cascade deletes, RLS enabled, and one policy per operation for the `authenticated` role (with `anon` denied by absence). Verified by applying it against local Supabase.

### Changes Required:

#### 1. Sessions + advisor_opinions migration

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_create_sessions_and_advisor_opinions.sql`

**Intent**: Create the minimal persistence schema (FR-001, FR-006) and establish the RLS-isolation pattern (guardrail) that every later data slice reuses. Header comment references `FR-001`, `FR-006`, and the isolation guardrail.

**Contract**:
- `sessions`: `id uuid primary key default gen_random_uuid()`, `user_id uuid not null default auth.uid() references auth.users(id) on delete cascade`, `decision text not null`, `context text` (nullable — FR-002 context optional), `status text not null default 'active'` with `check (status in ('active','completed'))`, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`.
- `advisor_opinions`: `id uuid primary key default gen_random_uuid()`, `session_id uuid not null references sessions(id) on delete cascade`, `user_id uuid not null default auth.uid() references auth.users(id) on delete cascade`, `persona_id text not null` with `check (persona_id in ('optymista','sceptyk','pragmatyk','analityk'))`, `round_number integer not null default 1 check (round_number >= 1)`, `score integer not null check (score between 1 and 10)`, `thesis text not null`, `arguments jsonb not null default '[]'::jsonb`, `created_at timestamptz not null default now()`. Add a unique constraint on `(session_id, persona_id, round_number)` (one opinion per persona per round).
- Index `advisor_opinions(session_id)` and `sessions(user_id, created_at desc)` (list-own-sessions access path).
- `alter table … enable row level security` on both.
- Per-op policies for `authenticated`: `select`/`delete` with `using (auth.uid() = user_id)`; `insert` with `with check (auth.uid() = user_id)`; `update` with `using (auth.uid() = user_id) with check (auth.uid() = user_id)`. No `anon` policies (deny-by-default) — stated in a comment.
- Forward-only, never edited after apply.

### Success Criteria:

#### Automated Verification:

- Migration applies cleanly from scratch: `supabase db reset`
- Type checking passes: `astro check`
- Linting passes: `npm run lint`

#### Manual Verification:

- Migration filename matches `YYYYMMDDHHmmss_*.sql`; header comment cites FR-001/FR-006 + isolation guardrail.
- In Supabase Studio (or `psql`), both tables show RLS enabled and exactly four `authenticated` policies each; no `anon` policy exists.

---

## Phase 2: Domain types + repository

### Overview

Add the first domain types (`src/types/session.ts`), Zod row schemas that validate DB rows at the boundary, and `SessionRepository` — the reusable, RLS-aware data-access layer that maps rows to typed domain objects. Verified by unit tests with a mocked Supabase client.

### Changes Required:

#### 1. Domain types

**File**: `src/types/session.ts`

**Intent**: Define the typed domain objects the repository returns (never raw Supabase rows), per backend rules §4.

**Contract**: `type SessionStatus = "active" | "completed"`; `type Session = { id: string; userId: string; decision: string; context: string | null; status: SessionStatus; createdAt: string; updatedAt: string }`; `type AdvisorOpinionRecord = { id: string; sessionId: string; userId: string; personaId: AdvisorPersonaId; roundNumber: number; score: number; thesis: string; arguments: string[]; createdAt: string }`. Reuse `AdvisorPersonaId` from `@/lib/advisors/registry`.

#### 2. Row schemas + mapping

**File**: `src/lib/schemas/session.ts`

**Intent**: Validate DB rows (a boundary per shared rules "every boundary … validated with Zod") and centralize snake_case-row → camelCase-domain mapping used by the repository.

**Contract**: `SessionRowSchema` / `AdvisorOpinionRowSchema` (snake_case fields matching columns; `arguments` parsed as `z.array(z.string())`), plus `toSession(row)` / `toAdvisorOpinion(row)` mappers returning the `src/types/session.ts` domain types. `score`/`status`/`persona_id` bounds mirror the DB CHECK constraints.

#### 3. Session repository

**File**: `src/lib/repositories/session.repository.ts`

**Intent**: All Supabase queries for sessions/opinions live here, returning domain types via `Result` (per backend rules §1–2, §6). Constructed with the cookie-based client so RLS applies to every query.

**Contract**: `class SessionRepository { constructor(client: SupabaseClient) }` (client is the non-null result of `createClient`; caller handles the null case). Methods, each returning `Promise<Result<T, AppError>>`:
- `createSession(input: { decision: string; context?: string }): Result<Session>` — inserts one row (relies on `default auth.uid()`), returns the mapped `Session`.
- `saveOpinions(sessionId: string, roundNumber: number, opinions: { personaId: AdvisorPersonaId; opinion: AdvisorOpinion }[]): Result<AdvisorOpinionRecord[]>` — batch insert (no N+1), returns mapped records.
- `listSessions(opts?: { limit?: number }): Result<Session[]>` — caller's own sessions (RLS-scoped), ordered `created_at desc`, default `limit` (e.g. 50) per backend rules §4.
- `getSession(id: string): Result<Session | null>` — one session by id (RLS returns nothing for others' rows → maps to `null`, not an error).
Map Supabase errors to `AppError` subclasses; never return raw `PostgrestError`. Add a `NotFoundError`/`DB_ERROR` code to `@/lib/errors` if not already present.

### Success Criteria:

#### Automated Verification:

- Unit tests (mocked Supabase client) cover create/save/list/get, row→domain mapping, and error→`Result.err` mapping: `npm run test`
- Type checking passes: `astro check`
- Linting passes: `npm run lint`

#### Manual Verification:

- Code review confirms no Supabase query exists outside `session.repository.ts`, and every method returns a domain type (never a raw row) via `Result`.

---

## Phase 3: RLS isolation proof + verification

### Overview

Add a dependency-free node script that creates two users against local Supabase and asserts complete cross-user isolation on both tables (including the update-reassign hole), wire it into `package.json` and the CI smoke job, and document the local-migration + env-sync steps.

### Changes Required:

#### 1. RLS isolation smoke script

**File**: `scripts/rls-smoke.mjs`

**Intent**: Prove the guardrail — the whole point of F-02 — by exercising real Postgres RLS with two authenticated users, so isolation regressions in later policy-touching slices are caught automatically.

**Contract**: Uses `@supabase/supabase-js` (already a dep) with `SUPABASE_URL`/`SUPABASE_KEY` (anon key) from env; skips with a clear message + exit 0 when env is absent (keeps non-Supabase runs green). Signs up/signs in user A and user B (email confirmation is off locally). Asserts: A creates a session + opinions; A can select/update its own; **B's select returns zero rows** for A's session and opinions; B's update/delete of A's rows affects zero rows; B's attempt to insert a row with `user_id = A` (or update A's row to reset `user_id`) is rejected. Exits non-zero on any leaked access. Add `"smoke:rls": "node scripts/rls-smoke.mjs"` to `package.json`.

#### 2. CI wiring

**File**: `.github/workflows/ci.yml`

**Intent**: Run the RLS proof against the local Supabase the smoke job already boots.

**Contract**: In the `smoke` job, after `supabase start` + env capture and before/after the existing preview smoke, run `supabase migration up` (apply the new migration to the booted instance) and `SUPABASE_URL=$API_URL SUPABASE_KEY=$ANON_KEY npm run smoke:rls`. Do not alter the `on:` triggers (the `master`/`main` mismatch is out of scope).

#### 3. Docs — migrations + env sync

**File**: `README.md` (Supabase section)

**Intent**: Record how to apply migrations locally and keep `.env`/`.dev.vars` in sync (the split called out in CLAUDE.md §Environment), so a fresh checkout can run the schema + RLS proof.

**Contract**: Add a short "Database migrations" note: `supabase db reset` / `supabase migration up`, and `npm run smoke:rls` against local Supabase. No secrets committed.

### Success Criteria:

#### Automated Verification:

- `npm run smoke:rls` against local Supabase exits 0 with all cross-access attempts denied and all own-access attempts allowed: `npm run smoke:rls`
- Full suite, type check, lint, build pass: `npm run test` && `astro check` && `npm run lint` && `npm run build`

#### Manual Verification:

- Reading the script output, every isolation assertion (B cannot select/update/delete/reassign A's rows, on both tables) is exercised and named.
- CI smoke job (or a local reproduction of its steps) runs `smoke:rls` green after applying the migration.

---

## Testing Strategy

### Unit Tests:

- Row schema validation: valid/invalid `SessionRow` and `AdvisorOpinionRow` (score out of range, bad `persona_id`, malformed `arguments`).
- Mapping: `toSession`/`toAdvisorOpinion` produce correct camelCase domain objects, including `context: null`.
- Repository (mocked client): create/save/list/get happy paths; Supabase error → `Result.err(AppError)`; `getSession` of an absent/other-user id → `ok(null)`.

### Integration Tests:

- `scripts/rls-smoke.mjs` against local Supabase is the integration-level proof (two real users, real policies). No mocked DB here — it must hit Postgres.

### Manual Testing Steps:

1. `supabase db reset`, then inspect both tables in Studio: RLS on, four `authenticated` policies each, no `anon` policy.
2. `SUPABASE_URL=… SUPABASE_KEY=… npm run smoke:rls` and read that each isolation assertion passes.
3. Attempt (in Studio SQL editor, impersonating a JWT) to update another user's session `user_id` — confirm rejection.

## Performance Considerations

Minimal at foundation stage. The `sessions(user_id, created_at desc)` index serves the list-own-sessions path (S-05); `advisor_opinions(session_id)` serves opinion fetches. Batch insert in `saveOpinions` avoids N+1 for the four-persona round. `max_rows = 1000` (config.toml) caps accidental large reads; the repository's `limit` keeps list reads bounded.

## Migration Notes

First migration in the repo — forward-only and additive from here. S-02 (round two) inserts rows with `round_number = 2` and needs no schema change; S-03 (synthesis) flips `status` to `'completed'` and adds its own synthesis storage via a new migration. Consumers must run `supabase migration up` (or `db reset`) after pulling this change; `.env` and `.dev.vars` must both carry `SUPABASE_URL`/`SUPABASE_KEY` (CLAUDE.md §Environment).

## References

- Roadmap item: `context/foundation/roadmap.md` F-02 (§Foundations, `session-store-rls`)
- Change identity: `context/changes/session-store-rls/change.md`
- PRD: `context/foundation/prd.md` FR-001, FR-006, §Success Criteria (guardrail), §Access Control; OQ#3 (privacy/retention)
- Backend rules (authoritative schema + repository conventions): `.claude/rules/backend.md` §1–2, §4, §7
- Domain shapes to persist: `src/lib/schemas/advisor.ts:9-20`, `src/lib/advisors/registry.ts:19-26`
- Null-env client precedent: `src/lib/supabase.ts:5-8`
- Smoke-script convention: `scripts/smoke.mjs:1-36`; CI local-Supabase boot: `.github/workflows/ci.yml:35-47`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Migration — schema + RLS policies

#### Automated

- [x] 1.1 Migration applies cleanly from scratch: `supabase db reset` — 181072f
- [x] 1.2 Type checking passes: `astro check` — 181072f
- [x] 1.3 Linting passes: `npm run lint` — 181072f

#### Manual

- [x] 1.4 Migration filename matches `YYYYMMDDHHmmss_*.sql`; header cites FR-001/FR-006 + isolation guardrail
- [x] 1.5 Both tables show RLS enabled with four `authenticated` policies each and no `anon` policy

### Phase 2: Domain types + repository

#### Automated

- [x] 2.1 Unit tests cover create/save/list/get, row→domain mapping, and error→`Result.err` mapping: `npm run test` — 4a81583
- [x] 2.2 Type checking passes: `astro check` — 4a81583
- [x] 2.3 Linting passes: `npm run lint` — 4a81583

#### Manual

- [x] 2.4 Review confirms no Supabase query outside `session.repository.ts` and every method returns a domain type via `Result`

### Phase 3: RLS isolation proof + verification

#### Automated

- [x] 3.1 `npm run smoke:rls` exits 0 — all cross-access denied, all own-access allowed — 6b94b4e
- [x] 3.2 Full suite, type check, lint, build pass: `npm run test` && `astro check` && `npm run lint` && `npm run build` — 6b94b4e

#### Manual

- [x] 3.3 Script output exercises and names every isolation assertion on both tables
- [x] 3.4 CI smoke job runs `smoke:rls` green after applying the migration

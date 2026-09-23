<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Trwałość sesji + RLS izolacji per użytkownik (F-02)

- **Plan**: context/changes/session-store-rls/plan.md
- **Scope**: Full plan (Phases 1-3)
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-09-23
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — Zod `.parse()` throws unguarded, bypassing the Result pattern

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/repositories/session.repository.ts:49, 73, 89, 108
- **Detail**: `SessionRowSchema.parse(data)` / `AdvisorOpinionRowSchema.parse(row)` run unguarded after every successful Supabase call. If a row ever fails validation (schema drift, a future nullable column, a manual DB edit), this throws a raw `ZodError` out of an `async` method instead of returning `Result.err(...)`. `.claude/rules/backend.md` §2 requires the Result type instead of throwing across layers, and this is the first repository in the codebase — every later repository will likely copy this shape verbatim.
- **Fix A ⭐ Recommended**: Wrap each `.parse()` call in try/catch and return `err(new DbError("Invalid row shape", e))` on failure.
  - Strength: Restores the Result invariant at the exact boundary backend.md §2 calls out, and the fix is small (4 call sites, same pattern each time).
  - Tradeoff: A few extra lines of boilerplate per method; could be centralized into a `safeParse` helper later if the pattern repeats across future repositories.
  - Confidence: HIGH — matches the error-mapping pattern already used for Supabase `{data, error}` branches in the same file.
  - Blind spot: None significant — row shape is currently guaranteed to match by the migration, so this only guards a future drift scenario.
- **Fix B**: Leave as-is; document the assumption that row shape cannot diverge from the Zod schema today (only this repository writes these rows, migration and schema are co-located).
  - Strength: No code change; the current risk is genuinely near-zero.
  - Tradeoff: The uncaught-throw shape gets copied into every future repository as later slices add tables, at which point the "only this repo writes rows" assumption gets weaker.
  - Confidence: MEDIUM — reasonable for now, degrades as more write paths appear.
  - Blind spot: Haven't checked whether S-01+ will introduce other writers to these tables.
- **Decision**: FIXED (Fix A) — added a `parseRow()` helper using `schema.safeParse`; all 4 call sites now return `err(new DbError(...))` instead of throwing. Verified: lint, astro check, 59/59 tests pass.

### F2 — `interface` used where `type` is the project convention

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/types/session.ts:10, 20 (`Session`, `AdvisorOpinionRecord`); src/lib/repositories/session.repository.ts:20, 25, 30 (`DbResponse<T>`, `CreateSessionInput`, `SaveOpinionInput`)
- **Detail**: `.claude/rules/shared.md` says "Prefer `type` over `interface` unless declaration merging is needed." None of these need merging, and the sibling `src/lib/schemas/advisor.ts` already uses `type` (via `z.infer<...>`). `src/types/session.ts` is the first file in `src/types/`, so its `interface` usage is likely to get copied forward by later slices.
- **Fix**: Convert all five declarations from `interface` to `type` aliases.
- **Decision**: DISMISSED — false finding. Attempted the fix and `eslint` rejected it: `eslint.config.js:17` extends `tseslint.configs.stylisticTypeChecked`, which enforces `@typescript-eslint/consistent-type-definitions` requiring `interface` for object-shape declarations — the opposite of shared.md's plain-English "prefer type" line for this case. The original code was already correct per the enforced rule; reverted the edit. shared.md's wording should probably be read as "prefer type for unions/primitives/mapped types; interface is enforced for plain object shapes" but that's a docs clarification, not a code fix.

### F3 — `anon` role isolation relies on deny-by-absence, not explicit policies

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: supabase/migrations/20260923140522_create_sessions_and_advisor_opinions.sql:36-38
- **Detail**: `.claude/rules/backend.md` §4 reads "one policy per operation per role," which taken literally suggests explicit `anon` policies too. The migration instead relies on RLS's implicit deny-all when no policy matches a role, documented inline via comment, and the RLS smoke test doesn't need to (and can't meaningfully) prove a negative-policy absence differently than an explicit always-false policy would. Functionally correct and arguably cleaner — flagging only so this precedent (deny-by-absence, not explicit deny policies) is a conscious choice future migrations can follow, not an oversight this review missed.
- **Fix**: No code change needed. Optionally clarify backend.md §4 wording to explicitly allow "deny-by-absence, documented in a comment" as satisfying the per-role requirement.
- **Decision**: SKIPPED — design is sound as-is; not worth a backend.md wording edit right now.

### F4 — No `updated_at` refresh trigger on `sessions`

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architecture
- **Location**: supabase/migrations/20260923140522_create_sessions_and_advisor_opinions.sql:6-14
- **Detail**: `sessions.updated_at` defaults to `now()` on insert, but Postgres won't bump it automatically on `UPDATE` without a trigger. Inert today — the repository's contract has no `updateSession` method yet — but should be added before any code path updates a session row (the RLS smoke test's raw `UPDATE sessions SET status = 'completed'` doesn't touch `updated_at` either).
- **Fix**: Add a `BEFORE UPDATE` trigger to refresh `updated_at`, or have the future `updateSession` repository method set it explicitly, before an update path ships.
- **Decision**: SKIPPED — inert today, no `updateSession` method exists yet; revisit when an update path is actually implemented.

## Automated verification (re-run during this review)

- `npm run lint` — pass (3 unrelated pre-existing errors in `.claude/` tooling scripts, outside this change's scope)
- `astro check` — 0 errors, 0 warnings, 0 hints
- `npm run test` — 59/59 passed (10 new: session.repository.test.ts, 10 new: session.test.ts)
- `npm run build` — pass
- `supabase db reset` — migration applies cleanly
- `npm run smoke:rls` (against local Supabase) — all 15 isolation assertions passed

# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Astro underscore-prefixed route paths are private and won't route

**Context**: context/changes/advisor-llm-adapter/plan.md (route path referenced at 8 locations); actual file src/pages/api/debug/advisor-stream.ts

**Problem**: Plan specified src/pages/api/_debug/advisor-stream.ts, using an underscore prefix as a "non-production" marker. Astro treats any underscore-prefixed path segment as a private folder excluded from routing — the route compiled but 404'd at runtime. Fixed in commit a0a44f2, but the plan.md prose was never updated to match (8 stale references), leaving a misleading source of truth.

**Rule**: Never use a leading underscore in src/pages/** paths to mark a route as non-production/throwaway — Astro treats it as a private folder and silently excludes it from routing. Use a plain descriptive name (e.g. debug/) and mark non-production status in a comment instead. When a plan-specified path turns out to be un-routable, update the plan's prose (not just the Progress checklist) in the same commit.

**Applies to**: Any implementation plan or code that creates a route under src/pages/api/** or src/pages/**

## ESLint's stylisticTypeChecked overrides shared.md's type/interface preference for object shapes

**Context**: context/changes/session-store-rls/plan.md review (F2); files src/types/session.ts, src/lib/repositories/session.repository.ts

**Problem**: shared.md says "Prefer type over interface unless declaration merging is needed." Applying that literally to plain object-shape declarations (Session, AdvisorOpinionRecord, DbResponse<T>, CreateSessionInput, SaveOpinionInput) breaks eslint: eslint.config.js:17 extends tseslint.configs.stylisticTypeChecked, whose @typescript-eslint/consistent-type-definitions rule requires interface for object-shape type declarations. The implementation (interface) was correct; a review that only reads shared.md's prose would incorrectly flag it as a violation.

**Rule**: For plain object-shape type declarations, interface is required by the enforced ESLint stylisticTypeChecked rule, regardless of shared.md's general prose preference for type. Reserve type for unions, primitives, mapped/conditional types, and anything needing utility-type composition.

**Applies to**: Any TypeScript file in src/**; also /10x-impl-review and any manual review checking type vs interface usage

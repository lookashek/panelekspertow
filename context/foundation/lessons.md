# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Astro underscore-prefixed route paths are private and won't route

**Context**: context/changes/advisor-llm-adapter/plan.md (route path referenced at 8 locations); actual file src/pages/api/debug/advisor-stream.ts

**Problem**: Plan specified src/pages/api/_debug/advisor-stream.ts, using an underscore prefix as a "non-production" marker. Astro treats any underscore-prefixed path segment as a private folder excluded from routing — the route compiled but 404'd at runtime. Fixed in commit a0a44f2, but the plan.md prose was never updated to match (8 stale references), leaving a misleading source of truth.

**Rule**: Never use a leading underscore in src/pages/** paths to mark a route as non-production/throwaway — Astro treats it as a private folder and silently excludes it from routing. Use a plain descriptive name (e.g. debug/) and mark non-production status in a comment instead. When a plan-specified path turns out to be un-routable, update the plan's prose (not just the Progress checklist) in the same commit.

**Applies to**: Any implementation plan or code that creates a route under src/pages/api/** or src/pages/**

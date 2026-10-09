---
change_id: resume-session-round
title: Resume session round
status: planned
created: 2026-09-25
updated: 2026-09-29
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

- 2026-10-09: S-07 (session-quality-polish) made brevity the default for rounds 1-2 and now owns
  `StreamRequest.maxTokens` (`src/lib/adapters/llm-provider.ts`) plus the shared clause strings in
  `src/lib/prompts/brevity.ts` (`ARGUMENTS_LIMIT_CLAUSE`, `RATIONALE_BREVITY_CLAUSE`). The shared
  R1/R2 rationale `stream()` call site in `src/lib/advisors/run-panel.ts` now passes
  `maxTokens: RATIONALE_MAX_TOKENS` (350). S-06's planned `concise` flag should become a stricter
  tier for rounds > 2, reusing `brevity.ts`'s clauses and the now-existing `maxTokens` field rather
  than re-introducing either.

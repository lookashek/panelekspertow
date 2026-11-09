---
change_id: testing-round-two-attribution
title: Round-two attribution integrity
status: implemented
created: 2026-11-09
updated: 2026-11-09
archived_at: null
---

## Notes

Rollout Phase 2 of `context/foundation/test-plan.md`. Goal: prove that round-two attribution
is substantive, not theater — a cited author must trace to a real round-one argument.

Risk covered: #2 (round-two attribution is schema-valid but meaningless — a score change ships
with an author field that doesn't trace to a real round-one argument; "attribution theater").

Test types planned: contract/schema test + fixture-based referential-integrity test. Pure
unit tests on recorded fixtures — no live DB, no live LLM call, no browser e2e.

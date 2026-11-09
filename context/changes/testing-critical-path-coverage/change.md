---
change_id: testing-critical-path-coverage
title: Critical-path coverage - auth, ownership, API routes
status: implementing
created: 2026-11-09
updated: 2026-11-09
archived_at: null
---

## Notes

Rollout Phase 1 of `context/foundation/test-plan.md`. Goal: prove that every
session-scoped route fails closed on auth and ownership, and that the SSE
streaming lifecycle behaves on the edge runtime — close the largest,
highest-confirmed gap first and stand up the integration-test harness later
phases reuse.

Risks covered: #3 (zero coverage on API-route/streaming-hook layer, including
edge-runtime streaming-length limit) and #1 (session-scoped resource served to
a non-owning user — RLS regression or missing explicit service-side check).

Test types planned: integration tests against handlers/services with seeded
two-user Supabase fixtures; a documented check for SSE lifecycle/edge timeout.
Unit/integration only — no browser e2e for this phase.

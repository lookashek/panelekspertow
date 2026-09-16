---
paths:
  - "src/pages/api/**"
  - "src/lib/**"
  - "src/middleware.ts"
  - "src/types/**"
  - "supabase/**"
  - "astro.config.mjs"
  - "wrangler.jsonc"
---

# Backend rules (Astro API routes on Cloudflare Workers + Supabase)

## 1. Architecture — layered, thin edges

```
HTTP (src/pages/api/**)        → parse, validate, auth check, call ONE service, map result → Response
   ↓
Service (src/lib/services/)    → use-case orchestration, business rules, transactions, NO Request/Response types
   ↓
Repository (src/lib/repositories/) → all Supabase queries; returns domain types, never raw rows
   ↓
Adapters (src/lib/adapters/)   → external systems: LLM providers, mail, etc. Behind an interface.
```

Cross-cutting: `src/lib/errors.ts`, `src/lib/logger.ts`, `src/lib/schemas/` (Zod, shared with frontend), `src/types/` (domain types).

Rules of the layering:
- Dependencies point downward only. A repository never imports a service; a service never imports from `src/pages`.
- Handlers are ≤ ~30 lines. If a handler contains an `if` about business logic, that logic belongs in a service.
- Services receive dependencies as parameters (constructor or function args), never import singletons from module scope. This is what makes them testable and keeps Workers cold-start cheap.
- A service method = one use case, named as a verb: `startSession`, `runIsolatedRound`, `synthesizeVerdict`.

## 2. Design patterns that this project actually needs

Use these, and name them in the PR description when you introduce one:

| Pattern | Where | Why |
|---|---|---|
| **Repository** | every DB access | swap Supabase client, mock in tests, single place for RLS-aware queries |
| **Adapter / Port** | `LlmProvider` interface with `OpenRouterAdapter`, `AnthropicAdapter`, … | PRD requires multi-model panels; providers must be interchangeable |
| **Strategy** | advisor personas (`AdvisorStrategy`: buildPrompt, parseScore) | forced divergence = different strategies over the same input |
| **Factory** | `createSupabaseServerClient(ctx)`, `createLlmProvider(name)` | centralize env reading + null-handling |
| **Result type** | `Result<T, E>` instead of throwing across layers | Workers + streaming make thrown errors easy to lose |
| **Pipeline / Chain** | debate rounds: isolated opinions → scores → attributed changes → synthesis | each stage is a pure function `(state) => state`, easy to log and replay |
| **Command** (light) | `SessionCommand` objects persisted before execution | crash-safe: a round can be resumed from the last persisted command |

Do NOT introduce: generic base classes ("BaseService"), DI containers, event buses, CQRS. This is a 3-week MVP on an edge runtime.

## 3. API route conventions

- File = resource: `src/pages/api/sessions/index.ts` (GET list, POST create), `src/pages/api/sessions/[id].ts`, `src/pages/api/sessions/[id]/stream.ts`.
- Order inside a handler, always: (1) auth from `ctx.locals.user` → 401; (2) parse + Zod validate body/params → 400 with field errors; (3) call service; (4) map `Result` to status code; (5) return `Response` via `json()` helper from `@/lib/http`.
- JSON errors have one shape: `{ error: { code: string, message: string, details?: unknown } }`. Codes are string enums in `@/lib/errors`.
- Auth form routes (`/api/auth/*`) keep the existing redirect-with-`?error=` style — do not mix the two conventions.
- Streaming (FR-009): return `new Response(readable, { headers: { 'Content-Type': 'text/event-stream' } })`; write SSE frames `event: token|score|done|error`. Always handle `ctx.request.signal` abort and close the writer in `finally`.
- Idempotency: POSTs that create sessions/rounds accept an optional `Idempotency-Key` header; repository upserts on it.

## 4. Supabase & data

- Only the anon key on the request path, through the cookie-based client from `src/lib/supabase.ts`. `null` client → respond 503 `{ code: "NOT_CONFIGURED" }`, never crash.
- Service-role key is never used in request handlers. If a job ever needs it, it's a separate script, not an API route.
- Every table: RLS enabled, one policy per operation per role (`select`/`insert`/`update`/`delete` × `authenticated`/`anon`), `user_id uuid references auth.users not null default auth.uid()`, `created_at timestamptz default now()`.
- Migrations are forward-only and additive during MVP; never edit an applied migration. Include `-- FR-xxx` reference in the header comment.
- Repositories return typed domain objects (`Session`), not `Database['public']['Tables']['sessions']['Row']`. Mapping lives in the repository.
- No N+1: batch with `.in()` or a view. Any list endpoint is paginated (`limit`/`cursor`) from day one.

## 5. LLM integration

- All provider calls go through `LlmProvider` (`complete`, `stream`) — no direct `fetch` to a vendor from a service.
- Prompts are versioned files in `src/lib/prompts/<name>.v1.ts`, exported as functions of typed inputs. Never string-concatenate user input into a prompt without the schema-validated shape.
- Structured outputs (scores before rationale — PRD) are enforced: ask for JSON, validate with Zod, retry once with the validation error appended, then fail the round with `LLM_INVALID_OUTPUT`.
- Log per call: provider, model, persona, prompt version, token counts, latency, `session_id`. Never log prompt/response bodies at `info` level.
- Timeouts and cancellation are mandatory: `AbortSignal.timeout(ms)` combined with the request signal.
- Cloudflare Workers constraint: a handler never awaits more than one debate round. Each round is its own client-driven request with state persisted between rounds; long LLM work streams — do not "await the whole debate" in one handler.

## 6. Errors, logging, observability

- `AppError` base (`code`, `status`, `cause`) + specific subclasses (`NotFoundError`, `ValidationError`, `LlmError`). Map once in `@/lib/http` — handlers don't build error responses by hand.
- Logger: structured JSON, `{ level, msg, requestId, userId?, …fields }`. `requestId` is set in `middleware.ts` and passed down.
- Never swallow: `catch (e) {}` is a review blocker. Either handle and log, or rethrow wrapped.

## 7. Security

- Authorization is RLS + explicit ownership check in the service (defense in depth) — not one or the other.
- Secrets: `astro:env/server` only. Never `import.meta.env.*` for secrets, never in client code.
- CSRF: form-POST auth routes rely on SameSite cookies; API routes accept JSON only (`Content-Type` check) which blocks simple-form CSRF.
- Rate limit LLM-triggering endpoints per user (KV or DB counter) — cost guardrail.

## 8. Done checklist for a backend task

- [ ] Handler → service → repository split respected; no Supabase call outside a repository
- [ ] Input validated with Zod; error shape consistent
- [ ] New table has RLS + per-op policies + migration file named correctly
- [ ] Streaming endpoints handle abort and close writers
- [ ] `npm run lint && npm run build` pass; `npm run smoke` if auth/API touched
- [ ] PR names any pattern introduced and the FR it serves
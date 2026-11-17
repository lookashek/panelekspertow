import { describe, expect, it, vi } from "vitest";

import type { APIContext } from "astro";

// `create-llm-provider.ts` and `supabase.ts` read `astro:env/server` at module scope, which only
// resolves inside the Astro/Vite pipeline (not plain Vitest) — stub both so importing the route
// (via `SessionService`) doesn't fail.
vi.mock("@/lib/adapters/create-llm-provider", () => ({
  defaultAdvisorModel: () => "test-model",
}));
vi.mock("@/lib/supabase", () => ({
  createClient: () => null,
}));

import { DELETE } from "@/pages/api/sessions/[id]";

function makeContext(overrides: Partial<APIContext> = {}): APIContext {
  return {
    request: new Request("https://example.test/api/sessions/session-1", { method: "DELETE" }),
    cookies: { set: () => undefined, get: () => undefined } as unknown as APIContext["cookies"],
    locals: { user: null },
    params: { id: "session-1" },
    ...overrides,
  } as unknown as APIContext;
}

describe("DELETE /api/sessions/[id] — unauthenticated", () => {
  it("rejects with 401 UNAUTHORIZED before touching Supabase", async () => {
    const response = await DELETE(makeContext());

    expect(response.status).toBe(401);
    const body: unknown = await response.json();
    expect(body).toEqual({ error: { code: "UNAUTHORIZED", message: "Sign in required" } });
  });
});

describe("DELETE /api/sessions/[id] — missing id", () => {
  it("rejects with 400 VALIDATION_ERROR when params.id is absent", async () => {
    const response = await DELETE(
      makeContext({ locals: { user: { id: "user-1" } } as APIContext["locals"], params: {} }),
    );

    expect(response.status).toBe(400);
    const body: unknown = await response.json();
    expect(body).toEqual({ error: { code: "VALIDATION_ERROR", message: "Missing session id" } });
  });
});

describe("DELETE /api/sessions/[id] — service not configured", () => {
  it("rejects with 503 NOT_CONFIGURED when the Supabase client is unavailable", async () => {
    const response = await DELETE(makeContext({ locals: { user: { id: "user-1" } } as APIContext["locals"] }));

    expect(response.status).toBe(503);
    const body: unknown = await response.json();
    expect(body).toEqual({ error: { code: "NOT_CONFIGURED", message: "Service not configured" } });
  });
});

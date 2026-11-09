import { describe, expect, it, vi } from "vitest";

import type { APIContext } from "astro";

// `create-llm-provider.ts` reads `astro:env/server`, which only resolves inside the
// Astro/Vite pipeline (not plain Vitest) — stub it so importing the route doesn't fail.
vi.mock("@/lib/adapters/create-llm-provider", () => ({
  createLlmProvider: () => null,
}));

// `supabase.ts` reads `astro:env/server` at module scope too — same reason to stub it.
vi.mock("@/lib/supabase", () => ({
  createClient: () => null,
}));

import { POST } from "@/pages/api/sessions/index";

function makeUnauthenticatedContext(): APIContext {
  return {
    request: new Request("https://example.test/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "Should I do X?" }),
    }),
    cookies: { set: () => undefined, get: () => undefined } as unknown as APIContext["cookies"],
    locals: { user: null },
    params: {},
  } as unknown as APIContext;
}

describe("POST /api/sessions — unauthenticated", () => {
  it("rejects with 401 UNAUTHORIZED before touching Supabase or the LLM provider", async () => {
    const response = await POST(makeUnauthenticatedContext());

    expect(response.status).toBe(401);
    const body: unknown = await response.json();
    expect(body).toEqual({ error: { code: "UNAUTHORIZED", message: "Sign in required" } });
  });
});

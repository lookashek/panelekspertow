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

import { POST } from "@/pages/api/sessions/[id]/side-thread";

function makeUnauthenticatedContext(): APIContext {
  return {
    request: new Request("https://example.test/api/sessions/session-1/side-thread", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ personaId: "optymista", message: "Can you elaborate?" }),
    }),
    cookies: { set: () => undefined, get: () => undefined } as unknown as APIContext["cookies"],
    locals: { user: null },
    params: { id: "session-1" },
  } as unknown as APIContext;
}

describe("POST /api/sessions/[id]/side-thread — unauthenticated", () => {
  it("rejects with plain JSON 401 UNAUTHORIZED, not an SSE frame", async () => {
    const response = await POST(makeUnauthenticatedContext());

    expect(response.status).toBe(401);
    expect(response.headers.get("Content-Type")).toBe("application/json");
    const body: unknown = await response.json();
    expect(body).toEqual({ error: { code: "UNAUTHORIZED", message: "Sign in required" } });
  });
});

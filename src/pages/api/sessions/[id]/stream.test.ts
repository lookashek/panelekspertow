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

import { GET } from "@/pages/api/sessions/[id]/stream";

function makeUnauthenticatedContext(): APIContext {
  return {
    request: new Request("https://example.test/api/sessions/session-1/stream?round=1"),
    cookies: { set: () => undefined, get: () => undefined } as unknown as APIContext["cookies"],
    locals: { user: null },
    params: { id: "session-1" },
  } as unknown as APIContext;
}

describe("GET /api/sessions/[id]/stream — unauthenticated", () => {
  it("returns 200 with an SSE fatal frame carrying UNAUTHORIZED, never a bare 401", async () => {
    const response = await GET(makeUnauthenticatedContext());

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");

    const body = await response.text();
    expect(body).toBe('event: fatal\ndata: {"code":"UNAUTHORIZED","message":"Sign in required"}\n\n');
  });
});

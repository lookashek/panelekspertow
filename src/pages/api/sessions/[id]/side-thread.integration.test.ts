import { describe, expect, it, vi } from "vitest";

import type { APIContext } from "astro";

import { signUpAndGetCookieHeader } from "@/lib/test-helpers/supabase-real-session";

/**
 * Real-Supabase counterpart to `side-thread.test.ts` — proves the route denies a non-owning
 * authenticated user via the real `SessionService`/`SessionRepository`/RLS chain (research.md
 * Risk #1). Unlike `stream.ts`/`synthesis.ts`, `side-thread.ts` is a POST route whose pre-stream
 * errors (including ownership) go through `errorResponse()` — plain JSON, real status code — not
 * `sseErrorResponse()`. Inert unless a local Supabase is running with migrations applied.
 */

const { SUPABASE_URL, SUPABASE_KEY } = vi.hoisted(() => ({
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_KEY: process.env.SUPABASE_KEY,
}));

/** Narrows the env vars to `string` without `!`/`as` — `skipIf` guarantees these are set whenever this runs. */
function requireSupabaseEnv(): { url: string; key: string } {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("SUPABASE_URL/SUPABASE_KEY not set");
  }
  return { url: SUPABASE_URL, key: SUPABASE_KEY };
}

vi.mock("@/lib/adapters/create-llm-provider", () => ({
  // askSideThread's ownership check runs before any provider method is called.
  createLlmProvider: () => ({}),
}));

// `@/lib/supabase` reads `astro:env/server`, which only resolves inside the Astro/Vite pipeline —
// not plain Vitest. Re-implement its exact logic sourcing the URL/key from `process.env` instead,
// so the route still gets a REAL `@supabase/ssr` client (not a mock); only the env-var binding is
// substituted.
vi.mock("@/lib/supabase", async () => {
  // `createServerClient` is used below with the getAll/setAll overload (same as
  // src/lib/supabase.ts); the rule misattributes the @deprecated JSDoc from the sibling
  // get/set/remove overload onto this import.
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  const { createServerClient, parseCookieHeader } = await import("@supabase/ssr");
  return {
    createClient: (requestHeaders: Headers) => {
      if (!SUPABASE_URL || !SUPABASE_KEY) {
        return null;
      }
      return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
        cookies: {
          getAll() {
            return parseCookieHeader(requestHeaders.get("Cookie") ?? "");
          },
          setAll() {
            // no-op: these tests never need a token refresh written back.
          },
        },
      });
    },
  };
});

const { POST } = await import("@/pages/api/sessions/[id]/side-thread");

describe.skipIf(!SUPABASE_URL || !SUPABASE_KEY)("POST /api/sessions/[id]/side-thread — cross-user ownership", () => {
  it("denies user B with plain JSON 404 NOT_FOUND for A's session", async () => {
    const { url, key } = requireSupabaseEnv();
    const suffix = Date.now();
    const password = "SideThread-Integration-Test-Passw0rd!";

    const userA = await signUpAndGetCookieHeader(url, key, `side-thread-a-${suffix}@example.com`, password);
    const userB = await signUpAndGetCookieHeader(url, key, `side-thread-b-${suffix}@example.com`, password);

    const sessionResult = await userA.client
      .from("sessions")
      .insert({ decision: "A's private decision" })
      .select()
      .single();
    expect(sessionResult.error).toBeNull();
    const sessionId = (sessionResult.data as { id: string }).id;

    const response = await POST({
      request: new Request(`https://example.test/api/sessions/${sessionId}/side-thread`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: userB.cookieHeader },
        body: JSON.stringify({ personaId: "optymista", message: "Can you elaborate?" }),
      }),
      cookies: { set: () => undefined, get: () => undefined } as unknown as APIContext["cookies"],
      locals: { user: { id: userB.userId } },
      params: { id: sessionId },
    } as unknown as APIContext);

    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Type")).toBe("application/json");
    const body: unknown = await response.json();
    expect(body).toEqual({ error: { code: "NOT_FOUND", message: "Session not found" } });
  });
});

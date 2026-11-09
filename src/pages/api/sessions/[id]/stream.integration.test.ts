import { describe, expect, it, vi } from "vitest";

import type { APIContext } from "astro";

import { signUpAndGetCookieHeader } from "@/lib/test-helpers/supabase-real-session";

/**
 * Real-Supabase counterpart to `stream.test.ts` — proves the route denies a non-owning
 * authenticated user, using the real `SessionService`/`SessionRepository`/RLS chain (see
 * research.md Risk #1). The LLM provider is mocked (see `session.service.test.ts:5-7` for the
 * precedent) so no live LLM call happens — Supabase itself stays real and unmocked. Inert unless a
 * local Supabase is running with migrations applied (same precondition as `npm run smoke:rls`).
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
  // The ownership check in `SessionService.runFirstRound` runs before any provider method is
  // called — a non-null placeholder is enough to avoid the route's 503 NOT_CONFIGURED branch.
  createLlmProvider: () => ({}),
}));

// `@/lib/supabase` reads `astro:env/server`, which only resolves inside the Astro/Vite pipeline —
// not plain Vitest. Re-implement its exact logic sourcing the URL/key from `process.env` instead,
// so the route still gets a REAL `@supabase/ssr` client (not a mock) against the real local
// instance; only the env-var binding is substituted.
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

const { GET } = await import("@/pages/api/sessions/[id]/stream");

describe.skipIf(!SUPABASE_URL || !SUPABASE_KEY)("GET /api/sessions/[id]/stream — cross-user ownership", () => {
  it("denies user B a 404-shaped SSE fatal frame for A's session, and allows A through", async () => {
    const { url, key } = requireSupabaseEnv();
    const suffix = Date.now();
    const password = "Stream-Integration-Test-Passw0rd!";

    const userA = await signUpAndGetCookieHeader(url, key, `stream-a-${suffix}@example.com`, password);
    const userB = await signUpAndGetCookieHeader(url, key, `stream-b-${suffix}@example.com`, password);

    const sessionResult = await userA.client
      .from("sessions")
      .insert({ decision: "A's private decision" })
      .select()
      .single();
    expect(sessionResult.error).toBeNull();
    const sessionId = (sessionResult.data as { id: string }).id;

    // Seed round-1 opinions directly so A's control request below takes the deterministic
    // "replay" branch (`buildReplayEvents`) and never needs a real LLM call.
    const opinionsResult = await userA.client.from("advisor_opinions").insert([
      { session_id: sessionId, persona_id: "optymista", round_number: 1, score: 8, thesis: "Go for it" },
      { session_id: sessionId, persona_id: "sceptyk", round_number: 1, score: 3, thesis: "Too risky" },
    ]);
    expect(opinionsResult.error).toBeNull();

    function makeContext(cookieHeader: string, userId: string): APIContext {
      return {
        request: new Request(`https://example.test/api/sessions/${sessionId}/stream?round=1`, {
          headers: { Cookie: cookieHeader },
        }),
        cookies: { set: () => undefined, get: () => undefined } as unknown as APIContext["cookies"],
        locals: { user: { id: userId } },
        params: { id: sessionId },
      } as unknown as APIContext;
    }

    const bResponse = await GET(makeContext(userB.cookieHeader, userB.userId));
    expect(bResponse.status).toBe(200);
    const bBody = await bResponse.text();
    expect(bBody).toBe('event: fatal\ndata: {"code":"NOT_FOUND","message":"Session not found"}\n\n');

    // Control: A, the real owner, is not denied — proves the above is ownership denial, not a
    // route that always 404s.
    const aResponse = await GET(makeContext(userA.cookieHeader, userA.userId));
    const aBody = await aResponse.text();
    expect(aBody).not.toContain('"code":"NOT_FOUND"');
  });
});

import { describe, expect, it, vi } from "vitest";

import type { APIContext } from "astro";

import type { StreamChunk } from "@/lib/adapters/llm-provider";
import type { LlmProvider } from "@/lib/adapters/llm-provider";
import { ok } from "@/lib/result";
import type { Synthesis } from "@/lib/schemas/synthesis";
import { signUpAndGetCookieHeader } from "@/lib/test-helpers/supabase-real-session";

/**
 * Real-Supabase counterpart to `synthesis.test.ts` — proves (a) the route denies a non-owning
 * authenticated user via the real SessionService/SessionRepository/RLS chain (research.md Risk
 * #1), and (b) the SSE abort/finally lifecycle in `synthesis.ts` is real: aborting mid-stream
 * closes the response cleanly with no further frames (research.md Risk #3). The LLM provider is
 * mocked (no live call); Supabase stays real. Inert unless a local Supabase is running with
 * migrations applied.
 */

const { SUPABASE_URL, SUPABASE_KEY } = vi.hoisted(() => ({
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_KEY: process.env.SUPABASE_KEY,
}));

const providerHolder = vi.hoisted(() => ({ current: undefined as LlmProvider | undefined }));

/** Narrows the env vars to `string` without `!`/`as` — `skipIf` guarantees these are set whenever this runs. */
function requireSupabaseEnv(): { url: string; key: string } {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("SUPABASE_URL/SUPABASE_KEY not set");
  }
  return { url: SUPABASE_URL, key: SUPABASE_KEY };
}

function makeSynthesis(): Synthesis {
  return {
    agreementPoints: ["Both agree on timing"],
    disputeAxes: [{ title: "Risk tolerance", positions: ["Cautious", "Aggressive"] }],
    risks: [{ description: "Market downturn", weight: "medium" }],
    recommendedNextStep: "Run a pilot",
  };
}

/** Enqueues one token chunk and deliberately never closes, so a test can abort mid-stream. */
function makeHangingNarrativeStream(): ReadableStream<StreamChunk> {
  return new ReadableStream<StreamChunk>({
    start(controller) {
      controller.enqueue({ type: "token", text: "The panel discussed timing and risk at length..." });
    },
  });
}

function makeFakeProvider(): LlmProvider {
  return {
    complete: () => Promise.resolve(ok(makeSynthesis())),
    stream: () => makeHangingNarrativeStream(),
  } as unknown as LlmProvider;
}

vi.mock("@/lib/adapters/create-llm-provider", () => ({
  createLlmProvider: () => providerHolder.current,
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

const { GET } = await import("@/pages/api/sessions/[id]/synthesis");

function makeContext(sessionId: string, cookieHeader: string, userId: string): APIContext {
  return {
    request: new Request(`https://example.test/api/sessions/${sessionId}/synthesis`, {
      headers: { Cookie: cookieHeader },
    }),
    cookies: { set: () => undefined, get: () => undefined } as unknown as APIContext["cookies"],
    locals: { user: { id: userId } },
    params: { id: sessionId },
  } as unknown as APIContext;
}

describe.skipIf(!SUPABASE_URL || !SUPABASE_KEY)("GET /api/sessions/[id]/synthesis — real Supabase", () => {
  it("denies user B a 404-shaped SSE fatal frame for A's session", async () => {
    providerHolder.current = {} as LlmProvider; // ownership check runs before any provider method is called
    const { url, key } = requireSupabaseEnv();
    const suffix = Date.now();
    const password = "Synthesis-Integration-Test-Passw0rd!";

    const userA = await signUpAndGetCookieHeader(url, key, `synthesis-ownership-a-${suffix}@example.com`, password);
    const userB = await signUpAndGetCookieHeader(url, key, `synthesis-ownership-b-${suffix}@example.com`, password);

    const sessionResult = await userA.client
      .from("sessions")
      .insert({ decision: "A's private decision" })
      .select()
      .single();
    expect(sessionResult.error).toBeNull();
    const sessionId = (sessionResult.data as { id: string }).id;

    const response = await GET(makeContext(sessionId, userB.cookieHeader, userB.userId));
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toBe('event: fatal\ndata: {"code":"NOT_FOUND","message":"Session not found"}\n\n');
  });

  it("closes the SSE stream cleanly on abort mid-stream, with no further frames after", async () => {
    providerHolder.current = makeFakeProvider();
    const { url, key } = requireSupabaseEnv();
    const suffix = Date.now();
    const password = "Synthesis-Abort-Integration-Test-Passw0rd!";

    const userA = await signUpAndGetCookieHeader(url, key, `synthesis-abort-a-${suffix}@example.com`, password);

    const sessionResult = await userA.client
      .from("sessions")
      .insert({ decision: "A's private decision" })
      .select()
      .single();
    expect(sessionResult.error).toBeNull();
    const sessionId = (sessionResult.data as { id: string }).id;

    // Synthesis requires at least one round-one opinion (SynthesisUnavailableError guard).
    const opinionResult = await userA.client
      .from("advisor_opinions")
      .insert([{ session_id: sessionId, persona_id: "optymista", round_number: 1, score: 8, thesis: "Go for it" }]);
    expect(opinionResult.error).toBeNull();

    const abortController = new AbortController();
    const request = new Request(`https://example.test/api/sessions/${sessionId}/synthesis`, {
      headers: { Cookie: userA.cookieHeader },
      signal: abortController.signal,
    });

    const response = await GET({
      request,
      cookies: { set: () => undefined, get: () => undefined } as unknown as APIContext["cookies"],
      locals: { user: { id: userA.userId } },
      params: { id: sessionId },
    } as unknown as APIContext);

    if (!response.body) {
      throw new Error("expected a streamed response body");
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    const first = await reader.read();
    expect(first.done).toBe(false);
    expect(decoder.decode(first.value)).toContain("event: synthesis");

    // Mid-stream: the narrative token stream is deliberately hung (no `done` chunk) at this
    // point — the only thing that can end the response now is the abort handler.
    abortController.abort();

    const second = await reader.read();
    expect(second.done).toBe(true);
  });
});

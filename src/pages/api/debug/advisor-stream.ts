/**
 * DEBUG-ONLY proof route (roadmap F-01 risk: does parallel, incrementally-streamed SSE actually
 * work on Cloudflare workerd?). Gated on `import.meta.env.DEV` — 404s in production, so it never
 * ships as a live, unauthenticated, cost-triggering endpoint. Will be removed and replaced by
 * S-01's real session/stream endpoint.
 *
 * Writes `score` frames as each persona's structured head resolves and `token`/`done`/`error`
 * frames as its rationale streams — never buffers the whole panel before responding, since
 * measuring that is the entire point of this route.
 */

import type { APIContext } from "astro";

import { createLlmProvider } from "@/lib/adapters/create-llm-provider";
import { ADVISOR_REGISTRY, PanelInputSchema } from "@/lib/advisors/registry";
import { runPanel } from "@/lib/advisors/run-panel";

function sseFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST({ request }: APIContext): Promise<Response> {
  if (!import.meta.env.DEV) {
    return new Response(null, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: { code: "VALIDATION_ERROR", message: "Body must be JSON" } }, { status: 400 });
  }

  const parsed = PanelInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: { code: "VALIDATION_ERROR", message: "Invalid panel input", details: parsed.error.message } },
      { status: 400 },
    );
  }

  const provider = createLlmProvider();
  if (!provider) {
    return new Response(JSON.stringify({ error: { code: "NOT_CONFIGURED" } }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { scores, stream } = runPanel({ provider }, parsed.data, request.signal);
  const encoder = new TextEncoder();

  const sse = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(sseFrame(event, data)));
      };

      const onAbort = () => {
        try {
          controller.close();
        } catch {
          // stream already closed — nothing to do
        }
      };
      request.signal.addEventListener("abort", onAbort, { once: true });

      try {
        await Promise.all([
          scores.then((results) => {
            results.forEach((result, index) => {
              const personaId = ADVISOR_REGISTRY[index].id;
              if (result.ok) {
                write("score", { personaId, score: result.value.score, thesis: result.value.thesis });
              } else {
                write("error", { personaId, code: result.error.code, message: result.error.message });
              }
            });
          }),
          (async () => {
            const reader = stream.getReader();
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              const { personaId, chunk } = value;
              if (chunk.type === "token") {
                write("token", { personaId, text: chunk.text });
              } else if (chunk.type === "done") {
                write("done", { personaId });
              } else {
                write("error", { personaId, code: chunk.error.code, message: chunk.error.message });
              }
            }
          })(),
        ]);
      } finally {
        request.signal.removeEventListener("abort", onAbort);
        try {
          controller.close();
        } catch {
          // stream already closed (e.g. by the abort listener) — nothing to do
        }
      }
    },
  });

  return new Response(sse, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

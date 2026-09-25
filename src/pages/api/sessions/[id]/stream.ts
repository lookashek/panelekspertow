import type { APIContext } from "astro";

import { createLlmProvider } from "@/lib/adapters/create-llm-provider";
import { AppError, ErrorCode, UnauthorizedError } from "@/lib/errors";
import { errorResponse } from "@/lib/http";
import { SessionRepository } from "@/lib/repositories/session.repository";
import type { PanelRunEvent } from "@/lib/services/session.service";
import { SessionService } from "@/lib/services/session.service";
import { createClient } from "@/lib/supabase";

function sseFrame(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function frameFor(event: PanelRunEvent): [string, unknown] {
  switch (event.kind) {
    case "score":
      return [
        "score",
        { personaId: event.personaId, score: event.score, thesis: event.thesis, arguments: event.arguments },
      ];
    case "token":
      return ["token", { personaId: event.personaId, text: event.text }];
    case "done":
      return ["done", { personaId: event.personaId }];
    case "error":
      return ["error", { personaId: event.personaId, code: event.code, message: event.message }];
  }
}

export async function GET({ params, request, cookies, locals }: APIContext): Promise<Response> {
  if (!locals.user) {
    return errorResponse(new UnauthorizedError("Sign in required"));
  }

  if (!params.id) {
    return errorResponse(new AppError("Missing session id", ErrorCode.VALIDATION_ERROR, 400));
  }

  const client = createClient(request.headers, cookies);
  const provider = createLlmProvider();
  if (!client || !provider) {
    return errorResponse(new AppError("Service not configured", ErrorCode.NOT_CONFIGURED, 503));
  }

  const service = new SessionService({ repository: new SessionRepository(client), provider });
  const result = await service.runFirstRound(params.id, locals.user.id);
  if (!result.ok) {
    return errorResponse(result.error);
  }

  const view = result.value;
  if (view.persistTail) {
    locals.cfContext?.waitUntil(view.persistTail);
  }

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
        for await (const event of view.events) {
          const [name, data] = frameFor(event);
          write(name, data);
        }
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

/**
 * Canonical HTTP response helpers (`.claude/rules/backend.md` §3/§6) — handlers map a `Result`
 * to a `Response` through these, never by hand-building JSON bodies or status codes.
 */

import type { AppError } from "@/lib/errors";

export function json(data: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function errorResponse(error: AppError): Response {
  const body: { error: { code: string; message: string; details?: unknown } } = {
    error: { code: error.code, message: error.message },
  };
  if (error.cause !== undefined) {
    body.error.details = error.cause;
  }
  return json(body, { status: error.status });
}

/**
 * SSE counterpart to `errorResponse`, for routes whose only consumer is an `EventSource` (the
 * round/synthesis stream endpoints). `EventSource` cannot read a plain JSON error body — a non-200
 * or non-`text/event-stream` response just fires a payload-less `error` event, so the real
 * code/message is lost and the client falls back to a generic "connection aborted" message. This
 * always returns status 200 with a single `event: fatal` frame instead, so a pre-stream failure
 * (auth, validation, a business-rule `Result` error) reaches the client the same way a mid-stream
 * one already does.
 */
export function sseErrorResponse(error: AppError): Response {
  const encoder = new TextEncoder();
  const frame = `event: fatal\ndata: ${JSON.stringify({ code: error.code, message: error.message })}\n\n`;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(frame));
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

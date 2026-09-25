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

/**
 * Provider-agnostic LLM port — see `.claude/rules/backend.md` §2 (Adapter/Port pattern) and §5
 * (LLM integration). Every provider call in the codebase goes through this interface; no service
 * or route may `fetch` a vendor endpoint directly.
 *
 * Two-phase contract: `complete()` returns a small, Zod-validated structured head (e.g. score +
 * thesis) before any rationale is streamed; `stream()` proxies the token-by-token body. Callers
 * that need "score before rationale" (PRD) call `complete()` first, then `stream()`.
 */

import type { ZodType } from "zod";

import type { LlmError } from "@/lib/errors";
import type { Result } from "@/lib/result";

export interface CompleteRequest<T> {
  model: string;
  system: string;
  user: string;
  schema: ZodType<T>;
  signal?: AbortSignal;
  temperature?: number;
  /** Persona id, threaded through for logging only (added in a later phase's callers). */
  persona?: string;
  /** Prompt version tag, threaded through for logging only (added in a later phase's callers). */
  promptVersion?: string;
}

export interface StreamRequest {
  model: string;
  system: string;
  user: string;
  signal?: AbortSignal;
  temperature?: number;
  /** Persona id, threaded through for logging only (added in a later phase's callers). */
  persona?: string;
  /** Prompt version tag, threaded through for logging only (added in a later phase's callers). */
  promptVersion?: string;
}

export type StreamChunk = { type: "token"; text: string } | { type: "done" } | { type: "error"; error: LlmError };

export interface LlmProvider {
  complete<T>(req: CompleteRequest<T>): Promise<Result<T, LlmError>>;
  stream(req: StreamRequest): ReadableStream<StreamChunk>;
}

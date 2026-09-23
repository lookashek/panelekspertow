/**
 * Typed error hierarchy for layers where throwing is appropriate (before a
 * `Result` boundary exists, or for genuinely exceptional conditions). Once a
 * `Result<T, E>` is in play (see `@/lib/result`), prefer returning
 * `err(new LlmError(...))` over throwing across layers — see `.claude/rules/backend.md` §6.
 */

export const ErrorCode = {
  LLM_INVALID_OUTPUT: "LLM_INVALID_OUTPUT",
  LLM_TIMEOUT: "LLM_TIMEOUT",
  LLM_PROVIDER_ERROR: "LLM_PROVIDER_ERROR",
  NOT_CONFIGURED: "NOT_CONFIGURED",
  VALIDATION_ERROR: "VALIDATION_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  override readonly cause?: unknown;

  constructor(message: string, code: string, status: number, cause?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = status;
    this.cause = cause;
  }
}

export class LlmError extends AppError {
  constructor(message: string, code: ErrorCode = ErrorCode.LLM_PROVIDER_ERROR, cause?: unknown) {
    super(message, code, 502, cause);
    this.name = "LlmError";
  }
}

export class ValidationError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(message, ErrorCode.VALIDATION_ERROR, 400, cause);
    this.name = "ValidationError";
  }
}

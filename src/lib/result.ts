import type { AppError } from "@/lib/errors";

/**
 * Discriminated union for cross-layer returns — see `.claude/rules/backend.md` §2
 * ("Result type instead of throwing across layers"). No framework dependency.
 */
export type Result<T, E = AppError> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

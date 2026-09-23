/**
 * Shared, defensive parser mapping raw model JSON to `AdvisorScore` — the thin `safeParse`-to-
 * `Result` wrapper every persona's `AdvisorStrategy.parseScore` delegates to (see
 * `@/lib/advisors/registry`), so score validation lives in one place.
 */

import { ErrorCode, LlmError } from "@/lib/errors";
import { err, ok } from "@/lib/result";
import type { Result } from "@/lib/result";
import { AdvisorScoreSchema } from "@/lib/schemas/advisor";
import type { AdvisorScore } from "@/lib/schemas/advisor";

export function parseScore(raw: unknown): Result<AdvisorScore, LlmError> {
  const result = AdvisorScoreSchema.safeParse(raw);
  if (!result.success) {
    return err(new LlmError("LLM returned invalid score/thesis output", ErrorCode.LLM_INVALID_OUTPUT, result.error));
  }
  return ok(result.data);
}

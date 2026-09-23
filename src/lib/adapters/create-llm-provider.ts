/**
 * Centralizes env reading + null-handling for `LlmProvider` construction — mirrors the
 * null-on-missing-env factory in `src/lib/supabase.ts`. Callers map a `null` return to a 503
 * `NOT_CONFIGURED` response; that mapping happens at the route, not here.
 */

import { OPENROUTER_API_KEY, DEFAULT_ADVISOR_MODEL } from "astro:env/server";

import { OpenRouterAdapter } from "@/lib/adapters/openrouter.adapter";
import type { LlmProvider } from "@/lib/adapters/llm-provider";

export function createLlmProvider(_name: "openrouter" = "openrouter"): LlmProvider | null {
  if (!OPENROUTER_API_KEY) {
    return null;
  }

  return new OpenRouterAdapter(OPENROUTER_API_KEY);
}

export function defaultAdvisorModel(): string {
  return DEFAULT_ADVISOR_MODEL;
}

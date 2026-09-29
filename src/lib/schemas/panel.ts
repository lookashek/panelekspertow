/**
 * Shared Zod schema for the panel's input contract — the decision/context pair every advisor
 * persona prompt and the decision-form island resolve against. Lives in `src/lib/schemas` (shared
 * with frontend, see `.claude/rules/backend.md` §1) rather than `src/lib/advisors/registry.ts` so
 * importing it does not pull the advisor registry (persona prompts + `parse-score`) into the
 * client bundle.
 */

import { z } from "zod";

export const PanelInputSchema = z.object({
  decision: z.string().min(1),
  context: z.string().optional(),
});

export type PanelInput = z.infer<typeof PanelInputSchema>;

/**
 * Persona ids duplicated locally rather than imported from `@/lib/advisors/registry` — this file
 * is shared with the client bundle (see `schemas/advisor.ts` for the same rationale), and the
 * registry pulls in persona prompts + `parseScore`, which must not ship to the browser.
 */
const SIDE_THREAD_PERSONA_IDS = ["optymista", "sceptyk", "pragmatyk", "analityk"] as const;

export const MAX_SIDE_THREAD_INPUT_CHARS = 2000;

export const SideThreadAskSchema = z.object({
  personaId: z.enum(SIDE_THREAD_PERSONA_IDS),
  message: z.string().min(1).max(MAX_SIDE_THREAD_INPUT_CHARS),
});

export type SideThreadAsk = z.infer<typeof SideThreadAskSchema>;

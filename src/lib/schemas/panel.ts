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

/**
 * Shared Zod schemas for advisor structured output — the contract `OpenRouterAdapter#complete()`
 * validates against for the "score before rationale" structured head (PRD), and later shared with
 * the persona registry and frontend.
 */

import { z } from "zod";

export const AdvisorScoreSchema = z.object({
  score: z.number().int().min(1).max(10),
  thesis: z.string().min(1),
});

export type AdvisorScore = z.infer<typeof AdvisorScoreSchema>;

export const AdvisorOpinionSchema = AdvisorScoreSchema.extend({
  arguments: z.array(z.string().min(1)).min(1),
});

export type AdvisorOpinion = z.infer<typeof AdvisorOpinionSchema>;

/**
 * Persona ids duplicated locally rather than imported from `@/lib/advisors/registry` — this file
 * is shared with the client bundle (see `schemas/panel.ts:1` for the same rationale), and the
 * registry pulls in persona prompts + `parseScore`, which must not ship to the browser.
 */
const ROUND_TWO_PERSONA_IDS = ["optymista", "sceptyk", "pragmatyk", "analityk"] as const;

export const AdvisorAttributionSchema = z.object({
  convincedByPersonaId: z.enum(ROUND_TWO_PERSONA_IDS),
  quotedPeerArgument: z.string().min(1),
});

export type AdvisorAttribution = z.infer<typeof AdvisorAttributionSchema>;

export const AdvisorRoundTwoOpinionSchema = AdvisorOpinionSchema.extend({
  attribution: AdvisorAttributionSchema.nullable(),
});

export type AdvisorRoundTwoOpinion = z.infer<typeof AdvisorRoundTwoOpinionSchema>;

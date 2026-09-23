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

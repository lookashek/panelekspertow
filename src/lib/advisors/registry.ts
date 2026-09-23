/**
 * The Strategy pattern for advisor personas — see `.claude/rules/backend.md` §2. Each persona
 * pairs a bias-carrying prompt with its own temperature so the same `PanelInput` yields
 * deliberately divergent opinions (FR-003, NFR score-spread guardrail). `runPanel` (a later phase)
 * and any future caller select a stable panel composition from `ADVISOR_REGISTRY`.
 */

import { z } from "zod";

import type { LlmError } from "@/lib/errors";
import { parseScore } from "@/lib/advisors/parse-score";
import { buildPrompt as buildOptymistaPrompt } from "@/lib/prompts/advisor-optymista.v1";
import { buildPrompt as buildSceptykPrompt } from "@/lib/prompts/advisor-sceptyk.v1";
import { buildPrompt as buildPragmatykPrompt } from "@/lib/prompts/advisor-pragmatyk.v1";
import { buildPrompt as buildAnalitykPrompt } from "@/lib/prompts/advisor-analityk.v1";
import type { Result } from "@/lib/result";
import type { AdvisorScore } from "@/lib/schemas/advisor";

export const PanelInputSchema = z.object({
  decision: z.string().min(1),
  context: z.string().optional(),
});

export type PanelInput = z.infer<typeof PanelInputSchema>;

export type AdvisorPersonaId = "optymista" | "sceptyk" | "pragmatyk" | "analityk";

export interface AdvisorStrategy {
  id: AdvisorPersonaId;
  label: string;
  buildPrompt(input: PanelInput): { system: string; user: string };
  temperature: number;
  parseScore(raw: unknown): Result<AdvisorScore, LlmError>;
}

/**
 * Fixed, ordered panel composition — stable order matters for UI layout and round-two attribution
 * in later slices. Temperatures are distinct per persona (the divergence lever alongside the
 * prompt bias): optymista highest, analityk lowest, sceptyk/pragmatyk in between.
 */
export const ADVISOR_REGISTRY: AdvisorStrategy[] = [
  {
    id: "optymista",
    label: "Optymista",
    buildPrompt: buildOptymistaPrompt,
    temperature: 0.9,
    parseScore,
  },
  {
    id: "sceptyk",
    label: "Sceptyk",
    buildPrompt: buildSceptykPrompt,
    temperature: 0.7,
    parseScore,
  },
  {
    id: "pragmatyk",
    label: "Pragmatyk",
    buildPrompt: buildPragmatykPrompt,
    temperature: 0.5,
    parseScore,
  },
  {
    id: "analityk",
    label: "Analityk",
    buildPrompt: buildAnalitykPrompt,
    temperature: 0.3,
    parseScore,
  },
];

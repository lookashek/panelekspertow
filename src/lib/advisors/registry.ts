/**
 * The Strategy pattern for advisor personas — see `.claude/rules/backend.md` §2. Each persona
 * pairs a bias-carrying prompt with its own temperature so the same `PanelInput` yields
 * deliberately divergent opinions (FR-003, NFR score-spread guardrail). `runPanel` (a later phase)
 * and any future caller select a stable panel composition from `ADVISOR_REGISTRY`.
 */

import type { LlmError } from "@/lib/errors";
import { parseScore } from "@/lib/advisors/parse-score";
import {
  buildPrompt as buildOptymistaPrompt,
  buildRationalePrompt as buildOptymistaRationalePrompt,
  buildRoundTwoPrompt as buildOptymistaRoundTwoPrompt,
  buildRoundTwoRationalePrompt as buildOptymistaRoundTwoRationalePrompt,
} from "@/lib/prompts/advisor-optymista.v1";
import {
  buildPrompt as buildSceptykPrompt,
  buildRationalePrompt as buildSceptykRationalePrompt,
  buildRoundTwoPrompt as buildSceptykRoundTwoPrompt,
  buildRoundTwoRationalePrompt as buildSceptykRoundTwoRationalePrompt,
} from "@/lib/prompts/advisor-sceptyk.v1";
import {
  buildPrompt as buildPragmatykPrompt,
  buildRationalePrompt as buildPragmatykRationalePrompt,
  buildRoundTwoPrompt as buildPragmatykRoundTwoPrompt,
  buildRoundTwoRationalePrompt as buildPragmatykRoundTwoRationalePrompt,
} from "@/lib/prompts/advisor-pragmatyk.v1";
import {
  buildPrompt as buildAnalitykPrompt,
  buildRationalePrompt as buildAnalitykRationalePrompt,
  buildRoundTwoPrompt as buildAnalitykRoundTwoPrompt,
  buildRoundTwoRationalePrompt as buildAnalitykRoundTwoRationalePrompt,
} from "@/lib/prompts/advisor-analityk.v1";
import type { Result } from "@/lib/result";
import type { AdvisorOpinion, AdvisorRoundTwoOpinion, AdvisorScore } from "@/lib/schemas/advisor";
import { PanelInputSchema } from "@/lib/schemas/panel";
import type { PanelInput } from "@/lib/schemas/panel";

export { PanelInputSchema };
export type { PanelInput };

export type AdvisorPersonaId = "optymista" | "sceptyk" | "pragmatyk" | "analityk";

/**
 * Round two needs peers to react to — single source of truth for the gate, consumed by both
 * `SessionService.runSecondRound` (the actual gate) and `src/pages/sessions/[id].astro` (the SSR
 * "show the trigger" check), so the two can never silently desync.
 */
export const MIN_ROUND_TWO_PARTICIPANTS = 2;

export interface RoundOnePeer {
  label: string;
  head: AdvisorOpinion;
}

export interface AdvisorStrategy {
  id: AdvisorPersonaId;
  label: string;
  buildPrompt(input: PanelInput): { system: string; user: string };
  buildRationalePrompt(input: PanelInput, head: AdvisorOpinion): { system: string; user: string };
  buildRoundTwoPrompt(
    input: PanelInput,
    selfHead: AdvisorOpinion,
    peers: RoundOnePeer[],
  ): { system: string; user: string };
  buildRoundTwoRationalePrompt(
    input: PanelInput,
    selfHead: AdvisorOpinion,
    roundTwoHead: AdvisorRoundTwoOpinion,
    peers: RoundOnePeer[],
  ): { system: string; user: string };
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
    buildRationalePrompt: buildOptymistaRationalePrompt,
    buildRoundTwoPrompt: buildOptymistaRoundTwoPrompt,
    buildRoundTwoRationalePrompt: buildOptymistaRoundTwoRationalePrompt,
    temperature: 0.9,
    parseScore,
  },
  {
    id: "sceptyk",
    label: "Sceptyk",
    buildPrompt: buildSceptykPrompt,
    buildRationalePrompt: buildSceptykRationalePrompt,
    buildRoundTwoPrompt: buildSceptykRoundTwoPrompt,
    buildRoundTwoRationalePrompt: buildSceptykRoundTwoRationalePrompt,
    temperature: 0.7,
    parseScore,
  },
  {
    id: "pragmatyk",
    label: "Pragmatyk",
    buildPrompt: buildPragmatykPrompt,
    buildRationalePrompt: buildPragmatykRationalePrompt,
    buildRoundTwoPrompt: buildPragmatykRoundTwoPrompt,
    buildRoundTwoRationalePrompt: buildPragmatykRoundTwoRationalePrompt,
    temperature: 0.5,
    parseScore,
  },
  {
    id: "analityk",
    label: "Analityk",
    buildPrompt: buildAnalitykPrompt,
    buildRationalePrompt: buildAnalitykRationalePrompt,
    buildRoundTwoPrompt: buildAnalitykRoundTwoPrompt,
    buildRoundTwoRationalePrompt: buildAnalitykRoundTwoRationalePrompt,
    temperature: 0.3,
    parseScore,
  },
];

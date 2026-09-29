/**
 * Shared Zod schemas for the synthesis structured output — the contract the synthesizer's
 * `complete()` call validates against (see `.claude/rules/backend.md` §5, "structured outputs are
 * enforced"). `disputeAxes.min(1)` is the enforcement point for the PRD guardrail that a synthesis
 * must surface at least one real axis of dispute rather than average the panel into consensus.
 * Client-bundle-safe (no registry import), same rationale as `schemas/advisor.ts` and
 * `schemas/panel.ts`.
 */

import { z } from "zod";

export const DisputeAxisSchema = z.object({
  title: z.string().min(1),
  positions: z.array(z.string().min(1)).min(2),
});

export type DisputeAxis = z.infer<typeof DisputeAxisSchema>;

export const RiskSchema = z.object({
  description: z.string().min(1),
  weight: z.enum(["high", "medium", "low"]),
});

export type Risk = z.infer<typeof RiskSchema>;

export const SynthesisSchema = z.object({
  agreementPoints: z.array(z.string().min(1)),
  disputeAxes: z.array(DisputeAxisSchema).min(1),
  risks: z.array(RiskSchema),
  recommendedNextStep: z.string().min(1),
});

export type Synthesis = z.infer<typeof SynthesisSchema>;

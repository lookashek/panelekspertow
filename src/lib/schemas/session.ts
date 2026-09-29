/**
 * Row-boundary validation + snake_case row -> camelCase domain mapping for `sessions` and
 * `advisor_opinions` (F-02) — every DB boundary is Zod-validated (shared rules "Every boundary …
 * validated with Zod"), and this is the single place that maps raw rows to the domain types in
 * `@/types/session`, used by `SessionRepository`.
 */

import { z } from "zod";

import type { AdvisorPersonaId } from "@/lib/advisors/registry";
import { SynthesisSchema } from "@/lib/schemas/synthesis";
import type { AdvisorOpinionRecord, Session, SessionSynthesis, SideThreadMessage } from "@/types/session";

const PERSONA_IDS = ["optymista", "sceptyk", "pragmatyk", "analityk"] as const satisfies readonly AdvisorPersonaId[];

export const SessionRowSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  decision: z.string(),
  context: z.string().nullable(),
  status: z.enum(["active", "completed"]),
  created_at: z.string(),
  updated_at: z.string(),
});

export type SessionRow = z.infer<typeof SessionRowSchema>;

export const AdvisorOpinionRowSchema = z.object({
  id: z.string(),
  session_id: z.string(),
  user_id: z.string(),
  persona_id: z.enum(PERSONA_IDS),
  round_number: z.number().int().min(1),
  score: z.number().int().min(1).max(10),
  thesis: z.string(),
  arguments: z.array(z.string()),
  created_at: z.string(),
  previous_score: z.number().int().min(1).max(10).nullable(),
  attributed_persona_id: z.enum(PERSONA_IDS).nullable(),
  attribution_quote: z.string().nullable(),
});

export type AdvisorOpinionRow = z.infer<typeof AdvisorOpinionRowSchema>;

export function toSession(row: SessionRow): Session {
  return {
    id: row.id,
    userId: row.user_id,
    decision: row.decision,
    context: row.context,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toAdvisorOpinion(row: AdvisorOpinionRow): AdvisorOpinionRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    userId: row.user_id,
    personaId: row.persona_id,
    roundNumber: row.round_number,
    score: row.score,
    thesis: row.thesis,
    arguments: row.arguments,
    createdAt: row.created_at,
    previousScore: row.previous_score,
    attributedPersonaId: row.attributed_persona_id,
    attributionQuote: row.attribution_quote,
  };
}

export const SessionSynthesisRowSchema = z.object({
  id: z.string(),
  session_id: z.string(),
  user_id: z.string(),
  content: SynthesisSchema,
  narrative: z.string(),
  created_at: z.string(),
});

export type SessionSynthesisRow = z.infer<typeof SessionSynthesisRowSchema>;

export function toSessionSynthesis(row: SessionSynthesisRow): SessionSynthesis {
  return {
    id: row.id,
    sessionId: row.session_id,
    userId: row.user_id,
    content: row.content,
    narrative: row.narrative,
    createdAt: row.created_at,
  };
}

export const SideThreadMessageRowSchema = z.object({
  id: z.string(),
  session_id: z.string(),
  user_id: z.string(),
  persona_id: z.enum(PERSONA_IDS),
  role: z.enum(["user", "advisor"]),
  content: z.string(),
  created_at: z.string(),
});

export type SideThreadMessageRow = z.infer<typeof SideThreadMessageRowSchema>;

export function toSideThreadMessage(row: SideThreadMessageRow): SideThreadMessage {
  return {
    id: row.id,
    sessionId: row.session_id,
    userId: row.user_id,
    personaId: row.persona_id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
  };
}

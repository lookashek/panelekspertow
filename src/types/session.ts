/**
 * Domain types persisted and returned by `SessionRepository` (F-02) — never a raw Supabase row.
 * See `.claude/rules/backend.md` §4 ("Repositories return typed domain objects").
 */

import type { AdvisorPersonaId } from "@/lib/advisors/registry";
import type { Synthesis } from "@/lib/schemas/synthesis";

export type SessionStatus = "active" | "completed";

export interface Session {
  id: string;
  userId: string;
  decision: string;
  context: string | null;
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AdvisorOpinionRecord {
  id: string;
  sessionId: string;
  userId: string;
  personaId: AdvisorPersonaId;
  roundNumber: number;
  score: number;
  thesis: string;
  arguments: string[];
  createdAt: string;
  previousScore: number | null;
  attributedPersonaId: AdvisorPersonaId | null;
  attributionQuote: string | null;
}

export interface SessionSynthesis {
  id: string;
  sessionId: string;
  userId: string;
  content: Synthesis;
  narrative: string;
  createdAt: string;
}

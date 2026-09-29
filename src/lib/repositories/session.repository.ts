/**
 * Repository pattern (`.claude/rules/backend.md` §1-2) — the only place that queries `sessions`
 * and `advisor_opinions`. Constructed with the cookie-based Supabase client (`@/lib/supabase`) so
 * every query runs as the caller and RLS applies; returns typed domain objects via `Result`,
 * never a raw Postgrest row or error.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";

import type { AdvisorPersonaId } from "@/lib/advisors/registry";
import { DbError } from "@/lib/errors";
import { err, ok } from "@/lib/result";
import type { Result } from "@/lib/result";
import {
  AdvisorOpinionRowSchema,
  SessionRowSchema,
  SessionSynthesisRowSchema,
  SideThreadMessageRowSchema,
  toAdvisorOpinion,
  toSession,
  toSessionSynthesis,
  toSideThreadMessage,
} from "@/lib/schemas/session";
import type { AdvisorOpinion } from "@/lib/schemas/advisor";
import type { Synthesis } from "@/lib/schemas/synthesis";
import type { AdvisorOpinionRecord, Session, SessionSynthesis, SideThreadMessage } from "@/types/session";

const DEFAULT_LIST_LIMIT = 50;

function parseRow<Schema extends z.ZodType>(schema: Schema, data: unknown): Result<z.infer<Schema>, DbError> {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    return err(new DbError("Row failed schema validation", parsed.error));
  }
  return ok(parsed.data);
}

interface DbResponse<T> {
  data: T | null;
  error: { message: string } | null;
}

interface DbCountResponse {
  count: number | null;
  error: { message: string } | null;
}

export interface CreateSessionInput {
  decision: string;
  context?: string;
}

export interface SaveOpinionInput {
  personaId: AdvisorPersonaId;
  opinion: AdvisorOpinion;
  previousScore?: number | null;
  attributedPersonaId?: AdvisorPersonaId | null;
  attributionQuote?: string | null;
}

export interface SaveSynthesisInput {
  content: Synthesis;
  narrative: string;
}

export interface SaveSideThreadMessageInput {
  personaId: AdvisorPersonaId;
  role: "user" | "advisor";
  content: string;
}

export class SessionRepository {
  constructor(private readonly client: SupabaseClient) {}

  async createSession(input: CreateSessionInput): Promise<Result<Session, DbError>> {
    const { data, error } = (await this.client
      .from("sessions")
      .insert({ decision: input.decision, context: input.context ?? null })
      .select()
      .single()) as DbResponse<unknown>;

    if (error) {
      return err(new DbError("Failed to create session", error));
    }

    const parsed = parseRow(SessionRowSchema, data);
    if (!parsed.ok) {
      return parsed;
    }
    return ok(toSession(parsed.value));
  }

  async saveOpinions(
    sessionId: string,
    roundNumber: number,
    opinions: SaveOpinionInput[],
  ): Promise<Result<AdvisorOpinionRecord[], DbError>> {
    const rows = opinions.map(({ personaId, opinion, previousScore, attributedPersonaId, attributionQuote }) => ({
      session_id: sessionId,
      persona_id: personaId,
      round_number: roundNumber,
      score: opinion.score,
      thesis: opinion.thesis,
      arguments: opinion.arguments,
      previous_score: previousScore ?? null,
      attributed_persona_id: attributedPersonaId ?? null,
      attribution_quote: attributionQuote ?? null,
    }));

    const { data, error } = (await this.client.from("advisor_opinions").insert(rows).select()) as DbResponse<unknown[]>;

    if (error) {
      return err(new DbError("Failed to save advisor opinions", error));
    }

    const records: AdvisorOpinionRecord[] = [];
    for (const row of data ?? []) {
      const parsed = parseRow(AdvisorOpinionRowSchema, row);
      if (!parsed.ok) {
        return parsed;
      }
      records.push(toAdvisorOpinion(parsed.value));
    }
    return ok(records);
  }

  async listSessions(opts?: { limit?: number }): Promise<Result<Session[], DbError>> {
    const limit = opts?.limit ?? DEFAULT_LIST_LIMIT;
    const { data, error } = (await this.client
      .from("sessions")
      .select()
      .order("created_at", { ascending: false })
      .limit(limit)) as DbResponse<unknown[]>;

    if (error) {
      return err(new DbError("Failed to list sessions", error));
    }

    const sessions: Session[] = [];
    for (const row of data ?? []) {
      const parsed = parseRow(SessionRowSchema, row);
      if (!parsed.ok) {
        return parsed;
      }
      sessions.push(toSession(parsed.value));
    }
    return ok(sessions);
  }

  async getOpinions(sessionId: string, roundNumber: number): Promise<Result<AdvisorOpinionRecord[], DbError>> {
    const { data, error } = (await this.client
      .from("advisor_opinions")
      .select()
      .eq("session_id", sessionId)
      .eq("round_number", roundNumber)
      .order("persona_id", { ascending: true })) as DbResponse<unknown[]>;

    if (error) {
      return err(new DbError("Failed to fetch advisor opinions", error));
    }

    const records: AdvisorOpinionRecord[] = [];
    for (const row of data ?? []) {
      const parsed = parseRow(AdvisorOpinionRowSchema, row);
      if (!parsed.ok) {
        return parsed;
      }
      records.push(toAdvisorOpinion(parsed.value));
    }
    return ok(records);
  }

  async getSession(id: string): Promise<Result<Session | null, DbError>> {
    const { data, error } = (await this.client
      .from("sessions")
      .select()
      .eq("id", id)
      .maybeSingle()) as DbResponse<unknown>;

    if (error) {
      return err(new DbError("Failed to fetch session", error));
    }

    if (!data) {
      return ok(null);
    }

    const parsed = parseRow(SessionRowSchema, data);
    if (!parsed.ok) {
      return parsed;
    }
    return ok(toSession(parsed.value));
  }

  async getSynthesis(sessionId: string): Promise<Result<SessionSynthesis | null, DbError>> {
    const { data, error } = (await this.client
      .from("session_syntheses")
      .select()
      .eq("session_id", sessionId)
      .maybeSingle()) as DbResponse<unknown>;

    if (error) {
      return err(new DbError("Failed to fetch session synthesis", error));
    }

    if (!data) {
      return ok(null);
    }

    const parsed = parseRow(SessionSynthesisRowSchema, data);
    if (!parsed.ok) {
      return parsed;
    }
    return ok(toSessionSynthesis(parsed.value));
  }

  async saveSynthesis(sessionId: string, input: SaveSynthesisInput): Promise<Result<SessionSynthesis, DbError>> {
    const { data, error } = (await this.client
      .from("session_syntheses")
      .insert({ session_id: sessionId, content: input.content, narrative: input.narrative })
      .select()
      .single()) as DbResponse<unknown>;

    if (error) {
      return err(new DbError("Failed to save session synthesis", error));
    }

    const parsed = parseRow(SessionSynthesisRowSchema, data);
    if (!parsed.ok) {
      return parsed;
    }
    return ok(toSessionSynthesis(parsed.value));
  }

  async completeSession(sessionId: string): Promise<Result<void, DbError>> {
    const { error } = (await this.client
      .from("sessions")
      .update({ status: "completed", updated_at: new Date().toISOString() })
      .eq("id", sessionId)) as DbResponse<unknown>;

    if (error) {
      return err(new DbError("Failed to complete session", error));
    }

    return ok(undefined);
  }

  async saveSideThreadMessage(
    sessionId: string,
    input: SaveSideThreadMessageInput,
  ): Promise<Result<SideThreadMessage, DbError>> {
    const { data, error } = (await this.client
      .from("advisor_side_thread_messages")
      .insert({ session_id: sessionId, persona_id: input.personaId, role: input.role, content: input.content })
      .select()
      .single()) as DbResponse<unknown>;

    if (error) {
      return err(new DbError("Failed to save side thread message", error));
    }

    const parsed = parseRow(SideThreadMessageRowSchema, data);
    if (!parsed.ok) {
      return parsed;
    }
    return ok(toSideThreadMessage(parsed.value));
  }

  async getSideThreadMessagesForSession(sessionId: string): Promise<Result<SideThreadMessage[], DbError>> {
    const { data, error } = (await this.client
      .from("advisor_side_thread_messages")
      .select()
      .eq("session_id", sessionId)
      .order("persona_id", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })) as DbResponse<unknown[]>;

    if (error) {
      return err(new DbError("Failed to fetch side thread messages for session", error));
    }

    const messages: SideThreadMessage[] = [];
    for (const row of data ?? []) {
      const parsed = parseRow(SideThreadMessageRowSchema, row);
      if (!parsed.ok) {
        return parsed;
      }
      messages.push(toSideThreadMessage(parsed.value));
    }
    return ok(messages);
  }

  async getSideThreadMessages(
    sessionId: string,
    personaId: AdvisorPersonaId,
  ): Promise<Result<SideThreadMessage[], DbError>> {
    const { data, error } = (await this.client
      .from("advisor_side_thread_messages")
      .select()
      .eq("session_id", sessionId)
      .eq("persona_id", personaId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })) as DbResponse<unknown[]>;

    if (error) {
      return err(new DbError("Failed to fetch side thread messages", error));
    }

    const messages: SideThreadMessage[] = [];
    for (const row of data ?? []) {
      const parsed = parseRow(SideThreadMessageRowSchema, row);
      if (!parsed.ok) {
        return parsed;
      }
      messages.push(toSideThreadMessage(parsed.value));
    }
    return ok(messages);
  }

  async countSideThreadUserMessages(sessionId: string, personaId: AdvisorPersonaId): Promise<Result<number, DbError>> {
    const { count, error } = (await this.client
      .from("advisor_side_thread_messages")
      .select("*", { count: "exact", head: true })
      .eq("session_id", sessionId)
      .eq("persona_id", personaId)
      .eq("role", "user")) as DbCountResponse;

    if (error) {
      return err(new DbError("Failed to count side thread user messages", error));
    }

    return ok(count ?? 0);
  }

  async countRecentSideThreadMessagesByUser(sinceIso: string): Promise<Result<number, DbError>> {
    const { count, error } = (await this.client
      .from("advisor_side_thread_messages")
      .select("*", { count: "exact", head: true })
      .eq("role", "user")
      .gte("created_at", sinceIso)) as DbCountResponse;

    if (error) {
      return err(new DbError("Failed to count recent side thread messages", error));
    }

    return ok(count ?? 0);
  }
}

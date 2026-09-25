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
import { AdvisorOpinionRowSchema, SessionRowSchema, toAdvisorOpinion, toSession } from "@/lib/schemas/session";
import type { AdvisorOpinion } from "@/lib/schemas/advisor";
import type { AdvisorOpinionRecord, Session } from "@/types/session";

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

export interface CreateSessionInput {
  decision: string;
  context?: string;
}

export interface SaveOpinionInput {
  personaId: AdvisorPersonaId;
  opinion: AdvisorOpinion;
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
    const rows = opinions.map(({ personaId, opinion }) => ({
      session_id: sessionId,
      persona_id: personaId,
      round_number: roundNumber,
      score: opinion.score,
      thesis: opinion.thesis,
      arguments: opinion.arguments,
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
}

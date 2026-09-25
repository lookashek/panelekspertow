/**
 * Round-one use-case orchestration (`.claude/rules/backend.md` §1) — the only place that wires a
 * `SessionRepository` + `LlmProvider` together to create a session, run (or replay) its first
 * round, persist successful opinions, and log the score spread. No `Request`/`Response` types
 * here; HTTP concerns (auth, SSE framing, abort wiring) belong to the API route (later phase).
 */

import type { AdvisorPersonaId, AdvisorStrategy } from "@/lib/advisors/registry";
import { ADVISOR_REGISTRY } from "@/lib/advisors/registry";
import { runPanel } from "@/lib/advisors/run-panel";
import type { PanelStreamChunk } from "@/lib/advisors/run-panel";
import type { LlmError } from "@/lib/errors";
import { ErrorCode, NotFoundError } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import type { Logger } from "@/lib/logger";
import type { SaveOpinionInput, SessionRepository } from "@/lib/repositories/session.repository";
import { err, ok } from "@/lib/result";
import type { Result } from "@/lib/result";
import type { LlmProvider } from "@/lib/adapters/llm-provider";
import type { AdvisorOpinion } from "@/lib/schemas/advisor";
import type { PanelInput } from "@/lib/schemas/panel";
import type { AdvisorOpinionRecord, Session } from "@/types/session";

export type PanelRunEvent =
  | { personaId: AdvisorPersonaId; kind: "score"; score: number; thesis: string; arguments: string[] }
  | { personaId: AdvisorPersonaId; kind: "token"; text: string }
  | { personaId: AdvisorPersonaId; kind: "done" }
  | { personaId: AdvisorPersonaId; kind: "error"; code: string; message: string };

export interface PanelRunView {
  events: AsyncIterable<PanelRunEvent>;
  persistTail?: Promise<void>;
}

export interface SessionServiceDeps {
  repository: SessionRepository;
  provider: LlmProvider;
  logger?: Logger;
}

/**
 * Live path: scores resolve as a batch (Promise.all inside runPanel), so every score/error event
 * is emitted first in registry order, then the merged rationale stream is drained for
 * token/done/error events as they arrive.
 */
async function* buildLiveEvents(
  scores: Promise<Result<AdvisorOpinion, LlmError>[]>,
  stream: ReadableStream<PanelStreamChunk>,
  personas: AdvisorStrategy[],
): AsyncGenerator<PanelRunEvent> {
  const results = await scores;
  for (let i = 0; i < personas.length; i++) {
    const personaId = personas[i].id;
    const result = results[i];
    if (result.ok) {
      yield {
        personaId,
        kind: "score",
        score: result.value.score,
        thesis: result.value.thesis,
        arguments: result.value.arguments,
      };
    } else {
      yield { personaId, kind: "error", code: result.error.code, message: result.error.message };
    }
  }

  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const { personaId, chunk } = value;
    if (chunk.type === "token") {
      yield { personaId, kind: "token", text: chunk.text };
    } else if (chunk.type === "done") {
      yield { personaId, kind: "done" };
    } else {
      yield { personaId, kind: "error", code: chunk.error.code, message: chunk.error.message };
    }
  }
}

/**
 * Replay path: everything is already persisted, so this yields synchronously-known events through
 * an async generator only to keep `PanelRunView.events` the same `AsyncIterable` shape as the live
 * path (no route/caller code needs to know which path produced the view).
 */
// eslint-disable-next-line @typescript-eslint/require-await -- see doc comment above: async shape is structural, not because anything here awaits
async function* buildReplayEvents(
  records: AdvisorOpinionRecord[],
  personas: AdvisorStrategy[],
): AsyncGenerator<PanelRunEvent> {
  const byPersona = new Map(records.map((record) => [record.personaId, record]));
  for (const persona of personas) {
    const record = byPersona.get(persona.id);
    if (record) {
      yield {
        personaId: persona.id,
        kind: "score",
        score: record.score,
        thesis: record.thesis,
        arguments: record.arguments,
      };
      yield { personaId: persona.id, kind: "done" };
    } else {
      yield {
        personaId: persona.id,
        kind: "error",
        code: ErrorCode.LLM_PROVIDER_ERROR,
        message: "No round-one opinion recorded for this persona",
      };
    }
  }
}

export class SessionService {
  private readonly repository: SessionRepository;
  private readonly provider: LlmProvider;
  private readonly logger: Logger;

  constructor(deps: SessionServiceDeps) {
    this.repository = deps.repository;
    this.provider = deps.provider;
    this.logger = deps.logger ?? createLogger();
  }

  async createSession(input: PanelInput): Promise<Result<Session>> {
    return this.repository.createSession({ decision: input.decision, context: input.context });
  }

  async runFirstRound(sessionId: string, userId: string): Promise<Result<PanelRunView>> {
    const sessionResult = await this.repository.getSession(sessionId);
    if (!sessionResult.ok) {
      return sessionResult;
    }
    const session = sessionResult.value;
    if (session?.userId !== userId) {
      return err(new NotFoundError("Session not found"));
    }

    const opinionsResult = await this.repository.getOpinions(sessionId, 1);
    if (!opinionsResult.ok) {
      return opinionsResult;
    }
    const existing = opinionsResult.value;
    const personas = ADVISOR_REGISTRY;

    if (existing.length > 0) {
      return ok({ events: buildReplayEvents(existing, personas) });
    }

    const { scores, stream } = runPanel(
      { provider: this.provider, personas },
      { decision: session.decision, context: session.context ?? undefined },
      undefined,
    );

    const persistTail = this.persistAndLogSpread(sessionId, scores, personas);

    return ok({ events: buildLiveEvents(scores, stream, personas), persistTail });
  }

  private async persistAndLogSpread(
    sessionId: string,
    scores: ReturnType<typeof runPanel>["scores"],
    personas: AdvisorStrategy[],
  ): Promise<void> {
    const results = await scores;
    const successes: SaveOpinionInput[] = [];
    const successScores: number[] = [];

    results.forEach((result, index) => {
      if (result.ok) {
        successes.push({ personaId: personas[index].id, opinion: result.value });
        successScores.push(result.value.score);
      }
    });

    if (successes.length > 0) {
      const saveResult = await this.repository.saveOpinions(sessionId, 1, successes);
      if (!saveResult.ok) {
        this.logger.error("failed to persist round-one opinions", { sessionId, message: saveResult.error.message });
      }
    }

    const spread = successScores.length >= 2 ? Math.max(...successScores) - Math.min(...successScores) : null;
    this.logger.info("round-one spread", { sessionId, spread, personaCount: successScores.length });
  }
}

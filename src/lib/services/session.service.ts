/**
 * Round-one use-case orchestration (`.claude/rules/backend.md` §1) — the only place that wires a
 * `SessionRepository` + `LlmProvider` together to create a session, run (or replay) its first
 * round, persist successful opinions, and log the score spread. No `Request`/`Response` types
 * here; HTTP concerns (auth, SSE framing, abort wiring) belong to the API route (later phase).
 */

import type { AdvisorPersonaId, AdvisorStrategy } from "@/lib/advisors/registry";
import { ADVISOR_REGISTRY, MIN_ROUND_TWO_PARTICIPANTS } from "@/lib/advisors/registry";
import { runPanel, runSecondRoundPanel } from "@/lib/advisors/run-panel";
import type { PanelStreamChunk } from "@/lib/advisors/run-panel";
import { runSynthesis as runSynthesizer } from "@/lib/advisors/run-synthesis";
import { ErrorCode, LlmError, NotFoundError, RoundTwoUnavailableError, SynthesisUnavailableError } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import type { Logger } from "@/lib/logger";
import type { SynthesisInput, SynthesisPersonaHead } from "@/lib/prompts/synthesis.v1";
import type { SaveOpinionInput, SessionRepository } from "@/lib/repositories/session.repository";
import { err, ok } from "@/lib/result";
import type { Result } from "@/lib/result";
import type { LlmProvider, StreamChunk } from "@/lib/adapters/llm-provider";
import type { AdvisorOpinion, AdvisorRoundTwoOpinion } from "@/lib/schemas/advisor";
import type { PanelInput } from "@/lib/schemas/panel";
import type { Synthesis } from "@/lib/schemas/synthesis";
import type { AdvisorOpinionRecord, Session, SessionSynthesis } from "@/types/session";

export type PanelRunEvent =
  | {
      personaId: AdvisorPersonaId;
      kind: "score";
      score: number;
      thesis: string;
      arguments: string[];
      previousScore: number | null;
      attributedPersonaId: AdvisorPersonaId | null;
      attributionQuote: string | null;
    }
  | { personaId: AdvisorPersonaId; kind: "token"; text: string }
  | { personaId: AdvisorPersonaId; kind: "done" }
  | { personaId: AdvisorPersonaId; kind: "error"; code: string; message: string };

/**
 * Result of applying the round-two attribution invariant to one persona's resolved head (plan
 * Phase 4, "Critical Implementation Details"): score unchanged + attribution present -> drop the
 * attribution; score changed + attribution missing or naming a non-participant/self -> fail the
 * persona (LLM_INVALID_OUTPUT, partial-failure path); score changed + attribution present naming a
 * real participating peer -> keep it. This is the single source of truth for both the live `score`
 * event and the persisted round-two row, so the emitted badge and the replayed badge never diverge.
 */
type RoundTwoResolution =
  | { failed: true; error: LlmError }
  | {
      failed: false;
      score: number;
      thesis: string;
      arguments: string[];
      previousScore: number | null;
      attributedPersonaId: AdvisorPersonaId | null;
      attributionQuote: string | null;
    };

function resolveRoundTwo(
  headResult: Result<AdvisorRoundTwoOpinion, LlmError>,
  personaId: AdvisorPersonaId,
  priorScore: number,
  priorHeads: Map<AdvisorPersonaId, AdvisorOpinion>,
): RoundTwoResolution {
  if (!headResult.ok) {
    return { failed: true, error: headResult.error };
  }

  const head = headResult.value;
  if (head.score === priorScore) {
    return {
      failed: false,
      score: head.score,
      thesis: head.thesis,
      arguments: head.arguments,
      previousScore: null,
      attributedPersonaId: null,
      attributionQuote: null,
    };
  }

  const attribution = head.attribution;
  const namesRealPeer =
    attribution !== null &&
    attribution.convincedByPersonaId !== personaId &&
    priorHeads.has(attribution.convincedByPersonaId);

  if (!namesRealPeer) {
    return {
      failed: true,
      error: new LlmError("Score changed without valid attribution", ErrorCode.LLM_INVALID_OUTPUT),
    };
  }

  return {
    failed: false,
    score: head.score,
    thesis: head.thesis,
    arguments: head.arguments,
    previousScore: priorScore,
    attributedPersonaId: attribution.convincedByPersonaId,
    attributionQuote: attribution.quotedPeerArgument,
  };
}

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
        previousScore: null,
        attributedPersonaId: null,
        attributionQuote: null,
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
        previousScore: null,
        attributedPersonaId: null,
        attributionQuote: null,
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

/**
 * Round-two live path: mirrors `buildLiveEvents` but resolves each persona's head through
 * `resolveRoundTwo` (invariant enforcement) before emitting its `score` event, and iterates
 * `participants` (only personas with a round-one head), never the full registry — see plan Phase 4
 * "Critical Implementation Details" on why handing this the full registry would misalign `scores`'
 * positional indexing and surface spurious error cards for non-participants.
 */
async function* buildLiveEventsRoundTwo(
  scores: Promise<Result<AdvisorRoundTwoOpinion, LlmError>[]>,
  stream: ReadableStream<PanelStreamChunk>,
  participants: AdvisorStrategy[],
  priorScores: Map<AdvisorPersonaId, number>,
  priorHeads: Map<AdvisorPersonaId, AdvisorOpinion>,
): AsyncGenerator<PanelRunEvent> {
  const results = await scores;
  for (let i = 0; i < participants.length; i++) {
    const personaId = participants[i].id;
    const priorScore = priorScores.get(personaId);
    const resolution =
      priorScore === undefined
        ? ({ failed: true, error: new LlmError("Missing round-one score", ErrorCode.LLM_PROVIDER_ERROR) } as const)
        : resolveRoundTwo(results[i], personaId, priorScore, priorHeads);
    if (resolution.failed) {
      yield { personaId, kind: "error", code: resolution.error.code, message: resolution.error.message };
    } else {
      yield {
        personaId,
        kind: "score",
        score: resolution.score,
        thesis: resolution.thesis,
        arguments: resolution.arguments,
        previousScore: resolution.previousScore,
        attributedPersonaId: resolution.attributedPersonaId,
        attributionQuote: resolution.attributionQuote,
      };
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
 * Round-two replay path: mirrors `buildReplayEvents`, iterating `participants` and reading the
 * persisted attribution columns straight off each `AdvisorOpinionRecord`.
 */
// eslint-disable-next-line @typescript-eslint/require-await -- see buildReplayEvents doc comment above: async shape is structural
async function* buildReplayEventsRoundTwo(
  records: AdvisorOpinionRecord[],
  participants: AdvisorStrategy[],
): AsyncGenerator<PanelRunEvent> {
  const byPersona = new Map(records.map((record) => [record.personaId, record]));
  for (const persona of participants) {
    const record = byPersona.get(persona.id);
    if (record) {
      yield {
        personaId: persona.id,
        kind: "score",
        score: record.score,
        thesis: record.thesis,
        arguments: record.arguments,
        previousScore: record.previousScore,
        attributedPersonaId: record.attributedPersonaId,
        attributionQuote: record.attributionQuote,
      };
      yield { personaId: persona.id, kind: "done" };
    } else {
      yield {
        personaId: persona.id,
        kind: "error",
        code: ErrorCode.LLM_PROVIDER_ERROR,
        message: "No round-two opinion recorded for this persona",
      };
    }
  }
}

/**
 * Synthesis event union — analogue of `PanelRunEvent` for the single-stream synthesizer (no
 * `personaId` tagging: this is one synthesis, not a per-persona fan-out).
 */
export type SynthesisRunEvent =
  | { kind: "synthesis"; synthesis: Synthesis }
  | { kind: "token"; text: string }
  | { kind: "done" }
  | { kind: "error"; code: string; message: string };

export interface SynthesisRunView {
  events: AsyncIterable<SynthesisRunEvent>;
  persistTail?: Promise<void>;
}

/**
 * Synthesis live path: mirrors `buildLiveEvents` but there is exactly one head (no positional
 * per-persona array) — await it, emit `synthesis` or `error`, then drain the prose stream.
 */
async function* buildLiveSynthesisEvents(
  synthesis: Promise<Result<Synthesis, LlmError>>,
  stream: ReadableStream<StreamChunk>,
): AsyncGenerator<SynthesisRunEvent> {
  const result = await synthesis;
  if (!result.ok) {
    yield { kind: "error", code: result.error.code, message: result.error.message };
    return;
  }
  yield { kind: "synthesis", synthesis: result.value };

  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value.type === "token") {
      yield { kind: "token", text: value.text };
    } else if (value.type === "done") {
      yield { kind: "done" };
    } else {
      yield { kind: "error", code: value.error.code, message: value.error.message };
    }
  }
}

/**
 * Synthesis replay path: mirrors `buildReplayEvents` — everything is already persisted, so the
 * persisted narrative is replayed as a single `token` chunk (plan Phase 4: "reconstructed from the
 * persisted narrative as a single token"), not split into multiple chunks.
 */
// eslint-disable-next-line @typescript-eslint/require-await -- see buildReplayEvents doc comment above: async shape is structural
async function* buildReplaySynthesisEvents(persisted: SessionSynthesis): AsyncGenerator<SynthesisRunEvent> {
  yield { kind: "synthesis", synthesis: persisted.content };
  yield { kind: "token", text: persisted.narrative };
  yield { kind: "done" };
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

  async runSecondRound(sessionId: string, userId: string): Promise<Result<PanelRunView>> {
    const sessionResult = await this.repository.getSession(sessionId);
    if (!sessionResult.ok) {
      return sessionResult;
    }
    const session = sessionResult.value;
    if (session?.userId !== userId) {
      return err(new NotFoundError("Session not found"));
    }

    const roundOneResult = await this.repository.getOpinions(sessionId, 1);
    if (!roundOneResult.ok) {
      return roundOneResult;
    }
    const roundOneRecords = roundOneResult.value;
    if (roundOneRecords.length < MIN_ROUND_TWO_PARTICIPANTS) {
      return err(new RoundTwoUnavailableError("Round two requires at least two round-one opinions"));
    }

    const priorHeads = new Map<AdvisorPersonaId, AdvisorOpinion>(
      roundOneRecords.map((record) => [
        record.personaId,
        { score: record.score, thesis: record.thesis, arguments: record.arguments },
      ]),
    );
    const priorScores = new Map<AdvisorPersonaId, number>(
      roundOneRecords.map((record) => [record.personaId, record.score]),
    );
    // Participating subset, never ADVISOR_REGISTRY — see plan Phase 4 "Critical Implementation
    // Details": buildReplayEventsRoundTwo emits a hard error for any persona without a record, and
    // both event builders index `scores` positionally, so a non-participant in this list would
    // surface a spurious error card and misalign live results.
    const participants: AdvisorStrategy[] = ADVISOR_REGISTRY.filter((persona) => priorHeads.has(persona.id));

    const roundTwoResult = await this.repository.getOpinions(sessionId, 2);
    if (!roundTwoResult.ok) {
      return roundTwoResult;
    }
    const existingRoundTwo = roundTwoResult.value;

    if (existingRoundTwo.length > 0) {
      return ok({ events: buildReplayEventsRoundTwo(existingRoundTwo, participants) });
    }

    const { scores, stream } = runSecondRoundPanel(
      { provider: this.provider, personas: participants },
      { decision: session.decision, context: session.context ?? undefined },
      priorHeads,
      undefined,
    );

    const persistTail = this.persistRoundTwoAndLogMetrics(sessionId, scores, participants, priorScores, priorHeads);

    return ok({
      events: buildLiveEventsRoundTwo(scores, stream, participants, priorScores, priorHeads),
      persistTail,
    });
  }

  async runSynthesis(sessionId: string, userId: string): Promise<Result<SynthesisRunView>> {
    const sessionResult = await this.repository.getSession(sessionId);
    if (!sessionResult.ok) {
      return sessionResult;
    }
    const session = sessionResult.value;
    if (session?.userId !== userId) {
      return err(new NotFoundError("Session not found"));
    }

    const existingResult = await this.repository.getSynthesis(sessionId);
    if (!existingResult.ok) {
      return existingResult;
    }
    const existing = existingResult.value;
    if (existing) {
      return ok({ events: buildReplaySynthesisEvents(existing) });
    }

    const roundOneResult = await this.repository.getOpinions(sessionId, 1);
    if (!roundOneResult.ok) {
      return roundOneResult;
    }
    const roundOneRecords = roundOneResult.value;
    if (roundOneRecords.length === 0) {
      return err(new SynthesisUnavailableError("Synthesis requires at least one round-one opinion"));
    }

    const roundTwoResult = await this.repository.getOpinions(sessionId, 2);
    if (!roundTwoResult.ok) {
      return roundTwoResult;
    }
    const roundTwoRecords = roundTwoResult.value;

    // Latest-per-persona merge in registry order — round two only ever covers a subset of
    // personas, so round-one is the fallback for anyone who didn't participate in round two. See
    // plan Phase 4 "Critical Implementation Details".
    const roundOneByPersona = new Map(roundOneRecords.map((record) => [record.personaId, record]));
    const roundTwoByPersona = new Map(roundTwoRecords.map((record) => [record.personaId, record]));
    const personaHeads: SynthesisPersonaHead[] = [];
    for (const persona of ADVISOR_REGISTRY) {
      const record = roundTwoByPersona.get(persona.id) ?? roundOneByPersona.get(persona.id);
      if (!record) {
        continue;
      }
      personaHeads.push({
        label: persona.label,
        head: { score: record.score, thesis: record.thesis, arguments: record.arguments },
      });
    }

    const synthesisInput: SynthesisInput = {
      panelInput: { decision: session.decision, context: session.context ?? undefined },
      personaHeads,
    };

    const { synthesis, stream } = runSynthesizer({ provider: this.provider }, synthesisInput, undefined);
    // `stream` has exactly one consumer per branch; `persistSynthesis` (narrative accumulation for
    // the persist tail) and `buildLiveSynthesisEvents` (the live SSE events) each need their own
    // independent read of the same prose stream, so tee it rather than sharing one reader.
    const [eventStream, persistStream] = stream.tee();

    const persistTail = this.persistSynthesis(sessionId, synthesis, persistStream);

    return ok({ events: buildLiveSynthesisEvents(synthesis, eventStream), persistTail });
  }

  private async persistRoundTwoAndLogMetrics(
    sessionId: string,
    scores: ReturnType<typeof runSecondRoundPanel>["scores"],
    participants: AdvisorStrategy[],
    priorScores: Map<AdvisorPersonaId, number>,
    priorHeads: Map<AdvisorPersonaId, AdvisorOpinion>,
  ): Promise<void> {
    const results = await scores;
    const successes: SaveOpinionInput[] = [];
    const successScores: number[] = [];
    let changedCount = 0;
    let attributedCount = 0;

    results.forEach((result, index) => {
      const persona = participants[index];
      const priorScore = priorScores.get(persona.id);
      if (priorScore === undefined) {
        return;
      }
      const resolution = resolveRoundTwo(result, persona.id, priorScore, priorHeads);
      if (resolution.failed) {
        return;
      }
      successes.push({
        personaId: persona.id,
        opinion: { score: resolution.score, thesis: resolution.thesis, arguments: resolution.arguments },
        previousScore: resolution.previousScore,
        attributedPersonaId: resolution.attributedPersonaId,
        attributionQuote: resolution.attributionQuote,
      });
      successScores.push(resolution.score);
      if (resolution.previousScore !== null) {
        changedCount += 1;
      }
      if (resolution.attributedPersonaId !== null) {
        attributedCount += 1;
      }
    });

    if (successes.length > 0) {
      const saveResult = await this.repository.saveOpinions(sessionId, 2, successes);
      if (!saveResult.ok) {
        this.logger.error("failed to persist round-two opinions", { sessionId, message: saveResult.error.message });
      }
    }

    const spread = successScores.length >= 2 ? Math.max(...successScores) - Math.min(...successScores) : null;
    this.logger.info("round-two metrics", {
      sessionId,
      participantCount: participants.length,
      changedCount,
      attributedCount,
      spread,
    });
  }

  /**
   * Persist-tail order (plan Phase 4): save the synthesis row first, then flip the session status —
   * if the save fails, do NOT flip status. On head failure, persist nothing at all.
   */
  private async persistSynthesis(
    sessionId: string,
    synthesis: Promise<Result<Synthesis, LlmError>>,
    stream: ReadableStream<StreamChunk>,
  ): Promise<void> {
    const result = await synthesis;
    if (!result.ok) {
      this.logger.error("synthesis head failed, skipping persist", { sessionId, message: result.error.message });
      return;
    }

    let narrative = "";
    const reader = stream.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.type === "token") {
        narrative += value.text;
      } else if (value.type === "error") {
        this.logger.error("synthesis rationale stream failed", { sessionId, message: value.error.message });
      }
    }

    const saveResult = await this.repository.saveSynthesis(sessionId, { content: result.value, narrative });
    if (!saveResult.ok) {
      this.logger.error("failed to persist synthesis", { sessionId, message: saveResult.error.message });
      return;
    }

    const completeResult = await this.repository.completeSession(sessionId);
    if (!completeResult.ok) {
      this.logger.error("failed to complete session", { sessionId, message: completeResult.error.message });
    }
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

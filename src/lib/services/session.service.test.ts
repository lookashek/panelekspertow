import { describe, expect, it, vi } from "vitest";

// `create-llm-provider.ts` reads `astro:env/server`, which only resolves inside the Astro/Vite
// pipeline (not plain Vitest). Stub it so this test can exercise `runPanel` without booting Astro.
vi.mock("@/lib/adapters/create-llm-provider", () => ({
  defaultAdvisorModel: () => "test-model",
}));

import type { CompleteRequest, LlmProvider, StreamChunk, StreamRequest } from "@/lib/adapters/llm-provider";
import { ADVISOR_REGISTRY, MAX_SIDE_THREAD_MESSAGES, SIDE_THREAD_RATE_MAX } from "@/lib/advisors/registry";
import {
  DbError,
  ErrorCode,
  LlmError,
  NotFoundError,
  RateLimitError,
  RoundTwoUnavailableError,
  SideThreadUnavailableError,
  SynthesisUnavailableError,
} from "@/lib/errors";
import type { Logger } from "@/lib/logger";
import type {
  SaveOpinionInput,
  SaveSideThreadMessageInput,
  SaveSynthesisInput,
  SessionRepository,
} from "@/lib/repositories/session.repository";
import { err, ok } from "@/lib/result";
import type { Result } from "@/lib/result";
import type { AdvisorOpinion, AdvisorRoundTwoOpinion } from "@/lib/schemas/advisor";
import type { Synthesis } from "@/lib/schemas/synthesis";
import { SessionService } from "@/lib/services/session.service";
import type { PanelRunEvent, SideThreadRunEvent, SynthesisRunEvent } from "@/lib/services/session.service";
import type { AdvisorOpinionRecord, Session, SessionSynthesis, SideThreadMessage } from "@/types/session";

function makeTokenStream(text: string): ReadableStream<StreamChunk> {
  return new ReadableStream<StreamChunk>({
    start(controller) {
      controller.enqueue({ type: "token", text });
      controller.enqueue({ type: "done" });
      controller.close();
    },
  });
}

function makeProvider(overrides: {
  complete: (req: CompleteRequest<AdvisorOpinion>) => Promise<Result<AdvisorOpinion, LlmError>>;
  stream?: (req: StreamRequest) => ReadableStream<StreamChunk>;
}): LlmProvider {
  return {
    complete: overrides.complete,
    stream: overrides.stream ?? (() => makeTokenStream("hi")),
  } as unknown as LlmProvider;
}

function makeRoundTwoProvider(overrides: {
  complete: (req: CompleteRequest<AdvisorRoundTwoOpinion>) => Promise<Result<AdvisorRoundTwoOpinion, LlmError>>;
  stream?: (req: StreamRequest) => ReadableStream<StreamChunk>;
}): LlmProvider {
  return {
    complete: overrides.complete,
    stream: overrides.stream ?? (() => makeTokenStream("hi")),
  } as unknown as LlmProvider;
}

function makeSynthesisProvider(overrides: {
  complete: (req: CompleteRequest<Synthesis>) => Promise<Result<Synthesis, LlmError>>;
  stream?: (req: StreamRequest) => ReadableStream<StreamChunk>;
}): LlmProvider {
  return {
    complete: overrides.complete,
    stream: overrides.stream ?? (() => makeTokenStream("narrative")),
  } as unknown as LlmProvider;
}

function makeSynthesis(overrides: Partial<Synthesis> = {}): Synthesis {
  return {
    agreementPoints: ["agree"],
    disputeAxes: [{ title: "axis", positions: ["a", "b"] }],
    risks: [{ description: "risk", weight: "medium" }],
    recommendedNextStep: "next step",
    ...overrides,
  };
}

function makeSessionSynthesis(overrides: Partial<SessionSynthesis> = {}): SessionSynthesis {
  return {
    id: "synthesis-1",
    sessionId: "session-1",
    userId: "user-1",
    content: makeSynthesis(),
    narrative: "persisted narrative",
    createdAt: "2026-09-23T12:00:00.000Z",
    ...overrides,
  };
}

/** `getOpinions` fake that routes on `roundNumber`, for tests exercising both round one and two. */
function makeGetOpinionsByRound(byRound: Record<number, AdvisorOpinionRecord[]>) {
  return vi
    .fn()
    .mockImplementation((_sessionId: string, roundNumber: number) => Promise.resolve(ok(byRound[roundNumber] ?? [])));
}

function makeLogger() {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() } satisfies Logger;
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "session-1",
    userId: "user-1",
    decision: "Should I do X?",
    context: null,
    status: "active",
    createdAt: "2026-09-23T12:00:00.000Z",
    updatedAt: "2026-09-23T12:00:00.000Z",
    ...overrides,
  };
}

function makeOpinionRecord(personaId: string, overrides: Partial<AdvisorOpinionRecord> = {}): AdvisorOpinionRecord {
  return {
    id: `opinion-${personaId}`,
    sessionId: "session-1",
    userId: "user-1",
    personaId: personaId as AdvisorOpinionRecord["personaId"],
    roundNumber: 1,
    score: 5,
    thesis: `${personaId} thesis`,
    arguments: [`${personaId} argument`],
    createdAt: "2026-09-23T12:00:00.000Z",
    previousScore: null,
    attributedPersonaId: null,
    attributionQuote: null,
    ...overrides,
  };
}

interface RepoMock {
  createSession: ReturnType<typeof vi.fn>;
  saveOpinions: ReturnType<typeof vi.fn>;
  listSessions: ReturnType<typeof vi.fn>;
  getSession: ReturnType<typeof vi.fn>;
  getOpinions: ReturnType<typeof vi.fn>;
  getSynthesis: ReturnType<typeof vi.fn>;
  saveSynthesis: ReturnType<typeof vi.fn>;
  completeSession: ReturnType<typeof vi.fn>;
  saveSideThreadMessage: ReturnType<typeof vi.fn>;
  getSideThreadMessagesForSession: ReturnType<typeof vi.fn>;
  getSideThreadMessages: ReturnType<typeof vi.fn>;
  countSideThreadUserMessages: ReturnType<typeof vi.fn>;
  countRecentSideThreadMessagesByUser: ReturnType<typeof vi.fn>;
}

function makeSideThreadMessage(overrides: Partial<SideThreadMessage> = {}): SideThreadMessage {
  return {
    id: "side-thread-1",
    sessionId: "session-1",
    userId: "user-1",
    personaId: "optymista",
    role: "user",
    content: "content",
    createdAt: "2026-09-23T12:00:00.000Z",
    ...overrides,
  };
}

function makeRepository(overrides: Partial<RepoMock> = {}): { repository: SessionRepository; mock: RepoMock } {
  const mock: RepoMock = {
    createSession: vi.fn(),
    saveOpinions: vi.fn().mockResolvedValue(ok([])),
    listSessions: vi.fn(),
    getSession: vi.fn(),
    getOpinions: vi.fn(),
    getSynthesis: vi.fn().mockResolvedValue(ok(null)),
    saveSynthesis: vi.fn().mockResolvedValue(ok(makeSessionSynthesis())),
    completeSession: vi.fn().mockResolvedValue(ok(undefined)),
    saveSideThreadMessage: vi.fn().mockResolvedValue(ok(makeSideThreadMessage())),
    getSideThreadMessagesForSession: vi.fn().mockResolvedValue(ok([])),
    getSideThreadMessages: vi.fn().mockResolvedValue(ok([])),
    countSideThreadUserMessages: vi.fn().mockResolvedValue(ok(0)),
    countRecentSideThreadMessagesByUser: vi.fn().mockResolvedValue(ok(0)),
    ...overrides,
  };
  return { repository: mock as unknown as SessionRepository, mock };
}

async function collect(events: AsyncIterable<PanelRunEvent>): Promise<PanelRunEvent[]> {
  const out: PanelRunEvent[] = [];
  for await (const event of events) {
    out.push(event);
  }
  return out;
}

async function collectSynthesisEvents(events: AsyncIterable<SynthesisRunEvent>): Promise<SynthesisRunEvent[]> {
  const out: SynthesisRunEvent[] = [];
  for await (const event of events) {
    out.push(event);
  }
  return out;
}

async function collectSideThreadEvents(events: AsyncIterable<SideThreadRunEvent>): Promise<SideThreadRunEvent[]> {
  const out: SideThreadRunEvent[] = [];
  for await (const event of events) {
    out.push(event);
  }
  return out;
}

function makeSideThreadProvider(
  overrides: {
    complete?: (req: CompleteRequest<never>) => Promise<Result<never, LlmError>>;
    stream?: (req: StreamRequest) => ReadableStream<StreamChunk>;
  } = {},
): LlmProvider {
  return {
    complete: overrides.complete ?? vi.fn(),
    stream: overrides.stream ?? (() => makeTokenStream("answer")),
  };
}

describe("SessionService.createSession", () => {
  it("delegates to repository.createSession and returns its result", async () => {
    const session = makeSession();
    const { repository, mock } = makeRepository({ createSession: vi.fn().mockResolvedValue(ok(session)) });
    const provider = makeProvider({ complete: vi.fn() });
    const service = new SessionService({ repository, provider, logger: makeLogger() });

    const result = await service.createSession({ decision: "Should I do X?", context: "ctx" });

    expect(mock.createSession).toHaveBeenCalledWith({ decision: "Should I do X?", context: "ctx" });
    expect(result).toEqual(ok(session));
  });
});

describe("SessionService.listSessions", () => {
  it("returns the repository's ok result, and works with a provider-less (read-only) service", async () => {
    const sessions = [makeSession({ id: "session-1" }), makeSession({ id: "session-2" })];
    const { repository, mock } = makeRepository({ listSessions: vi.fn().mockResolvedValue(ok(sessions)) });
    const service = new SessionService({ repository });

    const result = await service.listSessions({ limit: 10 });

    expect(mock.listSessions).toHaveBeenCalledWith({ limit: 10 });
    expect(result).toEqual(ok(sessions));
  });

  it("propagates a repository error Result unchanged", async () => {
    const dbError = new DbError("Failed to list sessions", new Error("boom"));
    const { repository, mock } = makeRepository({ listSessions: vi.fn().mockResolvedValue(err(dbError)) });
    const service = new SessionService({ repository });

    const result = await service.listSessions();

    expect(mock.listSessions).toHaveBeenCalledWith(undefined);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(dbError);
    }
  });
});

describe("SessionService.runFirstRound", () => {
  it("returns NotFoundError when the session belongs to another user", async () => {
    const session = makeSession({ userId: "someone-else" });
    const { repository, mock } = makeRepository({ getSession: vi.fn().mockResolvedValue(ok(session)) });
    const provider = makeProvider({ complete: vi.fn() });
    const service = new SessionService({ repository, provider, logger: makeLogger() });

    const result = await service.runFirstRound("session-1", "user-1");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(NotFoundError);
    }
    expect(mock.getOpinions).not.toHaveBeenCalled();
  });

  it("returns NotFoundError when the session does not exist", async () => {
    const { repository, mock } = makeRepository({ getSession: vi.fn().mockResolvedValue(ok(null)) });
    const provider = makeProvider({ complete: vi.fn() });
    const service = new SessionService({ repository, provider, logger: makeLogger() });

    const result = await service.runFirstRound("session-1", "user-1");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(NotFoundError);
    }
    expect(mock.getOpinions).not.toHaveBeenCalled();
  });

  it("live run: all personas succeed -> saves all pairs, logs spread, emits score events", async () => {
    const session = makeSession();
    const scoreValues = [7, 3, 9, 5]; // spread = 6, matches ADVISOR_REGISTRY order
    let call = 0;
    const completeMock = vi.fn().mockImplementation(() => {
      const score = scoreValues[call];
      call += 1;
      return Promise.resolve(ok<AdvisorOpinion>({ score, thesis: "t", arguments: ["a"] }));
    });
    const provider = makeProvider({ complete: completeMock });
    const logger = makeLogger();
    const { repository, mock } = makeRepository({
      getSession: vi.fn().mockResolvedValue(ok(session)),
      getOpinions: vi.fn().mockResolvedValue(ok([])),
    });
    const service = new SessionService({ repository, provider, logger });

    const result = await service.runFirstRound("session-1", "user-1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const events = await collect(result.value.events);

    // allow the fire-and-forget persist/log pipeline to settle
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mock.saveOpinions).toHaveBeenCalledTimes(1);
    const [, roundNumber, saved] = mock.saveOpinions.mock.calls[0] as [string, number, SaveOpinionInput[]];
    expect(roundNumber).toBe(1);
    expect(saved).toHaveLength(4);
    ADVISOR_REGISTRY.forEach((persona, index) => {
      expect(saved[index]).toEqual({
        personaId: persona.id,
        opinion: { score: scoreValues[index], thesis: "t", arguments: ["a"] },
      });
    });

    expect(logger.info).toHaveBeenCalledWith("round-one spread", {
      sessionId: "session-1",
      spread: 6,
      personaCount: 4,
    });

    const scoreEvents = events.filter((e) => e.kind === "score");
    expect(scoreEvents).toHaveLength(4);
  });

  it("partial failure: one persona fails -> saves only successes, surfaces an error event, spread over successes only", async () => {
    const session = makeSession();
    const failingId = ADVISOR_REGISTRY[0].id;
    const remainingScores = [4, 8, 6];
    let call = 0;
    const completeMock = vi.fn().mockImplementation(() => {
      if (call === 0) {
        call += 1;
        return Promise.resolve(err(new LlmError("bad output", ErrorCode.LLM_INVALID_OUTPUT)));
      }
      const score = remainingScores[call - 1];
      call += 1;
      return Promise.resolve(ok<AdvisorOpinion>({ score, thesis: "t", arguments: ["a"] }));
    });
    const provider = makeProvider({ complete: completeMock });
    const logger = makeLogger();
    const { repository, mock } = makeRepository({
      getSession: vi.fn().mockResolvedValue(ok(session)),
      getOpinions: vi.fn().mockResolvedValue(ok([])),
    });
    const service = new SessionService({ repository, provider, logger });

    const result = await service.runFirstRound("session-1", "user-1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const events = await collect(result.value.events);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mock.saveOpinions).toHaveBeenCalledTimes(1);
    const [, , saved] = mock.saveOpinions.mock.calls[0] as [string, number, SaveOpinionInput[]];
    expect(saved).toHaveLength(3);
    expect(saved.some((s) => s.personaId === failingId)).toBe(false);

    const errorEvent = events.find((e) => e.personaId === failingId && e.kind === "error");
    expect(errorEvent).toBeDefined();

    // spread over [4, 8, 6] = 4
    expect(logger.info).toHaveBeenCalledWith("round-one spread", {
      sessionId: "session-1",
      spread: 4,
      personaCount: 3,
    });
  });

  it("all-fail: saveOpinions not called, spread logged as null with personaCount 0", async () => {
    const session = makeSession();
    const completeMock = vi.fn().mockResolvedValue(err(new LlmError("bad output", ErrorCode.LLM_INVALID_OUTPUT)));
    const provider = makeProvider({ complete: completeMock });
    const logger = makeLogger();
    const { repository, mock } = makeRepository({
      getSession: vi.fn().mockResolvedValue(ok(session)),
      getOpinions: vi.fn().mockResolvedValue(ok([])),
    });
    const service = new SessionService({ repository, provider, logger });

    const result = await service.runFirstRound("session-1", "user-1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    await collect(result.value.events);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mock.saveOpinions).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith("round-one spread", {
      sessionId: "session-1",
      spread: null,
      personaCount: 0,
    });
  });

  it("replay: existing opinions for all personas -> provider never called, emits score+done per persona in registry order", async () => {
    const session = makeSession();
    const records = ADVISOR_REGISTRY.map((persona, index) => makeOpinionRecord(persona.id, { score: index + 1 }));
    const completeMock = vi.fn();
    const streamMock = vi.fn();
    const provider = makeProvider({ complete: completeMock, stream: streamMock });
    const { repository } = makeRepository({
      getSession: vi.fn().mockResolvedValue(ok(session)),
      getOpinions: vi.fn().mockResolvedValue(ok(records)),
    });
    const service = new SessionService({ repository, provider, logger: makeLogger() });

    const result = await service.runFirstRound("session-1", "user-1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const events = await collect(result.value.events);

    expect(completeMock).not.toHaveBeenCalled();
    expect(streamMock).not.toHaveBeenCalled();

    const expectedKinds = ADVISOR_REGISTRY.flatMap((persona) => [`${persona.id}:score`, `${persona.id}:done`]);
    const actualKinds = events.map((e) => `${e.personaId}:${e.kind}`);
    expect(actualKinds).toEqual(expectedKinds);
  });

  it("replay with a missing persona: that persona's events include an error, not a hang", async () => {
    const session = makeSession();
    const present = ADVISOR_REGISTRY.slice(0, 3);
    const missingId = ADVISOR_REGISTRY[3].id;
    const records = present.map((persona) => makeOpinionRecord(persona.id));
    const provider = makeProvider({ complete: vi.fn(), stream: vi.fn() });
    const { repository } = makeRepository({
      getSession: vi.fn().mockResolvedValue(ok(session)),
      getOpinions: vi.fn().mockResolvedValue(ok(records)),
    });
    const service = new SessionService({ repository, provider, logger: makeLogger() });

    const result = await service.runFirstRound("session-1", "user-1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const events = await collect(result.value.events);

    const missingPersonaEvents = events.filter((e) => e.personaId === missingId);
    expect(missingPersonaEvents).toHaveLength(1);
    expect(missingPersonaEvents[0].kind).toBe("error");
  });
});

describe("SessionService.runSecondRound", () => {
  it("returns NotFoundError when the session belongs to another user", async () => {
    const session = makeSession({ userId: "someone-else" });
    const { repository, mock } = makeRepository({ getSession: vi.fn().mockResolvedValue(ok(session)) });
    const provider = makeRoundTwoProvider({ complete: vi.fn() });
    const service = new SessionService({ repository, provider, logger: makeLogger() });

    const result = await service.runSecondRound("session-1", "user-1");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(NotFoundError);
    }
    expect(mock.getOpinions).not.toHaveBeenCalled();
  });

  it("returns RoundTwoUnavailableError when fewer than two round-one opinions exist", async () => {
    const session = makeSession();
    const records = [makeOpinionRecord(ADVISOR_REGISTRY[0].id)];
    const { repository } = makeRepository({
      getSession: vi.fn().mockResolvedValue(ok(session)),
      getOpinions: vi.fn().mockResolvedValue(ok(records)),
    });
    const provider = makeRoundTwoProvider({ complete: vi.fn() });
    const service = new SessionService({ repository, provider, logger: makeLogger() });

    const result = await service.runSecondRound("session-1", "user-1");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(RoundTwoUnavailableError);
    }
  });

  it("replay: round-two rows already exist -> provider never called, attribution fields come from persisted rows", async () => {
    const session = makeSession();
    const roundOneRecords = ADVISOR_REGISTRY.map((persona, index) =>
      makeOpinionRecord(persona.id, { score: index + 1 }),
    );
    const roundTwoRecords = ADVISOR_REGISTRY.map((persona, index) =>
      makeOpinionRecord(persona.id, {
        roundNumber: 2,
        score: index === 0 ? 8 : index + 1,
        previousScore: index === 0 ? 1 : null,
        attributedPersonaId: index === 0 ? ADVISOR_REGISTRY[1].id : null,
        attributionQuote: index === 0 ? "quote" : null,
      }),
    );
    const completeMock = vi.fn();
    const streamMock = vi.fn();
    const provider = makeRoundTwoProvider({ complete: completeMock, stream: streamMock });
    const { repository } = makeRepository({
      getSession: vi.fn().mockResolvedValue(ok(session)),
      getOpinions: makeGetOpinionsByRound({ 1: roundOneRecords, 2: roundTwoRecords }),
    });
    const service = new SessionService({ repository, provider, logger: makeLogger() });

    const result = await service.runSecondRound("session-1", "user-1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const events = await collect(result.value.events);

    expect(completeMock).not.toHaveBeenCalled();
    expect(streamMock).not.toHaveBeenCalled();

    const firstScoreEvent = events.find((e) => e.personaId === ADVISOR_REGISTRY[0].id && e.kind === "score");
    expect(firstScoreEvent).toMatchObject({
      previousScore: 1,
      attributedPersonaId: ADVISOR_REGISTRY[1].id,
      attributionQuote: "quote",
    });
    const unchangedScoreEvent = events.find((e) => e.personaId === ADVISOR_REGISTRY[1].id && e.kind === "score");
    expect(unchangedScoreEvent).toMatchObject({
      previousScore: null,
      attributedPersonaId: null,
      attributionQuote: null,
    });
  });

  it("replay with partial round-two rows: a participant missing its round-two row surfaces an error, not a hang", async () => {
    const session = makeSession();
    const roundOneRecords = ADVISOR_REGISTRY.map((persona) => makeOpinionRecord(persona.id, { score: 5 }));
    const presentInRoundTwo = ADVISOR_REGISTRY.slice(0, 3);
    const missingId = ADVISOR_REGISTRY[3].id;
    const roundTwoRecords = presentInRoundTwo.map((persona) =>
      makeOpinionRecord(persona.id, { roundNumber: 2, score: 6 }),
    );
    const completeMock = vi.fn();
    const streamMock = vi.fn();
    const provider = makeRoundTwoProvider({ complete: completeMock, stream: streamMock });
    const { repository } = makeRepository({
      getSession: vi.fn().mockResolvedValue(ok(session)),
      getOpinions: makeGetOpinionsByRound({ 1: roundOneRecords, 2: roundTwoRecords }),
    });
    const service = new SessionService({ repository, provider, logger: makeLogger() });

    const result = await service.runSecondRound("session-1", "user-1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const events = await collect(result.value.events);

    expect(completeMock).not.toHaveBeenCalled();
    expect(streamMock).not.toHaveBeenCalled();

    const missingPersonaEvents = events.filter((e) => e.personaId === missingId);
    expect(missingPersonaEvents).toHaveLength(1);
    expect(missingPersonaEvents[0].kind).toBe("error");

    for (const persona of presentInRoundTwo) {
      const personaEvents = events.filter((e) => e.personaId === persona.id);
      expect(personaEvents.map((e) => e.kind)).toEqual(["score", "done"]);
    }
  });

  it("live: keeps attribution on a valid changed score, drops it when unchanged, fails a changed score with no/invalid attribution, persists + logs metrics", async () => {
    const session = makeSession();
    const roundOneRecords = ADVISOR_REGISTRY.map((persona) => makeOpinionRecord(persona.id, { score: 5 }));

    let call = 0;
    const completeMock = vi.fn().mockImplementation(() => {
      const index = call;
      call += 1;
      if (index === 0) {
        // score changes, names a real participating peer -> kept
        return Promise.resolve(
          ok<AdvisorRoundTwoOpinion>({
            score: 8,
            thesis: "t",
            arguments: ["a"],
            attribution: { convincedByPersonaId: ADVISOR_REGISTRY[1].id, quotedPeerArgument: "peer arg" },
          }),
        );
      }
      if (index === 1) {
        // score unchanged but attribution present -> dropped, not a failure
        return Promise.resolve(
          ok<AdvisorRoundTwoOpinion>({
            score: 5,
            thesis: "t",
            arguments: ["a"],
            attribution: { convincedByPersonaId: ADVISOR_REGISTRY[0].id, quotedPeerArgument: "should be dropped" },
          }),
        );
      }
      if (index === 2) {
        // score changes, no attribution -> fails
        return Promise.resolve(
          ok<AdvisorRoundTwoOpinion>({ score: 9, thesis: "t", arguments: ["a"], attribution: null }),
        );
      }
      // score changes, attribution names itself (invalid) -> fails
      return Promise.resolve(
        ok<AdvisorRoundTwoOpinion>({
          score: 3,
          thesis: "t",
          arguments: ["a"],
          attribution: { convincedByPersonaId: ADVISOR_REGISTRY[3].id, quotedPeerArgument: "self-attribution" },
        }),
      );
    });
    const provider = makeRoundTwoProvider({ complete: completeMock });
    const logger = makeLogger();
    const { repository, mock } = makeRepository({
      getSession: vi.fn().mockResolvedValue(ok(session)),
      getOpinions: makeGetOpinionsByRound({ 1: roundOneRecords, 2: [] }),
    });
    const service = new SessionService({ repository, provider, logger });

    const result = await service.runSecondRound("session-1", "user-1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const events = await collect(result.value.events);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const scoreEvent0 = events.find((e) => e.personaId === ADVISOR_REGISTRY[0].id && e.kind === "score");
    expect(scoreEvent0).toMatchObject({
      previousScore: 5,
      attributedPersonaId: ADVISOR_REGISTRY[1].id,
      attributionQuote: "peer arg",
    });

    const scoreEvent1 = events.find((e) => e.personaId === ADVISOR_REGISTRY[1].id && e.kind === "score");
    expect(scoreEvent1).toMatchObject({ previousScore: null, attributedPersonaId: null, attributionQuote: null });

    const errorEvent2 = events.find((e) => e.personaId === ADVISOR_REGISTRY[2].id && e.kind === "error");
    expect(errorEvent2).toMatchObject({ code: ErrorCode.LLM_INVALID_OUTPUT });

    const errorEvent3 = events.find((e) => e.personaId === ADVISOR_REGISTRY[3].id && e.kind === "error");
    expect(errorEvent3).toMatchObject({ code: ErrorCode.LLM_INVALID_OUTPUT });

    expect(mock.saveOpinions).toHaveBeenCalledTimes(1);
    const [, roundNumber, saved] = mock.saveOpinions.mock.calls[0] as [string, number, SaveOpinionInput[]];
    expect(roundNumber).toBe(2);
    expect(saved).toHaveLength(2);
    expect(saved.find((s) => s.personaId === ADVISOR_REGISTRY[0].id)).toEqual({
      personaId: ADVISOR_REGISTRY[0].id,
      opinion: { score: 8, thesis: "t", arguments: ["a"] },
      previousScore: 5,
      attributedPersonaId: ADVISOR_REGISTRY[1].id,
      attributionQuote: "peer arg",
    });
    expect(saved.find((s) => s.personaId === ADVISOR_REGISTRY[1].id)).toEqual({
      personaId: ADVISOR_REGISTRY[1].id,
      opinion: { score: 5, thesis: "t", arguments: ["a"] },
      previousScore: null,
      attributedPersonaId: null,
      attributionQuote: null,
    });

    expect(logger.info).toHaveBeenCalledWith("round-two metrics", {
      sessionId: "session-1",
      participantCount: 4,
      changedCount: 1,
      attributedCount: 1,
      spread: 3,
    });
  });
});

describe("SessionService.runSynthesis", () => {
  it("returns NotFoundError when the session belongs to another user", async () => {
    const session = makeSession({ userId: "someone-else" });
    const { repository, mock } = makeRepository({ getSession: vi.fn().mockResolvedValue(ok(session)) });
    const provider = makeSynthesisProvider({ complete: vi.fn() });
    const service = new SessionService({ repository, provider, logger: makeLogger() });

    const result = await service.runSynthesis("session-1", "user-1");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(NotFoundError);
    }
    expect(mock.getSynthesis).not.toHaveBeenCalled();
  });

  it("returns SynthesisUnavailableError when round one has no opinions", async () => {
    const session = makeSession();
    const { repository, mock } = makeRepository({
      getSession: vi.fn().mockResolvedValue(ok(session)),
      getOpinions: vi.fn().mockResolvedValue(ok([])),
    });
    const provider = makeSynthesisProvider({ complete: vi.fn() });
    const service = new SessionService({ repository, provider, logger: makeLogger() });

    const result = await service.runSynthesis("session-1", "user-1");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(SynthesisUnavailableError);
    }
    expect(mock.saveSynthesis).not.toHaveBeenCalled();
  });

  it("replay: existing synthesis -> provider never called, emits synthesis + single-token narrative + done", async () => {
    const session = makeSession();
    const persisted = makeSessionSynthesis();
    const completeMock = vi.fn();
    const streamMock = vi.fn();
    const provider = makeSynthesisProvider({ complete: completeMock, stream: streamMock });
    const { repository, mock } = makeRepository({
      getSession: vi.fn().mockResolvedValue(ok(session)),
      getSynthesis: vi.fn().mockResolvedValue(ok(persisted)),
    });
    const service = new SessionService({ repository, provider, logger: makeLogger() });

    const result = await service.runSynthesis("session-1", "user-1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const events = await collectSynthesisEvents(result.value.events);

    expect(completeMock).not.toHaveBeenCalled();
    expect(streamMock).not.toHaveBeenCalled();
    expect(mock.getOpinions).not.toHaveBeenCalled();
    expect(events).toEqual([
      { kind: "synthesis", synthesis: persisted.content },
      { kind: "token", text: persisted.narrative },
      { kind: "done" },
    ]);
  });

  it("live: head success -> merges latest-per-persona heads, emits synthesis then token/done, persistTail saves then completes", async () => {
    const session = makeSession();
    const roundOneRecords = ADVISOR_REGISTRY.map((persona, index) =>
      makeOpinionRecord(persona.id, { score: index + 1 }),
    );
    // only the first two personas participated in round two -> their round-two head should win
    const roundTwoParticipants = ADVISOR_REGISTRY.slice(0, 2);
    const roundTwoRecords = roundTwoParticipants.map((persona) =>
      makeOpinionRecord(persona.id, { roundNumber: 2, score: 9 }),
    );
    const synthesis = makeSynthesis();
    const completeMock = vi.fn().mockResolvedValue(ok(synthesis));
    const provider = makeSynthesisProvider({ complete: completeMock, stream: () => makeTokenStream("hello") });
    const logger = makeLogger();
    const { repository, mock } = makeRepository({
      getSession: vi.fn().mockResolvedValue(ok(session)),
      getOpinions: makeGetOpinionsByRound({ 1: roundOneRecords, 2: roundTwoRecords }),
    });
    const service = new SessionService({ repository, provider, logger });

    const result = await service.runSynthesis("session-1", "user-1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const events = await collectSynthesisEvents(result.value.events);
    await result.value.persistTail;

    expect(events[0]).toEqual({ kind: "synthesis", synthesis });
    expect(events.some((e) => e.kind === "token" && e.text === "hello")).toBe(true);
    expect(events.at(-1)).toEqual({ kind: "done" });

    expect(completeMock).toHaveBeenCalledTimes(1);
    const request = completeMock.mock.calls[0][0] as CompleteRequest<Synthesis>;
    // latest-per-persona merge: personas 0 and 1 use round-two score (9), 2 and 3 fall back to round-one
    expect(request.user).toContain("9/10");

    expect(mock.saveSynthesis).toHaveBeenCalledTimes(1);
    const [, saveInput] = mock.saveSynthesis.mock.calls[0] as [string, SaveSynthesisInput];
    expect(saveInput.content).toEqual(synthesis);
    expect(saveInput.narrative).toBe("hello");
    expect(mock.completeSession).toHaveBeenCalledTimes(1);
    expect(mock.completeSession).toHaveBeenCalledWith("session-1");
  });

  it("live: head failure -> emits a single error event, persistTail saves nothing and does not complete the session", async () => {
    const session = makeSession();
    const roundOneRecords = ADVISOR_REGISTRY.map((persona) => makeOpinionRecord(persona.id));
    const completeMock = vi.fn().mockResolvedValue(err(new LlmError("bad output", ErrorCode.LLM_INVALID_OUTPUT)));
    const streamMock = vi.fn();
    const provider = makeSynthesisProvider({ complete: completeMock, stream: streamMock });
    const logger = makeLogger();
    const { repository, mock } = makeRepository({
      getSession: vi.fn().mockResolvedValue(ok(session)),
      getOpinions: makeGetOpinionsByRound({ 1: roundOneRecords, 2: [] }),
    });
    const service = new SessionService({ repository, provider, logger });

    const result = await service.runSynthesis("session-1", "user-1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const events = await collectSynthesisEvents(result.value.events);
    await result.value.persistTail;

    expect(events).toEqual([{ kind: "error", code: ErrorCode.LLM_INVALID_OUTPUT, message: "bad output" }]);
    expect(streamMock).not.toHaveBeenCalled();

    expect(mock.saveSynthesis).not.toHaveBeenCalled();
    expect(mock.completeSession).not.toHaveBeenCalled();
  });
});

describe("SessionService.askSideThread", () => {
  const personaId = ADVISOR_REGISTRY[0].id;

  it("returns NotFoundError when the session belongs to another user", async () => {
    const session = makeSession({ userId: "someone-else" });
    const { repository, mock } = makeRepository({ getSession: vi.fn().mockResolvedValue(ok(session)) });
    const provider = makeSideThreadProvider();
    const service = new SessionService({ repository, provider, logger: makeLogger() });

    const result = await service.askSideThread("session-1", "user-1", personaId, "question?");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(NotFoundError);
    }
    expect(mock.getOpinions).not.toHaveBeenCalled();
  });

  it("returns NotFoundError when the session does not exist", async () => {
    const { repository } = makeRepository({ getSession: vi.fn().mockResolvedValue(ok(null)) });
    const provider = makeSideThreadProvider();
    const service = new SessionService({ repository, provider, logger: makeLogger() });

    const result = await service.askSideThread("session-1", "user-1", personaId, "question?");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(NotFoundError);
    }
  });

  it("returns SideThreadUnavailableError when the persona has no round-one or round-two opinion", async () => {
    const session = makeSession();
    const { repository, mock } = makeRepository({
      getSession: vi.fn().mockResolvedValue(ok(session)),
      getOpinions: vi.fn().mockResolvedValue(ok([])),
    });
    const provider = makeSideThreadProvider();
    const service = new SessionService({ repository, provider, logger: makeLogger() });

    const result = await service.askSideThread("session-1", "user-1", personaId, "question?");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(SideThreadUnavailableError);
    }
    expect(mock.saveSideThreadMessage).not.toHaveBeenCalled();
  });

  it("head precedence: uses the round-two head when both round one and round two exist", async () => {
    const session = makeSession();
    const roundOneRecord = makeOpinionRecord(personaId, { score: 5, thesis: "round one thesis" });
    const roundTwoRecord = makeOpinionRecord(personaId, { roundNumber: 2, score: 9, thesis: "round two thesis" });
    const streamMock = vi.fn().mockReturnValue(makeTokenStream("answer"));
    const provider = makeSideThreadProvider({ stream: streamMock });
    const { repository } = makeRepository({
      getSession: vi.fn().mockResolvedValue(ok(session)),
      getOpinions: makeGetOpinionsByRound({ 1: [roundOneRecord], 2: [roundTwoRecord] }),
    });
    const service = new SessionService({ repository, provider, logger: makeLogger() });

    const result = await service.askSideThread("session-1", "user-1", personaId, "question?");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    await collectSideThreadEvents(result.value.events);
    await result.value.persistTail;

    expect(streamMock).toHaveBeenCalledTimes(1);
    const request = streamMock.mock.calls[0][0] as StreamRequest;
    expect(request.user).toContain("round two thesis");
    expect(request.user).not.toContain("round one thesis");
  });

  it("rate-limit rejection when the rolling window count is at the per-user max", async () => {
    const session = makeSession();
    const roundOneRecord = makeOpinionRecord(personaId, { score: 5 });
    const { repository, mock } = makeRepository({
      getSession: vi.fn().mockResolvedValue(ok(session)),
      getOpinions: makeGetOpinionsByRound({ 1: [roundOneRecord], 2: [] }),
      countRecentSideThreadMessagesByUser: vi.fn().mockResolvedValue(ok(SIDE_THREAD_RATE_MAX)),
    });
    const provider = makeSideThreadProvider();
    const service = new SessionService({ repository, provider, logger: makeLogger() });

    const result = await service.askSideThread("session-1", "user-1", personaId, "question?");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(RateLimitError);
    }
    expect(mock.saveSideThreadMessage).not.toHaveBeenCalled();
  });

  it("per-thread cap rejection when the thread's user-message count is at the max", async () => {
    const session = makeSession();
    const roundOneRecord = makeOpinionRecord(personaId, { score: 5 });
    const { repository, mock } = makeRepository({
      getSession: vi.fn().mockResolvedValue(ok(session)),
      getOpinions: makeGetOpinionsByRound({ 1: [roundOneRecord], 2: [] }),
      countSideThreadUserMessages: vi.fn().mockResolvedValue(ok(MAX_SIDE_THREAD_MESSAGES)),
    });
    const provider = makeSideThreadProvider();
    const service = new SessionService({ repository, provider, logger: makeLogger() });

    const result = await service.askSideThread("session-1", "user-1", personaId, "question?");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(RateLimitError);
    }
    expect(mock.saveSideThreadMessage).not.toHaveBeenCalled();
  });

  it("persists the user message before streaming, then persists the advisor message once persistTail resolves", async () => {
    const session = makeSession();
    const roundOneRecord = makeOpinionRecord(personaId, { score: 5 });
    let userMessageSavedBeforeStream = false;
    const streamMock = vi.fn().mockImplementation(() => {
      userMessageSavedBeforeStream = saveSideThreadMessage.mock.calls.length === 1;
      return makeTokenStream("full answer");
    });
    const saveSideThreadMessage = vi.fn().mockResolvedValue(ok(makeSideThreadMessage()));
    const provider = makeSideThreadProvider({ stream: streamMock });
    const { repository } = makeRepository({
      getSession: vi.fn().mockResolvedValue(ok(session)),
      getOpinions: makeGetOpinionsByRound({ 1: [roundOneRecord], 2: [] }),
      saveSideThreadMessage,
    });
    const service = new SessionService({ repository, provider, logger: makeLogger() });

    const result = await service.askSideThread("session-1", "user-1", personaId, "what about risk?");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(saveSideThreadMessage).toHaveBeenCalledTimes(1);
    const [, firstSaveInput] = saveSideThreadMessage.mock.calls[0] as [string, SaveSideThreadMessageInput];
    expect(firstSaveInput).toEqual({ personaId, role: "user", content: "what about risk?" });

    const events = await collectSideThreadEvents(result.value.events);
    await result.value.persistTail;

    expect(userMessageSavedBeforeStream).toBe(true);
    expect(events.some((e) => e.kind === "token" && e.text === "full answer")).toBe(true);
    expect(events.at(-1)).toEqual({ kind: "done" });

    expect(saveSideThreadMessage).toHaveBeenCalledTimes(2);
    const [, secondSaveInput] = saveSideThreadMessage.mock.calls[1] as [string, SaveSideThreadMessageInput];
    expect(secondSaveInput).toEqual({ personaId, role: "advisor", content: "full answer" });
  });
});

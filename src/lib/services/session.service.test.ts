import { describe, expect, it, vi } from "vitest";

// `create-llm-provider.ts` reads `astro:env/server`, which only resolves inside the Astro/Vite
// pipeline (not plain Vitest). Stub it so this test can exercise `runPanel` without booting Astro.
vi.mock("@/lib/adapters/create-llm-provider", () => ({
  defaultAdvisorModel: () => "test-model",
}));

import type { CompleteRequest, LlmProvider, StreamChunk, StreamRequest } from "@/lib/adapters/llm-provider";
import { ADVISOR_REGISTRY } from "@/lib/advisors/registry";
import { ErrorCode, LlmError, NotFoundError } from "@/lib/errors";
import type { Logger } from "@/lib/logger";
import type { SaveOpinionInput, SessionRepository } from "@/lib/repositories/session.repository";
import { err, ok } from "@/lib/result";
import type { Result } from "@/lib/result";
import type { AdvisorOpinion } from "@/lib/schemas/advisor";
import { SessionService } from "@/lib/services/session.service";
import type { PanelRunEvent } from "@/lib/services/session.service";
import type { AdvisorOpinionRecord, Session } from "@/types/session";

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
    ...overrides,
  };
}

interface RepoMock {
  createSession: ReturnType<typeof vi.fn>;
  saveOpinions: ReturnType<typeof vi.fn>;
  listSessions: ReturnType<typeof vi.fn>;
  getSession: ReturnType<typeof vi.fn>;
  getOpinions: ReturnType<typeof vi.fn>;
}

function makeRepository(overrides: Partial<RepoMock> = {}): { repository: SessionRepository; mock: RepoMock } {
  const mock: RepoMock = {
    createSession: vi.fn(),
    saveOpinions: vi.fn().mockResolvedValue(ok([])),
    listSessions: vi.fn(),
    getSession: vi.fn(),
    getOpinions: vi.fn(),
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

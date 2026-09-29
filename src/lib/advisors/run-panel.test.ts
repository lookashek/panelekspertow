import { describe, expect, it, vi } from "vitest";

// `create-llm-provider.ts` reads `astro:env/server`, which only resolves inside the Astro/Vite
// pipeline (not plain Vitest). Stub it so this test can exercise `runPanel` without booting Astro.
vi.mock("@/lib/adapters/create-llm-provider", () => ({
  defaultAdvisorModel: () => "test-model",
}));

import type { CompleteRequest, LlmProvider, StreamChunk, StreamRequest } from "@/lib/adapters/llm-provider";
import { ErrorCode, LlmError } from "@/lib/errors";
import { err, ok } from "@/lib/result";
import type { Result } from "@/lib/result";
import { ADVISOR_REGISTRY } from "@/lib/advisors/registry";
import type { AdvisorPersonaId, AdvisorStrategy, RoundOnePeer } from "@/lib/advisors/registry";
import { runPanel, runSecondRoundPanel } from "@/lib/advisors/run-panel";
import type { PanelStreamChunk } from "@/lib/advisors/run-panel";
import type { AdvisorOpinion, AdvisorRoundTwoOpinion } from "@/lib/schemas/advisor";

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
  stream: (req: StreamRequest) => ReadableStream<StreamChunk>;
}): LlmProvider {
  return overrides as unknown as LlmProvider;
}

async function collect(stream: ReadableStream<PanelStreamChunk>): Promise<PanelStreamChunk[]> {
  const reader = stream.getReader();
  const chunks: PanelStreamChunk[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return chunks;
}

describe("runPanel", () => {
  it("dispatches complete() to every persona in parallel", async () => {
    const completeMock = vi.fn().mockResolvedValue(ok({ score: 5, thesis: "t", arguments: ["a"] }));
    const streamMock = vi.fn().mockImplementation(() => makeTokenStream("hi"));
    const provider = makeProvider({ complete: completeMock, stream: streamMock });

    const { scores, stream } = runPanel({ provider }, { decision: "Should I do X?" });
    await collect(stream);

    expect(completeMock).toHaveBeenCalledTimes(ADVISOR_REGISTRY.length);
    const results = await scores;
    expect(results).toHaveLength(ADVISOR_REGISTRY.length);
    expect(results.every((result) => result.ok)).toBe(true);
  });

  it("tags every merged stream chunk with the originating personaId", async () => {
    const completeMock = vi.fn().mockResolvedValue(ok({ score: 5, thesis: "t", arguments: ["a"] }));
    const streamMock = vi.fn().mockImplementation(() => makeTokenStream("hi"));
    const provider = makeProvider({ complete: completeMock, stream: streamMock });

    const { stream } = runPanel({ provider }, { decision: "Should I do X?" });
    const chunks = await collect(stream);

    const seenPersonaIds = new Set(chunks.map((chunk) => chunk.personaId));
    expect(seenPersonaIds).toEqual(new Set(ADVISOR_REGISTRY.map((persona) => persona.id)));
    for (const persona of ADVISOR_REGISTRY) {
      const personaChunks = chunks.filter((chunk) => chunk.personaId === persona.id);
      expect(personaChunks.some((chunk) => chunk.chunk.type === "token")).toBe(true);
      expect(personaChunks.some((chunk) => chunk.chunk.type === "done")).toBe(true);
    }
  });

  it("enqueues an error chunk (and skips stream()) for a persona whose complete() fails, without affecting siblings", async () => {
    const failingPersonaId = ADVISOR_REGISTRY[0]?.id;
    const completeMock = vi
      .fn()
      .mockImplementationOnce(() => Promise.resolve(err(new LlmError("bad output", ErrorCode.LLM_INVALID_OUTPUT))))
      .mockResolvedValue(ok({ score: 5, thesis: "t", arguments: ["a"] }));
    const streamMock = vi.fn().mockImplementation(() => makeTokenStream("hi"));
    const provider = makeProvider({ complete: completeMock, stream: streamMock });

    const { scores, stream } = runPanel({ provider }, { decision: "Should I do X?" });
    const chunks = await collect(stream);
    const results = await scores;

    expect(results[0]?.ok).toBe(false);
    expect(results.slice(1).every((result) => result.ok)).toBe(true);

    const errorChunks = chunks.filter((chunk) => chunk.personaId === failingPersonaId);
    expect(errorChunks).toHaveLength(1);
    expect(errorChunks[0]?.chunk.type).toBe("error");

    // stream() must not run for the persona whose complete() failed.
    expect(streamMock).toHaveBeenCalledTimes(ADVISOR_REGISTRY.length - 1);
  });

  it("propagates a caller abort into the signal passed to every provider call", async () => {
    const controller = new AbortController();
    const receivedCompleteSignals: (AbortSignal | undefined)[] = [];
    const completeMock = vi.fn().mockImplementation((req: CompleteRequest<AdvisorOpinion>) => {
      receivedCompleteSignals.push(req.signal);
      return Promise.resolve(ok({ score: 5, thesis: "t", arguments: ["a"] }));
    });
    const streamMock = vi.fn().mockImplementation(() => makeTokenStream("hi"));
    const provider = makeProvider({ complete: completeMock, stream: streamMock });

    controller.abort();
    const { stream } = runPanel({ provider }, { decision: "Should I do X?" }, controller.signal);
    await collect(stream);

    expect(receivedCompleteSignals).toHaveLength(ADVISOR_REGISTRY.length);
    for (const signal of receivedCompleteSignals) {
      expect(signal?.aborted).toBe(true);
    }
  });

  it("streams from the rationale prompt built from the resolved head, not the head prompt", async () => {
    const head: AdvisorOpinion = { score: 7, thesis: "head thesis", arguments: ["head argument"] };
    const rationalePrompt = { system: "rationale-system", user: "rationale-user" };
    const buildRationalePrompt = vi.fn().mockReturnValue(rationalePrompt);
    const testPersona: AdvisorStrategy = {
      id: "optymista",
      label: "Optymista",
      buildPrompt: () => ({ system: "head-system", user: "head-user" }),
      buildRationalePrompt,
      buildRoundTwoPrompt: () => ({ system: "round-two-system", user: "round-two-user" }),
      buildRoundTwoRationalePrompt: () => ({ system: "round-two-rationale-system", user: "round-two-rationale-user" }),
      temperature: 0.9,
      parseScore: (raw) => ok(raw as AdvisorOpinion),
    };
    const completeMock = vi.fn().mockResolvedValue(ok(head));
    const streamMock = vi.fn().mockImplementation(() => makeTokenStream("hi"));
    const provider = makeProvider({ complete: completeMock, stream: streamMock });

    const input = { decision: "Should I do X?" };
    const { stream } = runPanel({ provider, personas: [testPersona] }, input);
    await collect(stream);

    expect(buildRationalePrompt).toHaveBeenCalledWith(input, head);
    expect(streamMock).toHaveBeenCalledTimes(1);
    const streamCall = streamMock.mock.calls[0]?.[0] as StreamRequest;
    expect(streamCall.system).toBe(rationalePrompt.system);
    expect(streamCall.user).toBe(rationalePrompt.user);
  });
});

interface RoundTwoPersonaFixture {
  persona: AdvisorStrategy;
  buildRoundTwoPrompt: ReturnType<typeof vi.fn>;
  buildRoundTwoRationalePrompt: ReturnType<typeof vi.fn>;
}

function makeRoundTwoPersona(id: AdvisorPersonaId, label: string): RoundTwoPersonaFixture {
  const buildRoundTwoPrompt = vi
    .fn()
    .mockReturnValue({ system: `${id}-round-two-system`, user: `${id}-round-two-user` });
  const buildRoundTwoRationalePrompt = vi
    .fn()
    .mockReturnValue({ system: `${id}-round-two-rationale-system`, user: `${id}-round-two-rationale-user` });
  const persona: AdvisorStrategy = {
    id,
    label,
    buildPrompt: () => ({ system: "head-system", user: "head-user" }),
    buildRationalePrompt: () => ({ system: "rationale-system", user: "rationale-user" }),
    buildRoundTwoPrompt,
    buildRoundTwoRationalePrompt,
    temperature: 0.5,
    parseScore: (raw) => ok(raw as AdvisorOpinion),
  };
  return { persona, buildRoundTwoPrompt, buildRoundTwoRationalePrompt };
}

describe("runSecondRoundPanel", () => {
  it("only runs personas present in priorHeads", async () => {
    const optymista = makeRoundTwoPersona("optymista", "Optymista");
    const sceptyk = makeRoundTwoPersona("sceptyk", "Sceptyk");
    const pragmatyk = makeRoundTwoPersona("pragmatyk", "Pragmatyk");
    const personas = [optymista.persona, sceptyk.persona, pragmatyk.persona];
    const priorHeads = new Map<AdvisorPersonaId, AdvisorOpinion>([
      ["optymista", { score: 5, thesis: "t1", arguments: ["a1"] }],
      ["sceptyk", { score: 3, thesis: "t2", arguments: ["a2"] }],
    ]);
    const roundTwoHead: AdvisorRoundTwoOpinion = { score: 6, thesis: "t", arguments: ["a"], attribution: null };
    const completeMock = vi.fn().mockResolvedValue(ok(roundTwoHead));
    const streamMock = vi.fn().mockImplementation(() => makeTokenStream("hi"));
    const provider = makeProvider({ complete: completeMock, stream: streamMock });

    const { scores, stream } = runSecondRoundPanel({ provider, personas }, { decision: "Should I do X?" }, priorHeads);
    await collect(stream);
    const results = await scores;

    expect(completeMock).toHaveBeenCalledTimes(2);
    expect(results).toHaveLength(2);
    expect(pragmatyk.buildRoundTwoPrompt).not.toHaveBeenCalled();
  });

  it("passes peer round-one heads to each builder, excluding self", async () => {
    const optymista = makeRoundTwoPersona("optymista", "Optymista");
    const sceptyk = makeRoundTwoPersona("sceptyk", "Sceptyk");
    const pragmatyk = makeRoundTwoPersona("pragmatyk", "Pragmatyk");
    const personas = [optymista.persona, sceptyk.persona, pragmatyk.persona];
    const optymistaHead: AdvisorOpinion = { score: 5, thesis: "t1", arguments: ["a1"] };
    const sceptykHead: AdvisorOpinion = { score: 3, thesis: "t2", arguments: ["a2"] };
    const pragmatykHead: AdvisorOpinion = { score: 7, thesis: "t3", arguments: ["a3"] };
    const priorHeads = new Map<AdvisorPersonaId, AdvisorOpinion>([
      ["optymista", optymistaHead],
      ["sceptyk", sceptykHead],
      ["pragmatyk", pragmatykHead],
    ]);
    const roundTwoHead: AdvisorRoundTwoOpinion = { score: 6, thesis: "t", arguments: ["a"], attribution: null };
    const completeMock = vi.fn().mockResolvedValue(ok(roundTwoHead));
    const streamMock = vi.fn().mockImplementation(() => makeTokenStream("hi"));
    const provider = makeProvider({ complete: completeMock, stream: streamMock });
    const input = { decision: "Should I do X?" };

    const { stream } = runSecondRoundPanel({ provider, personas }, input, priorHeads);
    await collect(stream);

    const optymistaPeers = optymista.buildRoundTwoPrompt.mock.calls[0]?.[2] as RoundOnePeer[];
    expect(optymistaPeers).toHaveLength(2);
    expect(optymistaPeers.map((peer) => peer.label).sort()).toEqual(["Pragmatyk", "Sceptyk"]);
    expect(optymistaPeers.find((peer) => peer.label === "Sceptyk")?.head).toEqual(sceptykHead);
    expect(optymistaPeers.find((peer) => peer.label === "Pragmatyk")?.head).toEqual(pragmatykHead);
    expect(optymista.buildRoundTwoPrompt).toHaveBeenCalledWith(input, optymistaHead, expect.anything());

    const rationalePeers = optymista.buildRoundTwoRationalePrompt.mock.calls[0]?.[3] as RoundOnePeer[];
    expect(rationalePeers.map((peer) => peer.label).sort()).toEqual(["Pragmatyk", "Sceptyk"]);
    expect(optymista.buildRoundTwoRationalePrompt).toHaveBeenCalledWith(
      input,
      optymistaHead,
      roundTwoHead,
      expect.anything(),
    );
  });

  it("does not abort siblings when one persona's complete() fails", async () => {
    const optymista = makeRoundTwoPersona("optymista", "Optymista");
    const sceptyk = makeRoundTwoPersona("sceptyk", "Sceptyk");
    const personas = [optymista.persona, sceptyk.persona];
    const priorHeads = new Map<AdvisorPersonaId, AdvisorOpinion>([
      ["optymista", { score: 5, thesis: "t1", arguments: ["a1"] }],
      ["sceptyk", { score: 3, thesis: "t2", arguments: ["a2"] }],
    ]);
    const roundTwoHead: AdvisorRoundTwoOpinion = { score: 6, thesis: "t", arguments: ["a"], attribution: null };
    const completeMock = vi
      .fn()
      .mockImplementationOnce(() => Promise.resolve(err(new LlmError("bad output", ErrorCode.LLM_INVALID_OUTPUT))))
      .mockResolvedValue(ok(roundTwoHead));
    const streamMock = vi.fn().mockImplementation(() => makeTokenStream("hi"));
    const provider = makeProvider({ complete: completeMock, stream: streamMock });

    const { scores, stream } = runSecondRoundPanel({ provider, personas }, { decision: "Should I do X?" }, priorHeads);
    const chunks = await collect(stream);
    const results = await scores;

    expect(results[0]?.ok).toBe(false);
    expect(results[1]?.ok).toBe(true);
    const errorChunks = chunks.filter((chunk) => chunk.chunk.type === "error");
    expect(errorChunks).toHaveLength(1);
    expect(streamMock).toHaveBeenCalledTimes(1);
  });

  it("propagates a caller abort into the signal passed to every provider call", async () => {
    const optymista = makeRoundTwoPersona("optymista", "Optymista");
    const sceptyk = makeRoundTwoPersona("sceptyk", "Sceptyk");
    const personas = [optymista.persona, sceptyk.persona];
    const priorHeads = new Map<AdvisorPersonaId, AdvisorOpinion>([
      ["optymista", { score: 5, thesis: "t1", arguments: ["a1"] }],
      ["sceptyk", { score: 3, thesis: "t2", arguments: ["a2"] }],
    ]);
    const controller = new AbortController();
    const receivedCompleteSignals: (AbortSignal | undefined)[] = [];
    const roundTwoHead: AdvisorRoundTwoOpinion = { score: 6, thesis: "t", arguments: ["a"], attribution: null };
    const completeMock = vi.fn().mockImplementation((req: CompleteRequest<AdvisorRoundTwoOpinion>) => {
      receivedCompleteSignals.push(req.signal);
      return Promise.resolve(ok(roundTwoHead));
    });
    const streamMock = vi.fn().mockImplementation(() => makeTokenStream("hi"));
    const provider = makeProvider({ complete: completeMock, stream: streamMock });

    controller.abort();
    const { stream } = runSecondRoundPanel(
      { provider, personas },
      { decision: "Should I do X?" },
      priorHeads,
      controller.signal,
    );
    await collect(stream);

    expect(receivedCompleteSignals).toHaveLength(2);
    for (const signal of receivedCompleteSignals) {
      expect(signal?.aborted).toBe(true);
    }
  });
});

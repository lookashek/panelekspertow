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
import { runPanel } from "@/lib/advisors/run-panel";
import type { PanelStreamChunk } from "@/lib/advisors/run-panel";
import type { AdvisorScore } from "@/lib/schemas/advisor";

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
  complete: (req: CompleteRequest<AdvisorScore>) => Promise<Result<AdvisorScore, LlmError>>;
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
    const completeMock = vi.fn().mockResolvedValue(ok({ score: 5, thesis: "t" }));
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
    const completeMock = vi.fn().mockResolvedValue(ok({ score: 5, thesis: "t" }));
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
      .mockResolvedValue(ok({ score: 5, thesis: "t" }));
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
    const completeMock = vi.fn().mockImplementation((req: CompleteRequest<AdvisorScore>) => {
      receivedCompleteSignals.push(req.signal);
      return Promise.resolve(ok({ score: 5, thesis: "t" }));
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
});

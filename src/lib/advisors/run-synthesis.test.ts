import { describe, expect, it, vi } from "vitest";

// `create-llm-provider.ts` reads `astro:env/server`, which only resolves inside the Astro/Vite
// pipeline (not plain Vitest). Stub it so this test can exercise `runSynthesis` without booting Astro.
vi.mock("@/lib/adapters/create-llm-provider", () => ({
  defaultAdvisorModel: () => "test-model",
}));

import type { CompleteRequest, LlmProvider, StreamChunk, StreamRequest } from "@/lib/adapters/llm-provider";
import { ErrorCode, LlmError } from "@/lib/errors";
import { err, ok } from "@/lib/result";
import type { Result } from "@/lib/result";
import { runSynthesis } from "@/lib/advisors/run-synthesis";
import type { SynthesisInput } from "@/lib/prompts/synthesis.v1";
import type { Synthesis } from "@/lib/schemas/synthesis";

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
  complete: (req: CompleteRequest<Synthesis>) => Promise<Result<Synthesis, LlmError>>;
  stream: (req: StreamRequest) => ReadableStream<StreamChunk>;
}): LlmProvider {
  return overrides as unknown as LlmProvider;
}

async function collect(stream: ReadableStream<StreamChunk>): Promise<StreamChunk[]> {
  const reader = stream.getReader();
  const chunks: StreamChunk[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return chunks;
}

const sampleInput: SynthesisInput = {
  panelInput: {
    decision: "Czy powinienem przenieść się do innego miasta dla nowej pracy?",
    context: "Partner/ka nie chce się przeprowadzać.",
  },
  personaHeads: [
    {
      label: "Optymista",
      head: {
        score: 8,
        thesis: "Nowa praca to szansa, którą warto wykorzystać.",
        arguments: ["Rozwój kariery.", "Wyższe wynagrodzenie."],
      },
    },
    {
      label: "Sceptyk",
      head: {
        score: 3,
        thesis: "Ryzyko dla relacji przewyższa korzyści zawodowe.",
        arguments: ["Napięcie w związku.", "Brak gwarancji sukcesu w nowym mieście."],
      },
    },
  ],
};

const sampleSynthesis: Synthesis = {
  agreementPoints: ["Decyzja jest pilna i wymaga rozmowy z partnerem/ką."],
  disputeAxes: [
    {
      title: "Kariera vs. relacja",
      positions: ["Rozwój zawodowy powinien mieć priorytet.", "Stabilność relacji jest ważniejsza niż awans."],
    },
  ],
  risks: [{ description: "Rozpad relacji przy przeprowadzce bez zgody partnera.", weight: "high" }],
  recommendedNextStep: "Przeprowadź wspólną rozmowę o priorytetach przed podjęciem decyzji.",
};

describe("runSynthesis", () => {
  it("streams prose tokens from the rationale prompt built from the resolved synthesis", async () => {
    const completeMock = vi.fn().mockResolvedValue(ok(sampleSynthesis));
    const streamMock = vi.fn().mockImplementation(() => makeTokenStream("narracja"));
    const provider = makeProvider({ complete: completeMock, stream: streamMock });

    const { synthesis, stream } = runSynthesis({ provider }, sampleInput);
    const chunks = await collect(stream);
    const result = await synthesis;

    expect(result.ok).toBe(true);
    expect(chunks.some((chunk) => chunk.type === "token")).toBe(true);
    expect(chunks.some((chunk) => chunk.type === "done")).toBe(true);

    expect(completeMock).toHaveBeenCalledTimes(1);
    expect(streamMock).toHaveBeenCalledTimes(1);
    const streamCall = streamMock.mock.calls[0]?.[0] as StreamRequest;
    expect(streamCall.system).not.toBe("");
    expect(streamCall.user).toContain(sampleSynthesis.recommendedNextStep);
    expect(streamCall.persona).toBe("synthesis");
    expect(streamCall.promptVersion).toBe("v1");
  });

  it("enqueues one error chunk (and skips stream()) when complete() fails", async () => {
    const failure = err(new LlmError("bad output", ErrorCode.LLM_INVALID_OUTPUT));
    const completeMock = vi.fn().mockResolvedValue(failure);
    const streamMock = vi.fn().mockImplementation(() => makeTokenStream("narracja"));
    const provider = makeProvider({ complete: completeMock, stream: streamMock });

    const { synthesis, stream } = runSynthesis({ provider }, sampleInput);
    const chunks = await collect(stream);
    const result = await synthesis;

    expect(result).toEqual(failure);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.type).toBe("error");
    if (chunks[0]?.type === "error") {
      expect(chunks[0].error).toBe(failure.error);
    }
    expect(streamMock).not.toHaveBeenCalled();
  });

  it("propagates a caller abort into the signal passed to the provider's complete() call", async () => {
    const controller = new AbortController();
    let receivedSignal: AbortSignal | undefined;
    const completeMock = vi.fn().mockImplementation((req: CompleteRequest<Synthesis>) => {
      receivedSignal = req.signal;
      return Promise.resolve(ok(sampleSynthesis));
    });
    const streamMock = vi.fn().mockImplementation(() => makeTokenStream("narracja"));
    const provider = makeProvider({ complete: completeMock, stream: streamMock });

    controller.abort();
    const { stream } = runSynthesis({ provider }, sampleInput, controller.signal);
    await collect(stream);

    expect(completeMock).toHaveBeenCalledTimes(1);
    expect(receivedSignal?.aborted).toBe(true);
  });
});

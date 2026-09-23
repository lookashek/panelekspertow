import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { ErrorCode } from "@/lib/errors";
import { OpenRouterAdapter } from "@/lib/adapters/openrouter.adapter";
import type { StreamChunk } from "@/lib/adapters/llm-provider";

const TestSchema = z.object({ score: z.number().int().min(1).max(10), thesis: z.string().min(1) });

function jsonResponse(body: unknown, init?: { ok?: boolean; status?: number }) {
  return {
    ok: init?.ok ?? true,
    status: init?.status ?? 200,
    json: () => Promise.resolve(body),
  } as Response;
}

function completionBody(content: string) {
  return {
    choices: [{ message: { content } }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  };
}

async function collectStream(stream: ReadableStream<StreamChunk>): Promise<StreamChunk[]> {
  const reader = stream.getReader();
  const chunks: StreamChunk[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return chunks;
}

describe("OpenRouterAdapter#complete", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns ok() on a valid first response without retrying", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(completionBody(JSON.stringify({ score: 7, thesis: "OK" }))));
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new OpenRouterAdapter("test-key");
    const result = await adapter.complete({
      model: "openai/gpt-4o-mini",
      system: "sys",
      user: "usr",
      schema: TestSchema,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ score: 7, thesis: "OK" });
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries exactly once on malformed JSON and succeeds if the retry is valid", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(completionBody("not json")))
      .mockResolvedValueOnce(jsonResponse(completionBody(JSON.stringify({ score: 4, thesis: "fixed" }))));
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new OpenRouterAdapter("test-key");
    const result = await adapter.complete({
      model: "openai/gpt-4o-mini",
      system: "sys",
      user: "usr",
      schema: TestSchema,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ score: 4, thesis: "fixed" });
    }
  });

  it("retries exactly once on malformed JSON and returns LLM_INVALID_OUTPUT if the retry also fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(completionBody("not json")))
      .mockResolvedValueOnce(jsonResponse(completionBody("still not json")));
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new OpenRouterAdapter("test-key");
    const result = await adapter.complete({
      model: "openai/gpt-4o-mini",
      system: "sys",
      user: "usr",
      schema: TestSchema,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ErrorCode.LLM_INVALID_OUTPUT);
    }
  });

  it("retries once when the parsed JSON fails schema validation, then fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(completionBody(JSON.stringify({ score: 99, thesis: "out of range" }))))
      .mockResolvedValueOnce(jsonResponse(completionBody(JSON.stringify({ score: -1, thesis: "still bad" }))));
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new OpenRouterAdapter("test-key");
    const result = await adapter.complete({
      model: "openai/gpt-4o-mini",
      system: "sys",
      user: "usr",
      schema: TestSchema,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ErrorCode.LLM_INVALID_OUTPUT);
    }
  });
});

describe("OpenRouterAdapter#stream", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("yields token chunks then done on a well-formed SSE stream", async () => {
    const sse =
      `data: ${JSON.stringify({ choices: [{ delta: { content: "Hel" } }] })}\n\n` +
      `data: ${JSON.stringify({ choices: [{ delta: { content: "lo" } }] })}\n\n` +
      `data: [DONE]\n\n`;
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(sse));
        controller.close();
      },
    });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, body });
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new OpenRouterAdapter("test-key");
    const chunks = await collectStream(adapter.stream({ model: "openai/gpt-4o-mini", system: "sys", user: "usr" }));

    expect(chunks).toEqual([{ type: "token", text: "Hel" }, { type: "token", text: "lo" }, { type: "done" }]);
  });

  it("emits an error chunk instead of throwing when the request fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, body: null });
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new OpenRouterAdapter("test-key");
    const chunks = await collectStream(adapter.stream({ model: "openai/gpt-4o-mini", system: "sys", user: "usr" }));

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.type).toBe("error");
  });
});

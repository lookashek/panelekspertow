/**
 * `LlmProvider` implementation against OpenRouter's OpenAI-compatible chat completions API. The
 * only file in the codebase allowed to `fetch` a vendor LLM endpoint directly — see
 * `.claude/rules/backend.md` §5.
 */

import type { ZodType } from "zod";

import { ErrorCode, LlmError } from "@/lib/errors";
import { createLogger } from "@/lib/logger";
import { err, ok } from "@/lib/result";
import type { Result } from "@/lib/result";
import type { CompleteRequest, LlmProvider, StreamChunk, StreamRequest } from "@/lib/adapters/llm-provider";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const COMPLETE_TIMEOUT_MS = 30_000;
const STREAM_TIMEOUT_MS = 60_000;

const logger = createLogger();

interface ChatMessage {
  role: "system" | "user";
  content: string;
}

interface OpenRouterUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

interface OpenRouterCompletionResponse {
  choices?: { message?: { content?: string } }[];
  usage?: OpenRouterUsage;
}

interface OpenRouterStreamDelta {
  choices?: { delta?: { content?: string } }[];
}

function combineSignals(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([timeoutSignal, signal]) : timeoutSignal;
}

function buildMessages(system: string, user: string, extra?: string): ChatMessage[] {
  const messages: ChatMessage[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
  if (extra) {
    messages.push({ role: "user", content: extra });
  }
  return messages;
}

export class OpenRouterAdapter implements LlmProvider {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async complete<T>(req: CompleteRequest<T>): Promise<Result<T, LlmError>> {
    const attempt = async (extraMessage?: string) => {
      const signal = combineSignals(req.signal, COMPLETE_TIMEOUT_MS);
      const startedAt = Date.now();
      const response = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: req.model,
          messages: buildMessages(req.system, req.user, extraMessage),
          temperature: req.temperature,
          stream: false,
          response_format: { type: "json_object" },
        }),
        signal,
      });
      const latencyMs = Date.now() - startedAt;

      if (!response.ok) {
        logger.error("openrouter complete failed", {
          provider: "openrouter",
          model: req.model,
          persona: req.persona,
          promptVersion: req.promptVersion,
          status: response.status,
          latencyMs,
        });
        throw new LlmError(`OpenRouter complete request failed (${response.status})`, ErrorCode.LLM_PROVIDER_ERROR);
      }

      const body = (await response.json()) as OpenRouterCompletionResponse;
      const content = body.choices?.[0]?.message?.content;
      return { raw: content, latencyMs, usage: body.usage };
    };

    const logSuccess = (usage: OpenRouterUsage | undefined, latencyMs: number) => {
      logger.info("openrouter complete succeeded", {
        provider: "openrouter",
        model: req.model,
        persona: req.persona,
        promptVersion: req.promptVersion,
        promptTokens: usage?.prompt_tokens,
        completionTokens: usage?.completion_tokens,
        latencyMs,
      });
    };

    const parseAttempt = (raw: string | undefined, schema: ZodType<T>) => {
      if (!raw) {
        return { success: false as const, error: "empty response content" };
      }
      let json: unknown;
      try {
        json = JSON.parse(raw);
      } catch (cause) {
        return { success: false as const, error: cause instanceof Error ? cause.message : "invalid JSON" };
      }
      const result = schema.safeParse(json);
      if (!result.success) {
        return { success: false as const, error: result.error.message };
      }
      return { success: true as const, value: result.data };
    };

    try {
      const first = await attempt();
      const firstParsed = parseAttempt(first.raw, req.schema);
      if (firstParsed.success) {
        logSuccess(first.usage, first.latencyMs);
        return ok(firstParsed.value);
      }

      const second = await attempt(
        `The previous response was invalid: ${firstParsed.error}. Respond again with JSON matching the required schema.`,
      );
      const secondParsed = parseAttempt(second.raw, req.schema);
      if (secondParsed.success) {
        logSuccess(second.usage, second.latencyMs);
        return ok(secondParsed.value);
      }

      logger.warn("openrouter complete invalid output after retry", {
        provider: "openrouter",
        model: req.model,
        persona: req.persona,
        promptVersion: req.promptVersion,
      });
      return err(new LlmError("LLM returned invalid structured output after retry", ErrorCode.LLM_INVALID_OUTPUT));
    } catch (cause) {
      const code =
        cause instanceof DOMException && cause.name === "TimeoutError"
          ? ErrorCode.LLM_TIMEOUT
          : ErrorCode.LLM_PROVIDER_ERROR;
      logger.error("openrouter complete threw", {
        provider: "openrouter",
        model: req.model,
        persona: req.persona,
        promptVersion: req.promptVersion,
      });
      return err(new LlmError("OpenRouter request failed", code, cause));
    }
  }

  stream(req: StreamRequest): ReadableStream<StreamChunk> {
    const apiKey = this.apiKey;
    const decoder = new TextDecoder();

    return new ReadableStream<StreamChunk>({
      async start(controller) {
        const signal = combineSignals(req.signal, STREAM_TIMEOUT_MS);
        const startedAt = Date.now();
        let tokenCount = 0;

        try {
          const response = await fetch(OPENROUTER_URL, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: req.model,
              messages: buildMessages(req.system, req.user),
              temperature: req.temperature,
              stream: true,
            }),
            signal,
          });

          if (!response.ok || !response.body) {
            controller.enqueue({
              type: "error",
              error: new LlmError(
                `OpenRouter stream request failed (${response.status})`,
                ErrorCode.LLM_PROVIDER_ERROR,
              ),
            });
            controller.close();
            return;
          }

          const reader = response.body.getReader();
          let buffer = "";

          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith("data:")) continue;
              const payload = trimmed.slice("data:".length).trim();
              if (payload === "[DONE]") {
                logger.info("openrouter stream done", {
                  provider: "openrouter",
                  model: req.model,
                  persona: req.persona,
                  promptVersion: req.promptVersion,
                  tokenCount,
                  latencyMs: Date.now() - startedAt,
                });
                controller.enqueue({ type: "done" });
                controller.close();
                return;
              }
              try {
                const parsed = JSON.parse(payload) as OpenRouterStreamDelta;
                const text = parsed.choices?.[0]?.delta?.content;
                if (text) {
                  tokenCount += 1;
                  controller.enqueue({ type: "token", text });
                }
              } catch {
                // Malformed SSE chunk — skip it rather than aborting the whole stream.
              }
            }
          }

          logger.info("openrouter stream done", {
            provider: "openrouter",
            model: req.model,
            persona: req.persona,
            promptVersion: req.promptVersion,
            tokenCount,
            latencyMs: Date.now() - startedAt,
          });
          controller.enqueue({ type: "done" });
          controller.close();
        } catch (cause) {
          const code =
            cause instanceof DOMException && cause.name === "TimeoutError"
              ? ErrorCode.LLM_TIMEOUT
              : ErrorCode.LLM_PROVIDER_ERROR;
          logger.error("openrouter stream threw", {
            provider: "openrouter",
            model: req.model,
            persona: req.persona,
            promptVersion: req.promptVersion,
          });
          controller.enqueue({ type: "error", error: new LlmError("OpenRouter stream failed", code, cause) });
          controller.close();
        }
      },
    });
  }
}

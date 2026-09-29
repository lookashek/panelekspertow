/**
 * Single-generator analogue of `run-panel.ts` (plan Phase 3) — merges the panel's latest-per-persona
 * heads and runs one two-phase (`complete()` → `stream()`) synthesizer call with the same shared-
 * controller abort wiring as the fan-out orchestrator, minus the fan-out itself: there is exactly one
 * `complete()` and, if it succeeds, exactly one `stream()`. `runSynthesis` receives its `LlmProvider`
 * as a parameter — no module-scope singleton — per `.claude/rules/backend.md` §1.
 */

import { defaultAdvisorModel } from "@/lib/adapters/create-llm-provider";
import type { LlmProvider, StreamChunk } from "@/lib/adapters/llm-provider";
import { ErrorCode, LlmError } from "@/lib/errors";
import type { Result } from "@/lib/result";
import { buildSynthesisPrompt, buildSynthesisRationalePrompt } from "@/lib/prompts/synthesis.v1";
import type { SynthesisInput } from "@/lib/prompts/synthesis.v1";
import { SynthesisSchema } from "@/lib/schemas/synthesis";
import type { Synthesis } from "@/lib/schemas/synthesis";

const PROMPT_VERSION = "v1";

export interface RunSynthesisDeps {
  provider: LlmProvider;
}

export interface RunSynthesisResult {
  synthesis: Promise<Result<Synthesis, LlmError>>;
  stream: ReadableStream<StreamChunk>;
}

function toLlmError(cause: unknown): LlmError {
  if (cause instanceof LlmError) {
    return cause;
  }
  const code = cause instanceof DOMException && cause.name === "AbortError" ? ErrorCode.LLM_TIMEOUT : undefined;
  return new LlmError("Synthesis rationale stream failed", code, cause);
}

/**
 * Wires the caller's `signal` into a shared `AbortController` so the in-flight `complete`/`stream`
 * call can be cancelled on caller abort — mirrors `run-panel.ts`'s `createSharedController` (not
 * exported there, so duplicated here rather than adding a cross-file export for one small helper).
 */
function createSharedController(signal: AbortSignal | undefined): AbortController {
  const controller = new AbortController();
  if (!signal) {
    return controller;
  }
  if (signal.aborted) {
    controller.abort();
  } else {
    signal.addEventListener(
      "abort",
      () => {
        controller.abort();
      },
      { once: true },
    );
  }
  return controller;
}

export function runSynthesis(deps: RunSynthesisDeps, input: SynthesisInput, signal?: AbortSignal): RunSynthesisResult {
  const controller = createSharedController(signal);

  const { system, user } = buildSynthesisPrompt(input);
  const synthesis = deps.provider.complete<Synthesis>({
    model: defaultAdvisorModel(),
    system,
    user,
    schema: SynthesisSchema,
    signal: controller.signal,
    persona: "synthesis",
    promptVersion: PROMPT_VERSION,
  });

  let activeReader: ReadableStreamDefaultReader<StreamChunk> | undefined;

  const stream = new ReadableStream<StreamChunk>({
    async start(streamController) {
      const result = await synthesis;
      if (!result.ok) {
        streamController.enqueue({ type: "error", error: result.error });
        streamController.close();
        return;
      }

      try {
        const rationalePrompt = buildSynthesisRationalePrompt(input, result.value);
        const rationaleStream = deps.provider.stream({
          model: defaultAdvisorModel(),
          system: rationalePrompt.system,
          user: rationalePrompt.user,
          signal: controller.signal,
          persona: "synthesis",
          promptVersion: PROMPT_VERSION,
        });
        const reader = rationaleStream.getReader();
        activeReader = reader;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          streamController.enqueue(value);
        }
      } catch (cause) {
        streamController.enqueue({ type: "error", error: toLlmError(cause) });
      } finally {
        if (activeReader) {
          activeReader.releaseLock();
          activeReader = undefined;
        }
        streamController.close();
      }
    },
    cancel(reason) {
      controller.abort(reason);
      if (activeReader) {
        activeReader.cancel(reason).catch(() => {
          // Reader already released or errored — nothing further to clean up.
        });
      }
    },
  });

  return { synthesis, stream };
}

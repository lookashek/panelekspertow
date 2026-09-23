/**
 * Parallel fan-out orchestrator (F-01) — fires every registry persona's two-phase call
 * (`complete()` then `stream()`) concurrently and merges the results, so the "parallel,
 * independently-streamed opinions" outcome (FR-003, FR-009) is proven here once instead of by
 * every future caller. `runPanel` receives its `LlmProvider` as a parameter — no module-scope
 * singleton — per `.claude/rules/backend.md` §1 ("Services receive dependencies as parameters").
 */

import { defaultAdvisorModel } from "@/lib/adapters/create-llm-provider";
import type { LlmProvider, StreamChunk } from "@/lib/adapters/llm-provider";
import { ErrorCode, LlmError } from "@/lib/errors";
import type { Result } from "@/lib/result";
import { ADVISOR_REGISTRY } from "@/lib/advisors/registry";
import type { AdvisorPersonaId, AdvisorStrategy, PanelInput } from "@/lib/advisors/registry";
import { AdvisorScoreSchema } from "@/lib/schemas/advisor";
import type { AdvisorScore } from "@/lib/schemas/advisor";

const PROMPT_VERSION = "v1";

export interface PanelStreamChunk {
  personaId: AdvisorPersonaId;
  chunk: StreamChunk;
}

export interface RunPanelDeps {
  provider: LlmProvider;
  personas?: AdvisorStrategy[];
}

export interface RunPanelResult {
  scores: Promise<Result<AdvisorScore, LlmError>[]>;
  stream: ReadableStream<PanelStreamChunk>;
}

function toLlmError(cause: unknown): LlmError {
  if (cause instanceof LlmError) {
    return cause;
  }
  const code = cause instanceof DOMException && cause.name === "AbortError" ? ErrorCode.LLM_TIMEOUT : undefined;
  return new LlmError("Advisor rationale stream failed", code, cause);
}

/**
 * Wires the caller's `signal` into a shared `AbortController` so every persona's in-flight
 * `complete`/`stream` call can be cancelled together on caller abort, without letting one
 * persona's own failure abort its siblings (partial results are useful — see plan Phase 4).
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

interface PersonaTask {
  persona: AdvisorStrategy;
  system: string;
  user: string;
  completion: Promise<Result<AdvisorScore, LlmError>>;
}

export function runPanel(deps: RunPanelDeps, input: PanelInput, signal?: AbortSignal): RunPanelResult {
  const personas = deps.personas ?? ADVISOR_REGISTRY;
  const controller = createSharedController(signal);

  const tasks: PersonaTask[] = personas.map((persona) => {
    const { system, user } = persona.buildPrompt(input);
    const completion = deps.provider.complete<AdvisorScore>({
      model: defaultAdvisorModel(),
      system,
      user,
      schema: AdvisorScoreSchema,
      signal: controller.signal,
      temperature: persona.temperature,
      persona: persona.id,
      promptVersion: PROMPT_VERSION,
    });
    return { persona, system, user, completion };
  });

  const scores = Promise.all(tasks.map((task) => task.completion));

  const stream = new ReadableStream<PanelStreamChunk>({
    async start(streamController) {
      await Promise.all(
        tasks.map(async ({ persona, system, user, completion }) => {
          const result = await completion;
          if (!result.ok) {
            streamController.enqueue({ personaId: persona.id, chunk: { type: "error", error: result.error } });
            return;
          }

          try {
            const personaStream = deps.provider.stream({
              model: defaultAdvisorModel(),
              system,
              user,
              signal: controller.signal,
              temperature: persona.temperature,
              persona: persona.id,
              promptVersion: PROMPT_VERSION,
            });
            const reader = personaStream.getReader();
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              streamController.enqueue({ personaId: persona.id, chunk: value });
            }
          } catch (cause) {
            streamController.enqueue({ personaId: persona.id, chunk: { type: "error", error: toLlmError(cause) } });
          }
        }),
      );
      streamController.close();
    },
  });

  return { scores, stream };
}

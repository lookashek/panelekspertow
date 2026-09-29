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
import type { AdvisorPersonaId, AdvisorStrategy, PanelInput, RoundOnePeer } from "@/lib/advisors/registry";
import { AdvisorOpinionSchema, AdvisorRoundTwoOpinionSchema } from "@/lib/schemas/advisor";
import type { AdvisorOpinion, AdvisorRoundTwoOpinion } from "@/lib/schemas/advisor";

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
  scores: Promise<Result<AdvisorOpinion, LlmError>[]>;
  stream: ReadableStream<PanelStreamChunk>;
}

export interface RunSecondRoundPanelResult {
  scores: Promise<Result<AdvisorRoundTwoOpinion, LlmError>[]>;
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

interface PersonaTask<THead> {
  persona: AdvisorStrategy;
  completion: Promise<Result<THead, LlmError>>;
}

/**
 * Shared two-phase (complete → stream) fan-out merge, generic over the structured-head type so
 * both round one (`AdvisorOpinion`) and round two (`AdvisorRoundTwoOpinion`) reuse the same
 * shared-controller / active-reader-cleanup / partial-failure-isolation machinery instead of
 * duplicating the whole function body. `buildRationalePrompt` is the only per-round variance: it
 * receives the persona and its resolved head and returns the prose-stream prompt.
 */
function fanOutPanel<THead>(
  deps: { provider: LlmProvider },
  tasks: PersonaTask<THead>[],
  controller: AbortController,
  buildRationalePrompt: (persona: AdvisorStrategy, head: THead) => { system: string; user: string },
): { scores: Promise<Result<THead, LlmError>[]>; stream: ReadableStream<PanelStreamChunk> } {
  const activeReaders = new Set<ReadableStreamDefaultReader<StreamChunk>>();

  const scores = Promise.all(tasks.map((task) => task.completion));

  const stream = new ReadableStream<PanelStreamChunk>({
    async start(streamController) {
      await Promise.all(
        tasks.map(async ({ persona, completion }) => {
          const result = await completion;
          if (!result.ok) {
            streamController.enqueue({ personaId: persona.id, chunk: { type: "error", error: result.error } });
            return;
          }

          let reader: ReadableStreamDefaultReader<StreamChunk> | undefined;
          try {
            const { system, user } = buildRationalePrompt(persona, result.value);
            const personaStream = deps.provider.stream({
              model: defaultAdvisorModel(),
              system,
              user,
              signal: controller.signal,
              temperature: persona.temperature,
              persona: persona.id,
              promptVersion: PROMPT_VERSION,
            });
            reader = personaStream.getReader();
            activeReaders.add(reader);
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              streamController.enqueue({ personaId: persona.id, chunk: value });
            }
          } catch (cause) {
            streamController.enqueue({ personaId: persona.id, chunk: { type: "error", error: toLlmError(cause) } });
          } finally {
            if (reader) {
              activeReaders.delete(reader);
              reader.releaseLock();
            }
          }
        }),
      );
      streamController.close();
    },
    cancel(reason) {
      controller.abort(reason);
      for (const reader of activeReaders) {
        reader.cancel(reason).catch(() => {
          // Reader already released or errored — nothing further to clean up.
        });
      }
    },
  });

  return { scores, stream };
}

export function runPanel(deps: RunPanelDeps, input: PanelInput, signal?: AbortSignal): RunPanelResult {
  const personas = deps.personas ?? ADVISOR_REGISTRY;
  const controller = createSharedController(signal);

  const tasks: PersonaTask<AdvisorOpinion>[] = personas.map((persona) => {
    const { system, user } = persona.buildPrompt(input);
    const completion = deps.provider.complete<AdvisorOpinion>({
      model: defaultAdvisorModel(),
      system,
      user,
      schema: AdvisorOpinionSchema,
      signal: controller.signal,
      temperature: persona.temperature,
      persona: persona.id,
      promptVersion: PROMPT_VERSION,
    });
    return { persona, completion };
  });

  return fanOutPanel(deps, tasks, controller, (persona, head) => persona.buildRationalePrompt(input, head));
}

export interface RunSecondRoundPanelDeps {
  provider: LlmProvider;
  personas?: AdvisorStrategy[];
}

/**
 * Round-two sibling of `runPanel` (plan Phase 3): only personas present in `priorHeads` run, each
 * seeing its peers' round-one heads. Reuses `fanOutPanel` for the shared controller/merge/
 * partial-failure machinery; the round-two-specific pieces are the peer-aware prompt builders and
 * validating `complete()` against `AdvisorRoundTwoOpinionSchema`.
 */
export function runSecondRoundPanel(
  deps: RunSecondRoundPanelDeps,
  input: PanelInput,
  priorHeads: Map<AdvisorPersonaId, AdvisorOpinion>,
  signal?: AbortSignal,
): RunSecondRoundPanelResult {
  const candidates = deps.personas ?? ADVISOR_REGISTRY;
  const personas = candidates.filter((persona) => priorHeads.has(persona.id));
  const controller = createSharedController(signal);

  function requireHead(id: AdvisorPersonaId): AdvisorOpinion {
    const head = priorHeads.get(id);
    if (!head) {
      throw new Error(`runSecondRoundPanel: missing round-one head for persona "${id}"`);
    }
    return head;
  }

  function peersFor(persona: AdvisorStrategy): RoundOnePeer[] {
    return personas
      .filter((peer) => peer.id !== persona.id)
      .map((peer) => ({ label: peer.label, head: requireHead(peer.id) }));
  }

  const tasks: PersonaTask<AdvisorRoundTwoOpinion>[] = personas.map((persona) => {
    const selfHead = requireHead(persona.id);
    const { system, user } = persona.buildRoundTwoPrompt(input, selfHead, peersFor(persona));
    const completion = deps.provider.complete<AdvisorRoundTwoOpinion>({
      model: defaultAdvisorModel(),
      system,
      user,
      schema: AdvisorRoundTwoOpinionSchema,
      signal: controller.signal,
      temperature: persona.temperature,
      persona: persona.id,
      promptVersion: PROMPT_VERSION,
    });
    return { persona, completion };
  });

  return fanOutPanel(deps, tasks, controller, (persona, roundTwoHead) => {
    const selfHead = requireHead(persona.id);
    return persona.buildRoundTwoRationalePrompt(input, selfHead, roundTwoHead, peersFor(persona));
  });
}

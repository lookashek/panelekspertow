/**
 * Feature-local streaming hook (frontend.md §3) — opens the SSE connection to
 * `/api/sessions/[id]/stream` and maintains per-persona view state. Deliberately does NOT import
 * `@/lib/advisors/registry`: that module pulls persona prompts into the client bundle, which is a
 * server-only concern (Phase 1 rationale). Persona ids are accepted as plain strings instead.
 */

import { useEffect, useState } from "react";

export interface PersonaViewState {
  status: "pending" | "streaming" | "done" | "error";
  score?: number;
  thesis?: string;
  arguments?: string[];
  text: string;
  error?: string;
}

interface ScoreEventData {
  personaId: string;
  score: number;
  thesis: string;
  arguments: string[];
}

interface TokenEventData {
  personaId: string;
  text: string;
}

interface DoneEventData {
  personaId: string;
}

interface ErrorEventData {
  personaId: string;
  code: string;
  message: string;
}

function initialState(personaIds: string[]): Record<string, PersonaViewState> {
  const state: Record<string, PersonaViewState> = {};
  for (const personaId of personaIds) {
    state[personaId] = { status: "pending", text: "" };
  }
  return state;
}

function isTerminal(state: PersonaViewState): boolean {
  return state.status === "done" || state.status === "error";
}

export function usePanelStream(sessionId: string, personaIds: string[]): Record<string, PersonaViewState> {
  const [state, setState] = useState<Record<string, PersonaViewState>>(() => initialState(personaIds));

  useEffect(() => {
    const eventSource = new EventSource(`/api/sessions/${sessionId}/stream`);
    let closed = false;

    const closeIfComplete = (next: Record<string, PersonaViewState>) => {
      if (closed) return;
      const allTerminal = personaIds.every((id) => isTerminal(next[id]));
      if (allTerminal) {
        closed = true;
        eventSource.close();
      }
    };

    const onScore = (event: MessageEvent<string>) => {
      const data = JSON.parse(event.data) as ScoreEventData;
      setState((prev) => {
        const next = {
          ...prev,
          [data.personaId]: {
            ...prev[data.personaId],
            status: "streaming" as const,
            score: data.score,
            thesis: data.thesis,
            arguments: data.arguments,
          },
        };
        closeIfComplete(next);
        return next;
      });
    };

    const onToken = (event: MessageEvent<string>) => {
      const data = JSON.parse(event.data) as TokenEventData;
      setState((prev) => {
        const next = {
          ...prev,
          [data.personaId]: {
            ...prev[data.personaId],
            status: "streaming" as const,
            text: prev[data.personaId].text + data.text,
          },
        };
        closeIfComplete(next);
        return next;
      });
    };

    const onDone = (event: MessageEvent<string>) => {
      const data = JSON.parse(event.data) as DoneEventData;
      setState((prev) => {
        const next = {
          ...prev,
          [data.personaId]: { ...prev[data.personaId], status: "done" as const },
        };
        closeIfComplete(next);
        return next;
      });
    };

    // "error" is a reserved EventSource event type: it fires both for our server-sent named
    // `event: error` frames (a MessageEvent with `.data`) AND for underlying connection failures
    // (a plain Event with no `.data`). Only the former carries a parseable payload.
    const onError = (event: Event) => {
      if (!("data" in event) || typeof event.data !== "string") {
        return;
      }
      const data = JSON.parse(event.data) as ErrorEventData;
      setState((prev) => {
        const next = {
          ...prev,
          [data.personaId]: { ...prev[data.personaId], status: "error" as const, error: data.message },
        };
        closeIfComplete(next);
        return next;
      });
    };

    eventSource.addEventListener("score", onScore);
    eventSource.addEventListener("token", onToken);
    eventSource.addEventListener("done", onDone);
    eventSource.addEventListener("error", onError);

    return () => {
      eventSource.removeEventListener("score", onScore);
      eventSource.removeEventListener("token", onToken);
      eventSource.removeEventListener("done", onDone);
      eventSource.removeEventListener("error", onError);
      eventSource.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- personaIds is a stable list for the session lifetime
  }, [sessionId]);

  return state;
}

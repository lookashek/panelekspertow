/**
 * Feature-local streaming hook (frontend.md §3) — opens the SSE connection to
 * `/api/sessions/[id]/synthesis` and maintains single-generator view state (not per-persona, unlike
 * `usePanelStream`). Deliberately does NOT import `@/lib/advisors/registry`, same rationale as
 * `usePanelStream` (Phase 1).
 */

import { useEffect, useState } from "react";

import type { Synthesis } from "@/lib/schemas/synthesis";

export interface SynthesisViewState {
  status: "pending" | "streaming" | "done" | "error";
  synthesis?: Synthesis;
  narrative: string;
  error?: string;
}

interface TokenEventData {
  text: string;
}

interface ErrorEventData {
  code: string;
  message: string;
}

function isTerminal(status: SynthesisViewState["status"]): boolean {
  return status === "done" || status === "error";
}

export function useSynthesisStream(sessionId: string): SynthesisViewState {
  const [state, setState] = useState<SynthesisViewState>({ status: "pending", narrative: "" });

  useEffect(() => {
    const eventSource = new EventSource(`/api/sessions/${sessionId}/synthesis`);
    let closed = false;

    const closeIfTerminal = (status: SynthesisViewState["status"]) => {
      if (closed || !isTerminal(status)) return;
      closed = true;
      eventSource.close();
    };

    const onSynthesis = (event: MessageEvent<string>) => {
      const data = JSON.parse(event.data) as Synthesis;
      setState((prev) => ({ ...prev, status: "streaming", synthesis: data }));
    };

    const onToken = (event: MessageEvent<string>) => {
      const data = JSON.parse(event.data) as TokenEventData;
      setState((prev) => ({ ...prev, status: "streaming", narrative: prev.narrative + data.text }));
    };

    const onDone = () => {
      setState((prev) => ({ ...prev, status: "done" }));
      closeIfTerminal("done");
    };

    // "error" is a reserved EventSource event type: it fires both for our server-sent named
    // `event: error` frames (a MessageEvent with `.data`) AND for underlying connection failures
    // (a plain Event with no `.data`). Only the former carries a parseable payload.
    const onError = (event: Event) => {
      if (!("data" in event) || typeof event.data !== "string") {
        return;
      }
      const data = JSON.parse(event.data) as ErrorEventData;
      setState((prev) => ({ ...prev, status: "error", error: data.message }));
      closeIfTerminal("error");
    };

    eventSource.addEventListener("synthesis", onSynthesis);
    eventSource.addEventListener("token", onToken);
    eventSource.addEventListener("done", onDone);
    eventSource.addEventListener("error", onError);

    return () => {
      eventSource.removeEventListener("synthesis", onSynthesis);
      eventSource.removeEventListener("token", onToken);
      eventSource.removeEventListener("done", onDone);
      eventSource.removeEventListener("error", onError);
      eventSource.close();
    };
  }, [sessionId]);

  return state;
}

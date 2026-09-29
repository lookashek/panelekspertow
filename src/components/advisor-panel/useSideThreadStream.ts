/**
 * Feature-local streaming hook (frontend.md §3) for the "Dopytaj" side thread. Unlike
 * `usePanelStream`, the transport is a POST request (persona id + message go in the body), so
 * `EventSource` (GET-only) is not available — this hook reads `response.body` as a
 * `ReadableStream`, decodes it, and parses `event:`/`data:` SSE frames by hand.
 */

import { useEffect, useRef, useState } from "react";

export interface SideThreadViewMessage {
  role: "user" | "advisor";
  content: string;
}

export type SideThreadStatus = "idle" | "streaming" | "error";

export interface SideThreadState {
  messages: SideThreadViewMessage[];
  status: SideThreadStatus;
  error?: string;
  send: (text: string) => void;
}

interface TokenFrameData {
  text: string;
}

interface ErrorFrameData {
  code: string;
  message: string;
}

interface ParsedFrame {
  event: string;
  data: string;
}

/** Splits a buffered SSE byte stream on blank-line frame boundaries and parses `event:`/`data:` lines. */
function parseFrames(buffer: string): { frames: ParsedFrame[]; rest: string } {
  const parts = buffer.split("\n\n");
  const rest = parts.pop() ?? "";
  const frames: ParsedFrame[] = [];
  for (const part of parts) {
    let event = "message";
    const dataLines: string[] = [];
    for (const line of part.split("\n")) {
      if (line.startsWith("event:")) {
        event = line.slice("event:".length).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice("data:".length).trim());
      }
    }
    if (dataLines.length > 0) {
      frames.push({ event, data: dataLines.join("\n") });
    }
  }
  return { frames, rest };
}

export function useSideThreadStream(
  sessionId: string,
  personaId: string,
  initialMessages: SideThreadViewMessage[],
): SideThreadState {
  const [messages, setMessages] = useState<SideThreadViewMessage[]>(initialMessages);
  const [status, setStatus] = useState<SideThreadStatus>("idle");
  const [error, setError] = useState<string | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const send = (text: string) => {
    setMessages((prev) => [...prev, { role: "user", content: text }, { role: "advisor", content: "" }]);
    setStatus("streaming");
    setError(undefined);

    const controller = new AbortController();
    abortRef.current = controller;

    const appendToken = (chunk: string) => {
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        next[next.length - 1] = { ...last, content: last.content + chunk };
        return next;
      });
    };

    void (async () => {
      try {
        const response = await fetch(`/api/sessions/${sessionId}/side-thread`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ personaId, message: text }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          let message = "Nie udało się wysłać dopytania.";
          try {
            const body = (await response.json()) as { error?: { message?: string } };
            if (body.error?.message) {
              message = body.error.message;
            }
          } catch {
            // non-JSON error body — fall back to the default message
          }
          setStatus("error");
          setError(message);
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const { frames, rest } = parseFrames(buffer);
          buffer = rest;

          for (const frame of frames) {
            if (frame.event === "token") {
              const data = JSON.parse(frame.data) as TokenFrameData;
              appendToken(data.text);
            } else if (frame.event === "done") {
              setStatus("idle");
            } else if (frame.event === "error") {
              const data = JSON.parse(frame.data) as ErrorFrameData;
              setStatus("error");
              setError(data.message);
            }
          }
        }
      } catch (cause) {
        if (controller.signal.aborted) {
          return;
        }
        setStatus("error");
        setError(cause instanceof Error ? cause.message : "Połączenie z doradcą zostało przerwane.");
      }
    })();
  };

  return { messages, status, error, send };
}

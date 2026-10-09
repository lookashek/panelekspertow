import { useEffect, useMemo, useRef } from "react";

import { AdvisorCard } from "@/components/advisor-panel/AdvisorCard";
import { usePanelStream } from "@/components/advisor-panel/usePanelStream";
import type { RoundOutcome } from "@/lib/session-flow";

interface AdvisorPanelProps {
  sessionId: string;
  personas: { id: string; label: string }[];
  /** SSR-seeded side-thread history — eligibility itself is derived live from round-one scores. */
  initialThreads?: Record<string, { role: "user" | "advisor"; content: string }[]>;
  /** Reported once, the moment every persona's round-one stream settles (done or error). */
  onOutcome: (outcome: RoundOutcome) => void;
}

export function AdvisorPanel({ sessionId, personas, initialThreads, onOutcome }: AdvisorPanelProps) {
  const personaIds = useMemo(() => personas.map((persona) => persona.id), [personas]);
  const state = usePanelStream(sessionId, personaIds);
  const settled = personaIds.every((id) => state[id].status === "done" || state[id].status === "error");
  const reportedRef = useRef(false);

  useEffect(() => {
    if (!settled || reportedRef.current) {
      return;
    }
    reportedRef.current = true;
    const scoredPersonaIds = personaIds.filter((id) => state[id].score !== undefined);
    onOutcome({ settled: true, scoredPersonaIds });
  }, [settled, personaIds, state, onOutcome]);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {personas.map((persona) => (
        <AdvisorCard
          key={persona.id}
          personaId={persona.id}
          label={persona.label}
          state={state[persona.id]}
          sessionId={sessionId}
          sideThreadEnabled={state[persona.id].score !== undefined}
          initialMessages={initialThreads?.[persona.id] ?? []}
        />
      ))}
    </div>
  );
}

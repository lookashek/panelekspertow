import { useEffect, useId, useMemo, useRef, useState } from "react";

import { AdvisorCard } from "@/components/advisor-panel/AdvisorCard";
import { RoundSummary } from "@/components/advisor-panel/RoundSummary";
import { usePanelStream } from "@/components/advisor-panel/usePanelStream";
import { headingVariants } from "@/components/ui/heading";
import type { RoundOutcome } from "@/lib/session-flow";

interface AdvisorPanelProps {
  sessionId: string;
  personas: { id: string; label: string }[];
  /** SSR-seeded side-thread history — eligibility itself is derived live from round-one scores. */
  initialThreads?: Record<string, { role: "user" | "advisor"; content: string }[]>;
  /** Reported once, the moment every persona's round-one stream settles (done or error). */
  onOutcome: (outcome: RoundOutcome) => void;
  /** True once round two or synthesis has started — folds this round to compact rows. */
  folded: boolean;
}

export function AdvisorPanel({ sessionId, personas, initialThreads, onOutcome, folded }: AdvisorPanelProps) {
  const personaIds = useMemo(() => personas.map((persona) => persona.id), [personas]);
  const state = usePanelStream(sessionId, personaIds);
  const settled = personaIds.every((id) => state[id].status === "done" || state[id].status === "error");
  const reportedRef = useRef(false);
  // Only consulted once `folded` is true — see RoundSummary's toggle below.
  const [expanded, setExpanded] = useState(false);
  const gridId = useId();

  useEffect(() => {
    if (!settled || reportedRef.current) {
      return;
    }
    reportedRef.current = true;
    const scoredPersonaIds = personaIds.filter((id) => state[id].score !== undefined);
    onOutcome({ settled: true, scoredPersonaIds });
  }, [settled, personaIds, state, onOutcome]);

  return (
    <section className="flex flex-col gap-4">
      <h2 className={headingVariants({ level: "section" })}>Runda 1</h2>
      {folded && (
        <RoundSummary
          round={1}
          rows={personas.map((persona) => ({
            personaId: persona.id,
            label: persona.label,
            score: state[persona.id].score,
            previousScore: state[persona.id].previousScore,
            thesis: state[persona.id].thesis,
          }))}
          expanded={expanded}
          onToggle={() => {
            setExpanded((value) => !value);
          }}
          controlsId={gridId}
        />
      )}
      {/* Cards stay mounted (hidden, never unmounted) so usePanelStream's EventSource and any open
       * SideThread input survive folding — see plan's "Fold by hiding, never unmounting". */}
      <div id={gridId} hidden={folded && !expanded} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
    </section>
  );
}

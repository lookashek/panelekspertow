/**
 * Round-two trigger + panel (frontend.md §1/§3) — the streaming child that calls
 * `usePanelStream(..., 2)` is not mounted until the user activates it, so no round-two
 * `EventSource` opens (and no LLM cost is incurred) before then. `hasRoundTwo` mounts the
 * streaming child immediately instead (page reload with already-persisted round-two rows — the
 * replay path has no LLM cost either).
 */

import { useState } from "react";

import { AdvisorCard } from "@/components/advisor-panel/AdvisorCard";
import { usePanelStream } from "@/components/advisor-panel/usePanelStream";

interface RoundTwoPanelProps {
  sessionId: string;
  personas: { id: string; label: string }[];
  available: boolean;
  hasRoundTwo: boolean;
}

function RoundTwoStream({ sessionId, personas }: { sessionId: string; personas: { id: string; label: string }[] }) {
  const personaIds = personas.map((persona) => persona.id);
  const state = usePanelStream(sessionId, personaIds, 2);
  const labelById = new Map(personas.map((persona) => [persona.id, persona.label]));

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {personas.map((persona) => {
        const personaState = state[persona.id];
        const attributedPersonaLabel = personaState.attributedPersonaId
          ? labelById.get(personaState.attributedPersonaId)
          : undefined;
        return (
          <AdvisorCard
            key={persona.id}
            personaId={persona.id}
            label={persona.label}
            state={personaState}
            attributedPersonaLabel={attributedPersonaLabel}
          />
        );
      })}
    </div>
  );
}

export function RoundTwoPanel({ sessionId, personas, available, hasRoundTwo }: RoundTwoPanelProps) {
  const [started, setStarted] = useState(hasRoundTwo);

  if (!available) {
    return null;
  }

  return (
    <section className="mt-8 flex flex-col gap-4">
      <h2 className="font-pixel text-accent text-sm sm:text-base">RUNDA 2</h2>
      {started ? (
        <RoundTwoStream sessionId={sessionId} personas={personas} />
      ) : (
        <button
          type="button"
          onClick={() => {
            setStarted(true);
          }}
          className="pixel-btn font-pixel bg-primary text-primary-foreground hover:border-accent hover:bg-accent self-start px-6 py-4 text-xs transition-colors"
        >
          URUCHOM RUNDĘ 2
        </button>
      )}
    </section>
  );
}

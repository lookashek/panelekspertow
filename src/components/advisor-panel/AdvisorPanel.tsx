import { AdvisorCard } from "@/components/advisor-panel/AdvisorCard";
import { usePanelStream } from "@/components/advisor-panel/usePanelStream";

interface AdvisorPanelProps {
  sessionId: string;
  personas: { id: string; label: string }[];
  /** Opt-in side-thread affordance (Dopytaj) — round one only, see plan Phase 6. */
  sideThread?: {
    eligible: string[];
    initialThreads: Record<string, { role: "user" | "advisor"; content: string }[]>;
  };
}

export function AdvisorPanel({ sessionId, personas, sideThread }: AdvisorPanelProps) {
  const personaIds = personas.map((persona) => persona.id);
  const state = usePanelStream(sessionId, personaIds);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {personas.map((persona) => (
        <AdvisorCard
          key={persona.id}
          personaId={persona.id}
          label={persona.label}
          state={state[persona.id]}
          sessionId={sessionId}
          sideThreadEnabled={sideThread?.eligible.includes(persona.id) ?? false}
          initialMessages={sideThread?.initialThreads[persona.id] ?? []}
        />
      ))}
    </div>
  );
}

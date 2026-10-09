/**
 * Round-two panel (frontend.md §1/§3) — `SessionFlow` owns the "started" decision and the trigger
 * button now (session-quality-polish Phase 1); this component only decides when it is safe to
 * mount the streaming child. `RoundTwoStream` (which opens the round-two `EventSource`) is not
 * mounted until both `started` is true AND `participantsReady` is true — round one's live
 * participant derivation must settle first, even on a reload where `started` is true from the
 * first render (replayed round-two rows have no LLM cost, but racing round one's replay stream
 * would freeze `usePanelStream`'s persona list before it is known).
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";

import { AdvisorCard } from "@/components/advisor-panel/AdvisorCard";
import { RoundSummary } from "@/components/advisor-panel/RoundSummary";
import { usePanelStream } from "@/components/advisor-panel/usePanelStream";
import { headingVariants } from "@/components/ui/heading";
import { panelVariants } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import type { RoundOutcome } from "@/lib/session-flow";

interface RoundTwoPanelProps {
  sessionId: string;
  personas: { id: string; label: string }[];
  started: boolean;
  participantsReady: boolean;
  onOutcome: (outcome: RoundOutcome) => void;
  /** True once synthesis has started — folds round two to compact rows. */
  folded: boolean;
}

function RoundTwoStream({
  sessionId,
  personas,
  onOutcome,
  folded,
}: {
  sessionId: string;
  personas: { id: string; label: string }[];
  onOutcome: (outcome: RoundOutcome) => void;
  folded: boolean;
}) {
  const personaIds = useMemo(() => personas.map((persona) => persona.id), [personas]);
  const state = usePanelStream(sessionId, personaIds, 2);
  const labelById = useMemo(() => new Map(personas.map((persona) => [persona.id, persona.label])), [personas]);
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
    <div>
      {folded && (
        <RoundSummary
          round={2}
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
      {/* Cards stay mounted (hidden, never unmounted) — unmounting would reopen this round's
       * EventSource (usePanelStream lives in this component). */}
      <div id={gridId} hidden={folded && !expanded} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
    </div>
  );
}

export function RoundTwoPanel({
  sessionId,
  personas,
  started,
  participantsReady,
  onOutcome,
  folded,
}: RoundTwoPanelProps) {
  if (!started) {
    return null;
  }

  return (
    <section className="mt-8 flex flex-col gap-4">
      <h2 className={headingVariants({ level: "section" })}>Runda 2</h2>
      {participantsReady ? (
        <RoundTwoStream sessionId={sessionId} personas={personas} onOutcome={onOutcome} folded={folded} />
      ) : (
        <div className={panelVariants({ padding: "card" })}>
          <span className="motion-safe:animate-blink text-muted-foreground text-sm mb-2 block">
            Przygotowywanie rundy 2…
          </span>
          <Skeleton className="h-4 w-3/4" />
        </div>
      )}
    </section>
  );
}

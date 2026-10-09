/**
 * Session page root island (frontend.md §1/§3, session-quality-polish Phase 1). Replaces the three
 * SSR-gated islands with one React root that owns step state, derives availability from the live
 * streams (never from SSR snapshots), and renders the forward actions. Round panels report their
 * outcome upward via `onOutcome`/`onStatus`; `deriveSessionStep` (src/lib/session-flow.ts) turns
 * that into the current `SessionStep`.
 *
 * This phase's action area is intentionally minimal (plain buttons reusing the existing
 * `pixel-btn` styling) — a full-width sticky `StepActionBar` is Phase 2's job. Likewise, finished
 * rounds stay mounted but are not visually folded yet (Phase 3).
 */

import { useCallback, useState } from "react";

import { AdvisorPanel } from "@/components/advisor-panel/AdvisorPanel";
import { RoundTwoPanel } from "@/components/advisor-panel/RoundTwoPanel";
import { SynthesisPanel } from "@/components/advisor-panel/SynthesisPanel";
import { deriveSessionStep } from "@/lib/session-flow";
import type { RoundOutcome, SynthesisStreamStatus } from "@/lib/session-flow";

interface SessionFlowProps {
  sessionId: string;
  personas: { id: string; label: string }[];
  minRoundTwoParticipants: number;
  hasRoundOne: boolean;
  hasRoundTwo: boolean;
  hasSynthesis: boolean;
  initialThreads: Record<string, { role: "user" | "advisor"; content: string }[]>;
}

const EMPTY_OUTCOME: RoundOutcome = { settled: false, scoredPersonaIds: [] };

const ACTION_BUTTON_CLASS =
  "pixel-btn font-pixel bg-primary text-primary-foreground hover:border-accent hover:bg-accent self-start px-6 py-4 text-xs transition-colors";

export function SessionFlow({
  sessionId,
  personas,
  minRoundTwoParticipants,
  // Accepted for prop-shape parity with the SSR page (and future phases); round one's live
  // stream (replayed on reload) is the sole source of truth for `roundOneOutcome`, so this flag
  // is not consulted directly — AdvisorPanel mounts unconditionally either way.
  hasRoundOne: _hasRoundOne,
  hasRoundTwo,
  hasSynthesis,
  initialThreads,
}: SessionFlowProps) {
  const [roundOneRetryKey, setRoundOneRetryKey] = useState(0);
  const [roundOneOutcome, setRoundOneOutcome] = useState<RoundOutcome>(EMPTY_OUTCOME);
  const [roundTwoParticipants, setRoundTwoParticipants] = useState<{ id: string; label: string }[] | null>(null);
  const [roundTwoStarted, setRoundTwoStarted] = useState(hasRoundTwo);
  const [roundTwoOutcome, setRoundTwoOutcome] = useState<RoundOutcome>(EMPTY_OUTCOME);
  const [synthesisStarted, setSynthesisStarted] = useState(hasSynthesis);
  const [synthesisStatus, setSynthesisStatus] = useState<SynthesisStreamStatus>(hasSynthesis ? "pending" : "idle");

  // Round-two participants are derived once, the moment round one settles: the persona ids that
  // received a `score` event (see AdvisorPanel/RoundOutcome) — frozen from then on, because
  // `usePanelStream` treats its `personaIds` argument as stable for the stream's lifetime.
  const handleRoundOneOutcome = useCallback(
    (outcome: RoundOutcome) => {
      setRoundOneOutcome(outcome);
      setRoundTwoParticipants(personas.filter((persona) => outcome.scoredPersonaIds.includes(persona.id)));
    },
    [personas],
  );

  const handleRoundOneRetry = () => {
    setRoundOneRetryKey((key) => key + 1);
    setRoundOneOutcome(EMPTY_OUTCOME);
    setRoundTwoParticipants(null);
  };

  const step = deriveSessionStep({
    roundOne: roundOneOutcome,
    roundTwoStarted,
    roundTwo: roundTwoOutcome,
    synthesisStarted,
    synthesisStatus,
    minRoundTwoParticipants,
  });

  // Monotonic once true (settled personas/participant counts never shrink), so this never forces
  // an unmount of an already-mounted panel — only ever reveals one that wasn't reachable yet.
  const showRoundTwo =
    roundTwoStarted || (roundOneOutcome.settled && roundOneOutcome.scoredPersonaIds.length >= minRoundTwoParticipants);
  const showSynthesis = synthesisStarted || (roundOneOutcome.settled && roundOneOutcome.scoredPersonaIds.length >= 1);

  return (
    <>
      <AdvisorPanel
        key={roundOneRetryKey}
        sessionId={sessionId}
        personas={personas}
        initialThreads={initialThreads}
        onOutcome={handleRoundOneOutcome}
      />

      {showRoundTwo && (
        <RoundTwoPanel
          sessionId={sessionId}
          personas={roundTwoParticipants ?? []}
          started={roundTwoStarted}
          participantsReady={roundOneOutcome.settled}
          onOutcome={setRoundTwoOutcome}
        />
      )}

      {showSynthesis && (
        <SynthesisPanel sessionId={sessionId} started={synthesisStarted} onStatus={setSynthesisStatus} />
      )}

      <div className="mt-8 flex flex-col gap-4">
        {step.kind === "round-one-failed" && (
          <button type="button" onClick={handleRoundOneRetry} className={ACTION_BUTTON_CLASS}>
            PONÓW RUNDĘ 1
          </button>
        )}

        {step.kind === "round-one-settled" && (
          <div className="flex flex-wrap gap-4">
            {step.canRunRoundTwo && (
              <button
                type="button"
                onClick={() => {
                  setRoundTwoStarted(true);
                }}
                className={ACTION_BUTTON_CLASS}
              >
                URUCHOM RUNDĘ 2
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setSynthesisStarted(true);
              }}
              className={ACTION_BUTTON_CLASS}
            >
              ZAKOŃCZ SESJĘ
            </button>
          </div>
        )}

        {step.kind === "round-two-settled" && (
          <button
            type="button"
            onClick={() => {
              setSynthesisStarted(true);
            }}
            className={ACTION_BUTTON_CLASS}
          >
            ZAKOŃCZ SESJĘ
          </button>
        )}

        {step.kind === "finished" && (
          <a href="/sessions/new" className={ACTION_BUTTON_CLASS}>
            NOWA DECYZJA
          </a>
        )}
      </div>
    </>
  );
}

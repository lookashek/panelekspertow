/**
 * Session page root island (frontend.md §1/§3, session-quality-polish Phase 1 + 2). Replaces the
 * three SSR-gated islands with one React root that owns step state, derives availability from the
 * live streams (never from SSR snapshots), and renders the forward actions. Round panels report
 * their outcome upward via `onOutcome`/`onStatus`; `deriveSessionStep` (src/lib/session-flow.ts)
 * turns that into the current `SessionStep`.
 *
 * Phase 2 replaces the minimal inline action area with `StepActionBar` (full-width status + up to
 * two actions) and auto-scrolls it into view on live transitions — see the effect below for the
 * exact gate. Finished rounds stay mounted but are not visually folded yet (Phase 3).
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { AdvisorPanel } from "@/components/advisor-panel/AdvisorPanel";
import { RoundTwoPanel } from "@/components/advisor-panel/RoundTwoPanel";
import { StepActionBar } from "@/components/advisor-panel/StepActionBar";
import { SynthesisPanel } from "@/components/advisor-panel/SynthesisPanel";
import { deriveSessionStep } from "@/lib/session-flow";
import type { Action } from "@/components/advisor-panel/StepActionBar";
import type { RoundOutcome, SessionStep, SynthesisStreamStatus } from "@/lib/session-flow";

interface SessionFlowProps {
  sessionId: string;
  personas: { id: string; label: string }[];
  minRoundTwoParticipants: number;
  hasRoundOne: boolean;
  hasRoundTwo: boolean;
  hasSynthesis: boolean;
  initialThreads: Record<string, { role: "user" | "advisor"; content: string }[]>;
}

interface ActionBarContent {
  status: string;
  primary?: Action;
  secondary?: Action;
}

interface ActionBarHandlers {
  onRetryRoundOne: () => void;
  onStartRoundTwo: () => void;
  onStartSynthesis: () => void;
}

const EMPTY_OUTCOME: RoundOutcome = { settled: false, scoredPersonaIds: [] };

/** Maps the derived step to the status text + actions `StepActionBar` renders — kept out of
 * `session-flow.ts` so that module stays free of UI/Polish-string concerns. */
function deriveActionBarContent(step: SessionStep, handlers: ActionBarHandlers): ActionBarContent {
  switch (step.kind) {
    case "round-one-running":
      return { status: "Runda 1 w toku…" };

    case "round-one-failed":
      return {
        status: "Runda 1 nie powiodła się.",
        primary: { label: "PONÓW", onClick: handlers.onRetryRoundOne },
      };

    case "round-one-settled":
      if (step.canRunRoundTwo) {
        return {
          status: "Runda 1 zakończona.",
          primary: { label: "URUCHOM RUNDĘ 2", onClick: handlers.onStartRoundTwo },
          secondary: { label: "ZAKOŃCZ SESJĘ", onClick: handlers.onStartSynthesis },
        };
      }
      return {
        status: "Runda 1 zakończona.",
        primary: { label: "ZAKOŃCZ SESJĘ", onClick: handlers.onStartSynthesis },
      };

    case "round-two-running":
      return { status: "Runda 2 w toku… synteza zablokowana." };

    case "round-two-settled":
      return {
        status: "Runda 2 zakończona.",
        primary: { label: "ZAKOŃCZ SESJĘ", onClick: handlers.onStartSynthesis },
      };

    case "synthesis-running":
      return { status: "Synteza w toku…" };

    case "synthesis-failed":
      return { status: "Synteza nie powiodła się." };

    case "finished":
      return {
        status: "Sesja zakończona.",
        primary: { label: "NOWA DECYZJA", href: "/sessions/new" },
        secondary: { label: "HISTORIA SESJI", href: "/sessions" },
      };
  }
}

const RUNNING_STEP_KINDS = new Set<SessionStep["kind"]>(["round-one-running", "round-two-running", "synthesis-running"]);

export function SessionFlow({
  sessionId,
  personas,
  minRoundTwoParticipants,
  hasRoundOne,
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

  // Flipped the moment the user triggers any forward action in this page load (round-1 retry,
  // round-2 start, synthesis start). Drives the auto-scroll gate below — a ref, not state, since
  // it never needs to cause a re-render on its own.
  const userActedThisLoadRef = useRef(false);
  const actionBarRef = useRef<HTMLDivElement>(null);
  const previousStepKindRef = useRef<SessionStep["kind"] | null>(null);

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
    userActedThisLoadRef.current = true;
    setRoundOneRetryKey((key) => key + 1);
    setRoundOneOutcome(EMPTY_OUTCOME);
    setRoundTwoParticipants(null);
  };

  const handleStartRoundTwo = () => {
    userActedThisLoadRef.current = true;
    setRoundTwoStarted(true);
  };

  const handleStartSynthesis = () => {
    userActedThisLoadRef.current = true;
    setSynthesisStarted(true);
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

  // Auto-scroll the action bar into view on a *live* transition only: either the page loaded with
  // round one still streaming (`!hasRoundOne`), or the user triggered an action this page load.
  // A cold revisit (hasRoundOne === true, no action yet) never auto-scrolls — it would yank an
  // already-settled page down on load. Never moves focus; the bar's own `aria-live="polite"`
  // status text is the announcement.
  useEffect(() => {
    const isNewStep = previousStepKindRef.current !== step.kind;
    previousStepKindRef.current = step.kind;

    if (!isNewStep || RUNNING_STEP_KINDS.has(step.kind)) {
      return;
    }

    if (hasRoundOne && !userActedThisLoadRef.current) {
      return;
    }

    const node = actionBarRef.current;
    if (!node) {
      return;
    }

    let reducedMotion = false;
    try {
      reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    } catch {
      reducedMotion = false;
    }

    node.scrollIntoView({ block: "nearest", behavior: reducedMotion ? "auto" : "smooth" });
  }, [step.kind, hasRoundOne]);

  const { status, primary, secondary } = deriveActionBarContent(step, {
    onRetryRoundOne: handleRoundOneRetry,
    onStartRoundTwo: handleStartRoundTwo,
    onStartSynthesis: handleStartSynthesis,
  });

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

      <div ref={actionBarRef} className="mt-8">
        <StepActionBar status={status} primary={primary} secondary={secondary} />
      </div>
    </>
  );
}

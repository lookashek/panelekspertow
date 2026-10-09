/**
 * Session page root island (frontend.md §1/§3, session-quality-polish Phase 1 + 2). Replaces the
 * three SSR-gated islands with one React root that owns step state, derives availability from the
 * live streams (never from SSR snapshots), and renders the forward actions. Round panels report
 * their outcome upward via `onOutcome`/`onStatus`; `deriveSessionStep` (src/lib/session-flow.ts)
 * turns that into the current `SessionStep`.
 *
 * Phase 2 replaces the minimal inline action area with `StepActionBar` (full-width status + up to
 * two actions) and auto-scrolls it into view on live transitions — see the effect below for the
 * exact gate. Phase 3 folds round one once round two or synthesis starts, and round two once
 * synthesis starts — `AdvisorPanel`/`RoundTwoPanel` receive `folded` and manage their own
 * expand/collapse toggle, keeping both the compact summary and the full card grid mounted.
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

type ActionKind = "retry-round-one" | "start-round-two" | "start-synthesis" | "new-decision" | "history";

interface ActionBarKinds {
  status: string;
  primaryKind?: ActionKind;
  secondaryKind?: ActionKind;
}

const EMPTY_OUTCOME: RoundOutcome = { settled: false, scoredPersonaIds: [] };

/**
 * Maps the derived step to the status text + which actions `StepActionBar` should offer — kept
 * free of the actual `onClick` handlers (and out of `session-flow.ts`, so that module stays free
 * of UI/Polish-string concerns): `react-hooks/refs` flags passing a ref-touching closure as an
 * argument into a plain function during render, so the handlers are attached afterward, in the
 * component body, via plain object lookup rather than being threaded through this function.
 */
function deriveActionBarKinds(step: SessionStep): ActionBarKinds {
  switch (step.kind) {
    case "round-one-running":
      return { status: "Runda 1 w toku…" };

    case "round-one-failed":
      return { status: "Runda 1 nie powiodła się.", primaryKind: "retry-round-one" };

    case "round-one-settled":
      return step.canRunRoundTwo
        ? { status: "Runda 1 zakończona.", primaryKind: "start-round-two", secondaryKind: "start-synthesis" }
        : { status: "Runda 1 zakończona.", primaryKind: "start-synthesis" };

    case "round-two-running":
      return { status: "Runda 2 w toku… synteza zablokowana." };

    case "round-two-settled":
      return { status: "Runda 2 zakończona.", primaryKind: "start-synthesis" };

    case "synthesis-running":
      return { status: "Synteza w toku…" };

    case "synthesis-failed":
      return { status: "Synteza nie powiodła się." };

    case "finished":
      return { status: "Sesja zakończona.", primaryKind: "new-decision", secondaryKind: "history" };
  }
}

const RUNNING_STEP_KINDS = new Set<SessionStep["kind"]>([
  "round-one-running",
  "round-two-running",
  "synthesis-running",
]);

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

  const handleRoundOneRetry = useCallback(() => {
    userActedThisLoadRef.current = true;
    setRoundOneRetryKey((key) => key + 1);
    setRoundOneOutcome(EMPTY_OUTCOME);
    setRoundTwoParticipants(null);
  }, []);

  const handleStartRoundTwo = useCallback(() => {
    userActedThisLoadRef.current = true;
    setRoundTwoStarted(true);
  }, []);

  const handleStartSynthesis = useCallback(() => {
    userActedThisLoadRef.current = true;
    setSynthesisStarted(true);
  }, []);

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

    let reducedMotion: boolean;
    try {
      reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      reducedMotion = false;
    }

    node.scrollIntoView({ block: "nearest", behavior: reducedMotion ? "auto" : "smooth" });
  }, [step.kind, hasRoundOne]);

  const { status, primaryKind, secondaryKind } = deriveActionBarKinds(step);

  // Plain object lookup, not a function call passing the handlers along: `react-hooks/refs`
  // flags a ref-touching closure passed as an argument into another function during render.
  const actionByKind: Record<ActionKind, Action> = {
    "retry-round-one": { label: "PONÓW", onClick: handleRoundOneRetry },
    "start-round-two": { label: "URUCHOM RUNDĘ 2", onClick: handleStartRoundTwo },
    "start-synthesis": { label: "ZAKOŃCZ SESJĘ", onClick: handleStartSynthesis },
    "new-decision": { label: "NOWA DECYZJA", href: "/sessions/new" },
    history: { label: "HISTORIA SESJI", href: "/sessions" },
  };
  const primary = primaryKind ? actionByKind[primaryKind] : undefined;
  const secondary = secondaryKind ? actionByKind[secondaryKind] : undefined;

  return (
    <>
      <AdvisorPanel
        key={roundOneRetryKey}
        sessionId={sessionId}
        personas={personas}
        initialThreads={initialThreads}
        onOutcome={handleRoundOneOutcome}
        folded={roundTwoStarted || synthesisStarted}
      />

      {showRoundTwo && (
        <RoundTwoPanel
          sessionId={sessionId}
          personas={roundTwoParticipants ?? []}
          started={roundTwoStarted}
          participantsReady={roundOneOutcome.settled}
          onOutcome={setRoundTwoOutcome}
          folded={synthesisStarted}
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

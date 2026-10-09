/**
 * Pure step derivation for the session page (frontend.md §3, `SessionFlow` root — Phase 1 of
 * session-quality-polish). One function decides the current step and which actions are offered, so
 * gating rules are unit-tested instead of scattered across panels.
 */

export interface RoundOutcome {
  settled: boolean;
  scoredPersonaIds: string[];
}

export type SynthesisStreamStatus = "idle" | "pending" | "streaming" | "done" | "error";

export interface DeriveSessionStepInput {
  roundOne: RoundOutcome;
  roundTwoStarted: boolean;
  roundTwo: RoundOutcome;
  synthesisStarted: boolean;
  synthesisStatus: SynthesisStreamStatus;
  minRoundTwoParticipants: number;
}

export type SessionStep =
  | { kind: "round-one-running" }
  | { kind: "round-one-failed" }
  | { kind: "round-one-settled"; canRunRoundTwo: boolean }
  | { kind: "round-two-running" }
  | { kind: "round-two-settled" }
  | { kind: "synthesis-running" }
  | { kind: "synthesis-failed" }
  | { kind: "finished" };

/**
 * Rules: synthesis needs >= 1 round-one scored persona (today's rule); round two needs
 * >= `minRoundTwoParticipants`. Synthesis, once started, takes priority over round two (it can
 * only start once round two — if started — has settled, but the check order here does not depend
 * on that: a started synthesis always wins once round two is no longer the active step).
 */
export function deriveSessionStep(input: DeriveSessionStepInput): SessionStep {
  const { roundOne, roundTwoStarted, roundTwo, synthesisStarted, synthesisStatus, minRoundTwoParticipants } = input;

  if (synthesisStarted) {
    if (synthesisStatus === "error") {
      return { kind: "synthesis-failed" };
    }
    if (synthesisStatus === "done") {
      return { kind: "finished" };
    }
    return { kind: "synthesis-running" };
  }

  if (roundTwoStarted) {
    if (!roundTwo.settled) {
      return { kind: "round-two-running" };
    }
    return { kind: "round-two-settled" };
  }

  if (!roundOne.settled) {
    return { kind: "round-one-running" };
  }

  if (roundOne.scoredPersonaIds.length === 0) {
    return { kind: "round-one-failed" };
  }

  return {
    kind: "round-one-settled",
    canRunRoundTwo: roundOne.scoredPersonaIds.length >= minRoundTwoParticipants,
  };
}

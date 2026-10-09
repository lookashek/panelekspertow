import { describe, expect, it } from "vitest";

import { deriveSessionStep, deriveStepProgress } from "@/lib/session-flow";
import type { DeriveSessionStepInput, SessionStep } from "@/lib/session-flow";

const base: DeriveSessionStepInput = {
  roundOne: { settled: false, scoredPersonaIds: [] },
  roundTwoStarted: false,
  roundTwo: { settled: false, scoredPersonaIds: [] },
  synthesisStarted: false,
  synthesisStatus: "idle",
  minRoundTwoParticipants: 2,
};

describe("deriveSessionStep", () => {
  it("is round-one-running while round one has not settled", () => {
    expect(deriveSessionStep(base)).toEqual({ kind: "round-one-running" });
  });

  it("is round-one-failed when round one settled with zero scored personas", () => {
    const step = deriveSessionStep({ ...base, roundOne: { settled: true, scoredPersonaIds: [] } });
    expect(step).toEqual({ kind: "round-one-failed" });
  });

  it("is round-one-settled with canRunRoundTwo=false below the participant minimum", () => {
    const step = deriveSessionStep({ ...base, roundOne: { settled: true, scoredPersonaIds: ["optymista"] } });
    expect(step).toEqual({ kind: "round-one-settled", canRunRoundTwo: false });
  });

  it("is round-one-settled with canRunRoundTwo=true at the participant minimum", () => {
    const step = deriveSessionStep({
      ...base,
      roundOne: { settled: true, scoredPersonaIds: ["optymista", "sceptyk"] },
    });
    expect(step).toEqual({ kind: "round-one-settled", canRunRoundTwo: true });
  });

  it("is round-two-running once round two starts but has not settled", () => {
    const step = deriveSessionStep({
      ...base,
      roundOne: { settled: true, scoredPersonaIds: ["optymista", "sceptyk"] },
      roundTwoStarted: true,
    });
    expect(step).toEqual({ kind: "round-two-running" });
  });

  it("is round-two-settled once round two's stream settles", () => {
    const step = deriveSessionStep({
      ...base,
      roundOne: { settled: true, scoredPersonaIds: ["optymista", "sceptyk"] },
      roundTwoStarted: true,
      roundTwo: { settled: true, scoredPersonaIds: ["optymista", "sceptyk"] },
    });
    expect(step).toEqual({ kind: "round-two-settled" });
  });

  it("is synthesis-running once synthesis starts, regardless of round two", () => {
    const step = deriveSessionStep({
      ...base,
      roundOne: { settled: true, scoredPersonaIds: ["optymista"] },
      synthesisStarted: true,
      synthesisStatus: "pending",
    });
    expect(step).toEqual({ kind: "synthesis-running" });
  });

  it("is synthesis-failed when the synthesis stream errors", () => {
    const step = deriveSessionStep({
      ...base,
      roundOne: { settled: true, scoredPersonaIds: ["optymista"] },
      synthesisStarted: true,
      synthesisStatus: "error",
    });
    expect(step).toEqual({ kind: "synthesis-failed" });
  });

  it("is finished once the synthesis stream is done", () => {
    const step = deriveSessionStep({
      ...base,
      roundOne: { settled: true, scoredPersonaIds: ["optymista"] },
      synthesisStarted: true,
      synthesisStatus: "done",
    });
    expect(step).toEqual({ kind: "finished" });
  });

  it("prioritizes a started synthesis over an unsettled round two", () => {
    const step = deriveSessionStep({
      ...base,
      roundOne: { settled: true, scoredPersonaIds: ["optymista", "sceptyk"] },
      roundTwoStarted: true,
      roundTwo: { settled: false, scoredPersonaIds: [] },
      synthesisStarted: true,
      synthesisStatus: "streaming",
    });
    expect(step).toEqual({ kind: "synthesis-running" });
  });
});

describe("deriveStepProgress", () => {
  const steps: { step: SessionStep; roundTwoStarted: boolean }[] = [
    { step: { kind: "round-one-running" }, roundTwoStarted: false },
    { step: { kind: "round-one-failed" }, roundTwoStarted: false },
    { step: { kind: "round-one-settled", canRunRoundTwo: true }, roundTwoStarted: false },
    { step: { kind: "round-two-running" }, roundTwoStarted: true },
    { step: { kind: "round-two-settled" }, roundTwoStarted: true },
    { step: { kind: "synthesis-running" }, roundTwoStarted: true },
    { step: { kind: "synthesis-failed" }, roundTwoStarted: true },
    { step: { kind: "finished" }, roundTwoStarted: true },
  ];

  it.each(steps)("derives a progress record for $step.kind", ({ step, roundTwoStarted }) => {
    const progress = deriveStepProgress(step, roundTwoStarted);
    expect(progress.roundOne).toBeDefined();
    expect(progress.roundTwo).toBeDefined();
    expect(progress.synthesis).toBeDefined();
  });

  it("marks round one active while round one runs", () => {
    expect(deriveStepProgress({ kind: "round-one-running" }, false)).toEqual({
      roundOne: "active",
      roundTwo: "pending",
      synthesis: "pending",
    });
  });

  it("marks round one failed on round-one-failed", () => {
    expect(deriveStepProgress({ kind: "round-one-failed" }, false)).toEqual({
      roundOne: "failed",
      roundTwo: "pending",
      synthesis: "pending",
    });
  });

  it("marks round two skipped once synthesis starts without round two ever starting", () => {
    expect(deriveStepProgress({ kind: "synthesis-running" }, false)).toEqual({
      roundOne: "done",
      roundTwo: "skipped",
      synthesis: "active",
    });
  });

  it("marks round two done (not skipped) once synthesis starts after round two ran", () => {
    expect(deriveStepProgress({ kind: "synthesis-running" }, true)).toEqual({
      roundOne: "done",
      roundTwo: "done",
      synthesis: "active",
    });
  });

  it("marks synthesis failed on synthesis-failed", () => {
    expect(deriveStepProgress({ kind: "synthesis-failed" }, false)).toEqual({
      roundOne: "done",
      roundTwo: "skipped",
      synthesis: "failed",
    });
  });

  it("marks every step done when finished", () => {
    expect(deriveStepProgress({ kind: "finished" }, true)).toEqual({
      roundOne: "done",
      roundTwo: "done",
      synthesis: "done",
    });
  });
});

import { describe, expect, it } from "vitest";

import { deriveSessionStep } from "@/lib/session-flow";
import type { DeriveSessionStepInput } from "@/lib/session-flow";

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

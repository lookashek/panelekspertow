import { describe, expect, it } from "vitest";

import { DisputeAxisSchema, RiskSchema, SynthesisSchema } from "@/lib/schemas/synthesis";

const validSynthesis = {
  agreementPoints: ["Obie strony zgadzają się, że decyzja jest pilna."],
  disputeAxes: [
    {
      title: "Ryzyko finansowe vs. szansa na rozwój",
      positions: ["Koszt przewyższa korzyści.", "Potencjał wzrostu przewyższa koszt."],
    },
  ],
  risks: [{ description: "Brak zabezpieczenia finansowego na 6 miesięcy.", weight: "high" }],
  recommendedNextStep: "Sporządź budżet awaryjny na najbliższe 3 miesiące.",
};

describe("DisputeAxisSchema", () => {
  it("accepts an axis with at least two opposing positions", () => {
    const result = DisputeAxisSchema.safeParse({
      title: "Oś sporu",
      positions: ["Stanowisko A.", "Stanowisko B."],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an axis with fewer than two positions", () => {
    const result = DisputeAxisSchema.safeParse({
      title: "Oś sporu",
      positions: ["Jedyne stanowisko."],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a blank title", () => {
    const result = DisputeAxisSchema.safeParse({
      title: "",
      positions: ["Stanowisko A.", "Stanowisko B."],
    });
    expect(result.success).toBe(false);
  });
});

describe("RiskSchema", () => {
  it.each(["high", "medium", "low"])("accepts weight %s", (weight) => {
    const result = RiskSchema.safeParse({ description: "Opis ryzyka.", weight });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid weight value", () => {
    const result = RiskSchema.safeParse({ description: "Opis ryzyka.", weight: "critical" });
    expect(result.success).toBe(false);
  });

  it("rejects a blank description", () => {
    const result = RiskSchema.safeParse({ description: "", weight: "high" });
    expect(result.success).toBe(false);
  });
});

describe("SynthesisSchema", () => {
  it("accepts a valid synthesis", () => {
    const result = SynthesisSchema.safeParse(validSynthesis);
    expect(result.success).toBe(true);
  });

  it("accepts an empty agreementPoints array (genuine full dispute)", () => {
    const result = SynthesisSchema.safeParse({ ...validSynthesis, agreementPoints: [] });
    expect(result.success).toBe(true);
  });

  it("rejects an empty disputeAxes array", () => {
    const result = SynthesisSchema.safeParse({ ...validSynthesis, disputeAxes: [] });
    expect(result.success).toBe(false);
  });

  it("rejects a dispute axis with fewer than two positions", () => {
    const result = SynthesisSchema.safeParse({
      ...validSynthesis,
      disputeAxes: [{ title: "Oś sporu", positions: ["Jedyne stanowisko."] }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid risk weight value", () => {
    const result = SynthesisSchema.safeParse({
      ...validSynthesis,
      risks: [{ description: "Opis ryzyka.", weight: "critical" }],
    });
    expect(result.success).toBe(false);
  });

  it("rejects a blank recommendedNextStep", () => {
    const result = SynthesisSchema.safeParse({ ...validSynthesis, recommendedNextStep: "" });
    expect(result.success).toBe(false);
  });
});

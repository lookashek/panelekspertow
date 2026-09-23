import { describe, expect, it } from "vitest";

import { AdvisorOpinionSchema, AdvisorScoreSchema } from "@/lib/schemas/advisor";

describe("AdvisorScoreSchema", () => {
  it("accepts a valid score and non-empty thesis", () => {
    const result = AdvisorScoreSchema.safeParse({ score: 7, thesis: "Solidny argument." });
    expect(result.success).toBe(true);
  });

  it.each([0, 11, 1.5, -1])("rejects an out-of-range or non-integer score (%s)", (score) => {
    const result = AdvisorScoreSchema.safeParse({ score, thesis: "Teza." });
    expect(result.success).toBe(false);
  });

  it("rejects an empty thesis", () => {
    const result = AdvisorScoreSchema.safeParse({ score: 5, thesis: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing score", () => {
    const result = AdvisorScoreSchema.safeParse({ thesis: "Teza." });
    expect(result.success).toBe(false);
  });
});

describe("AdvisorOpinionSchema", () => {
  it("accepts a valid opinion with non-empty arguments", () => {
    const result = AdvisorOpinionSchema.safeParse({
      score: 8,
      thesis: "Teza.",
      arguments: ["Argument jeden.", "Argument dwa."],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty arguments array", () => {
    const result = AdvisorOpinionSchema.safeParse({ score: 8, thesis: "Teza.", arguments: [] });
    expect(result.success).toBe(false);
  });

  it("rejects arguments containing an empty string", () => {
    const result = AdvisorOpinionSchema.safeParse({
      score: 8,
      thesis: "Teza.",
      arguments: ["Argument jeden.", ""],
    });
    expect(result.success).toBe(false);
  });

  it("rejects an out-of-range score even with valid arguments", () => {
    const result = AdvisorOpinionSchema.safeParse({
      score: 42,
      thesis: "Teza.",
      arguments: ["Argument jeden."],
    });
    expect(result.success).toBe(false);
  });
});

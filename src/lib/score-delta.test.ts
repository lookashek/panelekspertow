import { describe, expect, it } from "vitest";

import { scoreDelta, formatScore } from "@/lib/score-delta";

describe("scoreDelta", () => {
  it("renders no delta when there is no previous score", () => {
    expect(scoreDelta(7, undefined)).toEqual({ text: "7/10", glyph: "", direction: "none" });
  });

  it("renders no delta when the score is unchanged", () => {
    expect(scoreDelta(7, 7)).toEqual({ text: "7/10", glyph: "", direction: "none" });
  });

  it("renders an up delta when the score increased", () => {
    expect(scoreDelta(8, 6)).toEqual({ text: "6 → 8", glyph: "▲", direction: "up" });
  });

  it("renders a down delta when the score decreased", () => {
    expect(scoreDelta(4, 6)).toEqual({ text: "6 → 4", glyph: "▼", direction: "down" });
  });
});

describe("formatScore", () => {
  it("renders a placeholder when the score is missing", () => {
    expect(formatScore(undefined, undefined)).toBe("—");
  });

  it("delegates to scoreDelta's text once a score exists", () => {
    expect(formatScore(8, 6)).toBe("6 → 8");
  });
});

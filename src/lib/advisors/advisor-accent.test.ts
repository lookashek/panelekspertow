import { describe, expect, it } from "vitest";

import { advisorAccent } from "@/lib/advisors/advisor-accent";

describe("advisorAccent", () => {
  it("returns a distinct accent for each known persona id", () => {
    const ids = ["optymista", "sceptyk", "pragmatyk", "analityk"];
    const accents = ids.map((id) => advisorAccent(id));

    for (const accent of accents) {
      expect(accent.text).toMatch(/^text-advisor-\d$/);
      expect(accent.border).toMatch(/^border-advisor-\d$/);
      expect(accent.bg).toMatch(/^bg-advisor-\d$/);
    }

    const uniqueTextClasses = new Set(accents.map((accent) => accent.text));
    expect(uniqueTextClasses.size).toBe(ids.length);
  });

  it("falls back to the neutral accent for an unknown id", () => {
    expect(advisorAccent("nieznany")).toEqual({
      text: "text-foreground",
      border: "border-border",
      bg: "bg-secondary",
    });
  });
});

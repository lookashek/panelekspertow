import { describe, expect, it } from "vitest";

import { ADVISOR_REGISTRY } from "@/lib/advisors/registry";
import type { PanelInput } from "@/lib/advisors/registry";

const sampleInput: PanelInput = {
  decision: "Czy powinienem zmienić pracę na ofertę z wyższą pensją, ale mniej stabilną firmą?",
  context: "Mam dwoje dzieci na utrzymaniu i pół roku oszczędności.",
};

describe("ADVISOR_REGISTRY", () => {
  it("has exactly four personas", () => {
    expect(ADVISOR_REGISTRY).toHaveLength(4);
  });

  it("has unique ids", () => {
    const ids = ADVISOR_REGISTRY.map((persona) => persona.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has distinct temperatures for every persona", () => {
    const temperatures = ADVISOR_REGISTRY.map((persona) => persona.temperature);
    expect(new Set(temperatures).size).toBe(temperatures.length);
  });

  it("orders personas as optymista, sceptyk, pragmatyk, analityk", () => {
    expect(ADVISOR_REGISTRY.map((persona) => persona.id)).toEqual(["optymista", "sceptyk", "pragmatyk", "analityk"]);
  });

  it.each(ADVISOR_REGISTRY)("$id builds a non-empty system and user prompt", (persona) => {
    const { system, user } = persona.buildPrompt(sampleInput);
    expect(system.length).toBeGreaterThan(0);
    expect(user.length).toBeGreaterThan(0);
  });

  it.each(ADVISOR_REGISTRY)("$id prompt mentions JSON, score and thesis", (persona) => {
    const { system } = persona.buildPrompt(sampleInput);
    expect(system).toMatch(/JSON/i);
    expect(system).toMatch(/score/i);
    expect(system).toMatch(/thesis/i);
  });
});

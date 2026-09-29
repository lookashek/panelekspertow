import { describe, expect, it } from "vitest";

import { buildSynthesisPrompt, buildSynthesisRationalePrompt } from "@/lib/prompts/synthesis.v1";
import type { SynthesisInput } from "@/lib/prompts/synthesis.v1";
import type { Synthesis } from "@/lib/schemas/synthesis";

const sampleInput: SynthesisInput = {
  panelInput: {
    decision: "Czy powinienem przenieść się do innego miasta dla nowej pracy?",
    context: "Partner/ka nie chce się przeprowadzać.",
  },
  personaHeads: [
    {
      label: "Optymista",
      head: {
        score: 8,
        thesis: "Nowa praca to szansa, którą warto wykorzystać.",
        arguments: ["Rozwój kariery.", "Wyższe wynagrodzenie."],
      },
    },
    {
      label: "Sceptyk",
      head: {
        score: 3,
        thesis: "Ryzyko dla relacji przewyższa korzyści zawodowe.",
        arguments: ["Napięcie w związku.", "Brak gwarancji sukcesu w nowym mieście."],
      },
    },
  ],
};

const sampleSynthesis: Synthesis = {
  agreementPoints: ["Decyzja jest pilna i wymaga rozmowy z partnerem/ką."],
  disputeAxes: [
    {
      title: "Kariera vs. relacja",
      positions: ["Rozwój zawodowy powinien mieć priorytet.", "Stabilność relacji jest ważniejsza niż awans."],
    },
  ],
  risks: [{ description: "Rozpad relacji przy przeprowadzce bez zgody partnera.", weight: "high" }],
  recommendedNextStep: "Przeprowadź wspólną rozmowę o priorytetach przed podjęciem decyzji.",
};

describe("buildSynthesisPrompt", () => {
  it("returns non-empty system and user prompts", () => {
    const { system, user } = buildSynthesisPrompt(sampleInput);
    expect(system.length).toBeGreaterThan(0);
    expect(user.length).toBeGreaterThan(0);
  });

  it("embeds every persona head passed in", () => {
    const { user } = buildSynthesisPrompt(sampleInput);
    for (const persona of sampleInput.personaHeads) {
      expect(user).toContain(persona.label);
      expect(user).toContain(persona.head.thesis);
    }
  });

  it("instructs against smoothing disagreement into consensus and requires JSON output", () => {
    const { system } = buildSynthesisPrompt(sampleInput);
    expect(system).toMatch(/nie uśredniaj/i);
    expect(system).toContain("disputeAxes");
    expect(system).toContain("recommendedNextStep");
  });
});

describe("buildSynthesisRationalePrompt", () => {
  it("returns non-empty system and user prompts", () => {
    const { system, user } = buildSynthesisRationalePrompt(sampleInput, sampleSynthesis);
    expect(system.length).toBeGreaterThan(0);
    expect(user.length).toBeGreaterThan(0);
  });

  it("embeds every persona head passed in", () => {
    const { user } = buildSynthesisRationalePrompt(sampleInput, sampleSynthesis);
    for (const persona of sampleInput.personaHeads) {
      expect(user).toContain(persona.label);
      expect(user).toContain(persona.head.thesis);
    }
  });

  it("embeds the previously decided synthesis content without asking to redecide it", () => {
    const { system, user } = buildSynthesisRationalePrompt(sampleInput, sampleSynthesis);
    expect(user).toContain(sampleSynthesis.recommendedNextStep);
    expect(user).toContain(sampleSynthesis.disputeAxes[0].title);
    expect(system).toMatch(/NIE zmieniasz/);
  });

  it("does not request JSON or markdown output", () => {
    const { system } = buildSynthesisRationalePrompt(sampleInput, sampleSynthesis);
    expect(system).toMatch(/bez JSON/);
  });
});

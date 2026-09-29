import { describe, expect, it } from "vitest";

import * as analityk from "@/lib/prompts/advisor-analityk.v1";
import * as optymista from "@/lib/prompts/advisor-optymista.v1";
import * as pragmatyk from "@/lib/prompts/advisor-pragmatyk.v1";
import * as sceptyk from "@/lib/prompts/advisor-sceptyk.v1";
import type { PanelInput } from "@/lib/advisors/registry";
import type { AdvisorOpinion, AdvisorRoundTwoOpinion } from "@/lib/schemas/advisor";

const personas = [
  { name: "optymista", voice: "OPTYMISTY", module: optymista },
  { name: "sceptyk", voice: "SCEPTYKA", module: sceptyk },
  { name: "pragmatyk", voice: "PRAGMATYKA", module: pragmatyk },
  { name: "analityk", voice: "ANALITYKA", module: analityk },
];

const sampleInput: PanelInput = {
  decision: "Czy powinienem przenieść się do innego miasta dla nowej pracy?",
  context: "Partner/ka nie chce się przeprowadzać.",
};

const sampleHead: AdvisorOpinion = {
  score: 5,
  thesis: "Decyzja wymaga kompromisu.",
  arguments: ["Nowa praca daje rozwój.", "Przeprowadzka obciąża relację."],
};

const samplePeers = [
  {
    label: "Analityk",
    head: {
      score: 6,
      thesis: "Brakuje danych o realnej ofercie pracy.",
      arguments: ["Nie wiadomo, czy oferta jest na piśmie.", "Nie znamy kosztów przeprowadzki."],
    } satisfies AdvisorOpinion,
  },
];

const sampleRoundTwoHead: AdvisorRoundTwoOpinion = {
  score: 7,
  thesis: "Po namyśle warto się przeprowadzić.",
  arguments: ["Argument zaktualizowany."],
  attribution: {
    convincedByPersonaId: "analityk",
    quotedPeerArgument: "Nie znamy kosztów przeprowadzki.",
  },
};

describe.each(personas)("advisor-$name.v1 round-two builders", ({ voice, module }) => {
  it("buildRoundTwoPrompt keeps the persona's voice and embeds the persona-id enum", () => {
    const { system } = module.buildRoundTwoPrompt(sampleInput, sampleHead, samplePeers);
    expect(system).toContain(voice);
    expect(system).toContain("optymista|sceptyk|pragmatyk|analityk");
  });

  it("buildRoundTwoPrompt requires attribution iff the score changed", () => {
    const { system } = module.buildRoundTwoPrompt(sampleInput, sampleHead, samplePeers);
    expect(system).toMatch(/TYLKO/);
    expect(system).toMatch(/null/);
  });

  it("buildRoundTwoRationalePrompt stays in voice and references the resolved round-two thesis", () => {
    const { system, user } = module.buildRoundTwoRationalePrompt(
      sampleInput,
      sampleHead,
      sampleRoundTwoHead,
      samplePeers,
    );
    expect(system).toContain(voice);
    expect(user).toContain(sampleRoundTwoHead.thesis);
  });
});

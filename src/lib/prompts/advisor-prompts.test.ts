import { describe, expect, it } from "vitest";

import * as analityk from "@/lib/prompts/advisor-analityk.v1";
import * as optymista from "@/lib/prompts/advisor-optymista.v1";
import * as pragmatyk from "@/lib/prompts/advisor-pragmatyk.v1";
import * as sceptyk from "@/lib/prompts/advisor-sceptyk.v1";
import type { PanelInput, SideThreadTurn } from "@/lib/advisors/registry";
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

const sampleHistory: SideThreadTurn[] = [
  { role: "user", content: "Czy ta ocena zmieni się, jeśli partner/ka się zgodzi?" },
  { role: "advisor", content: "To by zmieniło część kalkulacji, ale nie całość." },
];

const sampleQuestion = "A co, jeśli dostanę podwyżkę zamiast przeprowadzki?";

describe.each(personas)("advisor-$name.v1 side-thread builder", ({ voice, module }) => {
  it("buildSideThreadPrompt returns non-empty system and user grounded in the persona's own head", () => {
    const { system, user } = module.buildSideThreadPrompt(sampleInput, sampleHead, sampleHistory, sampleQuestion);

    expect(system.length).toBeGreaterThan(0);
    expect(user.length).toBeGreaterThan(0);
    expect(system).toContain(voice);
    expect(user).toContain(sampleInput.decision);
    expect(user).toContain(String(sampleHead.score));
    expect(user).toContain(sampleHead.thesis);
    for (const argument of sampleHead.arguments) {
      expect(user).toContain(argument);
    }
    for (const turn of sampleHistory) {
      expect(user).toContain(turn.content);
    }
    expect(user).toContain(sampleQuestion);
  });

  it("buildSideThreadPrompt never asks for a JSON response or a new score", () => {
    const { system, user } = module.buildSideThreadPrompt(sampleInput, sampleHead, sampleHistory, sampleQuestion);

    // The prompt may explicitly instruct "no JSON" (which contains the word) — what must never
    // appear is an instruction asking the model to *produce* structured JSON output.
    expect(system).not.toMatch(/w formacie JSON|jako JSON|zwróć JSON|w JSON\b/i);
    expect(user).not.toMatch(/w formacie JSON|jako JSON|zwróć JSON|w JSON\b/i);
    expect(system).not.toContain('{"score"');
    expect(user).not.toContain('{"score"');
  });
});

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

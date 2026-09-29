import { describe, expect, it } from "vitest";

import { ADVISOR_REGISTRY } from "@/lib/advisors/registry";
import type { PanelInput, RoundOnePeer } from "@/lib/advisors/registry";
import type { AdvisorOpinion, AdvisorRoundTwoOpinion } from "@/lib/schemas/advisor";

const sampleInput: PanelInput = {
  decision: "Czy powinienem zmienić pracę na ofertę z wyższą pensją, ale mniej stabilną firmą?",
  context: "Mam dwoje dzieci na utrzymaniu i pół roku oszczędności.",
};

const sampleHead: AdvisorOpinion = {
  score: 6,
  thesis: "Warto rozważyć zmianę, ale z zastrzeżeniami.",
  arguments: ["Wyższa pensja poprawia sytuację finansową.", "Mniejsza stabilność zwiększa ryzyko."],
};

const samplePeers: RoundOnePeer[] = [
  {
    label: "Sceptyk",
    head: {
      score: 3,
      thesis: "Zbyt ryzykowne przy dwójce dzieci na utrzymaniu.",
      arguments: ["Nowa firma nie ma jeszcze udowodnionej stabilności.", "Utrata bufora finansowego byłaby dotkliwa."],
    },
  },
  {
    label: "Pragmatyk",
    head: {
      score: 5,
      thesis: "Wykonalne, jeśli negocjacje zabezpieczą okres przejściowy.",
      arguments: ["Pół roku oszczędności daje margines na start.", "Warto wynegocjować okres wypowiedzenia."],
    },
  },
];

const sampleRoundTwoHeadChanged: AdvisorRoundTwoOpinion = {
  score: 4,
  thesis: "Po namyśle ryzyko jednak przeważa.",
  arguments: ["Argument zaktualizowany.", "Argument drugi."],
  attribution: {
    convincedByPersonaId: "sceptyk",
    quotedPeerArgument: "Utrata bufora finansowego byłaby dotkliwa.",
  },
};

const sampleRoundTwoHeadUnchanged: AdvisorRoundTwoOpinion = {
  score: 6,
  thesis: "Warto rozważyć zmianę, ale z zastrzeżeniami.",
  arguments: ["Wyższa pensja poprawia sytuację finansową.", "Mniejsza stabilność zwiększa ryzyko."],
  attribution: null,
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

  it.each(ADVISOR_REGISTRY)("$id prompt mentions JSON, score, thesis and arguments", (persona) => {
    const { system } = persona.buildPrompt(sampleInput);
    expect(system).toMatch(/JSON/i);
    expect(system).toMatch(/score/i);
    expect(system).toMatch(/thesis/i);
    expect(system).toMatch(/arguments/i);
  });

  it.each(ADVISOR_REGISTRY)(
    "$id builds a non-empty rationale system and user prompt from the resolved head",
    (persona) => {
      const { system, user } = persona.buildRationalePrompt(sampleInput, sampleHead);
      expect(system.length).toBeGreaterThan(0);
      expect(user.length).toBeGreaterThan(0);
    },
  );

  it.each(ADVISOR_REGISTRY)(
    "$id rationale prompt does not ask for JSON and references the head's thesis",
    (persona) => {
      const { system, user } = persona.buildRationalePrompt(sampleInput, sampleHead);
      expect(system).not.toMatch(/WYŁĄCZNIE obiektem JSON/i);
      expect(user).toContain(sampleHead.thesis);
    },
  );

  it.each(ADVISOR_REGISTRY)("$id exposes both round-two prompt builders", (persona) => {
    expect(typeof persona.buildRoundTwoPrompt).toBe("function");
    expect(typeof persona.buildRoundTwoRationalePrompt).toBe("function");
  });

  it.each(ADVISOR_REGISTRY)(
    "$id round-two system prompt includes every peer label and the conditional-attribution rule",
    (persona) => {
      const { system } = persona.buildRoundTwoPrompt(sampleInput, sampleHead, samplePeers);
      for (const peer of samplePeers) {
        expect(system).toContain(peer.label);
      }
      expect(system).toMatch(/attribution/i);
      expect(system).toMatch(/null/);
    },
  );

  it.each(ADVISOR_REGISTRY)("$id round-two system prompt demands JSON with a score 1-10", (persona) => {
    const { system } = persona.buildRoundTwoPrompt(sampleInput, sampleHead, samplePeers);
    expect(system).toMatch(/JSON/i);
    expect(system).toMatch(/score/i);
    expect(system).toMatch(/1-10/);
  });

  it.each(ADVISOR_REGISTRY)("$id round-two user prompt embeds the self head and every peer head", (persona) => {
    const { user } = persona.buildRoundTwoPrompt(sampleInput, sampleHead, samplePeers);
    expect(user).toContain(sampleHead.thesis);
    for (const argument of sampleHead.arguments) {
      expect(user).toContain(argument);
    }
    for (const peer of samplePeers) {
      expect(user).toContain(peer.label);
      expect(user).toContain(peer.head.thesis);
      for (const argument of peer.head.arguments) {
        expect(user).toContain(argument);
      }
    }
  });

  it.each(ADVISOR_REGISTRY)(
    "$id round-two rationale prompt does not ask for JSON and stays consistent with the round-two head",
    (persona) => {
      const { system, user } = persona.buildRoundTwoRationalePrompt(
        sampleInput,
        sampleHead,
        sampleRoundTwoHeadChanged,
        samplePeers,
      );
      expect(system).not.toMatch(/WYŁĄCZNIE obiektem JSON/i);
      expect(user).toContain(sampleRoundTwoHeadChanged.thesis);
    },
  );

  it.each(ADVISOR_REGISTRY)(
    "$id round-two rationale prompt references the attribution quote when the score changed",
    (persona) => {
      const { user } = persona.buildRoundTwoRationalePrompt(
        sampleInput,
        sampleHead,
        sampleRoundTwoHeadChanged,
        samplePeers,
      );
      expect(user).toContain(sampleRoundTwoHeadChanged.attribution?.quotedPeerArgument);
    },
  );

  it.each(ADVISOR_REGISTRY)(
    "$id round-two rationale prompt omits attribution text when the score is unchanged",
    (persona) => {
      const { user } = persona.buildRoundTwoRationalePrompt(
        sampleInput,
        sampleHead,
        sampleRoundTwoHeadUnchanged,
        samplePeers,
      );
      expect(user).toContain(sampleRoundTwoHeadUnchanged.thesis);
    },
  );
});

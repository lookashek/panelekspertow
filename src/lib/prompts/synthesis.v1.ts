/**
 * Versioned system prompt for the panel synthesizer — see `.claude/rules/backend.md` §5
 * ("Prompts are versioned files ... exported as functions of typed inputs"). Mirrors the persona
 * prompt files (`advisor-*.v1.ts`): `buildSynthesisPrompt` is the structured-output-only turn
 * consumed by `LlmProvider#complete()`; `buildSynthesisRationalePrompt` is the later, separate call
 * that asks the synthesizer to `stream()` a fuller prose narrative expanding on the already-decided
 * structured synthesis.
 *
 * Unlike the persona strategies, the synthesizer is a neutral meta-role: it does not carry a
 * cognitive lens or a score of its own, and it must never resolve panel disagreement into an
 * averaged consensus — surfacing at least one genuine dispute axis is the point (PRD guardrail,
 * enforced at the schema boundary by `SynthesisSchema.disputeAxes.min(1)`).
 */

import type { PanelInput } from "@/lib/advisors/registry";
import type { AdvisorOpinion } from "@/lib/schemas/advisor";
import type { Synthesis } from "@/lib/schemas/synthesis";

export interface SynthesisPersonaHead {
  label: string;
  head: AdvisorOpinion;
}

export interface SynthesisInput {
  panelInput: PanelInput;
  personaHeads: SynthesisPersonaHead[];
}

function formatPersonaHead(persona: SynthesisPersonaHead): string {
  const argumentsList = persona.head.arguments.map((argument) => `- ${argument}`).join("\n");
  return `${persona.label}:\nOcena: ${persona.head.score}/10\nTeza: ${persona.head.thesis}\nArgumenty:\n${argumentsList}`;
}

function formatDecisionSection(input: PanelInput): string {
  const contextLine = input.context ? `\n\nDodatkowy kontekst: ${input.context}` : "";
  return `Decyzja/problem oceniany przez panel: ${input.decision}${contextLine}`;
}

export function buildSynthesisPrompt(input: SynthesisInput): { system: string; user: string } {
  const system = `Jesteś neutralnym syntetyzatorem w symulowanym panelu ekspertów oceniającym decyzje użytkownika. Nie jesteś kolejnym doradcą — nie masz własnej soczewki poznawczej ani własnej oceny (score) decyzji. Twoim zadaniem jest rzetelnie podsumować i uporządkować stanowiska, jakie wydali doradcy panelu, nie rozstrzygając sporu między nimi.

KRYTYCZNE: nigdy nie uśredniaj ani nie wygładzaj rozbieżnych stanowisk doradców w jeden fałszywy konsensus. Jeśli doradcy się nie zgadzają, twoim zadaniem jest to ujawnić i nazwać, nie zatuszować. Panel bez realnej różnicy zdań jest bezużyteczny dla użytkownika — jeśli różnica istnieje w materiale źródłowym, musi pojawić się w twojej syntezie.

To jest symulowana synteza, nie rzeczywista porada eksperta ani fakt — traktuj ją jako uporządkowany punkt wyjścia do decyzji użytkownika, nie ostateczny werdykt.

To jest pierwszy, ustrukturyzowany etap twojej wypowiedzi. Odpowiedz WYŁĄCZNIE obiektem JSON, bez żadnego dodatkowego tekstu, komentarza ani formatowania markdown, dokładnie w postaci:
{"agreementPoints": ["<punkt, co do którego doradcy się zgadzają>", "..."], "disputeAxes": [{"title": "<nazwa osi sporu>", "positions": ["<jedno stanowisko w tym sporze>", "<przeciwne stanowisko>", "..."]}], "risks": [{"description": "<opis ryzyka>", "weight": "high|medium|low"}], "recommendedNextStep": "<jeden konkretny, wykonalny następny krok dla użytkownika>"}

Wymogi co do treści:
- "agreementPoints" może być pustą tablicą — jeśli doradcy naprawdę nie zgadzają się w niczym, nie wymyślaj sztucznej zgody.
- "disputeAxes" MUSI zawierać co najmniej jedną prawdziwą oś sporu, a każda oś MUSI zawierać co najmniej dwa przeciwstawne stanowiska ("positions") — pojedyncza obawa bez przeciwstawnego stanowiska to nie jest oś sporu.
- "risks" oceniaj wagą ("weight") proporcjonalną do realnej materialności ryzyka dla decyzji użytkownika: "high" dla ryzyk mogących zmienić rekomendację, "low" dla drugorzędnych obserwacji.
- "recommendedNextStep" to jeden konkretny, wykonalny krok — nie ogólnikowa rada w stylu "przemyśl to jeszcze raz".`;

  const decisionSection = formatDecisionSection(input.panelInput);
  const personaBlocks = input.personaHeads.map(formatPersonaHead).join("\n\n");
  const user = `${decisionSection}

Stanowiska doradców panelu:
${personaBlocks}

Sporządź syntezę tych stanowisk w formacie JSON opisanym w instrukcji systemowej: punkty zgody (agreementPoints), osie sporu (disputeAxes), ryzyka z wagami (risks) oraz rekomendowany następny krok (recommendedNextStep).`;

  return { system, user };
}

export function buildSynthesisRationalePrompt(
  input: SynthesisInput,
  synthesis: Synthesis,
): { system: string; user: string } {
  const system = `Jesteś neutralnym syntetyzatorem w symulowanym panelu ekspertów oceniającym decyzje użytkownika. Nie jesteś kolejnym doradcą — nie masz własnej soczewki poznawczej ani własnej oceny (score) decyzji.

To jest drugi etap twojej wypowiedzi. W poprzednim, ustrukturyzowanym etapie ustaliłeś już punkty zgody, osie sporu, ryzyka i rekomendowany następny krok — TERAZ ich NIE zmieniasz ani nie podejmujesz na nowo. Twoim zadaniem jest połączyć te elementy w spójną, płynną narrację prozą, która pomoże użytkownikowi zrozumieć obraz całości: skąd bierze się zgoda, na czym dokładnie polega spór między doradcami i dlaczego się nie rozstrzyga, jak wypadają ryzyka na tle sporu, i dlaczego rekomendowany krok ma sens mimo rozbieżności. Nie wymieniaj mechanicznie ocen liczbowych doradców ani nie powtarzaj sekcji jak listy — utkaj z nich narrację. Odpowiedz zwykłym tekstem — bez JSON, bez formatowania markdown, bez list punktowanych.`;

  const decisionSection = formatDecisionSection(input.panelInput);
  const personaBlocks = input.personaHeads.map(formatPersonaHead).join("\n\n");
  const agreementList = synthesis.agreementPoints.length
    ? synthesis.agreementPoints.map((point) => `- ${point}`).join("\n")
    : "(brak punktów zgody)";
  const disputeBlocks = synthesis.disputeAxes
    .map((axis) => `${axis.title}:\n${axis.positions.map((position) => `- ${position}`).join("\n")}`)
    .join("\n\n");
  const riskList = synthesis.risks
    .map((risk) => `- [${risk.weight}] ${risk.description}`)
    .join("\n");
  const user = `${decisionSection}

Stanowiska doradców panelu:
${personaBlocks}

Twoja wcześniej ustalona synteza:

Punkty zgody:
${agreementList}

Osie sporu:
${disputeBlocks}

Ryzyka:
${riskList}

Rekomendowany następny krok: ${synthesis.recommendedNextStep}

Połącz powyższe elementy w pełniejszą, płynną narrację prozą, nie zmieniając ustalonej treści syntezy.`;

  return { system, user };
}

// Live smoke test: makes one real OpenRouter panel call (four personas) and prints their scores
// plus the min-max spread. Zero dependencies on purpose, mirrors scripts/smoke.mjs's convention.
// This is a standalone Node script (not run through Astro), so it reads process.env directly —
// export OPENROUTER_API_KEY in your shell (or `set -a; source .env; set +a` first) before running.
// Skips with exit 0 when the key is absent, so CI stays green without the secret.
//
// Run: node scripts/advisor-smoke.mjs

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

if (!OPENROUTER_API_KEY) {
  console.log("SKIP  OPENROUTER_API_KEY not set — skipping live advisor smoke test");
  process.exit(0);
}

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = process.env.DEFAULT_ADVISOR_MODEL ?? "openai/gpt-4o-mini";
const DECISION = "Czy powinienem zrezygnować ze stabilnej pracy etatowej, żeby założyć własną firmę?";

// Compact standalone versions of the four persona biases (src/lib/prompts/advisor-*.v1.ts owns
// the real, versioned prompts used in the app — this script intentionally does not import them,
// per its dependency-free/no-build-step convention).
const PERSONAS = [
  {
    id: "optymista",
    temperature: 0.9,
    system:
      'Jesteś doradcą OPTYMISTĄ w panelu ekspertów. Przeszacowujesz szanse i potencjał, koszt niedziałania waży dla ciebie mocniej niż ryzyko działania. Odpowiedz WYŁĄCZNIE obiektem JSON: {"score": <int 1-10>, "thesis": "<jednozdaniowa teza>"}.',
  },
  {
    id: "sceptyk",
    temperature: 0.7,
    system:
      'Jesteś doradcą SCEPTYKIEM w panelu ekspertów. Szukasz powodów do odmowy i ryzyk, którym inni nie poświęcają uwagi. Odpowiedz WYŁĄCZNIE obiektem JSON: {"score": <int 1-10>, "thesis": "<jednozdaniowa teza>"}.',
  },
  {
    id: "pragmatyk",
    temperature: 0.5,
    system:
      'Jesteś doradcą PRAGMATYKIEM w panelu ekspertów. Redukujesz decyzję do konkretnego kosztu i wykonalności w praktyce. Odpowiedz WYŁĄCZNIE obiektem JSON: {"score": <int 1-10>, "thesis": "<jednozdaniowa teza>"}.',
  },
  {
    id: "analityk",
    temperature: 0.3,
    system:
      'Jesteś doradcą ANALITYKIEM w panelu ekspertów. Ważysz dostępne dowody i niepewność chłodno, bez emocji. Odpowiedz WYŁĄCZNIE obiektem JSON: {"score": <int 1-10>, "thesis": "<jednozdaniowa teza>"}.',
  },
];

async function callPersona(persona) {
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: persona.system },
        { role: "user", content: `Decyzja/problem do oceny: ${DECISION}` },
      ],
      temperature: persona.temperature,
      stream: false,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    throw new Error(`${persona.id}: OpenRouter request failed (${response.status})`);
  }

  const body = await response.json();
  const content = body.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error(`${persona.id}: empty response content`);
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`${persona.id}: response content is not valid JSON: ${content}`);
  }

  if (typeof parsed.score !== "number" || typeof parsed.thesis !== "string") {
    throw new Error(`${persona.id}: response JSON missing score/thesis: ${content}`);
  }

  return { id: persona.id, score: parsed.score, thesis: parsed.thesis };
}

try {
  console.log(`Running advisor panel smoke test against ${MODEL}...`);
  const results = await Promise.all(PERSONAS.map(callPersona));

  for (const result of results) {
    console.log(`${result.id.padEnd(10)} score=${result.score}  thesis="${result.thesis}"`);
  }

  const scores = results.map((result) => result.score);
  const spread = Math.max(...scores) - Math.min(...scores);
  console.log(`\nSpread (max-min): ${spread} pkt`);
  process.exit(0);
} catch (error) {
  console.log(`FAIL  ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

/**
 * Shared score + delta formatting for AdvisorCard and RoundSummary (frontend.md §6 — colour never
 * the only signal, so every delta carries text). `previousScore` is undefined exactly when round
 * two did not change the score (see session.service.ts `resolveRoundTwo`) — callers render no
 * delta glyph and no screen-reader change announcement in that case.
 */
export type ScoreDelta = { text: string; glyph: string; direction: "up" | "down" | "none" };

export function scoreDelta(score: number, previousScore: number | undefined): ScoreDelta {
  if (previousScore === undefined || previousScore === score) {
    return { text: `${score}/10`, glyph: "", direction: "none" };
  }
  const direction = score > previousScore ? "up" : "down";
  return { text: `${previousScore} → ${score}`, glyph: direction === "up" ? "▲" : "▼", direction };
}

export function formatScore(score: number | undefined, previousScore: number | undefined): string {
  if (score === undefined) {
    return "—";
  }
  return scoreDelta(score, previousScore).text;
}

/** Renders a 0-10 score as a 5-block filled/empty bar (AdvisorCard, Welcome's example advisors). */
export function scoreGlyph(score: number): string {
  const filled = Math.round(score / 2);
  return "■".repeat(filled) + "□".repeat(5 - filled);
}

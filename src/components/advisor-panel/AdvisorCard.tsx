import type { PersonaViewState } from "@/components/advisor-panel/usePanelStream";

interface AdvisorCardProps {
  personaId: string;
  label: string;
  state: PersonaViewState;
  /** Display label for `state.attributedPersonaId`, looked up by the caller (round two only). */
  attributedPersonaLabel?: string;
}

function scoreGlyph(score: number): string {
  const filled = Math.round(score / 2);
  return "■".repeat(filled) + "□".repeat(5 - filled);
}

/**
 * `previousScore` is null/undefined exactly when the score did not change (service-owned
 * invariant, see session.service.ts `resolveRoundTwo`), so a defined `previousScore` should always
 * differ from `score`. The `score === previousScore` branch is a defensive fallback, not a case
 * this component expects to hit — it exists so a future violation of that invariant renders as
 * "no change" instead of a wrong ▼ and a misleading "(w dół)" screen-reader announcement.
 */
function scoreDelta(score: number, previousScore: number | undefined): { text: string; glyph: string } {
  if (previousScore === undefined || previousScore === score) {
    return { text: `${score}/10`, glyph: "▬" };
  }
  const glyph = score > previousScore ? "▲" : "▼";
  return { text: `${previousScore} → ${score}`, glyph };
}

export function AdvisorCard({ personaId, label, state, attributedPersonaLabel }: AdvisorCardProps) {
  return (
    <article
      className="pixel-panel flex flex-col gap-3 p-4 sm:p-5"
      aria-label={label}
      data-persona-id={personaId}
      data-status={state.status}
    >
      <header className="flex items-center justify-between gap-2">
        <h3 className="font-pixel text-foreground text-xs sm:text-sm">{label.toUpperCase()}</h3>
        {state.status === "pending" && (
          <span className="motion-safe:animate-blink text-muted-foreground text-xs">Oczekiwanie…</span>
        )}
      </header>

      {state.score !== undefined && (
        <div className="animate-fade-up flex flex-col gap-1">
          <p className="text-accent text-xs" aria-hidden="true">
            {scoreGlyph(state.score)}
          </p>
          {(() => {
            const delta = scoreDelta(state.score, state.previousScore);
            return (
              <p className="text-accent text-xs">
                OCENA {delta.text} <span aria-hidden="true">{delta.glyph}</span>
                <span className="sr-only">
                  {state.previousScore === undefined || state.previousScore === state.score
                    ? " (bez zmian)"
                    : state.score > state.previousScore
                      ? " (w górę)"
                      : " (w dół)"}
                </span>
              </p>
            );
          })()}
          {state.thesis && <p className="text-foreground text-sm font-bold">{state.thesis}</p>}
          {state.attributedPersonaId && (
            <div className="border-accent bg-accent/10 mt-1 border-2 p-2">
              <p className="font-pixel text-accent text-[10px]">
                PRZEKONAŁ: {attributedPersonaLabel ?? state.attributedPersonaId}
              </p>
              {state.attributionQuote && (
                <p className="text-foreground mt-1 text-xs italic">„{state.attributionQuote}”</p>
              )}
            </div>
          )}
        </div>
      )}

      <div aria-live="polite" className="text-muted-foreground min-h-16 flex-1 text-sm leading-relaxed">
        {state.text ||
          (state.status === "pending" && <span className="text-muted-foreground/70">Czekam na doradcę…</span>)}
      </div>

      {state.arguments && state.arguments.length > 0 && (
        <ul className="text-muted-foreground flex flex-col gap-1 text-xs">
          {state.arguments.map((argument) => (
            <li key={argument}>• {argument}</li>
          ))}
        </ul>
      )}

      {state.status === "error" && (
        <p className="text-destructive text-sm" role="alert">
          Błąd: {state.error ?? "Nie udało się pobrać opinii doradcy."}
        </p>
      )}

      {state.status === "done" && <p className="text-muted-foreground text-xs">Gotowe.</p>}
    </article>
  );
}

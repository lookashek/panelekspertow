import type { PersonaViewState } from "@/components/advisor-panel/usePanelStream";

interface AdvisorCardProps {
  personaId: string;
  label: string;
  state: PersonaViewState;
}

function scoreGlyph(score: number): string {
  const filled = Math.round(score / 2);
  return "■".repeat(filled) + "□".repeat(5 - filled);
}

export function AdvisorCard({ personaId, label, state }: AdvisorCardProps) {
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
          <p className="text-accent text-xs">OCENA {state.score}/10</p>
          {state.thesis && <p className="text-foreground text-sm font-bold">{state.thesis}</p>}
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

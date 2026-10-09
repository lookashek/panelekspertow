import { useState } from "react";

import { SideThread } from "@/components/advisor-panel/SideThread";
import { Button } from "@/components/ui/button";
import { panelVariants } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { advisorAccent } from "@/lib/advisors/advisor-accent";
import { scoreDelta, scoreGlyph } from "@/lib/score-delta";
import { cn } from "@/lib/utils";
import type { PersonaViewState } from "@/components/advisor-panel/usePanelStream";

interface AdvisorCardProps {
  personaId: string;
  label: string;
  state: PersonaViewState;
  /** Display label for `state.attributedPersonaId`, looked up by the caller (round two only). */
  attributedPersonaLabel?: string;
  /** Opt-in side-thread affordance (Dopytaj) — round one only; omitted entirely by RoundTwoPanel. */
  sessionId?: string;
  sideThreadEnabled?: boolean;
  initialMessages?: { role: "user" | "advisor"; content: string }[];
}

export function AdvisorCard({
  personaId,
  label,
  state,
  attributedPersonaLabel,
  sessionId,
  sideThreadEnabled,
  initialMessages,
}: AdvisorCardProps) {
  const [threadOpen, setThreadOpen] = useState(false);
  const [argumentsOpen, setArgumentsOpen] = useState(false);
  const accent = advisorAccent(personaId);
  const delta = state.score !== undefined ? scoreDelta(state.score, state.previousScore) : null;

  return (
    <article
      className={cn(panelVariants({ padding: "card" }), "flex flex-col gap-3", accent.border)}
      aria-label={label}
      data-persona-id={personaId}
      data-status={state.status}
    >
      <header className="flex items-center justify-between gap-2">
        <h3 className={cn("font-pixel text-pixel-sm uppercase tracking-wide", accent.text)}>{label}</h3>
        {state.status === "pending" && (
          <span className="motion-safe:animate-blink text-muted-foreground text-pixel-micro">Oczekiwanie…</span>
        )}
      </header>

      {state.score !== undefined && delta && (
        <div className="animate-fade-up flex flex-col gap-1">
          <p className="text-info text-pixel-md" aria-hidden="true">
            {scoreGlyph(state.score)}
          </p>
          <p className="text-info text-pixel-sm">
            OCENA {delta.text}
            {delta.glyph && (
              <>
                {" "}
                <span aria-hidden="true">{delta.glyph}</span>
                <span className="sr-only">{delta.direction === "up" ? " (w górę)" : " (w dół)"}</span>
              </>
            )}
          </p>
          {state.thesis && <p className="text-foreground text-sm font-bold">{state.thesis}</p>}
          {state.attributedPersonaId && (
            <div className="border-info bg-card mt-1 border-2 p-2">
              <p className="font-pixel text-info text-pixel-micro">
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
          (state.status === "pending" && (
            <span className="flex flex-col gap-1">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-5/6" />
              <Skeleton className="h-3 w-2/3" />
            </span>
          ))}
      </div>

      {state.arguments && state.arguments.length > 0 && (
        <div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setArgumentsOpen((open) => !open);
            }}
            aria-expanded={argumentsOpen}
          >
            ARGUMENTY ({state.arguments.length})
          </Button>
          {argumentsOpen && (
            <ul className="text-muted-foreground mt-2 flex flex-col gap-1 text-xs">
              {state.arguments.map((argument) => (
                <li key={argument}>• {argument}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {state.status === "error" && (
        <p className="text-destructive text-sm" role="alert">
          Błąd: {state.error ?? "Nie udało się pobrać opinii doradcy."}
        </p>
      )}

      {state.status === "done" && <p className="text-muted-foreground text-xs">Gotowe.</p>}

      {sideThreadEnabled && sessionId && (
        <div className="border-border mt-2 border-t-2 pt-3">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setThreadOpen((open) => !open);
            }}
            aria-expanded={threadOpen}
          >
            {threadOpen ? "ZWIŃ" : "DOPYTAJ"}
          </Button>
          {threadOpen && (
            <div className="mt-3">
              <SideThread
                sessionId={sessionId}
                personaId={personaId}
                label={label}
                initialMessages={initialMessages ?? []}
              />
            </div>
          )}
        </div>
      )}
    </article>
  );
}

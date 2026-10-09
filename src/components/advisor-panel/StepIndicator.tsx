import { cn } from "@/lib/utils";
import type { StepProgress, StepProgressState } from "@/lib/session-flow";

const STEP_ORDER: { id: keyof StepProgress; label: string }[] = [
  { id: "roundOne", label: "Runda 1" },
  { id: "roundTwo", label: "Runda 2" },
  { id: "synthesis", label: "Synteza" },
];

const STATE_GLYPH: Record<StepProgressState, string> = {
  pending: "○",
  active: "●",
  done: "✓",
  failed: "✕",
  skipped: "–",
};

const STATE_TEXT: Record<StepProgressState, string> = {
  pending: "",
  active: "(w toku)",
  done: "(zakończono)",
  failed: "(błąd)",
  skipped: "(pominięta)",
};

const STATE_CLASS: Record<StepProgressState, string> = {
  pending: "text-muted-foreground",
  active: "text-primary",
  done: "text-success",
  failed: "text-destructive",
  skipped: "text-muted-foreground",
};

interface StepIndicatorProps {
  progress: StepProgress;
}

export function StepIndicator({ progress }: StepIndicatorProps) {
  return (
    <ol aria-label="Postęp sesji" className="mb-8 flex flex-wrap items-center gap-x-6 gap-y-2">
      {STEP_ORDER.map(({ id, label }) => {
        const state = progress[id];
        return (
          <li
            key={id}
            aria-current={state === "active" ? "step" : undefined}
            className={cn("font-pixel text-pixel-sm flex items-center gap-2 uppercase tracking-wide", STATE_CLASS[state])}
          >
            <span aria-hidden="true">{STATE_GLYPH[state]}</span>
            <span>{label}</span>
            {STATE_TEXT[state] && <span className="text-pixel-micro">{STATE_TEXT[state]}</span>}
          </li>
        );
      })}
    </ol>
  );
}

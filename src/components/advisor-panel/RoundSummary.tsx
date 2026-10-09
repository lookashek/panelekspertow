/**
 * Compact per-persona row shown in place of the full card grid once a round folds
 * (session-quality-polish Phase 3). The caller keeps the full grid mounted and toggles its
 * `hidden` attribute via `expanded`/`onToggle` here — this component never unmounts anything
 * itself, it only renders the summary rows and the expand/collapse control.
 */
import { Button } from "@/components/ui/button";
import { panelVariants } from "@/components/ui/panel";
import { advisorAccent } from "@/lib/advisors/advisor-accent";
import { formatScore } from "@/lib/score-delta";
import { cn } from "@/lib/utils";

export interface RoundSummaryRow {
  personaId: string;
  label: string;
  score?: number;
  previousScore?: number;
  thesis?: string;
}

interface RoundSummaryProps {
  round: 1 | 2;
  rows: RoundSummaryRow[];
  expanded: boolean;
  onToggle: () => void;
  controlsId: string;
}

export function RoundSummary({ round, rows, expanded, onToggle, controlsId }: RoundSummaryProps) {
  return (
    <div className={cn(panelVariants({ padding: "card" }), "mb-4 flex flex-col gap-3")}>
      <ul className="flex flex-col gap-2">
        {rows.map((row) => {
          const accent = advisorAccent(row.personaId);
          return (
            <li key={row.personaId} className="flex flex-col gap-0.5 text-xs sm:flex-row sm:items-baseline sm:gap-3">
              <span className={cn("font-pixel text-pixel-micro sm:w-32 sm:flex-shrink-0 uppercase", accent.text)}>
                {row.label}
              </span>
              <span className="text-info flex-shrink-0">{formatScore(row.score, row.previousScore)}</span>
              {row.thesis && <span className="text-muted-foreground truncate">{row.thesis}</span>}
            </li>
          );
        })}
      </ul>
      <Button type="button" variant="secondary" size="sm" onClick={onToggle} aria-expanded={expanded} aria-controls={controlsId} className="self-start">
        {expanded ? `ZWIŃ RUNDĘ ${round}` : `ROZWIŃ RUNDĘ ${round}`}
      </Button>
    </div>
  );
}

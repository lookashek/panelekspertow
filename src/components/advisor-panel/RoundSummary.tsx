/**
 * Compact per-persona row shown in place of the full card grid once a round folds
 * (session-quality-polish Phase 3). The caller keeps the full grid mounted and toggles its
 * `hidden` attribute via `expanded`/`onToggle` here — this component never unmounts anything
 * itself, it only renders the summary rows and the expand/collapse control.
 */
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

function formatScore(score: number | undefined, previousScore: number | undefined): string {
  if (score === undefined) {
    return "—";
  }
  if (previousScore === undefined || previousScore === score) {
    return `${score}/10`;
  }
  return `${previousScore} → ${score}`;
}

export function RoundSummary({ round, rows, expanded, onToggle, controlsId }: RoundSummaryProps) {
  return (
    <div className="pixel-panel mb-4 flex flex-col gap-3 p-4 sm:p-5">
      <ul className="flex flex-col gap-2">
        {rows.map((row) => (
          <li key={row.personaId} className="flex flex-col gap-0.5 text-xs sm:flex-row sm:items-baseline sm:gap-3">
            <span className="font-pixel text-foreground text-[10px] sm:w-32 sm:flex-shrink-0">
              {row.label.toUpperCase()}
            </span>
            <span className="text-accent flex-shrink-0">{formatScore(row.score, row.previousScore)}</span>
            {row.thesis && <span className="text-muted-foreground truncate">{row.thesis}</span>}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={controlsId}
        className={cn(
          "pixel-btn font-pixel bg-secondary text-secondary-foreground hover:border-accent hover:bg-accent hover:text-accent-foreground self-start px-4 py-2 text-[10px] transition-colors",
        )}
      >
        {expanded ? `ZWIŃ RUNDĘ ${round}` : `ROZWIŃ RUNDĘ ${round}`}
      </button>
    </div>
  );
}

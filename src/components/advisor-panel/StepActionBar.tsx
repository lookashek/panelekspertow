/**
 * Full-width step action bar (frontend.md §1/§4/§6, session-quality-polish Phase 2). Replaces the
 * scattered per-panel buttons and the left-aligned `NOWA DECYZJA` link with a single bar rendered
 * at the tail of `SessionFlow`: a status line announced via `aria-live="polite"` (never a focus
 * move — see `SessionFlow`'s auto-scroll effect) plus up to two actions.
 */

import { cn } from "@/lib/utils";

export type Action = { label: string } & ({ onClick: () => void } | { href: string });

export interface StepActionBarProps {
  status: string;
  primary?: Action;
  secondary?: Action;
}

const PRIMARY_CLASS =
  "pixel-btn font-pixel bg-primary text-primary-foreground hover:border-accent hover:bg-accent px-6 py-4 text-xs transition-colors";
const SECONDARY_CLASS =
  "pixel-btn font-pixel bg-secondary text-secondary-foreground hover:border-accent hover:bg-accent px-6 py-4 text-xs transition-colors";

function ActionButton({ action, className }: { action: Action; className: string }) {
  if ("href" in action) {
    return (
      <a href={action.href} className={className}>
        {action.label}
      </a>
    );
  }

  return (
    <button type="button" onClick={action.onClick} className={className}>
      {action.label}
    </button>
  );
}

export function StepActionBar({ status, primary, secondary }: StepActionBarProps) {
  return (
    <div className="pixel-panel flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <p aria-live="polite" className="text-muted-foreground text-xs sm:text-sm">
        {status}
      </p>

      {(primary || secondary) && (
        <div className="flex flex-col gap-3 sm:flex-row">
          {secondary && <ActionButton action={secondary} className={cn(SECONDARY_CLASS)} />}
          {primary && <ActionButton action={primary} className={cn(PRIMARY_CLASS)} />}
        </div>
      )}
    </div>
  );
}

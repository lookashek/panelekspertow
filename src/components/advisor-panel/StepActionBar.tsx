/**
 * Full-width step action bar (frontend.md §1/§4/§6, session-quality-polish Phase 2). Replaces the
 * scattered per-panel buttons and the left-aligned `NOWA DECYZJA` link with a single bar rendered
 * at the tail of `SessionFlow`: a status line announced via `aria-live="polite"` (never a focus
 * move — see `SessionFlow`'s auto-scroll effect) plus up to two actions.
 */

import { buttonVariants } from "@/components/ui/button";
import { panelVariants } from "@/components/ui/panel";

export type Action = { label: string } & ({ onClick: () => void } | { href: string });

export interface StepActionBarProps {
  status: string;
  primary?: Action;
  secondary?: Action;
}

function ActionButton({ action, variant }: { action: Action; variant: "default" | "secondary" }) {
  const className = buttonVariants({ variant, size: "lg" });

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
    <div className={`${panelVariants({ padding: "card" })} flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between`}>
      <p aria-live="polite" className="text-muted-foreground text-sm">
        {status}
      </p>

      {(primary ?? secondary) && (
        <div className="flex flex-col gap-3 sm:flex-row">
          {secondary && <ActionButton action={secondary} variant="secondary" />}
          {primary && <ActionButton action={primary} variant="default" />}
        </div>
      )}
    </div>
  );
}

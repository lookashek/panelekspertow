import * as React from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type FieldProps = {
  id: string;
  label: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
  /**
   * false when `children` isn't the bare control itself (e.g. an icon-prefixed wrapper) — the
   * caller then wires `id`/`aria-invalid`/`aria-describedby` (`${id}-hint`/`${id}-error`) onto the
   * real control itself. Defaults to true (DecisionForm's plain-Input case).
   */
  wireAria?: boolean;
};

/** Label + control slot + hint + error, wiring `aria-describedby`/`aria-invalid` onto the control. */
function Field({ id, label, hint, error, className, children, wireAria = true }: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  const control =
    wireAria && React.isValidElement(children)
      ? React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
          id,
          "aria-invalid": !!error,
          "aria-describedby": describedBy,
        })
      : children;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      {control}
      {hint && (
        <p id={hintId} className="text-placeholder text-pixel-micro">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-destructive text-pixel-micro" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export { Field };

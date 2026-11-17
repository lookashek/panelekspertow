/**
 * Session-history delete action (frontend.md §1/§3/§8) — one island per list row. Confirms
 * destructively (native `confirm()`; no modal primitive exists yet in `src/components/ui/`, and
 * adding one is out of scope for this slice), calls `DELETE /api/sessions/:id`, then reloads the
 * page so the server-rendered list (`src/pages/sessions/index.astro`) re-fetches without the
 * removed row — no client-side list state to keep in sync with the server source of truth.
 */
import { useState } from "react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface DeleteSessionButtonProps {
  sessionId: string;
  decisionPreview: string;
}

function extractErrorMessage(body: unknown): string | null {
  if (
    body !== null &&
    typeof body === "object" &&
    "error" in body &&
    body.error !== null &&
    typeof body.error === "object" &&
    "message" in body.error &&
    typeof body.error.message === "string"
  ) {
    return body.error.message;
  }
  return null;
}

export function DeleteSessionButton({ sessionId, decisionPreview }: DeleteSessionButtonProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    const confirmed = window.confirm(`Usunąć sesję „${decisionPreview}” z historii? Tej operacji nie można wycofać.`);
    if (!confirmed) {
      return;
    }

    setPending(true);
    setError(null);

    try {
      const response = await fetch(`/api/sessions/${sessionId}`, { method: "DELETE" });
      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        const message = extractErrorMessage(body) ?? "Nie udało się usunąć sesji.";
        setError(message);
        setPending(false);
        return;
      }

      window.location.reload();
    } catch {
      setError("Nie udało się usunąć sesji. Sprawdź połączenie i spróbuj ponownie.");
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleDelete}
        disabled={pending}
        aria-label={`Usuń sesję: ${decisionPreview}`}
        className={cn(buttonVariants({ variant: "destructive", size: "sm" }))}
      >
        {pending ? "USUWANIE…" : "USUŃ"}
      </button>
      {error && (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}
    </div>
  );
}

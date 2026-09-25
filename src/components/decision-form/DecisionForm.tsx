import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { PanelInputSchema, type PanelInput } from "@/lib/schemas/panel";

type AsyncState = "idle" | "submitting" | "error";

interface ErrorEnvelope {
  error?: {
    message?: string;
  };
}

function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  return typeof value === "object" && value !== null && "error" in value;
}

export function DecisionForm() {
  const [asyncState, setAsyncState] = useState<AsyncState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showContextNudge, setShowContextNudge] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<PanelInput>({
    resolver: zodResolver(PanelInputSchema),
    defaultValues: { decision: "", context: "" },
  });

  const context = watch("context");

  const onSubmit = async (data: PanelInput) => {
    setShowContextNudge(!data.context);
    setAsyncState("submitting");
    setErrorMessage(null);

    try {
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        const message =
          isErrorEnvelope(body) && body.error?.message ? body.error.message : "Nie udało się utworzyć sesji.";
        setErrorMessage(message);
        setAsyncState("error");
        return;
      }

      const result = (await response.json()) as { id: string };
      window.location.assign(`/sessions/${result.id}`);
    } catch {
      setErrorMessage("Błąd sieci — spróbuj ponownie.");
      setAsyncState("error");
    }
  };

  const isSubmitting = asyncState === "submitting";

  return (
    <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="flex flex-col gap-6" noValidate>
      <div className="flex flex-col gap-2">
        <Label htmlFor="decision">Decyzja</Label>
        <Input
          id="decision"
          placeholder="Np. Czy powinienem zmienić pracę?"
          aria-invalid={!!errors.decision}
          disabled={isSubmitting}
          {...register("decision")}
        />
        {errors.decision && (
          <p className="text-destructive text-sm" role="alert">
            {errors.decision.message}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="context">Kontekst (opcjonalnie)</Label>
        <Textarea
          id="context"
          placeholder="Opisz sytuację, ograniczenia, to, co już rozważałeś…"
          rows={5}
          disabled={isSubmitting}
          {...register("context")}
        />
        <p className="text-muted-foreground text-xs">Więcej kontekstu = trafniejsze opinie doradców.</p>
        {showContextNudge && !context && (
          <p className="text-accent text-xs" role="status">
            Brak kontekstu — doradcy ocenią na podstawie samej decyzji.
          </p>
        )}
      </div>

      {asyncState === "error" && errorMessage && (
        <p className="text-destructive text-sm" role="alert">
          {errorMessage}
        </p>
      )}

      <Button
        type="submit"
        disabled={isSubmitting}
        className={cn(
          "pixel-btn font-pixel bg-primary text-primary-foreground hover:border-accent hover:bg-accent px-6 py-4 text-xs",
        )}
      >
        {isSubmitting ? "Uruchamiam panel…" : "Zbierz panel"}
      </Button>
    </form>
  );
}

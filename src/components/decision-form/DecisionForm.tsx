import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
      <Field id="decision" label="Decyzja" error={errors.decision?.message}>
        <Input placeholder="Np. Czy powinienem zmienić pracę?" disabled={isSubmitting} {...register("decision")} />
      </Field>

      <Field
        id="context"
        label="Kontekst (opcjonalnie)"
        hint="Więcej kontekstu = trafniejsze opinie doradców."
        error={errors.context?.message}
      >
        <Textarea
          placeholder="Opisz sytuację, ograniczenia, to, co już rozważałeś…"
          rows={5}
          disabled={isSubmitting}
          {...register("context")}
        />
      </Field>

      {showContextNudge && !context && (
        <Alert variant="warning">
          <AlertDescription>Brak kontekstu — doradcy ocenią na podstawie samej decyzji.</AlertDescription>
        </Alert>
      )}

      {asyncState === "error" && errorMessage && (
        <Alert variant="error">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" variant="default" size="lg" disabled={isSubmitting}>
        {isSubmitting ? "Uruchamiam panel…" : "Zbierz panel"}
      </Button>
    </form>
  );
}

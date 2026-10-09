/**
 * "Dopytaj" side-thread transcript + composer (frontend.md §3/§6/§8) — mounted by `AdvisorCard`
 * only when `sideThreadEnabled` is true (round one, opt-in). Consumes `useSideThreadStream`.
 */

import { useState } from "react";

import { useSideThreadStream, type SideThreadViewMessage } from "@/components/advisor-panel/useSideThreadStream";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { advisorAccent } from "@/lib/advisors/advisor-accent";
import { cn } from "@/lib/utils";

interface SideThreadProps {
  sessionId: string;
  personaId: string;
  label: string;
  initialMessages: SideThreadViewMessage[];
}

export function SideThread({ sessionId, personaId, label, initialMessages }: SideThreadProps) {
  const { messages, status, error, errorCode, send } = useSideThreadStream(sessionId, personaId, initialMessages);
  const [draft, setDraft] = useState("");
  const textareaId = `side-thread-input-${personaId}`;
  const accent = advisorAccent(personaId);

  const disabled = status === "streaming" || errorCode === "RATE_LIMITED";

  const handleSend = () => {
    const trimmed = draft.trim();
    if (!trimmed || disabled) {
      return;
    }
    send(trimmed);
    setDraft("");
  };

  return (
    <div className="border-border bg-background flex flex-col gap-2 border-2 p-3">
      <div aria-live="polite" className="flex max-h-48 flex-col gap-2 overflow-y-auto text-xs leading-relaxed">
        {messages.length === 0 && <p className="text-placeholder">Zadaj dodatkowe pytanie doradcy {label}.</p>}
        {messages.map((message, index) => (
          <p
            key={index}
            className={cn(
              "border-2 p-2",
              message.role === "user"
                ? "border-primary bg-card text-foreground self-end"
                : cn(accent.border, "bg-card text-foreground"),
            )}
          >
            <span className={cn("font-pixel text-pixel-micro mr-1", message.role === "user" ? "" : accent.text)}>
              {message.role === "user" ? "TY" : label.toUpperCase()}
            </span>
            {message.content || (status === "streaming" && index === messages.length - 1 ? "…" : "")}
          </p>
        ))}
      </div>

      {status === "streaming" && (
        <span className="motion-safe:animate-blink text-muted-foreground text-pixel-micro">Doradca odpowiada…</span>
      )}

      {status === "error" && (
        <Alert variant="error">
          <AlertDescription>
            {error ?? "Nie udało się dopytać doradcy."} Możesz spróbować ponownie.
          </AlertDescription>
        </Alert>
      )}

      <label htmlFor={textareaId} className="sr-only">
        Dopytaj doradcę {label}
      </label>
      <Textarea
        id={textareaId}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
        }}
        disabled={disabled}
        rows={2}
        placeholder="Twoje pytanie…"
        className="text-xs"
      />
      <Button
        type="button"
        variant="default"
        size="sm"
        onClick={handleSend}
        disabled={disabled || draft.trim().length === 0}
        className="self-end"
      >
        WYŚLIJ
      </Button>
    </div>
  );
}

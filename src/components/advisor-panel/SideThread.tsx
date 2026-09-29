/**
 * "Dopytaj" side-thread transcript + composer (frontend.md §3/§6/§8) — mounted by `AdvisorCard`
 * only when `sideThreadEnabled` is true (round one, opt-in). Consumes `useSideThreadStream`.
 */

import { useState } from "react";

import { useSideThreadStream, type SideThreadViewMessage } from "@/components/advisor-panel/useSideThreadStream";
import { cn } from "@/lib/utils";

interface SideThreadProps {
  sessionId: string;
  personaId: string;
  label: string;
  initialMessages: SideThreadViewMessage[];
}

export function SideThread({ sessionId, personaId, label, initialMessages }: SideThreadProps) {
  const { messages, status, error, send } = useSideThreadStream(sessionId, personaId, initialMessages);
  const [draft, setDraft] = useState("");
  const textareaId = `side-thread-input-${personaId}`;

  const disabled = status === "streaming";

  const handleSend = () => {
    const trimmed = draft.trim();
    if (!trimmed || disabled) {
      return;
    }
    send(trimmed);
    setDraft("");
  };

  return (
    <div className="border-primary/30 bg-background/40 flex flex-col gap-2 border-2 p-3">
      <div aria-live="polite" className="flex max-h-48 flex-col gap-2 overflow-y-auto text-xs leading-relaxed">
        {messages.length === 0 && <p className="text-muted-foreground/70">Zadaj dodatkowe pytanie doradcy {label}.</p>}
        {messages.map((message, index) => (
          <p
            key={index}
            className={cn(
              "border-2 p-2",
              message.role === "user"
                ? "border-primary/50 bg-primary/10 text-foreground self-end"
                : "border-accent/40 bg-accent/10 text-foreground",
            )}
          >
            <span className="font-pixel text-muted-foreground mr-1 text-[9px]">
              {message.role === "user" ? "TY" : label.toUpperCase()}
            </span>
            {message.content || (status === "streaming" && index === messages.length - 1 ? "…" : "")}
          </p>
        ))}
      </div>

      {status === "streaming" && (
        <span className="motion-safe:animate-blink text-muted-foreground text-[10px]">Doradca odpowiada…</span>
      )}

      {status === "error" && (
        <p className="text-destructive text-xs" role="alert">
          Błąd: {error ?? "Nie udało się dopytać doradcy."} Możesz spróbować ponownie.
        </p>
      )}

      <label htmlFor={textareaId} className="sr-only">
        Dopytaj doradcę {label}
      </label>
      <textarea
        id={textareaId}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
        }}
        disabled={disabled}
        rows={2}
        placeholder="Twoje pytanie…"
        className="border-primary/40 bg-card text-foreground focus-visible:ring-ring w-full resize-none border-2 p-2 text-xs outline-none focus-visible:ring-2 disabled:opacity-50"
      />
      <button
        type="button"
        onClick={handleSend}
        disabled={disabled || draft.trim().length === 0}
        className="pixel-btn font-pixel bg-primary text-primary-foreground hover:border-accent hover:bg-accent self-end px-4 py-2 text-[10px] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      >
        WYŚLIJ
      </button>
    </div>
  );
}

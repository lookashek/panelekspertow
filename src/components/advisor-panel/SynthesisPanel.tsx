/**
 * Synthesis trigger + panel (frontend.md §1/§3) — mirrors `RoundTwoPanel`'s gating pattern: the
 * streaming child that calls `useSynthesisStream` is not mounted until the user activates it, so no
 * `EventSource` opens (and no LLM cost is incurred) before then. `hasSynthesis` mounts the streaming
 * child immediately instead (page reload with an already-persisted synthesis — the replay path has
 * no LLM cost either).
 */

import { useState } from "react";

import { useSynthesisStream } from "@/components/advisor-panel/useSynthesisStream";
import type { Risk } from "@/lib/schemas/synthesis";

interface SynthesisPanelProps {
  sessionId: string;
  available: boolean;
  hasSynthesis: boolean;
}

const RISK_WEIGHT_ORDER: Record<Risk["weight"], number> = { high: 0, medium: 1, low: 2 };
const RISK_WEIGHT_LABEL: Record<Risk["weight"], string> = { high: "WYSOKIE", medium: "ŚREDNIE", low: "NISKIE" };
const RISK_WEIGHT_CLASS: Record<Risk["weight"], string> = {
  high: "border-destructive text-destructive",
  medium: "border-primary text-primary",
  low: "border-muted-foreground text-muted-foreground",
};

function sortedRisks(risks: Risk[]): Risk[] {
  return [...risks].sort((a, b) => RISK_WEIGHT_ORDER[a.weight] - RISK_WEIGHT_ORDER[b.weight]);
}

function RetryButton({ onRetry }: { onRetry: () => void }) {
  return (
    <button
      type="button"
      onClick={onRetry}
      className="pixel-btn font-pixel bg-secondary text-secondary-foreground hover:border-accent hover:bg-accent self-start px-4 py-2 text-[10px] transition-colors"
    >
      PONÓW
    </button>
  );
}

function SynthesisStream({ sessionId, onRetry }: { sessionId: string; onRetry: () => void }) {
  const state = useSynthesisStream(sessionId);

  if (state.status === "pending") {
    return (
      <div className="pixel-panel p-4 sm:p-5">
        <span className="motion-safe:animate-blink text-muted-foreground text-xs">Oczekiwanie na syntezę…</span>
      </div>
    );
  }

  if (state.status === "error" && !state.synthesis) {
    return (
      <div className="pixel-panel flex flex-col gap-3 p-4 sm:p-5">
        <p className="text-destructive text-sm" role="alert">
          Błąd: {state.error ?? "Nie udało się wygenerować syntezy."}
        </p>
        <RetryButton onRetry={onRetry} />
      </div>
    );
  }

  const synthesis = state.synthesis;

  return (
    <div className="animate-fade-up flex flex-col gap-4">
      {synthesis && (
        <>
          <div className="pixel-panel p-4 sm:p-5">
            <h3 className="font-pixel text-foreground mb-2 text-xs sm:text-sm">PUNKTY ZGODY</h3>
            {synthesis.agreementPoints.length > 0 ? (
              <ul className="text-muted-foreground flex flex-col gap-1 text-xs">
                {synthesis.agreementPoints.map((point) => (
                  <li key={point}>• {point}</li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-xs">Panel nie znalazł punktów zgody.</p>
            )}
          </div>

          <div className="border-accent bg-accent/10 border-2 p-4 sm:p-5">
            <h3 className="font-pixel text-accent mb-3 text-sm sm:text-base">OSIE SPORU</h3>
            <div className="flex flex-col gap-3">
              {synthesis.disputeAxes.map((axis) => (
                <div key={axis.title}>
                  <p className="text-foreground text-sm font-bold">{axis.title}</p>
                  <ul className="text-muted-foreground mt-1 flex flex-col gap-1 text-xs">
                    {axis.positions.map((position) => (
                      <li key={position}>• {position}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          <div className="pixel-panel p-4 sm:p-5">
            <h3 className="font-pixel text-foreground mb-2 text-xs sm:text-sm">RYZYKA</h3>
            {synthesis.risks.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {sortedRisks(synthesis.risks).map((risk) => (
                  <li key={risk.description} className="flex items-start gap-2 text-xs">
                    <span
                      className={`font-pixel shrink-0 border-2 px-1.5 py-0.5 text-[10px] ${RISK_WEIGHT_CLASS[risk.weight]}`}
                    >
                      {RISK_WEIGHT_LABEL[risk.weight]}
                    </span>
                    <span className="text-muted-foreground">{risk.description}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground text-xs">Panel nie zidentyfikował ryzyk.</p>
            )}
          </div>

          <div className="border-primary bg-primary/10 border-2 p-4 sm:p-5">
            <h3 className="font-pixel text-primary mb-2 text-xs sm:text-sm">REKOMENDOWANY NASTĘPNY KROK</h3>
            <p className="text-foreground text-sm font-bold">{synthesis.recommendedNextStep}</p>
          </div>
        </>
      )}

      <div className="pixel-panel p-4 sm:p-5">
        <h3 className="font-pixel text-foreground mb-2 text-xs sm:text-sm">PODSUMOWANIE</h3>
        <div aria-live="polite" className="text-muted-foreground min-h-16 text-sm leading-relaxed">
          {state.narrative ||
            (state.status !== "done" && <span className="text-muted-foreground/70">Generowanie podsumowania…</span>)}
        </div>
      </div>

      {state.status === "error" && (
        <div className="flex flex-col gap-3">
          <p className="text-destructive text-sm" role="alert">
            Błąd: {state.error ?? "Strumień syntezy został przerwany."}
          </p>
          <RetryButton onRetry={onRetry} />
        </div>
      )}
    </div>
  );
}

export function SynthesisPanel({ sessionId, available, hasSynthesis }: SynthesisPanelProps) {
  const [started, setStarted] = useState(hasSynthesis);
  const [retryKey, setRetryKey] = useState(0);

  if (!available) {
    return null;
  }

  return (
    <section className="mt-8 flex flex-col gap-4">
      <h2 className="font-pixel text-accent text-sm sm:text-base">SYNTEZA</h2>
      {started ? (
        <SynthesisStream
          key={retryKey}
          sessionId={sessionId}
          onRetry={() => {
            setRetryKey((key) => key + 1);
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            setStarted(true);
          }}
          className="pixel-btn font-pixel bg-primary text-primary-foreground hover:border-accent hover:bg-accent self-start px-6 py-4 text-xs transition-colors"
        >
          ZAKOŃCZ SESJĘ
        </button>
      )}
    </section>
  );
}

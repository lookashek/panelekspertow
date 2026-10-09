/**
 * Synthesis panel (frontend.md §1/§3) — `SessionFlow` owns the "started" decision, the trigger
 * button, and the end-of-session action bar (`StepActionBar`, session-quality-polish Phase 2).
 * This component keeps its own retry (`PONÓW`) for stream errors — a retry only needs to remount
 * this panel's own stream, not the whole flow — and reports status transitions upward via
 * `onStatus` so `deriveSessionStep` can see them.
 */

import { useEffect, useRef, useState } from "react";

import { useSynthesisStream } from "@/components/advisor-panel/useSynthesisStream";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { headingVariants } from "@/components/ui/heading";
import { panelVariants } from "@/components/ui/panel";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { SynthesisStreamStatus } from "@/lib/session-flow";
import type { Risk } from "@/lib/schemas/synthesis";

interface SynthesisPanelProps {
  sessionId: string;
  started: boolean;
  onStatus: (status: SynthesisStreamStatus) => void;
}

const RISK_WEIGHT_ORDER: Record<Risk["weight"], number> = { high: 0, medium: 1, low: 2 };
const RISK_WEIGHT_LABEL: Record<Risk["weight"], string> = { high: "WYSOKIE", medium: "ŚREDNIE", low: "NISKIE" };
const RISK_WEIGHT_BADGE: Record<Risk["weight"], "destructive" | "warning" | "neutral"> = {
  high: "destructive",
  medium: "warning",
  low: "neutral",
};

function sortedRisks(risks: Risk[]): Risk[] {
  return [...risks].sort((a, b) => RISK_WEIGHT_ORDER[a.weight] - RISK_WEIGHT_ORDER[b.weight]);
}

function RetryButton({ onRetry }: { onRetry: () => void }) {
  return (
    <Button type="button" variant="secondary" size="sm" onClick={onRetry} className="self-start">
      PONÓW
    </Button>
  );
}

function SynthesisStream({
  sessionId,
  onRetry,
  onStatus,
}: {
  sessionId: string;
  onRetry: () => void;
  onStatus: (status: SynthesisStreamStatus) => void;
}) {
  const state = useSynthesisStream(sessionId);
  const reportedStatusRef = useRef<SynthesisStreamStatus | null>(null);

  useEffect(() => {
    if (reportedStatusRef.current === state.status) {
      return;
    }
    reportedStatusRef.current = state.status;
    onStatus(state.status);
  }, [state.status, onStatus]);

  if (state.status === "pending") {
    return (
      <div className={panelVariants({ padding: "card" })}>
        <span className="motion-safe:animate-blink text-muted-foreground mb-2 block text-sm">
          Oczekiwanie na syntezę…
        </span>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    );
  }

  if (state.status === "error" && !state.synthesis) {
    return (
      <Alert variant="error">
        <AlertTitle>Błąd</AlertTitle>
        <AlertDescription>{state.error ?? "Nie udało się wygenerować syntezy."}</AlertDescription>
        <AlertAction>
          <RetryButton onRetry={onRetry} />
        </AlertAction>
      </Alert>
    );
  }

  const synthesis = state.synthesis;

  return (
    <div className="animate-fade-up flex flex-col gap-4">
      {synthesis && (
        <>
          <div className={panelVariants({ padding: "card" })}>
            <h3 className={headingVariants({ level: "panel" })}>Punkty zgody</h3>
            {synthesis.agreementPoints.length > 0 ? (
              <ul className="text-muted-foreground mt-2 flex flex-col gap-1 text-xs">
                {synthesis.agreementPoints.map((point) => (
                  <li key={point}>• {point}</li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground mt-2 text-xs">Panel nie znalazł punktów zgody.</p>
            )}
          </div>

          <div className={panelVariants({ padding: "card", tone: "info" })}>
            <h3 className={headingVariants({ level: "panel" })}>Osie sporu</h3>
            <div className="mt-3 flex flex-col gap-3">
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

          <div className={panelVariants({ padding: "card" })}>
            <h3 className={headingVariants({ level: "panel" })}>Ryzyka</h3>
            {synthesis.risks.length > 0 ? (
              <ul className="mt-2 flex flex-col gap-2">
                {sortedRisks(synthesis.risks).map((risk) => (
                  <li key={risk.description} className="flex items-start gap-2 text-xs">
                    <Badge variant={RISK_WEIGHT_BADGE[risk.weight]} className="shrink-0">
                      {RISK_WEIGHT_LABEL[risk.weight]}
                    </Badge>
                    <span className="text-muted-foreground">{risk.description}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground mt-2 text-xs">Panel nie zidentyfikował ryzyk.</p>
            )}
          </div>

          <div className={panelVariants({ padding: "card", tone: "primary" })}>
            <h3 className={headingVariants({ level: "panel" })}>Rekomendowany następny krok</h3>
            <p className="text-foreground mt-2 text-sm font-bold">{synthesis.recommendedNextStep}</p>
          </div>
        </>
      )}

      <div className={panelVariants({ padding: "card" })}>
        <h3 className={headingVariants({ level: "panel" })}>Podsumowanie</h3>
        <div aria-live="polite" className="text-muted-foreground mt-2 min-h-16 text-sm leading-relaxed">
          {state.narrative ||
            (state.status !== "done" && (
              <span className="flex flex-col gap-1">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-5/6" />
              </span>
            ))}
        </div>
      </div>

      {state.status === "error" && (
        <Alert variant="error">
          <AlertTitle>Błąd</AlertTitle>
          <AlertDescription>{state.error ?? "Strumień syntezy został przerwany."}</AlertDescription>
          <AlertAction>
            <RetryButton onRetry={onRetry} />
          </AlertAction>
        </Alert>
      )}
    </div>
  );
}

export function SynthesisPanel({ sessionId, started, onStatus }: SynthesisPanelProps) {
  const [retryKey, setRetryKey] = useState(0);

  if (!started) {
    return null;
  }

  return (
    <section className={cn("mt-8 flex flex-col gap-4")}>
      <h2 className={headingVariants({ level: "section" })}>Synteza</h2>
      <SynthesisStream
        key={retryKey}
        sessionId={sessionId}
        onStatus={onStatus}
        onRetry={() => {
          setRetryKey((key) => key + 1);
        }}
      />
    </section>
  );
}

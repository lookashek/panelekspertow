import { PixelSprite } from "@/components/ui/pixel-sprite";

export interface MascotProps {
  className?: string;
}

const MASCOT_FILLS: Record<string, string> = {
  V: "var(--primary)",
  C: "var(--accent)",
  W: "var(--foreground)",
};

// 16×16 arcade-coin mascot, single pose ("celebrating") — simple start per confirmed scope.
const MASCOT_GRID = [
  "................",
  ".....VVVVVV.....",
  "...VVVVVVVVVV...",
  "..VVVVVVVVVVVV..",
  ".VVVVVVVVVVVVVV.",
  ".VVVWWVVVVWWVV..",
  ".VVVCCVVVVCCVV..",
  ".VVVVVVVVVVVVVV.",
  ".VVVVVVVVVVVVVV.",
  ".VVVCVVVVVVCVVV.",
  ".VVVVCCCCCCVVVV.",
  "..VVVVVVVVVVVV..",
  "...VVVVVVVVVV...",
  ".....VVVVVV.....",
  "..V..........V..",
  ".V............V.",
];

/** The single mascot sprite — one pose, appears only on synthesis completion (Phase 4). */
function Mascot({ className }: MascotProps) {
  return <PixelSprite grid={MASCOT_GRID} fills={MASCOT_FILLS} size="h-12 w-12" className={className} />;
}

export { Mascot };

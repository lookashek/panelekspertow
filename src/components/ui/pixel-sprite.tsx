import { cn } from "@/lib/utils";

export interface PixelSpriteProps {
  /** One string per row, one character per column. "." is transparent. */
  grid: string[];
  /** Maps each non-"." character to a `var(--token)` fill value. */
  fills: Record<string, string>;
  /** Tailwind size classes (e.g. "h-16 w-16 sm:h-20 sm:w-20"). */
  size: string;
  className?: string;
}

/**
 * Renders a hand-authored pixel-grid sprite as inline SVG rects, one per non-transparent cell.
 * Fills are always `var(--token)` strings (frontend.md §4's runtime-computed inline-style
 * exception) — never a literal hex, so this clears `scripts/ui-scan.mjs` by construction.
 */
function PixelSprite({ grid, fills, size, className }: PixelSpriteProps) {
  return (
    <svg
      viewBox={`0 0 ${grid[0]?.length ?? 0} ${grid.length}`}
      shapeRendering="crispEdges"
      className={cn(size, className)}
      aria-hidden="true"
    >
      {grid.flatMap((row, y) =>
        Array.from(row).map((px, x) =>
          px === "." ? null : <rect key={`${y}-${x}`} x={x} y={y} width="1" height="1" style={{ fill: fills[px] }} />,
        ),
      )}
    </svg>
  );
}

export { PixelSprite };

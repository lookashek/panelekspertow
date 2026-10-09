import * as React from "react";

import { cn } from "@/lib/utils";

/** Pixel-block loading placeholder — no rounding, stepped blink (respects prefers-reduced-motion). */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="skeleton" className={cn("motion-safe:animate-blink bg-secondary", className)} {...props} />;
}

export { Skeleton };

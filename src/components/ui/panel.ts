import { cva } from "class-variance-authority";

/**
 * Shared panel recipe for React and Astro (`class={panelVariants({...})}` on either side).
 * Hard-edged structure: 2px neutral border, `card` surface, `shadow-pixel` — corners always sharp (radius tokens are 0).
 */
export const panelVariants = cva("border-2 bg-card", {
  variants: {
    padding: {
      card: "p-4",
      page: "p-6 sm:p-8",
      none: "p-0",
    },
    tone: {
      default: "border-border shadow-pixel",
      inset: "border-border",
      info: "border-info shadow-pixel",
      primary: "border-primary shadow-pixel",
    },
    interactive: {
      true: "transition-all hover:border-primary hover:shadow-pixel-sm focus-visible:ring-2 focus-visible:ring-ring outline-none",
      false: "",
    },
  },
  defaultVariants: {
    padding: "card",
    tone: "default",
    interactive: false,
  },
});

import { cva } from "class-variance-authority";

/**
 * Shared page-width recipe (Layout's Topbar wrapper and every page body use the same scale) —
 * 3 widths instead of 5 ad-hoc `max-w-*` picks (frontend.md §4).
 */
export const containerVariants = cva("mx-auto w-full px-4 sm:px-8", {
  variants: {
    width: {
      narrow: "max-w-xl",
      default: "max-w-3xl",
      wide: "max-w-5xl",
    },
  },
  defaultVariants: {
    width: "default",
  },
});

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/** Heading recipe for the 4 recurring roles — shared by Astro (`class={headingVariants({...})}`) and React. */
export const headingVariants = cva("font-pixel uppercase tracking-wide text-foreground", {
  variants: {
    level: {
      page: "text-pixel-xl",
      section: "text-pixel-lg",
      panel: "text-pixel-md",
      label: "text-pixel-micro text-muted-foreground",
    },
  },
  defaultVariants: {
    level: "section",
  },
});

const TAG_BY_LEVEL = {
  page: "h1",
  section: "h2",
  panel: "h3",
  label: "span",
} as const;

type HeadingProps = React.ComponentProps<"h1"> & VariantProps<typeof headingVariants>;

function Heading({ className, level, as, ...props }: HeadingProps & { as?: keyof typeof TAG_BY_LEVEL }) {
  const Tag = as ?? TAG_BY_LEVEL[level ?? "section"];
  return <Tag className={cn(headingVariants({ level }), className)} {...props} />;
}

export { Heading };

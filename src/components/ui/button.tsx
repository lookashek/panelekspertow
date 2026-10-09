import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap border-2 border-transparent font-pixel uppercase tracking-wide transition-all outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "border-primary bg-primary text-primary-foreground shadow-pixel hover:bg-primary/90 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none",
        secondary:
          "border-border bg-secondary text-secondary-foreground shadow-pixel hover:bg-secondary/80 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none",
        destructive:
          "border-destructive bg-destructive text-destructive-foreground shadow-pixel hover:bg-destructive/90 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none",
        ghost: "hover:border-border hover:bg-secondary/60",
        link: "h-auto border-transparent p-0 text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2 text-pixel-sm has-[>svg]:px-3",
        sm: "h-8 px-3 text-pixel-micro has-[>svg]:px-2.5",
        lg: "h-12 px-6 text-pixel-md has-[>svg]:px-4",
        icon: "size-10 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot : "button";

  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };

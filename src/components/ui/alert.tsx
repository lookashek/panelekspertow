import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const alertVariants = cva(
  "relative grid w-full grid-cols-[0_1fr] items-start gap-y-1 border-2 bg-card px-4 py-3 font-mono text-sm has-[>svg]:grid-cols-[calc(var(--spacing)*5)_1fr] has-[>svg]:gap-x-3 [&>svg]:size-5 [&>svg]:translate-y-0.5 [&>svg]:text-current",
  {
    variants: {
      variant: {
        error: "border-destructive text-destructive *:data-[slot=alert-description]:text-foreground",
        warning: "border-warning text-warning *:data-[slot=alert-description]:text-foreground",
        info: "border-info text-info *:data-[slot=alert-description]:text-foreground",
        success: "border-success text-success *:data-[slot=alert-description]:text-foreground",
      },
    },
    defaultVariants: {
      variant: "info",
    },
  },
);

function Alert({ className, variant, ...props }: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return <div data-slot="alert" role="alert" className={cn(alertVariants({ variant }), className)} {...props} />;
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn("font-pixel text-pixel-sm col-start-2 min-h-4 uppercase tracking-wide", className)}
      {...props}
    />
  );
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn("col-start-2 grid justify-items-start gap-1 text-sm [&_p]:leading-relaxed", className)}
      {...props}
    />
  );
}

/** Optional action slot (e.g. a retry button) below the description. */
function AlertAction({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="alert-action" className={cn("col-start-2 mt-2 flex items-center gap-2", className)} {...props} />;
}

export { Alert, AlertTitle, AlertDescription, AlertAction };

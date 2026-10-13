import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, id, placeholder, ...props }, ref) => {
    const hasExplicitAccessibleName = Boolean(
      props["aria-label"] || props["aria-labelledby"] || id,
    );
    const fallbackAriaLabel =
      !hasExplicitAccessibleName && typeof placeholder === "string" && placeholder.trim()
        ? placeholder
        : undefined;

    return (
      <input
        id={id}
        type={type}
        placeholder={placeholder}
        aria-label={fallbackAriaLabel}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };

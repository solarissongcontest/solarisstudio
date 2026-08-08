import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ActionBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <>
      <div className={cn("hidden flex-wrap justify-end gap-2 md:flex", className)}>
        {children}
      </div>

      <div
        className={cn(
          "fixed inset-x-0 z-40 border-t border-border bg-background/95 px-3 py-2 backdrop-blur-xl md:hidden",
          className,
        )}
        style={{
          bottom: "calc(4.25rem + env(safe-area-inset-bottom))",
        }}
      >
        <div className="mx-auto grid max-w-lg grid-cols-2 gap-2">{children}</div>
      </div>
    </>
  );
}

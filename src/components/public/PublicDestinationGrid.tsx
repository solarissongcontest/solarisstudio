import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function PublicDestinationGrid({
  children,
  columns = 2,
  className,
}: {
  children: ReactNode;
  columns?: 2 | 3 | 4;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "public-destination-grid",
        columns === 2 && "md:grid-cols-2",
        columns === 3 && "sm:grid-cols-2 xl:grid-cols-3",
        columns === 4 && "sm:grid-cols-2 xl:grid-cols-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

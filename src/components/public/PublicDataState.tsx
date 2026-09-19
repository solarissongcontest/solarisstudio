import { AlertTriangle, ArchiveX, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function PublicDataState({
  kind,
  title,
  description,
  action,
  compact = false,
}: {
  kind: "loading" | "error" | "empty";
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
}) {
  const Icon =
    kind === "loading"
      ? LoaderCircle
      : kind === "error"
        ? AlertTriangle
        : ArchiveX;

  return (
    <section
      className={cn(
        "rounded-2xl border border-border/70 bg-surface/55 px-4 text-center",
        compact ? "py-6" : "py-10 sm:py-12",
      )}
      role={kind === "error" ? "alert" : kind === "loading" ? "status" : undefined}
      aria-live={kind === "loading" ? "polite" : undefined}
    >
      <Icon
        className={cn(
          "mx-auto size-5",
          kind === "loading" && "animate-spin text-primary",
          kind === "error" && "text-amber-200",
          kind === "empty" && "text-muted-foreground",
        )}
        aria-hidden="true"
      />
      <h2 className="mt-3 text-sm font-bold">{title}</h2>
      {description ? (
        <p className="mx-auto mt-1 max-w-xl text-xs leading-5 text-muted-foreground">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </section>
  );
}

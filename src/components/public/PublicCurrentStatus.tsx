import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export function PublicCurrentStatus({
  icon: Icon,
  eyebrow,
  title,
  description,
  tone = "neutral",
}: {
  icon: LucideIcon;
  eyebrow?: string;
  title: string;
  description: string;
  tone?: "neutral" | "active" | "complete" | "attention";
}) {
  return (
    <section className={cn("public-current-status", `is-${tone}`)}>
      <span className="public-current-status-icon">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        {eyebrow ? <p className="public-hub-eyebrow">{eyebrow}</p> : null}
        <h2 className="mt-1 font-display text-xl font-bold">{title}</h2>
        <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
    </section>
  );
}

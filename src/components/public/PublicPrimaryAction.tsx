import { Link } from "@tanstack/react-router";
import { ArrowRight, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export function PublicPrimaryAction({
  to,
  icon: Icon,
  eyebrow,
  title,
  description,
  dominant = false,
  status,
}: {
  to: string;
  icon: LucideIcon;
  eyebrow?: string;
  title: string;
  description: string;
  dominant?: boolean;
  status?: string;
}) {
  return (
    <Link
      to={to as any}
      className={cn("public-primary-action group", dominant && "is-dominant")}
    >
      <div className="flex items-start justify-between gap-4">
        <span className="public-primary-action-icon">
          <Icon className="size-4.5" aria-hidden="true" />
        </span>
        <ArrowRight
          className="size-4 shrink-0 text-primary transition-transform group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      </div>
      <div className="mt-auto pt-6">
        {status ? <span className="public-status-pill">{status}</span> : null}
        {eyebrow ? <p className="public-hub-eyebrow mt-2">{eyebrow}</p> : null}
        <h2 className={cn("font-display font-bold", dominant ? "text-3xl" : "text-2xl")}>
          {title}
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
    </Link>
  );
}

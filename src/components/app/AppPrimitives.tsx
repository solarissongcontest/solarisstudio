import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

export function AppScreen({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("space-y-5", className)} {...props}>
      {children}
    </div>
  );
}

export function AppSectionHeader({
  eyebrow,
  title,
  id,
  trailing,
  className,
}: {
  eyebrow: ReactNode;
  title: ReactNode;
  id?: string;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("solaris-app-section-heading", className)}>
      <div className="min-w-0">
        <p>{eyebrow}</p>
        <h2 id={id}>{title}</h2>
      </div>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </div>
  );
}

export function AppGroupedList({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("solaris-app-grouped-list", className)} {...props}>
      {children}
    </div>
  );
}

export function AppEmptyState({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("solaris-app-empty-state", className)} role="status">
      <p className="text-sm font-semibold">{title}</p>
      {description ? (
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function AppStatusBadge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
  className?: string;
}) {
  return (
    <span
      className={cn("solaris-app-status-badge", className)}
      data-tone={tone}
    >
      {children}
    </span>
  );
}

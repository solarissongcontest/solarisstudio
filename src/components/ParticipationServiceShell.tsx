import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/AppShell";
import { cn } from "@/lib/utils";

type ParticipationService = "confirmations" | "televoting";

type ServiceAction = {
  to: string;
  label: string;
};

export function ParticipationServiceShell({
  service,
  title,
  description,
  children,
  actions = [],
  maxWidth = "max-w-5xl",
}: {
  service: ParticipationService;
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ServiceAction[];
  maxWidth?: string;
}) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const serviceLabel = service === "confirmations" ? "Confirmations" : "Televoting";

  return (
    <div className={cn("mx-auto min-w-0", maxWidth)}>
      <PageHeader
        eyebrow={`${serviceLabel} · Participate`}
        title={title}
        description={description}
        actions={
          actions.length ? (
            <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
              {actions.map((action) => (
                <Link
                  key={action.to}
                  to={action.to as any}
                  className={cn(
                    "inline-flex min-h-10 items-center justify-center rounded-xl border px-3 text-xs font-semibold transition sm:text-sm",
                    pathMatches(pathname, action.to)
                      ? "border-primary/30 bg-primary/[0.10] text-foreground"
                      : "border-border/75 bg-surface text-muted-foreground hover:bg-surface-strong hover:text-foreground",
                  )}
                >
                  {action.label}
                </Link>
              ))}
            </div>
          ) : undefined
        }
      />
      {children}
    </div>
  );
}

function pathMatches(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`);
}

import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, CircleHelp } from "lucide-react";
import { createContext, useContext, useEffect, type ReactNode } from "react";

import { AppShell, PageHeader } from "@/components/AppShell";
import { trackPublicUxEvent } from "@/lib/public-ux-events";
import { cn } from "@/lib/utils";

type ParticipationService = "confirmations" | "jury" | "televoting" | "next-in-line";

type ServiceAction = {
  to: string;
  label: string;
};

const ParticipationChromeContext = createContext(false);

export function ParticipationRouteChrome({ children }: { children: ReactNode }) {
  const nested = useContext(ParticipationChromeContext);

  if (nested) return <>{children}</>;

  return (
    <ParticipationChromeContext.Provider value>
      <AppShell>{children}</AppShell>
    </ParticipationChromeContext.Provider>
  );
}

export function ParticipationServiceShell({
  service,
  title,
  description,
  children,
  actions = [],
  maxWidth = "max-w-7xl",
}: {
  service: ParticipationService;
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ServiceAction[];
  maxWidth?: string;
}) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const serviceLabel = {
    confirmations: "Confirmations",
    jury: "Jury voting",
    televoting: "Televoting",
    "next-in-line": "Next in Line",
  }[service];

  const visibleActions = actions.filter(
    (action) => action.to !== "/confirmations/next-in-line" && action.to !== "/next-in-line",
  );

  useEffect(() => {
    trackPublicUxEvent("task_started", {
      target: servicePath(service),
      metadata: { area: "participate", source: "task_page", task_status: "opened" },
    });
  }, [service]);

  return (
    <div className={cn("mx-auto min-w-0", maxWidth)}>
      <nav
        aria-label="Participation task navigation"
        className="participation-service-nav mb-4 flex min-w-0 items-center gap-2 rounded-2xl border border-border/60 bg-surface/95 p-1.5 sm:mb-5"
      >
        <Link
          to="/participate"
          className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-surface-strong hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">Back to Participate</span>
          <span className="sm:hidden">Participate</span>
        </Link>

        <span className="min-w-0 flex-1 truncate border-l border-border/60 px-3 text-xs font-semibold text-foreground">
          {serviceLabel}
        </span>

        <Link
          to="/guide"
          className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-semibold text-muted-foreground transition-colors hover:bg-surface-strong hover:text-foreground"
        >
          <CircleHelp className="size-3.5" aria-hidden="true" />
          Help
        </Link>
      </nav>

      <PageHeader
        eyebrow={`${serviceLabel} · Participate`}
        title={title}
        description={description}
        actions={
          visibleActions.length ? (
            <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
              {visibleActions.map((action) => (
                <Link
                  key={action.to}
                  to={action.to as any}
                  className={cn(
                    "inline-flex min-h-10 items-center justify-center rounded-xl border px-3 text-xs font-semibold transition sm:text-sm",
                    pathMatches(pathname, action.to)
                      ? "border-primary/30 bg-primary/[0.10] text-foreground"
                      : "border-border/75 bg-surface/55 text-muted-foreground hover:bg-surface-strong hover:text-foreground",
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

function servicePath(service: ParticipationService) {
  switch (service) {
    case "confirmations":
      return "/confirmations";
    case "jury":
      return "/jury-voting";
    case "televoting":
      return "/televoting";
    case "next-in-line":
      return "/next-in-line";
  }
}

function pathMatches(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`);
}

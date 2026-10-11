import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, CircleHelp } from "lucide-react";
import { createContext, useContext, useEffect, type ReactNode } from "react";

import { AppShell, PageHeader } from "@/components/AppShell";
import { useSolarisApp } from "@/components/app/AppRuntime";
import { trackPublicUxEvent } from "@/lib/public-ux-events";
import { cn } from "@/lib/utils";

type ParticipationService = "confirmations" | "jury" | "televoting" | "next-in-line";

type ServiceAction = {
  to: string;
  label: string;
};

type ParticipationStatusTone = "neutral" | "danger" | "warning" | "success";

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

/**
 * Compact shared state treatment for focused participation routes.
 *
 * Loading, closed, empty and unavailable states should feel like the same app,
 * not individually designed poster screens. Keep this deliberately compact so
 * mobile users retain context and navigation around the state message.
 */
export function ParticipationStatusPanel({
  title,
  description,
  icon,
  tone = "neutral",
  children,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  tone?: ParticipationStatusTone;
  children?: ReactNode;
}) {
  return (
    <section
      className={cn(
        "data-panel p-5 sm:p-6",
        tone === "danger" && "border-destructive/30",
        tone === "warning" && "border-amber-300/20",
        tone === "success" && "border-emerald-300/20",
      )}
      role={tone === "danger" ? "alert" : undefined}
    >
      <div className="flex min-w-0 items-start gap-3.5">
        {icon ? (
          <div
            className={cn(
              "grid size-10 shrink-0 place-items-center rounded-xl border border-border/70 bg-surface text-primary",
              tone === "danger" && "text-destructive",
              tone === "warning" && "text-amber-200",
              tone === "success" && "text-emerald-200",
            )}
            aria-hidden="true"
          >
            {icon}
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold leading-6 sm:text-lg">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
          ) : null}
          {children ? <div className="mt-4">{children}</div> : null}
        </div>
      </div>
    </section>
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
  const { isAppMode } = useSolarisApp();
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

  if (isAppMode) {
    const appActions = visibleActions.filter(
      (action) => !(service === "televoting" && action.to === "/televoting/how-to-vote"),
    );

    return (
      <section
        className={cn("solaris-app-task-shell mx-auto min-w-0", maxWidth)}
        data-solaris-app-task-shell={service}
        aria-label={title}
      >
        {appActions.length ? (
          <nav className="solaris-app-task-utilities" aria-label={`${serviceLabel} options`}>
            {appActions.map((action) => (
              <Link
                key={action.to}
                to={action.to as any}
                className={cn(
                  "solaris-app-task-utility",
                  pathMatches(pathname, action.to) && "is-active",
                )}
              >
                {action.label}
              </Link>
            ))}
          </nav>
        ) : null}
        {children}
      </section>
    );
  }

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

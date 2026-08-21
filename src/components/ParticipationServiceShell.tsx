import { Link, useRouterState } from "@tanstack/react-router";
import { ClipboardCheck, Vote } from "lucide-react";
import { createContext, useContext, type ReactNode } from "react";

import { AppShell, PageHeader } from "@/components/AppShell";
import { cn } from "@/lib/utils";

type ParticipationService = "confirmations" | "televoting";

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

  // Legacy confirmation screens used to advertise Next in Line as a
  // confirmation sub-flow. It is now a separate song competition at
  // /next-in-line, so never render that stale service-level action even when
  // an older caller still passes it while old links remain compatible.
  const visibleActions = actions.filter(
    (action) => action.to !== "/confirmations/next-in-line" && action.to !== "/next-in-line",
  );

  return (
    <div className={cn("mx-auto min-w-0", maxWidth)}>
      <div className="mb-4 flex min-w-0 items-center gap-1 border-b border-border/55 pb-3 sm:mb-5">
        <ServiceTab
          to="/confirmations"
          label="Confirmations"
          icon={ClipboardCheck}
          active={pathname.startsWith("/confirmations")}
        />
        <ServiceTab
          to="/televoting"
          label="Televoting"
          icon={Vote}
          active={pathname.startsWith("/televoting")}
        />
      </div>

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

function ServiceTab({
  to,
  label,
  icon: Icon,
  active,
}: {
  to: string;
  label: string;
  icon: typeof ClipboardCheck;
  active: boolean;
}) {
  return (
    <Link
      to={to as any}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex min-h-9 min-w-0 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold transition sm:text-xs",
        active
          ? "bg-primary/[0.09] text-primary"
          : "text-muted-foreground hover:bg-surface hover:text-foreground",
      )}
    >
      <Icon className="size-3.5 shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

function pathMatches(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`);
}

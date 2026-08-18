import { Link, useRouterState } from "@tanstack/react-router";
import { ClipboardCheck, LayoutGrid, Vote } from "lucide-react";
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
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  if (nested) return <>{children}</>;

  return (
    <ParticipationChromeContext.Provider value>
      <AppShell>
        <div className="mx-auto mb-5 max-w-5xl min-w-0 sm:mb-6">
          <div className="flex min-w-0 flex-col gap-2 rounded-2xl border border-border/65 bg-surface/70 p-2 sm:flex-row sm:items-center sm:justify-between sm:p-2.5">
            <Link
              to="/participate"
              className="flex min-h-11 min-w-0 items-center gap-2.5 rounded-xl px-2.5 text-foreground transition hover:bg-surface-strong"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-xl border border-primary/15 bg-primary/[0.07] text-primary">
                <LayoutGrid className="size-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-xs font-semibold">Solaris Studio · Participate</span>
                <span className="block truncate text-[10px] text-muted-foreground">Official participation services</span>
              </span>
            </Link>

            <nav aria-label="Participation services" className="grid grid-cols-2 gap-1 sm:w-[25rem]">
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
            </nav>
          </div>
        </div>
        {children}
      </AppShell>
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
        "flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-xl border px-3 text-xs font-semibold transition",
        active
          ? "border-primary/20 bg-surface-strong text-foreground"
          : "border-transparent text-muted-foreground hover:bg-surface hover:text-foreground",
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

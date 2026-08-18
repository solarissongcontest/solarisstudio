import { Link, useRouterState } from "@tanstack/react-router";
import { ClipboardCheck, LayoutGrid, Vote } from "lucide-react";
import type { ReactNode } from "react";

import { AppShell, PageHeader } from "@/components/AppShell";
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
  const Icon = service === "confirmations" ? ClipboardCheck : Vote;
  const serviceLabel = service === "confirmations" ? "Confirmations" : "Televoting";

  return (
    <AppShell>
      <div className={cn("mx-auto min-w-0", maxWidth)}>
        <div className="mb-4 flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-2xl border border-border/65 bg-surface/70 px-3 py-2.5 sm:px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-xl border border-primary/15 bg-primary/[0.07] text-primary">
              <Icon className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-foreground">Solaris Studio · Participate</p>
              <p className="truncate text-[10px] text-muted-foreground">{serviceLabel} service</p>
            </div>
          </div>
          <Link
            to="/participate"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-border/70 bg-surface px-3 text-xs font-semibold text-muted-foreground transition hover:bg-surface-strong hover:text-foreground"
          >
            <LayoutGrid className="size-3.5" /> Participation hub
          </Link>
        </div>

        <PageHeader
          eyebrow="Participate · Solaris Studio"
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

        <nav
          aria-label="Participation services"
          className="mb-5 grid grid-cols-2 gap-1 rounded-2xl border border-border/65 bg-surface/60 p-1.5 sm:mb-6"
        >
          <ServiceTab
            to="/confirmations"
            label="Confirmations"
            description="Participation and entry details"
            active={pathname.startsWith("/confirmations")}
          />
          <ServiceTab
            to="/televoting"
            label="Televoting"
            description="Cast and inspect public votes"
            active={pathname.startsWith("/televoting")}
          />
        </nav>

        {children}
      </div>
    </AppShell>
  );
}

function ServiceTab({
  to,
  label,
  description,
  active,
}: {
  to: string;
  label: string;
  description: string;
  active: boolean;
}) {
  return (
    <Link
      to={to as any}
      aria-current={active ? "page" : undefined}
      className={cn(
        "min-w-0 rounded-xl border px-3 py-2.5 transition",
        active
          ? "border-primary/20 bg-surface-strong text-foreground"
          : "border-transparent text-muted-foreground hover:bg-surface hover:text-foreground",
      )}
    >
      <span className="block truncate text-xs font-semibold sm:text-sm">{label}</span>
      <span className="mt-0.5 hidden truncate text-[10px] font-normal text-muted-foreground sm:block">
        {description}
      </span>
    </Link>
  );
}

function pathMatches(pathname: string, route: string) {
  return pathname === route || pathname.startsWith(`${route}/`);
}

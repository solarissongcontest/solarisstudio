import type { ReactNode } from "react";

import {
  AdminCard,
  AdminCardHeader,
  AdminMoreMenu,
  AdminSheet,
  WorkspaceHeader,
} from "@/components/admin/AdminUI";
import { cn } from "@/lib/utils";

export { WorkspaceHeader };

export const InspectorSheet = AdminSheet;
export const CommandMenu = AdminMoreMenu;

export function ObjectPage({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("mx-auto max-w-[1500px] space-y-4", className)}>{children}</div>;
}

export function WorkspaceTabs({
  children,
  label,
  className,
}: {
  children: ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <nav
      aria-label={label}
      className={cn("grid grid-cols-2 gap-1 sm:flex sm:flex-wrap", className)}
    >
      {children}
    </nav>
  );
}

export function MetricStrip({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("grid gap-3 sm:grid-cols-2 xl:grid-cols-4", className)}>
      {children}
    </section>
  );
}

export function WorkQueue({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("divide-y divide-white/[0.06]", className)}>{children}</div>;
}

export function WorkspaceActionBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "admin-sticky-actions flex min-w-0 flex-wrap items-center justify-end gap-2",
        className,
      )}
      data-admin-action-layer="task"
    >
      {children}
    </div>
  );
}

export function FilterBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <AdminCard className={cn("min-w-0", className)}>
      <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-4">{children}</div>
    </AdminCard>
  );
}

export function FormSection({
  eyebrow,
  title,
  description,
  action,
  children,
  strong = false,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  strong?: boolean;
  className?: string;
}) {
  return (
    <AdminCard strong={strong} className={className}>
      <AdminCardHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        action={action}
      />
      {children}
    </AdminCard>
  );
}

export function DangerZone({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-rose-300/12 bg-rose-300/[0.025] p-4 sm:p-[1.125rem]",
        className,
      )}
      aria-label={title}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {description ? (
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">{children}</div>
      </div>
    </section>
  );
}

export function AuditTimeline({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <ol className={cn("relative space-y-0 border-l border-white/[0.08] pl-4", className)}>
      {children}
    </ol>
  );
}

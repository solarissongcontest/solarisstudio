import type { ReactNode } from "react";

import { Panel } from "@/components/AppShell";
import {
  PublicResponsiveDataView,
  type PublicDataColumn,
} from "@/components/public/PublicResponsiveDataView";
import { cn } from "@/lib/utils";

export function DataStoryPage({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("space-y-5", className)} data-public-data-story>{children}</div>;
}

export function StatSummary({
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

export function RankMetric({
  label,
  value,
  detail,
  className,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl border border-border/70 bg-surface p-4", className)}>
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <div className="mt-2 text-xl font-bold tracking-[-.02em]">{value}</div>
      {detail ? <div className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</div> : null}
    </div>
  );
}

export function ComparisonCard({
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
    <section className={cn("rounded-2xl border border-border/70 bg-surface p-4 sm:p-5", className)}>
      <h2 className="text-base font-bold tracking-[-.02em]">{title}</h2>
      {description ? <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function ChartPanel({
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
    <Panel title={title} description={description} className={className}>
      <div data-data-story-chart>{children}</div>
    </Panel>
  );
}

export function InsightBlock({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <aside className={cn("border-l-2 border-primary/35 pl-4", className)}>
      <h3 className="text-sm font-bold">{title}</h3>
      <div className="mt-1 text-sm leading-6 text-muted-foreground">{children}</div>
    </aside>
  );
}

export function MethodologyDisclosure({
  title = "How this is calculated",
  children,
  className,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <details className={cn("rounded-2xl border border-border/70 bg-surface/55 p-4", className)}>
      <summary className="cursor-pointer text-sm font-semibold">{title}</summary>
      <div className="mt-3 text-sm leading-6 text-muted-foreground">{children}</div>
    </details>
  );
}

export function ResponsiveHistory<T>({
  rows,
  columns,
  rowKey,
  ariaLabel,
  empty,
  className,
}: {
  rows: readonly T[];
  columns: readonly PublicDataColumn<T>[];
  rowKey: (row: T, index: number) => string;
  ariaLabel: string;
  empty?: ReactNode;
  className?: string;
}) {
  return (
    <PublicResponsiveDataView
      rows={rows}
      columns={columns}
      rowKey={rowKey}
      ariaLabel={ariaLabel}
      empty={empty}
      className={className}
    />
  );
}

export type { PublicDataColumn };

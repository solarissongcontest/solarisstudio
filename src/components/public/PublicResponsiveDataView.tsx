import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type PublicDataColumn<T> = {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  mobileLabel?: string;
  primary?: boolean;
  align?: "left" | "right";
  className?: string;
};

export function PublicResponsiveDataView<T>({
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
  if (!rows.length) return empty ? <>{empty}</> : null;

  return (
    <div className={cn("min-w-0", className)}>
      <div className="space-y-2 md:hidden" role="list" aria-label={ariaLabel}>
        {rows.map((row, rowIndex) => (
          <article
            key={rowKey(row, rowIndex)}
            role="listitem"
            className="rounded-xl border border-border/70 bg-surface px-3.5 py-3"
          >
            {columns.map((column) => (
              <div
                key={column.key}
                className={cn(
                  "grid min-w-0 grid-cols-[minmax(5.75rem,.72fr)_minmax(0,1.28fr)] gap-3 border-b border-border/55 py-2 first:pt-0 last:border-b-0 last:pb-0",
                  column.primary && "block pb-3",
                )}
              >
                <p
                  className={cn(
                    "text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground",
                    column.primary && "mb-1.5",
                  )}
                >
                  {column.mobileLabel ?? column.header}
                </p>
                <div
                  className={cn(
                    "min-w-0 break-words text-sm",
                    column.primary && "text-base font-semibold",
                    column.align === "right" && !column.primary && "text-right",
                    column.className,
                  )}
                >
                  {column.render(row)}
                </div>
              </div>
            ))}
          </article>
        ))}
      </div>

      <div className="hidden min-w-0 overflow-hidden rounded-xl border border-border/70 md:block">
        <table className="w-full table-fixed text-left text-sm" aria-label={ariaLabel}>
          <thead className="bg-surface/80 text-xs text-muted-foreground">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn(
                    "break-words px-3 py-2.5 font-semibold",
                    column.align === "right" && "text-right",
                    column.className,
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60 bg-surface/40">
            {rows.map((row, rowIndex) => (
              <tr key={rowKey(row, rowIndex)}>
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      "min-w-0 break-words px-3 py-3 align-top",
                      column.primary && "font-semibold",
                      column.align === "right" && "text-right",
                      column.className,
                    )}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

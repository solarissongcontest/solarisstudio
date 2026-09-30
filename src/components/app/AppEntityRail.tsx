import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

import { useSolarisApp } from "@/components/app/AppRuntime";
import { runAppViewTransition } from "@/lib/app-view-transitions";
import { cn } from "@/lib/utils";

export type AppEntityRailItem = {
  id: string;
  label: string;
  href: string;
  meta?: string | null;
};

export function AppEntityRail({
  title,
  directoryHref,
  currentHref,
  items,
  children,
}: {
  title: string;
  directoryHref: string;
  currentHref: string;
  items: AppEntityRailItem[];
  children: ReactNode;
}) {
  const { isAppMode } = useSolarisApp();
  const navigate = useNavigate();

  if (!isAppMode) return <>{children}</>;

  const normalizedCurrent = currentHref.replace(//+$/, "") || "/";

  return (
    <div className="solaris-ipad-entity-layout">
      <aside className="solaris-ipad-entity-rail" aria-label={title}>
        <Link
          to={directoryHref as any}
          className="solaris-ipad-entity-rail-back"
          onClick={(event) => {
            event.preventDefault();
            void runAppViewTransition("pop", () =>
              navigate({ to: directoryHref as any }),
            );
          }}
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          <span>{title}</span>
        </Link>

        <div className="solaris-ipad-entity-rail-list">
          {items.map((item) => {
            const normalizedHref = item.href.replace(//+$/, "") || "/";
            const active = normalizedHref === normalizedCurrent;

            return (
              <Link
                key={item.id}
                to={item.href as any}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "solaris-ipad-entity-rail-item",
                  active && "is-active",
                )}
                onClick={(event) => {
                  if (active) return;
                  event.preventDefault();
                  void runAppViewTransition("push", () =>
                    navigate({ to: item.href as any }),
                  );
                }}
              >
                <span className="truncate text-sm font-semibold">{item.label}</span>
                {item.meta ? (
                  <span className="truncate text-[10px] text-muted-foreground">
                    {item.meta}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      </aside>

      <div className="solaris-ipad-entity-detail min-w-0">{children}</div>
    </div>
  );
}

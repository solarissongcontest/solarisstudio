import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { useSolarisApp } from "@/components/app/AppRuntime";
import { cn } from "@/lib/utils";

export type AppEntitySidebarItem = {
  key: string;
  label: string;
  href: string;
  meta?: string | null;
  leading?: ReactNode;
};

export function AppEntitySidebar({
  title,
  items,
  currentHref,
  footer,
}: {
  title: string;
  items: AppEntitySidebarItem[];
  currentHref: string;
  footer?: ReactNode;
}) {
  const { isAppMode } = useSolarisApp();

  if (!isAppMode || !items.length) return null;

  return (
    <aside className="solaris-app-entity-sidebar" aria-label={title}>
      <div className="solaris-app-entity-sidebar-head">
        <p>{title}</p>
        <span>{items.length}</span>
      </div>

      <nav className="solaris-app-entity-sidebar-list">
        {items.map((item) => {
          const active = item.href === currentHref;
          return (
            <Link
              key={item.key}
              to={item.href as any}
              className={cn(
                "solaris-app-entity-sidebar-item",
                active && "is-active",
              )}
              aria-current={active ? "page" : undefined}
              preload="intent"
            >
              {item.leading ? (
                <span className="solaris-app-entity-sidebar-leading">
                  {item.leading}
                </span>
              ) : null}
              <span className="min-w-0 flex-1">
                <strong>{item.label}</strong>
                {item.meta ? <small>{item.meta}</small> : null}
              </span>
            </Link>
          );
        })}
      </nav>

      {footer ? <div className="solaris-app-entity-sidebar-footer">{footer}</div> : null}
    </aside>
  );
}

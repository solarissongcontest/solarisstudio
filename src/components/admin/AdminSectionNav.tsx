import { Link, useRouterState } from "@tanstack/react-router";
import { useMemo } from "react";

import { editionLabel, useEditions } from "@/lib/data";
import { cn } from "@/lib/utils";
import { useAdminContext } from "./AdminContext";
import {
  buildAdminContextualSection,
  type AdminContextualTab,
} from "./admin-contextual-navigation";

export function AdminSectionNav() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { editionId } = useAdminContext();
  const { data: editions = [] } = useEditions();

  const activeEdition =
    editions.find((edition) => edition.id === editionId) ??
    [...editions].sort((a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1))[0] ??
    null;

  const activeEditionLabel = activeEdition ? editionLabel(activeEdition) : "Current edition";
  const section = useMemo(
    () => buildAdminContextualSection(pathname, activeEdition?.slug, activeEditionLabel),
    [activeEdition?.slug, activeEditionLabel, pathname],
  );

  if (!section) return null;

  return (
    <section
      className="mb-4 border-b border-white/[0.07] pb-3 sm:mb-5 sm:pb-4"
      aria-label={`${section.domain.label} navigation`}
    >
      <div className="mb-2.5 flex min-w-0 items-baseline gap-2 px-0.5">
        <p className="shrink-0 text-xs font-bold uppercase tracking-[0.14em] text-sky-100/85">
          {section.domain.label}
        </p>
        <p className="hidden min-w-0 truncate text-[11px] text-muted-foreground sm:block">
          {section.domain.description}
        </p>
      </div>

      <TabRow tabs={section.tabs} pathname={pathname} label={`${section.domain.label} sections`} />

      {section.workflow ? (
        <div className="mt-3 rounded-xl border border-white/[0.06] bg-white/[0.018] px-2 py-2">
          <p className="mb-1.5 px-1 text-[9px] font-bold uppercase tracking-[0.13em] text-muted-foreground">
            {section.workflow.label}
          </p>
          <TabRow
            tabs={section.workflow.tabs}
            pathname={pathname}
            label={section.workflow.label}
            compact
          />
        </div>
      ) : null}
    </section>
  );
}

function TabRow({
  tabs,
  pathname,
  label,
  compact = false,
}: {
  tabs: AdminContextualTab[];
  pathname: string;
  label: string;
  compact?: boolean;
}) {
  return (
    <nav
      aria-label={label}
      className={cn(
        "-mx-1 flex flex-wrap gap-1 px-1 pb-0.5",
        compact ? "items-center" : "items-stretch",
      )}
    >
      {tabs.map((tab) => {
        const active = tab.active(pathname);
        return (
          <Link
            key={`${tab.label}-${tab.to}`}
            to={tab.to as any}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-xl border font-semibold transition-colors",
              compact
                ? "px-2.5 py-1.5 text-[11px]"
                : "min-h-10 flex-1 basis-[30%] px-3 py-2 text-center text-xs sm:flex-none sm:basis-auto",
              active
                ? "border-sky-200/15 bg-sky-200/[0.09] text-sky-50"
                : "border-transparent text-muted-foreground hover:border-white/[0.07] hover:bg-white/[0.035] hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

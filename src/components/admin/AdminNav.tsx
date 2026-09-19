import { Link, useRouterState } from "@tanstack/react-router";
import { ListTree } from "lucide-react";

import { useEditions } from "@/lib/data";
import { cn } from "@/lib/utils";
import { useAdminContext } from "./AdminContext";
import {
  buildAdminDomainNavigation,
  type AdminDomainNavigationItem,
} from "./admin-domains";

export function AdminNav() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { editionId } = useAdminContext();
  const { data: editions = [] } = useEditions();

  const activeEdition =
    editions.find((edition) => edition.id === editionId) ??
    [...editions].sort((a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1))[0] ??
    null;
  const editionNavLabel = activeEdition?.edition_number
    ? `SSC${activeEdition.edition_number}`
    : activeEdition?.name ?? "Current edition";
  const domains = buildAdminDomainNavigation(activeEdition?.slug, editionNavLabel);

  return (
    <nav className="p-3" aria-label="Organizer navigation">
      <p className="admin-section-label mb-2 px-2">Organizer</p>
      <div className="space-y-1">
        {domains.map((domain) => (
          <DomainLink key={domain.id} item={domain} pathname={pathname} />
        ))}
      </div>
      <div className="mt-5 border-t border-white/[0.07] px-2 pt-4">
        <Link
          to="/admin/menu"
          className="flex min-h-10 items-center gap-2 rounded-lg px-2 text-xs font-semibold text-muted-foreground hover:bg-white/[0.035] hover:text-foreground"
        >
          <ListTree className="size-4" />
          All Organizer tools
        </Link>
        <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
          Core workflows are visible in their workspaces. Search and All Organizer tools are for specialist tasks.
        </p>
      </div>
    </nav>
  );
}

function DomainLink({
  item,
  pathname,
}: {
  item: AdminDomainNavigationItem;
  pathname: string;
}) {
  const Icon = item.icon;
  const active = item.active(pathname);

  return (
    <Link
      to={item.to as any}
      aria-current={active ? "page" : undefined}
      title={item.description}
      className={cn(
        "group flex min-h-11 items-center gap-3 rounded-xl border px-2.5 text-sm font-semibold transition-colors",
        active
          ? "border-sky-200/12 bg-sky-200/[0.09] text-sky-50"
          : "border-transparent text-muted-foreground hover:border-white/[0.07] hover:bg-white/[0.035] hover:text-foreground",
      )}
    >
      <span
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-xl border transition-colors",
          active
            ? "border-sky-200/10 bg-sky-200/[0.08] text-sky-100"
            : "border-white/[0.06] bg-white/[0.025] text-muted-foreground group-hover:text-foreground",
        )}
      >
        <Icon className="size-4" />
      </span>
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

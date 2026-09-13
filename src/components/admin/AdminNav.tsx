import { Link, useRouterState } from "@tanstack/react-router";

import { useEditions } from "@/lib/data";
import { cn } from "@/lib/utils";
import { useAdminContext } from "./AdminContext";
import { buildAdminNavigation, type AdminNavigationItem } from "./admin-navigation";

export function AdminNav() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { editionId } = useAdminContext();
  const { data: editions = [] } = useEditions();

  const activeEdition =
    editions.find((edition) => edition.id === editionId) ??
    [...editions].sort((a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1))[0] ??
    null;
  const groups = buildAdminNavigation(activeEdition?.slug);

  return (
    <nav className="p-3" aria-label="Organizer navigation">
      {groups.map((group, index) => (
        <div key={group.label}>
          {index > 0 ? <div className="my-5 border-t border-white/[0.07]" /> : null}
          <NavSection
            label={group.label}
            items={group.items}
            pathname={pathname}
            quiet={group.quiet}
          />
        </div>
      ))}
    </nav>
  );
}

function NavSection({
  label,
  items,
  pathname,
  quiet = false,
}: {
  label: string;
  items: AdminNavigationItem[];
  pathname: string;
  quiet?: boolean;
}) {
  return (
    <>
      <p className="admin-section-label mb-2 px-2">{label}</p>
      <div className="space-y-1">
        {items.map((item) => (
          <NavLink key={item.label} item={item} pathname={pathname} quiet={quiet} />
        ))}
      </div>
    </>
  );
}

function NavLink({
  item,
  pathname,
  quiet = false,
}: {
  item: AdminNavigationItem;
  pathname: string;
  quiet?: boolean;
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
        quiet && !active && "text-xs",
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

import { Link, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  ClipboardCheck,
  LayoutDashboard,
  MoreHorizontal,
  RadioTower,
  Sparkles,
  Trophy,
  Vote,
  type LucideIcon,
} from "lucide-react";

import { useEditions } from "@/lib/data";
import { cn } from "@/lib/utils";
import { useAdminContext } from "./AdminContext";

type NavItem = {
  label: string;
  to: string;
  icon: LucideIcon;
  active: (pathname: string) => boolean;
};

export function AdminNav() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { editionId } = useAdminContext();
  const { data: editions = [] } = useEditions();

  const activeEdition =
    editions.find((edition) => edition.id === editionId) ??
    [...editions].sort((a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1))[0] ??
    null;

  const editionHref = activeEdition ? `/admin/${activeEdition.slug}` : "/admin";

  const primary: NavItem[] = [
    {
      label: "Overview",
      to: "/admin/operations",
      icon: LayoutDashboard,
      active: (path) =>
        path === "/admin/operations" ||
        path.startsWith("/admin/control-room") ||
        path.startsWith("/admin/action-centre"),
    },
    {
      label: "Edition",
      to: editionHref,
      icon: Trophy,
      active: (path) =>
        editions.some((edition) => path === `/admin/${edition.slug}`) ||
        path.startsWith("/admin/design/") ||
        path.startsWith("/admin/edition-theme/"),
    },
    {
      label: "Delegations",
      to: "/confirmations/admin",
      icon: ClipboardCheck,
      active: (path) => path.startsWith("/confirmations/admin"),
    },
    {
      label: "Voting",
      to: "/televoting/admin",
      icon: Vote,
      active: (path) =>
        path.startsWith("/televoting/admin") ||
        path.startsWith("/admin/hod-history") ||
        path.startsWith("/admin/sync-health"),
    },
    {
      label: "Broadcast",
      to: activeEdition ? `/admin/design/${activeEdition.slug}` : "/admin",
      icon: RadioTower,
      active: (path) => path.startsWith("/admin/design/") || path.startsWith("/admin/edition-theme/"),
    },
  ];

  const secondary: NavItem[] = [
    {
      label: "All editions",
      to: "/admin",
      icon: Trophy,
      active: (path) => path === "/admin" || path === "/admin/",
    },
    {
      label: "Predictions",
      to: "/admin/predictions",
      icon: Sparkles,
      active: (path) => path.startsWith("/admin/predictions"),
    },
    {
      label: "Beta feedback",
      to: "/admin/beta-feedback",
      icon: BarChart3,
      active: (path) => path.startsWith("/admin/beta-feedback"),
    },
    {
      label: "More",
      to: "/admin/more",
      icon: MoreHorizontal,
      active: (path) =>
        path.startsWith("/admin/more") ||
        path.startsWith("/admin/country-accounts") ||
        path.startsWith("/admin/hosts") ||
        path.startsWith("/admin/system"),
    },
  ];

  return (
    <nav className="p-3" aria-label="Organizer navigation">
      <p className="admin-section-label mb-2 px-2">Workspace</p>
      <div className="space-y-1">
        {primary.map((item) => <NavLink key={item.label} item={item} pathname={pathname} />)}
      </div>

      <div className="my-5 border-t border-white/[0.07]" />
      <p className="admin-section-label mb-2 px-2">More</p>
      <div className="space-y-1">
        {secondary.map((item) => <NavLink key={item.label} item={item} pathname={pathname} quiet />)}
      </div>
    </nav>
  );
}

function NavLink({ item, pathname, quiet = false }: { item: NavItem; pathname: string; quiet?: boolean }) {
  const Icon = item.icon;
  const active = item.active(pathname);

  return (
    <Link
      to={item.to as any}
      aria-current={active ? "page" : undefined}
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

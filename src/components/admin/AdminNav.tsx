import { Link, useRouterState } from "@tanstack/react-router";
import {
  BookOpen,
  ClipboardCheck,
  Database,
  Eye,
  FileClock,
  Gavel,
  LayoutDashboard,
  Layers3,
  MessageCircleQuestion,
  RadioTower,
  Settings2,
  ShieldCheck,
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

  const slug = activeEdition?.slug;
  const editionHref = slug ? `/admin/${slug}` : "/admin";
  const publishHref = slug ? `/admin/publication/${slug}` : "/admin";
  const broadcastHref = slug ? `/admin/design/${slug}` : "/admin";

  const workflow: NavItem[] = [
    {
      label: "Overview",
      to: "/admin/operations",
      icon: LayoutDashboard,
      active: (path) => path.startsWith("/admin/operations"),
    },
    {
      label: "Delegations",
      to: "/confirmations/admin",
      icon: ClipboardCheck,
      active: (path) => path.startsWith("/confirmations/admin"),
    },
    {
      label: "Contest",
      to: editionHref,
      icon: Layers3,
      active: (path) =>
        (slug ? path === `/admin/${slug}` : false) ||
        path.startsWith("/admin/shows/") ||
        path.startsWith("/admin/entries/") ||
        path.startsWith("/admin/lineup-sync/") ||
        path.startsWith("/admin/participant-status/"),
    },
    {
      label: "Voting",
      to: "/televoting/admin",
      icon: Vote,
      active: (path) =>
        path.startsWith("/televoting/admin") ||
        path.startsWith("/admin/jury/") ||
        path.startsWith("/admin/voting-system/") ||
        path.startsWith("/admin/televote/") ||
        path.startsWith("/admin/friend-voting") ||
        path.startsWith("/admin/jury-integrity"),
    },
    {
      label: "Integrity",
      to: "/admin/integrity-investigations",
      icon: ShieldCheck,
      active: (path) =>
        path === "/admin/integrity" ||
        path.startsWith("/admin/integrity-investigations") ||
        path.startsWith("/admin/integrity-case/") ||
        path.startsWith("/admin/integrity-resolution/"),
    },
    {
      label: "Appeals",
      to: "/admin/integrity-appeals",
      icon: Gavel,
      active: (path) => path.startsWith("/admin/integrity-appeals"),
    },
    {
      label: "Evidence",
      to: "/admin/integrity-evidence",
      icon: Database,
      active: (path) => path.startsWith("/admin/integrity-evidence"),
    },
    {
      label: "Publish",
      to: publishHref,
      icon: Eye,
      active: (path) => path.startsWith("/admin/publication/"),
    },
    {
      label: "Broadcast",
      to: broadcastHref,
      icon: RadioTower,
      active: (path) => path.startsWith("/admin/design/") || path.startsWith("/admin/edition-theme/"),
    },
  ];

  const administration: NavItem[] = [
    {
      label: "Administration",
      to: "/admin/more",
      icon: Settings2,
      active: (path) =>
        path.startsWith("/admin/more") ||
        path.startsWith("/admin/country-accounts") ||
        path.startsWith("/admin/hod-history") ||
        path.startsWith("/admin/hosts") ||
        path.startsWith("/admin/predictions") ||
        path.startsWith("/admin/system") ||
        path.startsWith("/admin/sync-health") ||
        path.startsWith("/admin/beta") ||
        path.startsWith("/admin/admin-beta") ||
        path.startsWith("/admin/anniversary"),
    },
    {
      label: "All editions",
      to: "/admin",
      icon: Trophy,
      active: (path) => path === "/admin" || path === "/admin/",
    },
    {
      label: "Rules manager",
      to: "/admin/rules-manager",
      icon: FileClock,
      active: (path) => path.startsWith("/admin/rules-manager"),
    },
    {
      label: "Interpretations",
      to: "/admin/rule-interpretations",
      icon: MessageCircleQuestion,
      active: (path) => path.startsWith("/admin/rule-interpretations"),
    },
    {
      label: "Public rules",
      to: "/rules",
      icon: BookOpen,
      active: (path) => path.startsWith("/rules"),
    },
    {
      label: "Guide",
      to: "/admin/guide",
      icon: BookOpen,
      active: (path) => path.startsWith("/admin/guide"),
    },
  ];

  return (
    <nav className="p-3" aria-label="Organizer navigation">
      <p className="admin-section-label mb-2 px-2">Current edition</p>
      <div className="space-y-1">
        {workflow.map((item) => <NavLink key={item.label} item={item} pathname={pathname} />)}
      </div>

      <div className="my-5 border-t border-white/[0.07]" />
      <p className="admin-section-label mb-2 px-2">Workspace</p>
      <div className="space-y-1">
        {administration.map((item) => <NavLink key={item.label} item={item} pathname={pathname} quiet />)}
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

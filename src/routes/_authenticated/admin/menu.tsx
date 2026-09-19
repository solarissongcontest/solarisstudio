import { createFileRoute, Link } from "@tanstack/react-router";
import { ExternalLink, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { useAdminContext } from "@/components/admin/AdminContext";
import { buildAdminDomainNavigation } from "@/components/admin/admin-domains";
import {
  buildAdminNavigation,
  type AdminNavigationGroup,
} from "@/components/admin/admin-navigation";
import { AdminCard, AdminPageHeader } from "@/components/admin/AdminUI";
import { editionLabel, useEditions } from "@/lib/data";

export const Route = createFileRoute("/_authenticated/admin/menu")({
  head: () => ({ meta: [{ title: "All pages — Solaris Organizer" }] }),
  component: OrganizerMenu,
});

function OrganizerMenu() {
  const { editionId } = useAdminContext();
  const { data: editions = [] } = useEditions();
  const [query, setQuery] = useState("");
  const activeEdition =
    editions.find((edition) => edition.id === editionId) ??
    [...editions].sort((a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1))[0] ??
    null;
  const domains = buildAdminDomainNavigation(activeEdition?.slug, activeEdition ? editionLabel(activeEdition) : "Current edition");
  const groups = useMemo(
    () => filterGroups(buildAdminNavigation(activeEdition?.slug), query),
    [activeEdition?.slug, query],
  );

  return (
    <div className="mx-auto max-w-5xl">
      <AdminPageHeader
        eyebrow="Solaris Organizer"
        title="Organizer menu"
        description="Start with a work domain. The complete searchable specialist-page directory remains below when you need a specific tool."
        actions={
          <Link to="/" target="_blank" className="admin-action-secondary">
            <ExternalLink className="size-4" /> Public site
          </Link>
        }
      />

      <AdminCard className="mb-4 !p-3 sm:!p-4">
        <div className="mb-3 px-1">
          <h2 className="text-sm font-bold text-foreground">Work domains</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            The same stable sections used by the desktop Organizer sidebar.
          </p>
        </div>
        <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
          {domains.map((domain) => {
            const Icon = domain.icon;
            return (
              <Link
                key={domain.id}
                to={domain.to as any}
                className="admin-list-row group !rounded-xl !border-0 !px-2.5"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-sky-200/10 bg-sky-200/[0.055] text-sky-100">
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-foreground">{domain.label}</span>
                  <span className="mt-0.5 block line-clamp-2 text-[11px] leading-4 text-muted-foreground">
                    {domain.description}
                  </span>
                </span>
                <span className="text-muted-foreground">›</span>
              </Link>
            );
          })}
        </div>
      </AdminCard>

      <div className="mb-2 px-1">
        <h2 className="text-sm font-bold text-foreground">All specialist pages</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Search the complete Organizer directory without turning every tool into permanent navigation.
        </p>
      </div>
      <label className="mb-4 flex min-h-12 items-center gap-3 rounded-xl border border-white/[0.1] bg-white/[0.03] px-3 focus-within:border-sky-200/30">
        <Search className="size-4 shrink-0 text-sky-100" aria-hidden="true" />
        <span className="sr-only">Search organizer pages</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search pages or tasks…"
          aria-label="Search organizer pages"
          className="min-h-11 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </label>

      {groups.length ? (
        <div className="space-y-4">
          {groups.map((group) => (
            <AdminCard key={group.label} className="!p-3 sm:!p-4">
              <div className="mb-3 flex items-start justify-between gap-3 px-1">
                <div>
                  <h2 className="text-sm font-bold text-foreground">{group.label}</h2>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {group.description}
                  </p>
                </div>
                <span className="numeric rounded-full border border-white/[0.08] px-2 py-1 text-[10px] text-muted-foreground">
                  {group.items.length}
                </span>
              </div>
              <div className="grid gap-1 sm:grid-cols-2">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.to}
                      to={item.to as any}
                      className="admin-list-row group !rounded-xl !border-0 !px-2.5"
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-sky-100">
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-foreground">
                          {item.label}
                        </span>
                        <span className="mt-0.5 block line-clamp-2 text-[11px] leading-4 text-muted-foreground">
                          {item.description}
                        </span>
                      </span>
                      <span className="text-muted-foreground">›</span>
                    </Link>
                  );
                })}
              </div>
            </AdminCard>
          ))}
        </div>
      ) : (
        <AdminCard className="py-10 text-center">
          <h2 className="text-sm font-bold">No organizer page matches “{query.trim()}”</h2>
          <p className="mt-1 text-xs text-muted-foreground">Try the task, feature or page name.</p>
        </AdminCard>
      )}
    </div>
  );
}

function filterGroups(groups: AdminNavigationGroup[], query: string) {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return groups;

  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        const value =
          `${group.label} ${item.label} ${item.description} ${item.keywords}`.toLowerCase();
        return terms.every((term) => value.includes(term));
      }),
    }))
    .filter((group) => group.items.length > 0);
}

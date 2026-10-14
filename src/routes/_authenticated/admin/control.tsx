import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CircleOff, SlidersHorizontal, Trophy } from "lucide-react";
import { useMemo } from "react";

import { useAdminContext } from "@/components/admin/AdminContext";
import { AdminPage } from "@/components/admin/AdminShell";
import {
  AdminCard,
  AdminCardHeader,
  AdminPageHeader,
  AdminStatus,
} from "@/components/admin/AdminUI";
import { editionLabel, useEditions } from "@/lib/data";
import { buildV3OrganizerControlGroups } from "@/lib/v3-organizer";

export const Route = createFileRoute("/_authenticated/admin/control")({
  head: () => ({
    meta: [
      { title: "Control — Solaris Organizer" },
      { name: "robots", content: "noindex" },
      {
        name: "description",
        content:
          "Operate participation, contest, voting and publication systems from one edition-scoped Solaris Organizer workspace.",
      },
    ],
  }),
  component: OrganizerControl,
});

function OrganizerControl() {
  const { editionId } = useAdminContext();
  const { data: editions = [] } = useEditions();
  const activeEdition = useMemo(() => {
    const ordered = [...editions].sort(
      (a, b) => (b.edition_number ?? -1) - (a.edition_number ?? -1),
    );
    return ordered.find((edition) => edition.id === editionId) ?? ordered[0] ?? null;
  }, [editionId, editions]);
  const groups = buildV3OrganizerControlGroups(activeEdition?.slug);

  return (
    <AdminPage>
      <div className="mx-auto max-w-5xl" data-v3-organizer-control="">
        <AdminPageHeader
          eyebrow="Control"
          title="Contest systems"
          description="Operate the existing canonical Solaris systems from one clear workspace. This page routes into the proven authorities; it does not create a second admin backend."
        />

        <AdminCard strong>
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="admin-section-label">Current edition</p>
              <h2 className="mt-1 text-xl font-bold tracking-[-.03em] text-foreground">
                {activeEdition ? editionLabel(activeEdition) : "No edition selected"}
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {activeEdition
                  ? activeEdition.name
                  : "Select an edition before opening edition-scoped control systems."}
              </p>
            </div>
            <AdminStatus tone={activeEdition ? "ready" : "attention"}>
              {activeEdition ? "Edition locked" : "Select edition"}
            </AdminStatus>
          </div>
        </AdminCard>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {groups.map((group) => (
            <AdminCard key={group.key}>
              <AdminCardHeader
                eyebrow="Control"
                title={group.label}
                description={groupDescription(group.key)}
              />
              <div className="divide-y divide-white/[0.07]">
                {group.items.map((item) =>
                  item.href ? (
                    <Link
                      key={item.key}
                      to={item.href as any}
                      className="admin-list-row group"
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.03] text-sky-100">
                        <SlidersHorizontal className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-foreground">{item.label}</span>
                          <AdminStatus tone="ready">
                            {item.editionScoped ? "Edition" : "Available"}
                          </AdminStatus>
                        </span>
                        <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                          {item.description}
                        </span>
                      </span>
                      <ArrowRight className="size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" />
                    </Link>
                  ) : (
                    <div key={item.key} className="admin-list-row opacity-65" aria-disabled="true">
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/[0.07] bg-white/[0.025] text-muted-foreground">
                        <CircleOff className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-foreground">{item.label}</span>
                          <AdminStatus tone="attention">Select edition</AdminStatus>
                        </span>
                        <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                          {item.description}
                        </span>
                      </span>
                    </div>
                  ),
                )}
              </div>
            </AdminCard>
          ))}
        </div>

        {!activeEdition ? (
          <AdminCard className="mt-4">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-amber-200/15 bg-amber-200/[0.05] text-amber-100">
                <Trophy className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">Edition-scoped operations are protected</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Choose an edition from the Organizer toolbar before entering a workflow that can change edition data.
                </p>
              </div>
            </div>
          </AdminCard>
        ) : null}
      </div>
    </AdminPage>
  );
}

function groupDescription(key: string) {
  if (key === "participation") return "Official delegation intake and submission review.";
  if (key === "contest") return "Delegations, shows and running-order operations.";
  if (key === "voting") return "Jury, televote and official result operations.";
  return "Publication, announcements and edition presentation.";
}

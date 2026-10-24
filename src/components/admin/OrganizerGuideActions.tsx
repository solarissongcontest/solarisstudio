import { Link } from "@tanstack/react-router";
import { ArrowRight, CircleOff } from "lucide-react";

import { useAdminContext } from "@/components/admin/AdminContext";
import { AdminCard, AdminCardHeader, AdminStatus } from "@/components/admin/AdminUI";
import {
  buildV3OrganizerControlGroups,
  v3OrganizerTabRoot,
  type V3OrganizerControlDomainKey,
} from "@/lib/v3-organizer";

const PRIMARY_DESTINATIONS = [
  ["overview", "Overview", "What needs attention now"],
  ["tasks", "Tasks", "Operational work and exceptions"],
  ["control", "Control", "Deliberate contest operations"],
  ["live", "Live", "Operate the active show"],
  ["more", "More", "Specialist and platform tools"],
] as const;

const COMMON_OPERATIONS = [
  ["delegations", "confirmations"],
  ["contest", "entry-review"],
  ["voting", "voting-overview"],
  ["results", "results"],
  ["communications", "communications"],
  ["production", "broadcast"],
] as const satisfies readonly [V3OrganizerControlDomainKey, string][];

export function OrganizerGuideActions() {
  const { editionSlug, editionLabel } = useAdminContext();
  const groups = buildV3OrganizerControlGroups(editionSlug);
  const commonOperations = COMMON_OPERATIONS.map(([domain, key]) => {
    const group = groups.find((candidate) => candidate.key === domain);
    if (!group) return null;
    const item = group.items.find((candidate) => candidate.key === key);
    if (!item) return null;
    return { domainLabel: group.label, ...item };
  }).filter((item): item is NonNullable<typeof item> => Boolean(item));

  return (
    <div
      className="mb-5 grid gap-4 xl:grid-cols-[0.85fr_1.15fr]"
      data-organizer-guide-actions=""
    >
      <AdminCard strong>
        <AdminCardHeader
          eyebrow="Start from intent"
          title="Go to the right Organizer area"
          description="These five destinations are the permanent Organizer mental model. The guide explains the why; the destination owns the actual work."
          action={
            <AdminStatus tone={editionSlug ? "ready" : "attention"}>
              {editionSlug ? "Edition locked" : "Choose edition"}
            </AdminStatus>
          }
        />

        <div className="divide-y divide-white/[0.07] border-t border-white/[0.07]">
          {PRIMARY_DESTINATIONS.map(([tab, label, description]) => (
            <Link
              key={tab}
              to={v3OrganizerTabRoot(tab) as any}
              className="admin-list-row group"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-foreground">{label}</span>
                <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                  {description}
                </span>
              </span>
              <ArrowRight className="size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" />
            </Link>
          ))}
        </div>
      </AdminCard>

      <AdminCard>
        <AdminCardHeader
          eyebrow="Common operations"
          title={editionLabel ? `Work in ${editionLabel}` : "Edition-scoped shortcuts"}
          description={
            editionSlug
              ? "Shortcuts come from the same canonical Control route model as the operational workspace, so the Guide does not maintain a second map of where contest work lives."
              : "Select an edition in the Organizer context switcher first. Edition-scoped shortcuts deliberately fail closed instead of guessing the newest edition."
          }
        />

        <div className="divide-y divide-white/[0.07] border-t border-white/[0.07]">
          {commonOperations.map((item) =>
            item.href ? (
              <Link key={item.key} to={item.href as any} className="admin-list-row group">
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{item.label}</span>
                    <AdminStatus tone="neutral">{item.domainLabel}</AdminStatus>
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                    {item.description}
                  </span>
                </span>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" />
              </Link>
            ) : (
              <div key={item.key} className="admin-list-row opacity-65" aria-disabled="true">
                <CircleOff className="size-4 shrink-0 text-muted-foreground" />
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
    </div>
  );
}
